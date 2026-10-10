import { storage } from '#imports';
import { DEFAULT_PALETTE, type PaletteId } from './palettes';

/** Affichage des étiquettes sur les cartes. */
export type CardTagStyle = 'dots' | 'ribbon' | 'footer' | 'bookmarks';

/** Habillage des cartes (la disposition intérieure ne change pas). */
export const CARD_STYLE_IDS = ['classic', 'printed', 'printed-b', 'foil', 'foil-b', 'foil-c', 'material', 'material-b', 'material-c', 'fullart'] as const;
/** Habillage : « printed » / « foil » / « material » sont les variantes A, « -b » / « -c » les suivantes ; « fullart » : photo sur toute la carte. */
export type CardStyle = (typeof CARD_STYLE_IDS)[number];

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
  albumStyle: 'relie' | 'classeur' | 'grimoire' | 'herbier';
  /** Page Étiquettes : dossiers animés ou liste. */
  tagsLayout: 'folders' | 'list';
  /** Page Albums : rangement de la bibliothèque (albums à objectif et collections finies). */
  libraryOrder: 'progress' | 'style' | 'recent' | 'color' | 'alpha';
  /** Page Albums : planche des étagères de la bibliothèque. */
  shelfStyle: 'wood' | 'glass' | 'marble';
  /** Distingue les albums de collection (emoji, couleur vive) des albums de rangement (« · Nom », gris). */
  albumKinds: boolean;
  /** Affichage des étiquettes sur les cartes, partout dans l'app. */
  cardTagStyle: CardTagStyle;
  /** Habillage des cartes, partout dans l'app. */
  cardStyle: CardStyle;
  /** Clé gratuite Google AI Studio (Gemini) pour les demandes libres des albums à objectif ; vide = analyse sans IA. */
  geminiApiKey: string;

  // ---- Sur WikiMasters ----
  /** Façon d'appliquer la palette sur le site : couleur pleine + halo, ambiance teintée, ou irisé réservé aux paquets. */
  siteLook: 'solid' | 'ambient' | 'holo';
  /** Les cartes révélées respirent doucement (léger va-et-vient et oscillation). */
  cardBreathe: boolean;
  /** Les cartes révélées prennent l'habillage choisi dans Collection+. */
  revealSkin: boolean;
  /** Animation quand la carte tirée fait partie d'un album à objectif. */
  goalAlbumFx: boolean;
  /** … et la carte est vraiment ajoutée à cet album sur WikiMasters. */
  goalAutoStick: boolean;
  /** Nouvelle interface de la page d'ouverture (fond animé, paquet flottant, jauges). */
  packStage: boolean;
  /** Mise en scène du révélé selon la rareté (particules, halos, bannière). */
  revealFx: boolean;
  /** Petits sons synthétisés pendant l'ouverture et le révélé. */
  sound: boolean;
  /** Volume des sons (0 à 1). */
  soundVolume: number;
  /** Pastille « NOUVELLE » sur une carte jamais possédée. */
  newBadge: boolean;
  /** Récap du paquet une fois toutes les cartes vues. */
  packRecap: boolean;
  /** Espace : ouvrir un paquet, puis carte suivante. */
  spaceKey: boolean;
  /** Révélé éclair pour C, PC et R (hors shiny). */
  fastReveal: boolean;
  /** Volets de rangement pendant le révélé : rangement à gauche, collections à droite. */
  revealPanels: boolean;
  /** … volet de gauche (rangements). */
  revealPanelLeft: boolean;
  /** … volet de droite (collections). */
  revealPanelRight: boolean;
  /** … raccourcis clavier du rangement (1–9, ⇧1–9, ← ↓ →, /). */
  revealKeys: boolean;
  /** Statistiques de tirage sur la page des paquets. */
  packStats: boolean;
  /** Bouton plein écran (inclinaison 3D) sur les cartes du site. */
  cardFullscreen: boolean;
  /** Image libre (Wikipédia / Commons) pour les cartes sans image. */
  freeImages: boolean;
  /** Liste de souhaits mise en avant sur le marché et les échanges, cœur pour ajouter depuis le marché. */
  wishHighlight: boolean;
  /** Page Échanges : mini-cartes (image, rareté, titre complet) à la place des noms tronqués. */
  tradePreviews: boolean;
  /** Mode revue (page Cards) : mise en scène par rareté, comme à l'ouverture des paquets. */
  reviewFullStage: boolean;
  /** (n/10) dans le titre de l'onglet WikiMasters. */
  tabTitle: boolean;
  /** Nombre de paquets sur l'icône de l'extension. */
  iconBadge: boolean;
  /** Notification quand le seuil de paquets est atteint. */
  notifyFull: boolean;
  notifyThreshold: number;
  /** Rappel quotidien du pack PRO. */
  proReminder: boolean;
  proHour: number;
  /** Régénération des paquets : détectée, normale (10 min) ou PRO (3 min). */
  regenMode: 'auto' | 'normal' | 'pro';
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
  libraryOrder: 'progress',
  shelfStyle: 'wood',
  albumKinds: false,
  cardTagStyle: 'dots',
  cardStyle: 'classic',
  geminiApiKey: '',
  siteLook: 'solid',
  cardBreathe: true,
  revealSkin: true,
  goalAlbumFx: true,
  goalAutoStick: true,
  packStage: true,
  revealFx: true,
  sound: true,
  soundVolume: 0.6,
  newBadge: true,
  packRecap: true,
  spaceKey: true,
  fastReveal: false,
  revealPanels: true,
  revealPanelLeft: true,
  revealPanelRight: true,
  revealKeys: true,
  packStats: true,
  cardFullscreen: true,
  freeImages: false,
  wishHighlight: true,
  tradePreviews: true,
  reviewFullStage: false,
  tabTitle: true,
  iconBadge: true,
  notifyFull: true,
  notifyThreshold: 10,
  proReminder: true,
  proHour: 12,
  regenMode: 'auto',
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
  // Habillage retiré depuis (ex. « printed-c ») : retour à l'actuel.
  if (!(CARD_STYLE_IDS as readonly string[]).includes(settings.cardStyle)) settings.cardStyle = DEFAULT_SETTINGS.cardStyle;
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
