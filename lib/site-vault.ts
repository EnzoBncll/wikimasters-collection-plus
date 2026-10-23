import { storage } from '#imports';
import { emptyBundle, mergeBundles, normalizeBundle, packText, sameBundle, unpackText, type GoalBundle } from './goal-sync';
import { isVaultTag, VAULT_PREFIX } from './siteTags';
import { currentUserId, rest } from './supabase';

/**
 * Coffre sur WikiMasters : le paquet des albums à objectif (goal-sync.ts) rangé dans le compte WikiMasters lui-même,
 * pour qu'il suive le joueur sur n'importe quel ordinateur, même sans la synchro de Chrome.
 * Le site n'a pas de champ libre : le paquet compressé est écrit dans le NOM d'étiquettes sans carte
 * « ⚙ Collection+ 1/2 · … ». Collection+ les cache partout (siteTagsApi.list) ; le site, lui, les montre dans sa
 * liste d'étiquettes. On en crée le moins possible : la longueur acceptée est apprise au premier envoi.
 */

const VAULT_COLOR = '#3f3f46';
const HEADER = /^⚙ Collection\+ (\d+)\/(\d+) · /;

/** Longueur de morceau acceptée par le site, apprise par essais (on part haut, on divise par deux au refus). */
const chunkItem = storage.defineItem<number>('local:siteVaultChunk', { fallback: 4000 });
export const siteVaultItem = storage.defineItem<{ lastAt: number | null; error: string | null; tags: number }>('local:siteVault', {
  fallback: { lastAt: null, error: null, tags: 0 },
});

interface VaultTag {
  id: string;
  name: string;
}

async function readTags(): Promise<VaultTag[]> {
  const uid = await currentUserId();
  const rows = await rest<{ id: string; name: string }[]>(`tags?select=id,name&user_id=eq.${uid}&name=like.${encodeURIComponent('⚙ Collection+*')}`);
  return (rows ?? []).filter((r) => isVaultTag(r.name) && HEADER.test(r.name));
}

/** Paquet lu dans le coffre (null si vide, abîmé ou incomplet). */
function decode(tags: VaultTag[]): Promise<GoalBundle | null> {
  const parts = tags
    .map((t) => {
      const m = HEADER.exec(t.name)!;
      return { i: Number(m[1]), n: Number(m[2]), data: t.name.slice(m[0].length) };
    })
    .sort((a, b) => a.i - b.i);
  const n = parts[0]?.n;
  if (!n || parts.length !== n || parts.some((p, k) => p.i !== k + 1 || p.n !== n)) return Promise.resolve(null);
  return unpackText(parts.map((p) => p.data).join(''))
    .then((text) => normalizeBundle(JSON.parse(text)))
    .catch(() => null);
}

async function write(bundle: GoalBundle, old: VaultTag[]): Promise<number> {
  const uid = await currentUserId();
  const data = await packText(JSON.stringify(bundle));
  let size = await chunkItem.getValue();
  for (;;) {
    const n = Math.ceil(data.length / size) || 1;
    const names = Array.from({ length: n }, (_, k) => `${VAULT_PREFIX}${k + 1}/${n} · ${data.slice(k * size, (k + 1) * size)}`);
    const created: string[] = [];
    try {
      for (const name of names) {
        const [row] = await rest<{ id: string; name: string }[]>('tags', {
          method: 'POST',
          body: { user_id: uid, name, color: VAULT_COLOR },
          prefer: 'return=representation',
        });
        // Nom tronqué par le site : morceau trop long.
        if (!row || row.name !== name) throw Object.assign(new Error('nom tronqué'), { tooLong: true, id: row?.id });
        created.push(row.id);
      }
    } catch (error) {
      const id = (error as { id?: string }).id;
      for (const c of [...created, ...(id ? [id] : [])]) await rest(`tags?id=eq.${c}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
      const status = (error as { status?: number }).status;
      const tooLong = (error as { tooLong?: boolean }).tooLong || status === 400 || status === 422 || status === 413;
      if (!tooLong || size <= 120) throw error;
      size = Math.floor(size / 2);
      await chunkItem.setValue(size);
      continue;
    }
    // Les nouveaux morceaux sont en place : les anciens peuvent partir.
    for (const t of old) await rest(`tags?id=eq.${t.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
    return n;
  }
}

/**
 * Échange avec le coffre : lit, fusionne avec le paquet local, réécrit le coffre s'il lui manque quelque chose.
 * Renvoie le paquet fusionné (à appliquer localement par l'appelant).
 */
export async function syncSiteVault(local: GoalBundle): Promise<GoalBundle> {
  try {
    const tags = await readTags();
    const remote = (await decode(tags)) ?? emptyBundle();
    const merged = mergeBundles(local, remote);
    let count = tags.length;
    const empty = !Object.keys(merged.albums).length && !Object.keys(merged.gone).length;
    if (!empty && (!sameBundle(merged, remote) || !tags.length)) count = await write(merged, tags);
    await siteVaultItem.setValue({ lastAt: Date.now(), error: null, tags: count });
    return merged;
  } catch (error) {
    await siteVaultItem.setValue({ ...(await siteVaultItem.getValue()), error: (error as Error).message ?? String(error) });
    throw error;
  }
}

/** Retire le coffre du compte WikiMasters (quand l'option est coupée). */
export async function clearSiteVault() {
  for (const t of await readTags()) await rest(`tags?id=eq.${t.id}`, { method: 'DELETE', prefer: 'return=minimal' });
  await siteVaultItem.setValue({ lastAt: null, error: null, tags: 0 });
}
