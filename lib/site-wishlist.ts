import { apiJson } from './api';
import { currentUserId, rest, restAll } from './supabase';
import type { OwnedCard, Rarity } from './types';

/**
 * Liste de souhaits native de WikiMasters (table Supabase `wishlist_items`, une ligne par carte du catalogue),
 * la même que le cœur de « Toutes les cartes » : partagée entre tous les appareils du compte.
 */

export async function wishlistIds(): Promise<Set<string>> {
  const uid = await currentUserId();
  const rows = await restAll<{ card_id: string | number }>(`wishlist_items?select=card_id&user_id=eq.${uid}`);
  return new Set(rows.map((r) => String(r.card_id)));
}

export async function addWish(cardId: string): Promise<void> {
  const user_id = await currentUserId();
  try {
    await rest('wishlist_items', { method: 'POST', body: { user_id, card_id: cardId }, prefer: 'return=minimal' });
  } catch (error) {
    // Déjà dans la liste : rien à faire.
    if ((error as { status?: number }).status !== 409) throw error;
  }
}

export async function removeWish(cardId: string): Promise<void> {
  const uid = await currentUserId();
  await rest(`wishlist_items?user_id=eq.${uid}&card_id=eq.${encodeURIComponent(cardId)}`, { method: 'DELETE', prefer: 'return=minimal' });
}

/* ---------- Page Souhaits ---------- */

/** Une carte du catalogue WikiMasters (réponse de /api/cards). */
export interface CatalogCard {
  cardId: string;
  title: string;
  rarity: Rarity | null;
  imageUrl: string | null;
  wikipediaUrl: string | null;
  description: string | null;
  attack: number | null;
  defense: number | null;
}

export interface SiteWishlist {
  cards: CatalogCard[];
  /** Cartes souhaitées que tu possèdes déjà. */
  owned: Set<string>;
  /** Amis qui possèdent chaque carte souhaitée (pseudo), pour proposer un échange. */
  friends: Record<string, string[]>;
}

const firstString = (...v: unknown[]) => v.find((x): x is string => typeof x === 'string' && x.trim() !== '') ?? null;
const firstNumber = (...v: unknown[]) => {
  const f = v.find((x) => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)));
  return f === undefined ? null : Number(f);
};

function toCatalogCard(card: any): CatalogCard {
  return {
    cardId: String(card.id),
    title: String(card.wikipedia_title ?? card.name ?? ''),
    rarity: (['C', 'PC', 'R', 'SR', 'UR', 'L'] as Rarity[]).includes(card.rarity) ? card.rarity : null,
    imageUrl: !card.hide_image && card.image_url ? String(card.image_url) : null,
    wikipediaUrl: card.wikipedia_url ?? null,
    description: firstString(card.description, card.short_description, card.wikidata_description, card.wiki_description, card.subtitle),
    attack: firstNumber(card.atk, card.attack, card.stats?.attack),
    defense: firstNumber(card.def, card.defense, card.stats?.defense),
  };
}

/** Pour l'affichage avec WmCard. */
export function catalogAsCard(card: CatalogCard, count = 0): OwnedCard {
  return { ...card, ownedIds: [], count, tagIds: [], ownedTags: {} };
}

const MAX_PAGES = 40;

/** Toute la liste de souhaits du site, avec les cartes possédées et les amis qui les ont. */
export async function fetchSiteWishlist(): Promise<SiteWishlist> {
  const out: SiteWishlist = { cards: [], owned: new Set(), friends: {} };
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await apiJson<any>(`/api/cards?page=${page}&sort=rarity&wishlist=1`);
    const cards: any[] = Array.isArray(json?.cards) ? json.cards : [];
    for (const c of cards) {
      const card = toCatalogCard(c);
      if (seen.has(card.cardId)) continue;
      seen.add(card.cardId);
      out.cards.push(card);
    }
    for (const id of json?.ownedCardIds ?? []) out.owned.add(String(id));
    for (const [id, friends] of Object.entries<any>(json?.friendOwners ?? {})) {
      out.friends[id] = (friends as any[]).map((f) => String(f?.username ?? '')).filter(Boolean);
    }
    const total = Number(json?.total);
    if (cards.length < 50 || (Number.isFinite(total) && out.cards.length >= total)) break;
  }
  return out;
}

/** Recherche dans le catalogue du site (3 caractères minimum). */
export async function searchCatalog(query: string): Promise<CatalogCard[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const json = await apiJson<any>(`/api/cards?page=0&q=${encodeURIComponent(q)}`);
  return (Array.isArray(json?.cards) ? json.cards : []).map(toCatalogCard);
}

/** Carte du catalogue pour un article donné (titre exact), pour passer un souhait d'album sur le site. */
export async function findCatalogCard(title: string): Promise<CatalogCard | null> {
  const key = title.replace(/_/g, ' ').trim().toLowerCase();
  const found = await searchCatalog(title);
  return found.find((c) => c.title.replace(/_/g, ' ').trim().toLowerCase() === key) ?? null;
}
