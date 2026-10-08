import { storage } from '#imports';

/**
 * Synchronisation entre ordinateurs, sans serveur ni compte à créer : les données propres à Collection+
 * (albums à objectif, mises en page, souhaits, règles, réglages…) sont recopiées dans `chrome.storage.sync`,
 * que Chrome transporte d'un ordinateur à l'autre quand on y est connecté avec la synchronisation activée.
 *
 * Les cartes et les étiquettes vivent déjà sur WikiMasters : elles ne passent pas par ici.
 *
 * `chrome.storage.sync` est petit (100 Ko, 8 Ko par entrée) : chaque donnée est compressée (gzip, base64)
 * puis découpée. Une entrée « s:nom » décrit la version ({ h: empreinte, d: appareil, n: morceaux }),
 * les morceaux sont « s:nom:0 », « s:nom:1 »… et partent en un seul envoi.
 * Tourne dans le service worker (entrypoints/background.ts).
 */

/** Clés de chrome.storage.local recopiées, par ordre d'importance (si la place manque, les dernières sautent). */
export const SYNCED_KEYS = [
  'goalAlbums',
  'albumLayouts',
  'albumOrders',
  'albumRemoved',
  'albumDescriptions',
  'settings',
  'rules',
  'tagKindMemory',
  'wishlists',
  'albumSheets',
  'dismissedSuggestions',
  'albumRecoDismissed',
] as const;
type SyncedKey = (typeof SYNCED_KEYS)[number];

export const SYNCED_LABELS: Record<SyncedKey, string> = {
  goalAlbums: 'Albums à objectif',
  albumLayouts: 'Mises en page des albums',
  albumOrders: 'Ordre des albums',
  albumRemoved: 'Cartes écartées',
  albumDescriptions: 'Couvertures',
  settings: 'Réglages',
  rules: 'Règles automatiques',
  tagKindMemory: 'Types d’albums',
  wishlists: 'Listes de souhaits',
  albumSheets: 'Fiches d’album',
  dismissedSuggestions: 'Suggestions écartées',
  albumRecoDismissed: 'Recommandations écartées',
};

export interface CloudSyncState {
  enabled: boolean;
  /** Identifiant de cet ordinateur, pour ignorer ses propres envois. */
  device: string;
  /** Empreinte de chaque donnée lors du dernier échange (envoi ou réception). */
  hashes: Partial<Record<SyncedKey, string>>;
  lastPushAt: number | null;
  /** Dernière donnée reçue d'un autre ordinateur. */
  lastPullAt: number | null;
  /** Données trop lourdes pour la place disponible. */
  tooBig: SyncedKey[];
  error: string | null;
}

export const cloudSyncItem = storage.defineItem<CloudSyncState>('local:cloudSync', {
  fallback: { enabled: true, device: '', hashes: {}, lastPushAt: null, lastPullAt: null, tooBig: [], error: null },
});

/** Message de l'interface : tout revérifier tout de suite. */
export const CLOUD_SYNC_NOW = 'wmt:cloud-sync-now';

const META = (k: string) => `s:${k}`;
const PART = (k: string, i: number) => `s:${k}:${i}`;
/** Taille d'un morceau (8 Ko par entrée, nom de clé et guillemets compris). */
const CHUNK = 7800;
const DEBOUNCE = 2500;
/** Vérification automatique : rattrape ce qu'un événement de Chrome aurait manqué (service worker endormi, réseau coupé…). */
const AUTO_ALARM = 'wmt-cloud-sync';
const AUTO_MINUTES = 5;

interface Meta {
  h: string;
  d: string;
  n: number;
  at: number;
}

const isSynced = (k: string): k is SyncedKey => (SYNCED_KEYS as readonly string[]).includes(k);

/* ---------- Encodage ---------- */

