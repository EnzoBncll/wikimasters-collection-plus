import { storage } from '#imports';
import { sleep } from './queue';
import { transport } from './transport';
import type { Acquisition, CopyInfo, OwnedCard, Rarity, SiteTag } from './types';

/** Garde-fou contre une boucle infinie (réponse du site anormale), bien au-delà des plus grosses collections. */
const MAX_COLLECTION_PAGES = 5000;
/** Petite pause entre deux pages, pour ne pas déclencher la limite de requêtes du site. */
const PAGE_PAUSE_MS = 120;
/** Une reprise n'est proposée que si le chargement interrompu est récent. */
const RESUME_MAX_AGE = 30 * 60 * 1000;

/** Appelé quand le site demande de ralentir (429) ou ne répond pas : attente avant le prochain essai. */
export type RetryListener = (info: { attempt: number; waitMs: number; status: number }) => void;

/**
 * Requête JSON vers l'API du site (cookies de session inclus), avec retry sur 5xx / 429 / réseau.
 * Sur 429, l'attente monte jusqu'à 30 s par essai (≈ 2 min en tout) : la limite du site est à la minute.
 */
export async function apiJson<T = any>(path: string, maxAttempts = 4, onRetry?: RetryListener): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let status = 0;
    let text = '';
    try {
      ({ status, text } = await transport().siteFetch(path, { headers: { accept: 'application/json' } }));
    } catch {
      status = 0; // Coupure réseau : on réessaie comme une erreur serveur.
    }
    if (status >= 200 && status < 300) return (text ? JSON.parse(text) : null) as T;
    const limited = status === 429;
    const retryable = status === 0 || limited || status >= 500;
    const attempts = limited ? Math.max(maxAttempts, 8) : maxAttempts;
    if (!retryable || attempt >= attempts) {
      throw new Error(
        `GET ${path.split('?')[0]} : HTTP ${status}` +
          (status === 401 || status === 403 ? ' (es-tu connecté à WikiMasters ?)' : limited ? ' (le site limite les requêtes, réessaie dans une minute)' : ''),
      );
    }
    const waitMs = limited ? Math.min(30_000, 2000 * 2 ** (attempt - 1)) : Math.min(8000, 500 * 2 ** (attempt - 1));
    onRetry?.({ attempt, waitMs, status });
    await sleep(waitMs);
  }
}

/** Chargement complet en cours : permet de reprendre là où il s'est arrêté au lieu de tout relire. */
interface PartialCollection {
  startedAt: number;
  nextPage: number;
  cards: OwnedCard[];
  /** Exemplaires déjà lus, pour ne pas les compter deux fois si les pages se décalent. */
  seen: string[];
}
const partialCollection = storage.defineItem<PartialCollection | null>('local:collectionPartial', { fallback: null });

export interface CollectionProgress {
  page: number;
  cards: number;
  /** Secondes d'attente avant le prochain essai, quand le site demande de ralentir. */
  waitS?: number;
  /** Le chargement reprend une tentative précédente interrompue. */
  resumed?: boolean;
}

