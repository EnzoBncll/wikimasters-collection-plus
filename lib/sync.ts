import { apiJson, fetchFullCollection, type SiteTagsApi } from './api';
import { collectionCache, collectionDirty, type CollectionCache } from './cache';
import { setAssignments } from './siteTags';
import type { Settings } from './store';
import { ensureTradeTags } from './trade';

/** Au-delà, on recharge tout même si rien ne semble avoir changé (échanges acceptés par d'autres, etc.). */
const MAX_FULL_AGE = 6 * 60 * 60 * 1000;

export type SyncMode = 'light' | 'full';

export interface SyncProgress {
  step: 'check' | 'collection' | 'tags';
  page?: number;
  cards?: number;
}

/**
 * Synchronise la collection :
 *  - léger : si le cache est récent, non marqué « sale » et que les stats n'ont pas bougé,
 *    on ne relit que les étiquettes (1 requête) ;
 *  - complet : sinon, on recharge toutes les pages de /api/my-collection.
 */
export async function syncCollection(
  api: SiteTagsApi,
  settings: Settings,
  { force = false, onProgress }: { force?: boolean; onProgress?: (p: SyncProgress) => void } = {},
): Promise<{ cache: CollectionCache; mode: SyncMode }> {
  onProgress?.({ step: 'check' });
  const [cached, dirty, statsSig, { tags, tradeTags }] = await Promise.all([
    collectionCache.getValue(),
    collectionDirty.getValue(),
    fetchStatsSignature(),
    ensureTradeTags(api, settings),
  ]);

  const canReuse =
    !force &&
    !dirty &&
    cached?.version === 2 &&
    statsSig !== null &&
    statsSig === cached.statsSig &&
    Date.now() - cached.fullAt < MAX_FULL_AGE;

  const mode: SyncMode = canReuse ? 'light' : 'full';
  const cards = canReuse
    ? cached!.cards
    : await fetchFullCollection((page, n) => onProgress?.({ step: 'collection', page, cards: n }));

  onProgress?.({ step: 'tags' });
  setAssignments(cards, await api.assignments(tags.map((t) => t.id)));

  const now = Date.now();
  const cache: CollectionCache = {
    version: 2,
    fullAt: canReuse ? cached!.fullAt : now,
    syncedAt: now,
    statsSig: canReuse ? cached!.statsSig : statsSig,
    cards,
    tags,
    tradeTags,
  };
  await collectionCache.setValue(cache);
  if (!canReuse) await collectionDirty.setValue(false);
  return { cache, mode };
}

/** Empreinte légère de la collection (compteurs par rareté), sans les champs horodatés. */
async function fetchStatsSignature(): Promise<string | null> {
  try {
    const json = await apiJson('/api/my-collection/stats?sort=rarity');
    return JSON.stringify(json, (key, value) => (/(_at|At|time|date)$/i.test(key) ? undefined : value));
  } catch {
    return null;
  }
}
