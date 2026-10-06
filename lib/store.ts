import { storage } from '#imports';
import { DEFAULT_PALETTE, type PaletteId } from './palettes';

/** Affichage des étiquettes sur les cartes. */
export type CardTagStyle = 'dots' | 'ribbon' | 'footer' | 'bookmarks';

export interface Settings {
  /** Une carte sans étiquette Trade ni Not Trade est considérée Trade. */
  defaultTrade: boolean;
  tradeTagName: string;
  notTradeTagName: string;
  /** Étiquette des cartes à défausser. */
  discardTagName: string;
  /** Pastilles Trade / Not Trade sur les cartes du site. */
  showBadges: boolean;
  /** Miniatures des cartes dans l'export Google Sheets. */
  sheetImages: boolean;
  theme: 'system' | 'light' | 'dark';
  /** Palette de couleurs (charte Holo) de l'interface et de l'icône. */
  palette: PaletteId;
  /** Style de livre des albums. */
  albumStyle: 'relie' | 'classeur';
  /** Page Étiquettes : dossiers animés ou liste. */
  tagsLayout: 'folders' | 'list';
  /** Distingue les albums de collection (emoji, couleur vive) des albums de rangement (« · Nom », gris). */
  albumKinds: boolean;
  /** Affichage des étiquettes sur les cartes, partout dans l'app. */
  cardTagStyle: CardTagStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultTrade: true,
  tradeTagName: '🟢 Trade',
  notTradeTagName: '🔴 Not Trade',
  discardTagName: '🗑️ Discard',
  showBadges: true,
  sheetImages: true,
  theme: 'system',
  palette: DEFAULT_PALETTE,
  albumStyle: 'relie',
  tagsLayout: 'folders',
  albumKinds: false,
  cardTagStyle: 'dots',
};

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** Anciens noms des étiquettes système, renommés avec leur pastille sur le site. */
export const LEGACY_TRADE_TAG_NAMES = { trade: 'Trade', notTrade: 'Not Trade' };

export async function getSettings(): Promise<Settings> {
  const settings = { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
  if (settings.tradeTagName === LEGACY_TRADE_TAG_NAMES.trade) settings.tradeTagName = DEFAULT_SETTINGS.tradeTagName;
  if (settings.notTradeTagName === LEGACY_TRADE_TAG_NAMES.notTrade) settings.notTradeTagName = DEFAULT_SETTINGS.notTradeTagName;
  return settings;
}

/**
 * Nombre d'exemplaires par carte au moment de la dernière revue validée.
 * Sert à calculer les cartes « nouvelles » (jamais vues ou exemplaires en plus).
 */
export const reviewedSnapshotItem = storage.defineItem<Record<string, number> | null>(
  'local:reviewedSnapshot',
  { fallback: null },
);

export const lastReviewAtItem = storage.defineItem<number | null>('local:lastReviewAt', {
  fallback: null,
});
