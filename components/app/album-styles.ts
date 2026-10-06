import type { CSSProperties } from 'react';

/** Styles de livre pour les albums (réglage `albumStyle`). */
export type AlbumStyleId = 'relie' | 'classeur';

/** Bruit SVG (grain), teinte et opacité réglables. */
const noise = (freq: string, rgb: string, alpha: number, size = 160) => {
  const [r, g, b] = rgb.split(' ');
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${alpha} 0'/%3E%3C/filter%3E%3Crect width='${size}' height='${size}' filter='url(%23n)'/%3E%3C/svg%3E")`;
};

/** Papier : grain fin + fibres étirées. */
const PAPER_GRAIN = noise('.85', '.35 .3 .22', 0.16);
const PAPER_FIBERS = noise('.012 .35', '.45 .38 .28', 0.12, 240);
/** Toile de reliure : trame croisée + grain. */
const CLOTH =
  'repeating-linear-gradient(0deg, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgb(0 0 0 / 0.08) 0 1px, transparent 1px 3px)';
const CLOTH_GRAIN = noise('.7', '0 0 0', 0.35);
/** Plastique grainé du classeur. */
const PVC_GRAIN = noise('.95', '1 1 1', 0.07);
/** Carton noir des pages du classeur (petites fibres claires). */
const BLACK_STOCK = noise('.9', '.8 .8 .85', 0.06);

export interface AlbumStyle {
  id: AlbumStyleId;
  name: string;
  /** Livre incliné en perspective, tranches de pages visibles. */
  depth?: boolean;
  /** Couverture ouverte derrière les pages. */
  frame: (gradient: string) => CSSProperties;
  /** Débord de la couverture autour des pages (en unités de page) : haut, côtés, bas. */
  frameInset: { top: number; side: number; bottom: number };
  /** Couverture (avant ouverture). */
  cover: (gradient: string) => CSSProperties;
  coverTitle: string;
  page: string;
  /** Fond de page selon le côté (ombres de courbure vers la reliure). */
  pageStyle: (side: 'left' | 'right') => CSSProperties;
  header: string;
  headerAccent: string;
  slotEmpty: string;
  slotNumber: string;
  /** Nom d'une carte à trouver (album à objectif). */
  slotLabel: string;
  /** Enveloppe autour de la carte collée. */
  sticker: string;
  /** Multiplicateur de l'inclinaison « collée à la main ». */
  tilt: number;
  folio: string;
}

/** Courbure de la page : ombre profonde au pli, léger reflet, bords un peu plus sombres. */
const curve = (side: 'left' | 'right', dark: boolean) => {
  const to = side === 'left' ? 'to left' : 'to right';
  const from = side === 'left' ? 'to right' : 'to left';
  return dark
    ? `linear-gradient(${to}, rgb(0 0 0 / 0.55) 0%, rgb(0 0 0 / 0.15) 4%, transparent 14%), linear-gradient(${from}, rgb(255 255 255 / 0.03), transparent 8%)`
    : `linear-gradient(${to}, rgb(60 40 10 / 0.32) 0%, rgb(60 40 10 / 0.1) 4%, rgb(255 255 255 / 0.4) 10%, transparent 22%), linear-gradient(${from}, rgb(60 40 10 / 0.07), transparent 5%), linear-gradient(rgb(60 40 10 / 0.05), transparent 6%, transparent 94%, rgb(60 40 10 / 0.07))`;
};