/** Empreinte FNV-1a 32 bits, suffisante pour savoir si une donnée a bougé. */
function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}.${text.length.toString(36)}`;
}

async function pack(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function unpack(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/* ---------- État ---------- */

let state: CloudSyncState | null = null;

async function loadState(): Promise<CloudSyncState> {
  if (state) return state;
  const saved = await cloudSyncItem.getValue();
  state = { ...saved, hashes: { ...saved.hashes }, tooBig: [...(saved.tooBig ?? [])] };
  if (!state.device) {
    state.device = crypto.randomUUID().slice(0, 8);
    await cloudSyncItem.setValue(state);
  }
  return state;
}

async function saveState(patch: Partial<CloudSyncState>) {
  const s = await loadState();
  Object.assign(s, patch);
  await cloudSyncItem.setValue({ ...s });
}

/** Une seule opération à la fois : envois et réceptions s'enchaînent. */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

/* ---------- Envoi / réception ---------- */

/** Champs qui ne quittent jamais cet ordinateur (la clé Gemini reste locale). */
const PRIVATE: Partial<Record<SyncedKey, string[]>> = { settings: ['geminiApiKey'] };

async function readRaw(key: SyncedKey): Promise<unknown> {
  return (await browser.storage.local.get(key))[key] ?? null;
}

/** Donnée locale telle qu'elle est partagée (sans ses champs privés). */
async function readLocal(key: SyncedKey): Promise<unknown> {
  const value = await readRaw(key);
  const hidden = PRIVATE[key];
  if (!hidden || !isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !hidden.includes(k)));
}

async function push(key: SyncedKey, value: unknown, text = JSON.stringify(value ?? null)) {
  const s = await loadState();
  const h = hashOf(text);
  const b64 = await pack(text);
  const n = Math.ceil(b64.length / CHUNK) || 1;
  const remote = (await browser.storage.sync.get(META(key)))[META(key)] as Meta | undefined;
  const items: Record<string, unknown> = { [META(key)]: { h, d: s.device, n, at: Date.now() } satisfies Meta };
  for (let i = 0; i < n; i++) items[PART(key, i)] = b64.slice(i * CHUNK, (i + 1) * CHUNK);
  try {
    await browser.storage.sync.set(items);
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    if (/QUOTA_BYTES(?!_PER)/.test(message) || /MAX_ITEMS/.test(message)) {
      await saveState({ tooBig: [...new Set([...s.tooBig, key])], error: null });
      return;
    }
    throw error;
  }
  if (remote && remote.n > n) await browser.storage.sync.remove(Array.from({ length: remote.n - n }, (_, i) => PART(key, n + i)));
  s.hashes[key] = h;
  await saveState({ hashes: s.hashes, lastPushAt: Date.now(), tooBig: s.tooBig.filter((k) => k !== key), error: null });
}

async function readRemote(key: SyncedKey, all?: Record<string, unknown>): Promise<{ meta: Meta; text: string } | null> {
  const metas: Record<string, unknown> = all ?? (await browser.storage.sync.get(META(key)));
  const meta = metas[META(key)] as Meta | undefined;
  if (!meta?.n) return null;
  const parts: Record<string, unknown> = all ?? (await browser.storage.sync.get(Array.from({ length: meta.n }, (_, i) => PART(key, i))));
  const chunks = Array.from({ length: meta.n }, (_, i) => parts[PART(key, i)]);
  if (chunks.some((c) => typeof c !== 'string')) return null;
  const text = await unpack(chunks.join(''));
  return hashOf(text) === meta.h ? { meta, text } : null;
}

/** Écrit la donnée reçue en local ; l'empreinte est notée avant, pour que ce changement ne reparte pas. */
async function applyRemote(key: SyncedKey, text: string) {
  const s = await loadState();
  s.hashes[key] = hashOf(text);
  await saveState({ hashes: s.hashes, lastPullAt: Date.now(), error: null });
  let value = JSON.parse(text);
  const hidden = PRIVATE[key];
  const raw = hidden ? await readRaw(key) : null;
  if (hidden && isObject(value) && isObject(raw)) value = { ...value, ...Object.fromEntries(hidden.filter((k) => k in raw).map((k) => [k, raw[k]])) };
  await browser.storage.local.set({ [key]: value });
}

/* ---------- Fusion ---------- */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const idOf = (v: unknown) => (isObject(v) && typeof v.id === 'string' ? v.id : JSON.stringify(v));

/**
 * Les deux ordinateurs ont modifié la même donnée depuis le dernier échange : on garde les deux
 * (albums, souhaits… sont des dictionnaires par étiquette). `preferred` l'emporte quand une même entrée diffère.
 */
function merge(preferred: unknown, other: unknown): unknown {
  if (isObject(preferred) && isObject(other)) return { ...other, ...preferred };
  if (Array.isArray(preferred) && Array.isArray(other)) {
    const seen = new Set(preferred.map(idOf));
    return [...preferred, ...other.filter((x) => !seen.has(idOf(x)))];
  }
  return preferred ?? other;
}

/** Remet d'accord cet ordinateur et la copie de Chrome, donnée par donnée. */
async function reconcile() {
  const s = await loadState();
  if (!s.enabled) return;
  const all = await browser.storage.sync.get(null);
  for (const key of SYNCED_KEYS) {
    const local = await readLocal(key);
    const localText = JSON.stringify(local);
    const lh = hashOf(localText);
    const remote = await readRemote(key, all);
    if (!remote) {
      if (local !== null && s.hashes[key] !== lh) await push(key, local, localText);
      continue;
    }
    if (remote.meta.h === lh) {
      if (s.hashes[key] !== lh) {
        s.hashes[key] = lh;
        await saveState({ hashes: s.hashes });
      }
      continue;
    }
    const known = s.hashes[key];
    const localChanged = local !== null && known !== lh;
    const remoteChanged = known !== remote.meta.h;
    if (!localChanged) await applyRemote(key, remote.text);
    else if (!remoteChanged) await push(key, local, localText);
    else {
      // Première synchro de cet ordinateur : la copie partagée prime ; ensuite, les changements locaux.
      const remoteValue = JSON.parse(remote.text);
      const merged = known ? merge(local, remoteValue) : merge(remoteValue, local);
      const text = JSON.stringify(merged);
      await push(key, merged, text);
      await applyRemote(key, text);
    }
  }
}

/* ---------- Branchement ---------- */

const timers = new Map<SyncedKey, ReturnType<typeof setTimeout>>();

function schedulePush(key: SyncedKey) {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void serial(async () => {
        const s = await loadState();
        if (!s.enabled) return;
        const value = await readLocal(key);
        const text = JSON.stringify(value);
        if (s.hashes[key] !== hashOf(text)) await push(key, value, text);
      }).catch(reportError);
    }, DEBOUNCE),
  );
}

async function reportError(error: unknown) {
  console.warn('[Collection+] synchronisation entre ordinateurs', error);
  await saveState({ error: String((error as Error)?.message ?? error) }).catch(() => {});
}

export function syncNow() {
  return serial(reconcile).catch(reportError);
}

/** À appeler au démarrage du service worker. */
export function startCloudSync() {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      for (const key of Object.keys(changes)) if (isSynced(key)) schedulePush(key);
      // Synchro réactivée depuis les paramètres : on rattrape tout.
      const toggled = changes['cloudSync'] as { newValue?: CloudSyncState; oldValue?: CloudSyncState } | undefined;
      if (toggled && Boolean(toggled.newValue?.enabled) !== Boolean(toggled.oldValue?.enabled ?? true)) {
        state = null;
        if (toggled.newValue?.enabled) void syncNow();
      }
      return;
    }
    if (area !== 'sync') return;
    const keys = Object.keys(changes)
      .map((k) => k.match(/^s:([^:]+)$/)?.[1])
      .filter((k): k is SyncedKey => !!k && isSynced(k));
    if (!keys.length) return;
    void serial(async () => {
      const s = await loadState();
      if (!s.enabled) return;
      for (const key of keys) {
        const meta = changes[META(key)]?.newValue as Meta | undefined;
        if (!meta || meta.d === s.device || meta.h === s.hashes[key]) continue;
        const remote = await readRemote(key);
        if (remote) await applyRemote(key, remote.text);
      }
    }).catch(reportError);
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== CLOUD_SYNC_NOW) return;
    syncNow().then(() => sendResponse({ ok: true }));
    return true;
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_ALARM) void syncNow();
  });
  void browser.alarms.get(AUTO_ALARM).then((alarm) => {
    if (!alarm) void browser.alarms.create(AUTO_ALARM, { periodInMinutes: AUTO_MINUTES });
  });

  void syncNow();
}