/** Récupère toute la collection (toutes les pages) et regroupe les exemplaires par carte. */
export async function fetchFullCollection(onProgress?: (p: CollectionProgress) => void): Promise<OwnedCard[]> {
  const byCard = new Map<string, OwnedCard>();
  const seen = new Set<string>();
  let startPage = 0;
  let startedAt = Date.now();

  const partial = await partialCollection.getValue().catch(() => null);
  if (partial && Date.now() - partial.startedAt < RESUME_MAX_AGE && partial.nextPage > 0) {
    for (const card of partial.cards) byCard.set(card.cardId, card);
    for (const id of partial.seen) seen.add(id);
    startPage = partial.nextPage;
    startedAt = partial.startedAt;
  }
  const resumed = startPage > 0;

  let finished = false;
  let page = startPage;
  for (; page < MAX_COLLECTION_PAGES; page++) {
    if (page > startPage) await sleep(PAGE_PAUSE_MS);
    let json: any;
    try {
      json = await apiJson<any>(`/api/my-collection?sort=rarity&page=${page}&stats=0`, 5, ({ waitMs }) =>
        onProgress?.({ page, cards: byCard.size, waitS: Math.round(waitMs / 1000), resumed }),
      );
    } catch (error) {
      // On garde ce qui a été lu : le prochain essai repartira de cette page.
      if (page > 0) {
        await partialCollection
          .setValue({ startedAt, nextPage: page, cards: [...byCard.values()], seen: [...seen] })
          .catch(() => undefined);
        throw new Error(`${error instanceof Error ? error.message : String(error)} · ${page} pages lues, la prochaine synchro reprendra à la page ${page + 1}`);
      }
      throw error;
    }
    const entries: any[] = Array.isArray(json?.collection) ? json.collection : [];
    if (!entries.length) {
      finished = true;
      break;
    }

    for (const entry of entries) {
      const card = entry?.card;
      const cardId: string | undefined = entry?.card_id ?? card?.id;
      if (!cardId || !card?.wikipedia_title) continue;

      const ownedId: string | null = entry?.id ?? null;
      if (ownedId) {
        if (seen.has(ownedId)) continue;
        seen.add(ownedId);
      }
      const existing = byCard.get(cardId);

      const count = Number(entry?.count) || 1;
      const tagIds = extractTagIds(entry);
      const acquired = extractAcquisition(entry);
      const copy = extractCopy(entry, count, acquired);

      if (existing) {
        if (ownedId && !existing.ownedIds.includes(ownedId)) existing.ownedIds.push(ownedId);
        if (ownedId) existing.ownedTags[ownedId] = tagIds;
        if (ownedId && acquired) (existing.acquired ??= {})[ownedId] = acquired;
        if (ownedId) (existing.copies ??= {})[ownedId] = copy;
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
          description: firstString(
            card.description, card.short_description, card.wikidata_description, card.wiki_description,
            card.wikipedia_description, card.subtitle, card.summary, card.wikidata?.description, entry?.description,
          ),
          attack: firstNumber(card.attack, card.atk, card.stats?.attack),
          defense: firstNumber(card.defense, card.def, card.stats?.defense),
          tagIds,
          ownedTags: ownedId ? { [ownedId]: tagIds } : {},
          acquired: ownedId && acquired ? { [ownedId]: acquired } : {},
          copies: ownedId ? { [ownedId]: copy } : {},
        });
      }
    }

    onProgress?.({ page, cards: byCard.size, resumed });
    if (json?.has_more === false || json?.hasMore === false) {
      finished = true;
      break;
    }
  }

  await partialCollection.setValue(null).catch(() => undefined);
  if (!finished) console.warn(`[Collection+] chargement arrêté à ${page} pages (garde-fou)`);
  return [...byCard.values()];
}

/** Le nom exact des champs varie selon les versions de l'API : on prend le premier renseigné. */
const firstString = (...values: unknown[]) => values.find((v): v is string => typeof v === 'string' && v.trim() !== '') ?? null;
const firstNumber = (...values: unknown[]) => {
  const found = values.find((v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)));
  return found === undefined ? null : Number(found);
};

/** Date / provenance de l'exemplaire, si l'API les expose (noms de champs possibles). */
function extractAcquisition(entry: any): Acquisition | null {
  const rawAt = firstString(entry?.obtained_at, entry?.acquired_at, entry?.received_at, entry?.created_at, entry?.inserted_at);
  const at = rawAt ? Date.parse(rawAt) : NaN;
  const rawSource = (firstString(entry?.source, entry?.origin, entry?.obtained_from, entry?.obtained_via, entry?.acquired_via, entry?.acquisition_type) ?? '').toLowerCase();
  const source = /trade|exchange|echange|swap/.test(rawSource) ? 'trade' : /pack|booster|open|draw/.test(rawSource) ? 'pack' : null;
  if (Number.isNaN(at) && !source) return null;
  return { at: Number.isNaN(at) ? null : at, source, estimated: false };
}

/** Shiny et favori de l'exemplaire (champs de la table user_cards du site). */
function extractCopy(entry: any, count: number, acquired: Acquisition | null): CopyInfo {
  const flag = (...values: unknown[]) => values.some((v) => v === true || v === 1 || v === 'true');
  return {
    count,
    shiny: flag(entry?.is_shiny, entry?.shiny),
    starred: flag(entry?.starred, entry?.is_starred, entry?.favorite, entry?.is_favorite),
    at: acquired?.at ?? null,
  };
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
  update(tagId: string, patch: { name?: string; color?: string }): Promise<void>;
  /** Supprime l'étiquette et toutes ses poses. */
  delete(tagId: string): Promise<void>;
  /** Étiquettes posées, par exemplaire (user_card_id → tag ids), limitées aux étiquettes données. */
  assignments(tagIds: string[]): Promise<Map<string, string[]>>;
  addMany(tagId: string, ownedIds: string[]): Promise<void>;
  removeMany(tagId: string, ownedIds: string[]): Promise<void>;
}
