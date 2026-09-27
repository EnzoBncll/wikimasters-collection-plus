import { storage } from '#imports';
import type { TradeTags } from './trade';
import type { OwnedCard, SiteTag } from './types';

export interface CollectionCache {
  version: 2;
  /** Dernier chargement complet de la collection. */
  fullAt: number;
  /** Dernière vérification / mise à jour (légère ou complète). */
  syncedAt: number;
  /** Empreinte de /api/my-collection/stats au moment du chargement complet. */
  statsSig: string | null;
  cards: OwnedCard[];
  tags: SiteTag[];
  tradeTags: TradeTags;
}

/** Collection mise en cache localement (partagée entre l'overlay du site et l'onglet de l'extension). */
export const collectionCache = storage.defineItem<CollectionCache | null>('local:collectionCache.v2', {
  fallback: null,
});

/**
 * Passe à true quand le site a fait une action qui modifie la collection
 * (ouverture de paquet, échange, achat / vente…) : le prochain chargement sera complet.
 */
export const collectionDirty = storage.defineItem<boolean>('local:collectionDirty', { fallback: true });

/** Met à jour les cartes du cache après une modification locale (pose d'étiquettes). */
export async function saveCards(cards: OwnedCard[], syncedAt = Date.now()) {
  const cache = await collectionCache.getValue();
  if (!cache) return;
  await collectionCache.setValue({ ...cache, cards, syncedAt });
}
