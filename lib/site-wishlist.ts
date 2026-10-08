import { currentUserId, rest, restAll } from './supabase';

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
