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
export function pageCount(slotCount: number): number {
  const pages = Math.ceil(slotCount / SLOTS_PER_PAGE) + 1;
  return Math.max(2, pages + (pages % 2));
}
