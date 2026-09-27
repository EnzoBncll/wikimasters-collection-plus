import { storage } from '#imports';
import { DEFAULT_PALETTE, type PaletteId } from './palettes';

export interface Settings {
  /** Une carte sans étiquette Trade ni Not Trade est considérée Trade. */
  defaultTrade: boolean;
  tradeTagName: string;
  notTradeTagName: string;
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
}

export const DEFAULT_SETTINGS: Settings = {
  defaultTrade: true,
  tradeTagName: 'Trade',
  notTradeTagName: 'Not Trade',
  showBadges: true,
  sheetImages: true,
  theme: 'system',
  palette: DEFAULT_PALETTE,
  albumStyle: 'relie',
  tagsLayout: 'folders',
};

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
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
