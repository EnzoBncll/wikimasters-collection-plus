export type Rarity = 'C' | 'PC' | 'R' | 'SR' | 'L' | 'UR';

/** De la plus haute à la plus basse : Légendaire est au-dessus d'Ultra rare. */
export const RARITY_ORDER: Rarity[] = ['L', 'UR', 'SR', 'R', 'PC', 'C'];

export const RARITY_LABEL: Record<Rarity, string> = {
  C: 'Commun',
  PC: 'Peu commun',
  R: 'Rare',
  SR: 'Super rare',
  L: 'Légendaire',
  UR: 'Ultra rare',
};

/** Une carte de la collection, regroupée par carte du catalogue (card_id). */
export interface OwnedCard {
  cardId: string;
  /** Identifiants des exemplaires possédés (entrées de /api/my-collection). */
  ownedIds: string[];
  count: number;
  title: string;
  rarity: Rarity | null;
  imageUrl: string | null;
  wikipediaUrl: string | null;
  /** Courte description (Wikidata), affichée sur la carte comme sur le site. */
  description?: string | null;
  /** Statistiques de jeu, si l'API les fournit. */
  attack?: number | null;
  defense?: number | null;
  /** Étiquettes posées sur au moins un exemplaire (union de ownedTags). */
  tagIds: string[];
  /** Étiquettes par exemplaire : le site étiquette chaque user_card séparément. */
  ownedTags: Record<string, string[]>;
  /** Date et provenance de chaque exemplaire (clé : user_card id). */
  acquired?: Record<string, Acquisition>;
}

export type AcquisitionSource = 'pack' | 'trade';

export interface Acquisition {
  /** Horodatage d'obtention (ms), inconnu pour les cartes déjà là à l'installation. */
  at: number | null;
  source: AcquisitionSource | null;
  /** Déduit des actions faites sur le site plutôt que fourni par l'API. */
  estimated: boolean;
}

/** Étiquette native du site. */
export interface SiteTag {
  id: string;
  name: string;
  color: string | null;
}

export type TradeStatus = 'trade' | 'not_trade' | 'unset';