export const ALBUM_STYLES: Record<AlbumStyleId, AlbumStyle> = {
  relie: {
    id: 'relie',
    name: 'Relié 3D',
    depth: true,
    // Plus large sur les côtés et en bas : c'est là que se voient les tranches de pages.
    frameInset: { top: 1.6, side: 4, bottom: 5.4 },
    frame: (gradient) => ({
      background: `${CLOTH_GRAIN}, ${CLOTH}, linear-gradient(rgb(0 0 0 / 0.12), rgb(0 0 0 / 0.12)), ${gradient}`,
      boxShadow: [
        'inset 0 1px 0 rgb(255 255 255 / 0.25)',
        'inset 0 -3px 5px rgb(0 0 0 / 0.35)',
        '0 2px 0 rgb(0 0 0 / 0.35)',
        '0 4px 0 rgb(0 0 0 / 0.3)',
        '0 6px 1px rgb(0 0 0 / 0.3)',
        '0 45px 70px -10px rgb(0 0 0 / 0.65)',
      ].join(', '),
    }),
    cover: (gradient) => ({
      background: `${CLOTH_GRAIN}, ${CLOTH}, ${gradient}`,
      boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.15), inset -6px 0 12px rgb(0 0 0 / 0.25)',
    }),
    coverTitle: 'font-black tracking-tight',
    page: 'text-zinc-800',
    pageStyle: (side) => ({ background: `${curve(side, false)}, ${PAPER_FIBERS}, ${PAPER_GRAIN}, #fbf6ea` }),
    header: 'font-semibold tracking-[0.18em] text-[#8a7a60] uppercase',
    headerAccent: 'bg-holo opacity-70',
    slotEmpty: 'rounded-[calc(var(--u)*1.4)] border border-[#d8ccb4] bg-[rgb(120_90_40/0.04)] shadow-[inset_0_1px_2px_rgb(120_90_40/0.12)]',
    slotNumber: 'font-black text-[#cfc2a6]',
    slotLabel: 'text-[#7a6a4f]',
    sticker:
      "after:pointer-events-none after:absolute after:inset-0 after:z-50 after:rounded-[inherit] after:bg-[linear-gradient(135deg,rgb(255_255_255/0.22),transparent_38%)] after:content-[''] [&>.wm-card]:shadow-[0_1px_1px_rgb(0_0_0/0.25),0_4px_10px_-4px_rgb(60_40_10/0.5)]",
    tilt: 1,
    folio: 'font-serif italic text-[#a8987a]',
  },
  classeur: {
    id: 'classeur',
    name: 'Classeur',
    frameInset: { top: 2.8, side: 2.8, bottom: 2.8 },
    frame: (gradient) => ({
      background: `${PVC_GRAIN}, radial-gradient(140% 80% at 50% 0%, rgb(255 255 255 / 0.1), transparent 60%), linear-gradient(rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.55)), ${gradient}`,
      boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.15), inset 0 -2px 4px rgb(0 0 0 / 0.5), 0 35px 70px -10px rgb(0 0 0 / 0.7)',
    }),
    cover: (gradient) => ({
      background: `${PVC_GRAIN}, radial-gradient(140% 80% at 30% 0%, rgb(255 255 255 / 0.12), transparent 60%), linear-gradient(rgb(0 0 0 / 0.45), rgb(0 0 0 / 0.45)), ${gradient}`,
    }),
    coverTitle: 'font-black tracking-tight bg-white/90 text-zinc-900 px-[calc(var(--u)*5)] py-[calc(var(--u)*2.5)] rounded-[calc(var(--u)*1)] shadow-md',
    page: 'text-zinc-300',
    pageStyle: (side) => ({ background: `${curve(side, true)}, ${BLACK_STOCK}, linear-gradient(160deg, #1d2027, #121419)` }),
    header: 'font-semibold tracking-[0.18em] text-zinc-500 uppercase',
    headerAccent: 'bg-holo opacity-70',
    slotEmpty:
      "rounded-[calc(var(--u)*0.8)] bg-white/[0.035] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.13),inset_0_1px_0_rgb(255_255_255/0.08)] before:absolute before:inset-x-[8%] before:top-[calc(var(--u)*0.8)] before:h-px before:bg-white/20 before:content-['']",
    slotNumber: 'font-black text-white/[0.07]',
    slotLabel: 'text-white/60',
    sticker:
      "after:pointer-events-none after:absolute after:-inset-[calc(var(--u)*0.5)] after:z-50 after:rounded-[calc(var(--u)*0.9)] after:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.22)] after:bg-[linear-gradient(115deg,rgb(255_255_255/0.2),rgb(255_255_255/0.04)_30%,transparent_45%,transparent_70%,rgb(255_255_255/0.08)_85%,transparent)] after:content-['']",
    tilt: 0,
    folio: 'text-zinc-600',
  },
};

export const ALBUM_STYLE_IDS = Object.keys(ALBUM_STYLES) as AlbumStyleId[];
