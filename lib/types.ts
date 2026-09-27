export type Rarity = 'C' | 'PC' | 'R' | 'SR' | 'L' | 'UR';

export const RARITY_ORDER: Rarity[] = ['UR', 'L', 'SR', 'R', 'PC', 'C'];

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
  /** Étiquettes posées sur au moins un exemplaire (union de ownedTags). */
  tagIds: string[];
  /** Étiquettes par exemplaire : le site étiquette chaque user_card séparément. */
  ownedTags: Record<string, string[]>;
}

/** Étiquette native du site. */
export interface SiteTag {
  id: string;
  name: string;
  color: string | null;
}

export type TradeStatus = 'trade' | 'not_trade' | 'unset';
