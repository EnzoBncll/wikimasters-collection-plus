import { storage } from '#imports';
import { decodeAlbumCode, encodeAlbumCode, resolveSharedEntries } from './album-code';
import { collectionCache } from './cache';
import { goalAlbumsItem, type GoalAlbum } from './goal-albums';

/**
 * Albums à objectif d'un ordinateur à l'autre. Le site ne connaît que l'étiquette « ◇ Nom » et ses cartes :
 * la liste des cases vit dans l'extension. On la transporte sous forme de « paquet » compact, le même partout :
 *  - chaque album en code CP1 (≈ 3 octets par case, voir album-code.ts) avec sa date de modification ;
 *  - les albums supprimés, pour qu'ils ne reviennent pas.
 * Fusion album par album, le plus récent gagne. Le paquet voyage par la synchro de Chrome (cloud-sync.ts),
 * par WikiMasters (site-vault.ts), par Google Drive (drive-sync.ts) ou par un code à coller (transfert manuel).
 */

export interface GoalBundle {
  v: 1;
  /** Étiquette → code CP1 de l'album et date de sa dernière modification. */
  albums: Record<string, { c: string; at: number }>;
  /** Étiquette → date de suppression. */
  gone: Record<string, number>;
}

export const emptyBundle = (): GoalBundle => ({ v: 1, albums: {}, gone: {} });

export const goalBundleItem = storage.defineItem<GoalBundle>('local:goalBundle', { fallback: emptyBundle() });

/** Codes déjà appliqués (étiquette → code) : un code reçu n'est relu sur Wikipédia qu'une fois. */
const appliedItem = storage.defineItem<Record<string, string>>('local:goalBundleApplied', { fallback: {} });

const isBundle = (v: unknown): v is GoalBundle => typeof v === 'object' && v !== null && (v as GoalBundle).v === 1 && typeof (v as GoalBundle).albums === 'object';

export function normalizeBundle(v: unknown): GoalBundle {
  return isBundle(v) ? { v: 1, albums: { ...v.albums }, gone: { ...(v.gone ?? {}) } } : emptyBundle();
}

/** Album par album, le plus récent l'emporte ; une suppression plus récente que l'album l'efface. */
export function mergeBundles(a: GoalBundle, b: GoalBundle): GoalBundle {
  const out = emptyBundle();
  for (const [id, at] of [...Object.entries(a.gone), ...Object.entries(b.gone)]) out.gone[id] = Math.max(out.gone[id] ?? 0, at);
  for (const src of [a, b]) {
    for (const [id, album] of Object.entries(src.albums)) {
      const cur = out.albums[id];
      if (!cur || album.at > cur.at) out.albums[id] = album;
    }
  }
  for (const [id, album] of Object.entries(out.albums)) {
    if ((out.gone[id] ?? 0) >= album.at) delete out.albums[id];
    else delete out.gone[id];
  }
  return out;
}

export const sameBundle = (a: GoalBundle, b: GoalBundle) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (b: GoalBundle) => ({
  albums: Object.keys(b.albums).sort().map((k) => [k, b.albums[k]!.c, b.albums[k]!.at]),
  gone: Object.keys(b.gone).sort().map((k) => [k, b.gone[k]]),
});

/**
 * Remet le paquet local d'accord avec les albums de cet ordinateur : un album nouveau ou modifié prend la date
 * du jour, un album disparu passe dans les suppressions. Un album inchangé garde son code et sa date.
 */
