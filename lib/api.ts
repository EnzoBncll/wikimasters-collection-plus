import { sleep } from './queue';
import { transport } from './transport';
import type { OwnedCard, Rarity, SiteTag } from './types';

const MAX_COLLECTION_PAGES = 300;

/** Requête JSON vers l'API du site (cookies de session inclus), avec retry sur 5xx / 429. */
export async function apiJson<T = any>(path: string, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { status, text } = await transport().siteFetch(path, { headers: { accept: 'application/json' } });
    if (status >= 200 && status < 300) return (text ? JSON.parse(text) : null) as T;
    const retryable = status === 0 || status === 429 || status >= 500;
    if (!retryable || attempt >= maxAttempts) {
      throw new Error(`GET ${path.split('?')[0]} : HTTP ${status}${status === 401 || status === 403 ? ' (es-tu connecté à WikiMasters ?)' : ''}`);
    }
    await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
  }
}

/** Récupère toute la collection (toutes les pages) et regroupe les exemplaires par carte. */
export async function fetchFullCollection(onPage?: (page: number, cards: number) => void): Promise<OwnedCard[]> {
  const byCard = new Map<string, OwnedCard>();

  for (let page = 0; page < MAX_COLLECTION_PAGES; page++) {
    const json = await apiJson<any>(`/api/my-collection?sort=rarity&page=${page}&stats=0`);
    const entries: any[] = Array.isArray(json?.collection) ? json.collection : [];
    if (!entries.length) break;

    for (const entry of entries) {
      const card = entry?.card;
      const cardId: string | undefined = entry?.card_id ?? card?.id;
      if (!cardId || !card?.wikipedia_title) continue;

      const existing = byCard.get(cardId);
      const ownedId: string | null = entry?.id ?? null;
      const count = Number(entry?.count) || 1;
      const tagIds = extractTagIds(entry);

      if (existing) {
        if (ownedId && !existing.ownedIds.includes(ownedId)) existing.ownedIds.push(ownedId);
        if (ownedId) existing.ownedTags[ownedId] = tagIds;
        existing.count += count;
        for (const id of tagIds) if (!existing.tagIds.includes(id)) existing.tagIds.push(id);
      } else {
        byCard.set(cardId, {
          cardId,
          ownedIds: ownedId ? [ownedId] : [],
          count,
          title: card.wikipedia_title,
          rarity: (card.rarity as Rarity) ?? null,
          imageUrl: card.image_url ?? null,
          wikipediaUrl: card.wikipedia_url ?? null,
          tagIds,
          ownedTags: ownedId ? { [ownedId]: tagIds } : {},
        });
      }
    }

    onPage?.(page, byCard.size);
    if (json?.has_more === false || json?.hasMore === false) break;
  }

  return [...byCard.values()];
}

/** Les étiquettes peuvent arriver sous forme d'ids ou d'objets ; on normalise en ids. */
function extractTagIds(entry: any): string[] {
  const raw = entry?.tags ?? entry?.tag_ids ?? entry?.labels ?? entry?.card_tags ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => (typeof t === 'string' ? t : t?.tag_id ?? t?.id ?? t?.tag?.id))
    .filter((id: unknown): id is string => typeof id === 'string');
}

export interface SiteTagsApi {
  list(): Promise<SiteTag[]>;
  create(name: string, color: string): Promise<SiteTag>;
  /** Étiquettes posées, par exemplaire (user_card_id → tag ids), limitées aux étiquettes données. */
  assignments(tagIds: string[]): Promise<Map<string, string[]>>;
  addMany(tagId: string, ownedIds: string[]): Promise<void>;
  removeMany(tagId: string, ownedIds: string[]): Promise<void>;
}
