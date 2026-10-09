import { storage } from '#imports';
import { RARITY_ORDER, type OwnedCard } from './types';

/** Emplacements par page d'album (grille 3 × 3). */
export const SLOTS_PER_PAGE = 9;

/**
 * Disposition des albums, par étiquette (ou « none » pour les cartes sans étiquette) :
 * un emplacement par case, `null` pour une case vide. Rangement purement local, le site n'a pas d'ordre.
 */
export const albumLayoutsItem = storage.defineItem<Record<string, (string | null)[]>>('local:albumLayouts', {
  fallback: {},
});

const rank = (card: OwnedCard) => (card.rarity ? RARITY_ORDER.indexOf(card.rarity) : RARITY_ORDER.length);

/** Retire les cases vides en fin d'album. */
export function trimSlots(slots: (string | null)[]): (string | null)[] {
  let end = slots.length;
  while (end > 0 && slots[end - 1] === null) end--;
  return slots.slice(0, end);
}

/**
 * Aligne une disposition enregistrée sur les cartes actuelles de l'étiquette :
 * les cartes disparues libèrent leur case, les nouvelles s'ajoutent à la fin (par rareté puis titre).
 */
export function reconcileSlots(saved: (string | null)[] | undefined, cards: OwnedCard[]): (string | null)[] {
  const ids = new Set(cards.map((c) => c.cardId));
  const slots = trimSlots((saved ?? []).map((id) => (id && ids.has(id) ? id : null)));
  const placed = new Set(slots);
  const fresh = cards
    .filter((c) => !placed.has(c.cardId))
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'fr'));
  return [...slots, ...fresh.map((c) => c.cardId)];
}

/** Échange le contenu de deux cases (la case d'arrivée peut être vide ou au-delà de la fin). */
export function swapSlots(slots: (string | null)[], from: number, to: number): (string | null)[] {
  const next = [...slots];
  while (next.length <= Math.max(from, to)) next.push(null);
  [next[from], next[to]] = [next[to] ?? null, next[from] ?? null];
  return trimSlots(next);
}

/** Nombre de pages : de quoi tout ranger, plus une page libre pour réorganiser ; toujours pair (doubles pages). */
export function pageCount(slotCount: number, perPage = SLOTS_PER_PAGE): number {
  const pages = Math.ceil(slotCount / perPage) + 1;
  return Math.max(2, pages + (pages % 2));
}

/** Description libre affichée sous le titre de la couverture, par album (même clé que la disposition). */
export const albumDescriptionsItem = storage.defineItem<Record<string, string>>('local:albumDescriptions', {
  fallback: {},
});

/** Style de livre propre à un album (même clé que la disposition) ; absent = style par défaut des réglages. */
export const albumStylesItem = storage.defineItem<Record<string, 'relie' | 'classeur' | 'grimoire' | 'herbier'>>('local:albumStyles', { fallback: {} });

/**
 * Apparence d'un album (menu pinceau), par album ; chaque champ absent prend sa valeur par défaut.
 * Le style du livre, le relief, les parties et l'ordre ont leurs propres entrées (plus anciennes).
 */
export interface AlbumLook {
  /** Emblème de couverture : « ◇ », un emoji, « card:<id> » (carte en médaillon) ou '' (aucun). */
  emblem?: string;
  /** Couverture du grimoire. */
  grimoireCover?: 'a' | 'b' | 'c';
  /** Cases par page : 4 grandes (2 × 2), 9 (3 × 3) ou 16 petites (4 × 4). */
  perPage?: 4 | 9 | 16;
  /** Case à trouver (album à objectif) : son nom, une silhouette, ou l'image de l'article floutée. */
  missing?: 'name' | 'silhouette' | 'blur';
  numbers?: boolean;
  /** Motif de fond des pages (Grimoire, Herbier). */
  pattern?: boolean;
  /** Habillage des cartes dans cet album ; absent = celui des réglages. */
  cardStyle?: string;
  /** Cartes collées légèrement de travers. */
  tilted?: boolean;
  /** Reflets et animations des cartes rares. */
  shine?: boolean;
  /** Bruit de page qui tourne. */
  sound?: boolean;
  speed?: 'normal' | 'fast' | 'none';
}

export const DEFAULT_LOOK: Required<Omit<AlbumLook, 'cardStyle' | 'emblem'>> = {
  grimoireCover: 'b',
  perPage: 9,
  missing: 'name',
  numbers: true,
  pattern: true,
  tilted: true,
  shine: true,
  sound: false,
  speed: 'normal',
};

export const albumLooksItem = storage.defineItem<Record<string, AlbumLook>>('local:albumLooks', { fallback: {} });

/** Relief propre à un album : true = 3D (incliné, épaisseur), false = 2D ; absent = selon le style. */
export const albumDepthItem = storage.defineItem<Record<string, boolean>>('local:albumDepth', { fallback: {} });

/** Mise en page des parties d'un album à objectif (voir goal-layout.ts), par album ; absent = « tile ». */
export const albumSectionsItem = storage.defineItem<Record<string, 'tile' | 'row' | 'page' | 'color'>>('local:albumSections', { fallback: {} });

/** Vue de l'album : rangement manuel (enregistré) ou tri par rareté, sans toucher au rangement. Par album. */
export type AlbumOrder = 'manual' | 'rarity';
export const albumOrdersItem = storage.defineItem<Record<string, AlbumOrder>>('local:albumOrders', { fallback: {} });

/** Cases de la vue par rareté : de la plus rare à la plus commune, puis par titre, sans case vide. */
export function raritySlots(cards: OwnedCard[]): string[] {
  return [...cards].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'fr')).map((c) => c.cardId);
}

/**
 * Cartes écartées d'un album à la main (croix sur la vignette), par étiquette.
 * Listées sous les suggestions pour pouvoir les remettre, et plus jamais proposées pour cet album.
 */
export const albumRemovedItem = storage.defineItem<Record<string, string[]>>('local:albumRemoved', { fallback: {} });