export async function rebuildBundle(): Promise<GoalBundle> {
  const [goals, bundle, cache, applied] = await Promise.all([goalAlbumsItem.getValue(), goalBundleItem.getValue(), collectionCache.getValue(), appliedItem.getValue()]);
  const next = normalizeBundle(bundle);
  const tags = new Map((cache?.tags ?? []).map((t) => [t.id, t]));
  const now = Date.now();
  for (const [id, goal] of Object.entries(goals ?? {})) {
    const cur0 = next.albums[id];
    // Album reçu d'un autre ordinateur et pas retouché ici : on garde son code tel quel.
    if (cur0 && applied[id] === cur0.c && goal.at === cur0.at) continue;
    const tag = tags.get(id);
    const code = await encodeAlbumCode(tag?.name ?? 'Album', tag?.color ?? null, goal);
    const cur = next.albums[id];
    if (cur?.c === code) continue;
    // Même contenu, autre nom (renommage de l'étiquette) : pas une modification de l'album.
    if (cur && (await sameContent(cur.c, code))) continue;
    next.albums[id] = { c: code, at: Math.max(now, goal.at ?? 0) };
    delete next.gone[id];
  }
  for (const id of Object.keys(next.albums)) {
    if (!(goals ?? {})[id]) {
      delete next.albums[id];
      next.gone[id] = now;
    }
  }
  if (!sameBundle(bundle, next)) await goalBundleItem.setValue(next);
  return next;
}

async function sameContent(a: string, b: string) {
  try {
    const [x, y] = await Promise.all([decodeAlbumCode(a), decodeAlbumCode(b)]);
    return JSON.stringify([x.items, x.source, x.annex]) === JSON.stringify([y.items, y.source, y.annex]);
  } catch {
    return false;
  }
}

/**
 * Écrit dans les albums de cet ordinateur ce que le paquet a de plus récent : cases relues sur Wikidata / Wikipédia
 * (une fois par code), suppressions appliquées. Renvoie le nombre d'albums ajoutés ou mis à jour.
 */
export async function applyBundle(incoming: GoalBundle): Promise<number> {
  await rebuildBundle();
  const [local, goals, applied] = await Promise.all([goalBundleItem.getValue(), goalAlbumsItem.getValue(), appliedItem.getValue()]);
  const merged = mergeBundles(normalizeBundle(local), incoming);
  const nextGoals: Record<string, GoalAlbum> = { ...(goals ?? {}) };
  const nextApplied = { ...applied };
  let changed = 0;
  for (const [id, album] of Object.entries(merged.albums)) {
    const mine = normalizeBundle(local).albums[id];
    if (nextGoals[id] && (mine?.c === album.c || applied[id] === album.c)) continue;
    if (nextGoals[id] && mine && mine.at >= album.at) continue;
    try {
      const shared = await decodeAlbumCode(album.c);
      const { entries } = await resolveSharedEntries(shared);
      if (!entries.length) continue;
      nextGoals[id] = { entries, source: shared.source, annex: shared.annex, at: album.at };
      nextApplied[id] = album.c;
      changed++;
    } catch (e) {
      console.warn('[Collection+] album reçu illisible', id, e);
    }
  }
  for (const id of Object.keys(merged.gone)) {
    if (nextGoals[id]) {
      delete nextGoals[id];
      changed++;
    }
  }
  // Le paquet local d'abord : la reconstruction déclenchée par l'écriture des albums n'y verra rien de neuf.
  await goalBundleItem.setValue(merged);
  await appliedItem.setValue(nextApplied);
  if (changed) await goalAlbumsItem.setValue(nextGoals);
  return changed;
}

/* ---------- Transfert manuel ---------- */

const TRANSFER = 'CPT1-';

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function packText(text: string): Promise<string> {
  const b = await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw'));
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function unpackText(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')));
}

/** Tous les albums à objectif de cet ordinateur, en un code à coller sur un autre. */
export async function exportTransferCode(): Promise<{ code: string; count: number }> {
  const bundle = await rebuildBundle();
  return { code: TRANSFER + (await packText(JSON.stringify(bundle))), count: Object.keys(bundle.albums).length };
}

export async function importTransferCode(code: string): Promise<number> {
  const clean = code.replace(/\s+/g, '');
  if (!clean.startsWith(TRANSFER)) throw new Error('Ce n’est pas un code de transfert Collection+ (il commence par « CPT1- »).');
  let bundle: GoalBundle;
  try {
    bundle = normalizeBundle(JSON.parse(await unpackText(clean.slice(TRANSFER.length))));
  } catch {
    throw new Error('Code abîmé : vérifie qu’il a été copié en entier.');
  }
  return applyBundle(bundle);
}
