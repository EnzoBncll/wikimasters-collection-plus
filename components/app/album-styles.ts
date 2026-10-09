import { Book, BookKey, Leaf, NotebookTabs, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

/** Styles de livre pour les albums (réglage `albumStyle`). */
export type AlbumStyleId = 'relie' | 'classeur' | 'grimoire' | 'herbier';

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
/** Cuir du grimoire : grain serré et marbrures. */
const LEATHER = noise('.55', '0 0 0', 0.45);
const LEATHER_MOTTLE = noise('.018', '.2 .1 .05', 0.35, 260);
/** Parchemin : taches de rousseur et fibres. */
const FOXING = noise('.03', '.55 .35 .12', 0.18, 300);
/** Taches de rousseur : grandes auréoles (seuil sur un bruit lent) et piqûres fines. */
/** Image étirée à la taille de l'élément (traits d'épaisseur fixe avec vector-effect). */
const stretched = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'>${body}</svg>`)}")`;
const svg = (w: number, h: number, body: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;
/** Matrice de couleur : teinte fixe, opacité = k × bruit + décalage (seuil). */
const tint = (rgb: string, k: number, off: number) => {
  const [r, g, b] = rgb.split(' ');
  return `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${k} 0 0 0 ${off}`;
};
/** Auréoles rares : seuil haut sur un bruit lent ; `size` varie d'une couche à l'autre pour casser la répétition. */
const spots = (rgb: string, strength: number, seed: number, size = 530) =>
  svg(
    size,
    size,
    `<filter id='s'><feTurbulence type='fractalNoise' baseFrequency='${(37 / size).toFixed(3)}' numOctaves='3' seed='${seed}'/><feColorMatrix values='${tint(rgb, 3 * strength, -2.15 * strength)}'/></filter><rect width='${size}' height='${size}' filter='url(#s)'/>`,
  );
/** Piqûres fines, clairsemées. */
const speckles = (rgb: string, seed: number, size = 330) =>
  svg(
    size,
    size,
    `<filter id='p'><feTurbulence type='fractalNoise' baseFrequency='.55' numOctaves='1' seed='${seed}'/><feColorMatrix values='${tint(rgb, 14, -12.1)}'/></filter><rect width='${size}' height='${size}' filter='url(#p)'/>`,
  );
/**
 * Page aux bords irréguliers (déchirés) : un rectangle déformé par du bruit sert de masque.
 * Le côté de la reliure reste droit (le rectangle déborde de ce côté).
 */
const tornMask = (side: 'left' | 'right', roughness: number, seed: number) =>
  svg(
    500,
    700,
    `<filter id='t' x='-5%' y='-5%' width='110%' height='110%'><feTurbulence type='fractalNoise' baseFrequency='.09' numOctaves='4' seed='${seed}'/><feDisplacementMap in='SourceGraphic' scale='${roughness}'/></filter><rect x='${side === 'left' ? 9 : -40}' y='9' width='531' height='682' rx='10' filter='url(#t)'/>`,
  );
/* ---------- Motifs d'herbier : quelques plantes éparses, de tailles et d'angles variés ---------- */

const fern = (n: number) =>
  `<path d='M0 0 C6 -40 10 -80 30 -120'/>${Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const x = t * 22 + Math.sin(t * 3) * 3;
    const y = -t * 110;
    const l = 18 - i * (14 / n);
    return `<path d='M${x.toFixed(1)} ${y.toFixed(1)} q-${l.toFixed(1)} -3 -${(l + 3).toFixed(1)} -${(l * 0.7).toFixed(1)}'/><path d='M${x.toFixed(1)} ${y.toFixed(1)} q${l.toFixed(1)} -7 ${(l + 2).toFixed(1)} -${(l * 0.9).toFixed(1)}'/>`;
  }).join('')}`;
const leaf = `<path d='M0 0 C-22 -18 -20 -52 6 -78 C26 -52 24 -18 0 0 Z'/><path d='M0 0 L4 -74 M2 -22 l12 -9 M3 -40 l-12 -9 M4 -56 l9 -8'/>`;
const sprig = `<path d='M0 0 C4 -30 12 -50 26 -66'/>${[0, 1, 2, 3, 4].map((i) => `<circle cx='${(5 + i * 5).toFixed(0)}' cy='${(-20 - i * 11).toFixed(0)}' r='${(3.6 - i * 0.4).toFixed(1)}'/>`).join('')}`;
const flower = `<path d='M0 0 C2 -20 -2 -36 0 -50'/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx='0' cy='-60' rx='4' ry='9' transform='rotate(${a} 0 -50)'/>`).join('')}<circle cx='0' cy='-50' r='3'/><path d='M0 -18 c-10 -4 -14 -12 -12 -18 c8 2 12 8 12 18 z'/>`;
const place = (motif: string, x: number, y: number, rot: number, scale: number) => `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${scale})'>${motif}</g>`;
const ink = (body: string) => `<g fill='none' stroke='rgb(85 110 70)' stroke-opacity='.13' stroke-width='1.2' stroke-linecap='round'>${body}</g>`;
/** Deux trames de tailles premières entre elles : les motifs ne se répètent pas au même endroit. */
const BOTANICAL_A = svg(670, 670, ink(place(fern(9), 90, 330, -18, 1.25) + place(flower, 470, 170, 24, 0.9) + place(leaf, 520, 600, -130, 0.8)));
const BOTANICAL_B = svg(910, 910, ink(place(sprig, 300, 760, 38, 1.1) + place(leaf, 760, 380, 70, 0.6) + place(fern(7), 640, 880, 160, 0.8)));

/* ---------- Couverture du grimoire (sceau et sangle) ---------- */

const GOLD = `<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f3d98f'/><stop offset='.5' stop-color='#b8892f'/><stop offset='1' stop-color='#e6c46a'/></linearGradient>`;
/** Double filet doré (traits d'épaisseur fixe, étirés à la taille de la couverture). */
const GRIMOIRE_FRAME = stretched(
  100,
  100,
  `<g fill='none' stroke='#d6ac54' vector-effect='non-scaling-stroke'><rect x='9' y='5' width='76' height='90' stroke-opacity='.8' stroke-width='1.5' vector-effect='non-scaling-stroke'/><rect x='11.2' y='6.8' width='71.6' height='86.4' stroke-opacity='.45' stroke-width='.9' vector-effect='non-scaling-stroke'/></g>`,
);
const GRIMOIRE_DIAMOND = svg(20, 20, `<path d='M0 10 L10 2 L20 10 L10 18 Z' fill='#d6ac54' fill-opacity='.85'/>`);
/** Sangle de cuir cousue (étirée sur toute la hauteur). */
const GRIMOIRE_STRAP = stretched(
  22,
  100,
  `<defs><linearGradient id='s' x1='0' x2='1'><stop offset='0' stop-color='#22140c'/><stop offset='.45' stop-color='#4d301d'/><stop offset='1' stop-color='#1d110a'/></linearGradient></defs><rect width='22' height='100' fill='url(#s)'/><g stroke='#c9a14a' stroke-opacity='.75' stroke-width='1' stroke-dasharray='3 3'><line x1='3' y1='0' x2='3' y2='100' vector-effect='non-scaling-stroke'/><line x1='19' y1='0' x2='19' y2='100' vector-effect='non-scaling-stroke'/></g>`,
);
const GRIMOIRE_BUCKLE = svg(
  42,
  40,
  `<defs>${GOLD}</defs><rect x='3' y='3' width='36' height='34' rx='4' fill='none' stroke='url(#g)' stroke-width='5'/><rect x='19' y='5' width='4.5' height='30' rx='1' fill='url(#g)'/><circle cx='21.2' cy='20' r='1.6' fill='#5a3d0e'/>`,
);
/** Sceau de cire rouge, bord irrégulier, ◇ en relief. */
const GRIMOIRE_SEAL = svg(
  60,
  60,
  `<defs><radialGradient id='w' cx='.38' cy='.32' r='.75'><stop offset='0' stop-color='#e2483d'/><stop offset='.7' stop-color='#9b1b15'/><stop offset='1' stop-color='#6d0f0b'/></radialGradient></defs><path d='M30 3 C40 2 47 8 52 14 C59 20 57 29 57 33 C58 43 50 51 42 55 C34 59 24 58 17 53 C8 48 3 40 4 31 C3 21 9 12 17 7 C21 4 26 3 30 3 Z' fill='url(#w)'/><circle cx='30' cy='30' r='17' fill='none' stroke='#5e0e0b' stroke-opacity='.65' stroke-width='1.6'/><circle cx='30' cy='30' r='14' fill='none' stroke='#ff8a7a' stroke-opacity='.25' stroke-width='.8'/><path d='M30 19 L40 30 L30 41 L20 30 Z' fill='none' stroke='#5e0e0b' stroke-width='2.6'/><path d='M30 19 L40 30 L30 41 L20 30 Z' fill='none' stroke='#ff9d8f' stroke-opacity='.35' stroke-width='.8' transform='translate(-.6 -.6)'/><ellipse cx='22' cy='15' rx='6' ry='3' fill='#fff' fill-opacity='.18' transform='rotate(-25 22 15)'/>`,
);

const BRASS = `<linearGradient id='b' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f6dc8e'/><stop offset='.5' stop-color='#a87b26'/><stop offset='1' stop-color='#e2be66'/></linearGradient>`;
/** Coin de laiton riveté (haut gauche ; tourné pour les autres coins). */
const brassCorner = (rot: number) =>
  svg(
    60,
    60,
    `<defs>${BRASS}</defs><g transform='rotate(${rot} 30 30)'><path d='M2 2 H44 V12 H12 V44 H2 Z' fill='url(#b)' stroke='#5a3d0e' stroke-width='1'/><circle cx='7' cy='7' r='2.2' fill='#fff3c4'/><circle cx='36' cy='7' r='1.6' fill='#fff3c4'/><circle cx='7' cy='36' r='1.6' fill='#fff3c4'/></g>`,
  );
const GRIMOIRE_MEDALLION = svg(
  100,
  100,
  `<defs>${BRASS}</defs><circle cx='50' cy='50' r='44' fill='none' stroke='url(#b)' stroke-width='6'/><circle cx='50' cy='50' r='35' fill='rgb(30 15 8 / .6)' stroke='url(#b)' stroke-width='1.5'/><path d='M50 26 L72 50 L50 74 L28 50 Z' fill='none' stroke='url(#b)' stroke-width='4'/>`,
);
const GRIMOIRE_ARCANE = svg(
  200,
  200,
  `<defs><radialGradient id='l' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#f1d48a' stop-opacity='.22'/><stop offset='1' stop-color='#f1d48a' stop-opacity='0'/></radialGradient></defs><circle cx='100' cy='100' r='98' fill='url(#l)'/><g fill='none' stroke='#d9b45c' stroke-linecap='round'><circle cx='100' cy='100' r='80' stroke-width='2'/><circle cx='100' cy='100' r='73' stroke-width='1' stroke-dasharray='1 4'/><circle cx='100' cy='100' r='50' stroke-width='1.2'/><path d='M100 28 L162 136 L38 136 Z' stroke-width='1.3' opacity='.85'/><path d='M100 172 L38 64 L162 64 Z' stroke-width='1.3' opacity='.85'/><g stroke-width='1.4'><circle cx='100' cy='21' r='5'/><circle cx='169' cy='140' r='5'/><circle cx='31' cy='140' r='5'/><circle cx='100' cy='179' r='5'/><circle cx='31' cy='60' r='5'/><circle cx='169' cy='60' r='5'/></g><path d='M100 80 L118 100 L100 120 L82 100 Z' stroke-width='2.6'/></g>`,
);

/** Couvertures du grimoire : A ferrures et médaillon, B sceau et sangle, C cercle arcane. */
const GRIMOIRE_COVERS: Record<'a' | 'b' | 'c', { name: string; cover: (gradient: string) => CSSProperties }> = {
  a: {
    name: 'Ferrures',
    cover: (gradient) => ({
      background: [
        `${brassCorner(0)} left calc(var(--u) * 2) top calc(var(--u) * 2) / calc(var(--u) * 12) calc(var(--u) * 12) no-repeat`,
        `${brassCorner(90)} right calc(var(--u) * 2) top calc(var(--u) * 2) / calc(var(--u) * 12) calc(var(--u) * 12) no-repeat`,
        `${brassCorner(270)} left calc(var(--u) * 2) bottom calc(var(--u) * 2) / calc(var(--u) * 12) calc(var(--u) * 12) no-repeat`,
        `${brassCorner(180)} right calc(var(--u) * 2) bottom calc(var(--u) * 2) / calc(var(--u) * 12) calc(var(--u) * 12) no-repeat`,
        `${GRIMOIRE_MEDALLION} 50% 84% / calc(var(--u) * 20) calc(var(--u) * 20) no-repeat`,
        'radial-gradient(70% 50% at 40% 40%, rgb(255 220 170 / 0.12), transparent 70%)',
        LEATHER,
        LEATHER_MOTTLE,
        'linear-gradient(160deg, rgb(60 30 12 / 0.7), rgb(25 12 5 / 0.82))',
        gradient,
      ].join(', '),
      boxShadow: 'inset -6px 0 14px rgb(0 0 0 / 0.45), inset 0 0 calc(var(--u) * 6) rgb(0 0 0 / 0.35)',
    }),
  },
  b: {
    name: 'Sceau',
    cover: (gradient) => ({
      background: [
        `${GRIMOIRE_SEAL} 50% 88% / calc(var(--u) * 17) calc(var(--u) * 17) no-repeat`,
        `${GRIMOIRE_BUCKLE} right calc(var(--u) * 1.2) center / calc(var(--u) * 10.5) calc(var(--u) * 10) no-repeat`,
        `${GRIMOIRE_STRAP} right calc(var(--u) * 3.2) top / calc(var(--u) * 7.5) 100% no-repeat`,
        `${GRIMOIRE_DIAMOND} 46% calc(var(--u) * 7.5) / calc(var(--u) * 5) calc(var(--u) * 5) no-repeat`,
        `${GRIMOIRE_DIAMOND} 46% calc(100% - var(--u) * 7.5) / calc(var(--u) * 5) calc(var(--u) * 5) no-repeat`,
        `${GRIMOIRE_FRAME} 0 0 / 100% 100% no-repeat`,
        'radial-gradient(70% 50% at 40% 40%, rgb(255 200 170 / 0.12), transparent 70%)',
        LEATHER,
        LEATHER_MOTTLE,
        'linear-gradient(160deg, rgb(78 12 12 / 0.78), rgb(32 5 5 / 0.86))',
        gradient,
      ].join(', '),
      boxShadow: 'inset -6px 0 14px rgb(0 0 0 / 0.45), inset 0 0 calc(var(--u) * 6) rgb(0 0 0 / 0.35)',
    }),
  },
  c: {
    name: 'Arcane',
    cover: (gradient) => ({
      background: [
        `${GRIMOIRE_ARCANE} 50% 46% / calc(var(--u) * 62) calc(var(--u) * 62) no-repeat`,
        LEATHER,
        LEATHER_MOTTLE,
        'linear-gradient(160deg, rgb(20 14 34 / 0.78), rgb(8 6 14 / 0.88))',
        gradient,
      ].join(', '),
      boxShadow: 'inset -6px 0 14px rgb(0 0 0 / 0.5), inset 0 0 calc(var(--u) * 8) rgb(0 0 0 / 0.45)',
    }),
  },
};

/** Toile de lin de l'herbier. */
const LINEN =
  'repeating-linear-gradient(0deg, rgb(255 255 255 / 0.07) 0 1px, transparent 1px 2px), repeating-linear-gradient(90deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 2px)';
/** Carton crème épais de l'herbier. */
const BOARD = noise('.6', '.4 .38 .3', 0.1);

/** Couleurs de la tranche des pages (styles en 3D) : clair près de la page, sombre au bord, lignes des feuilles. */
export interface PageEdges {
  light: string;
  dark: string;
  line: string;
}

export const DEFAULT_EDGES: PageEdges = { light: '#f3ead6', dark: '#cdbd9b', line: 'rgb(110 85 45 / 0.22)' };

export interface AlbumStyle {
  id: AlbumStyleId;
  name: string;
  /** Livre incliné en perspective, tranches de pages visibles. */
  depth?: boolean;
  /** Tranche des pages (styles en 3D). */
  edges?: PageEdges;
  /** Masque de la page (bords déchirés) ; absent = page nette. */
  pageMask?: (side: 'left' | 'right') => string;
  /** Couverture ouverte derrière les pages. */
  frame: (gradient: string) => CSSProperties;
  /** Débord de la couverture autour des pages (en unités de page) : haut, côtés, bas. */
  frameInset: { top: number; side: number; bottom: number };
  /** Couverture (avant ouverture). */
  cover: (gradient: string) => CSSProperties;
  /** Autres couvertures au choix (menu pinceau), par identifiant. */
  coverVariants?: Record<string, { name: string; cover: (gradient: string) => CSSProperties }>;
  /** Le style a un motif de fond désactivable (pageStyle reçoit alors `pattern`). */
  hasPattern?: boolean;
  coverTitle: string;
  page: string;
  /** Fond de page selon le côté (ombres de courbure vers la reliure). */
  pageStyle: (side: 'left' | 'right', pattern?: boolean) => CSSProperties;
  header: string;
  headerAccent: string;
  slotEmpty: string;
  slotNumber: string;
  /** Nom d'une carte à trouver (album à objectif). */
  slotLabel: string;
  /** Enveloppe autour de la carte collée. */
  sticker: string;
  /** Étiquette sous chaque case, avec le nom de la carte (Herbier) ; absente = pas d'étiquette. */
  slotTag?: string;
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
    frameInset: { top: 3.4, side: 3.4, bottom: 3.4 },
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
    edges: { light: '#2b2e36', dark: '#121419', line: 'rgb(255 255 255 / 0.07)' },
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
  grimoire: {
    id: 'grimoire',
    name: 'Grimoire',
    depth: true,
    frameInset: { top: 3.8, side: 3.8, bottom: 3.8 },
    // Cuir sombre teinté par la couleur de l'album, filet doré repoussé sur le pourtour.
    frame: (gradient) => ({
      background: `${LEATHER}, ${LEATHER_MOTTLE}, linear-gradient(rgb(20 8 0 / 0.62), rgb(20 8 0 / 0.62)), ${gradient}`,
      boxShadow: [
        'inset 0 0 0 calc(var(--u) * 1.1) rgb(0 0 0 / 0.25)',
        'inset 0 0 0 calc(var(--u) * 1.4) rgb(214 172 84 / 0.55)',
        'inset 0 0 0 calc(var(--u) * 1.7) rgb(0 0 0 / 0.3)',
        '0 2px 0 rgb(0 0 0 / 0.45)',
        '0 5px 1px rgb(0 0 0 / 0.35)',
        '0 45px 70px -10px rgb(0 0 0 / 0.75)',
      ].join(', '),
    }),
    cover: GRIMOIRE_COVERS.b.cover,
    coverVariants: GRIMOIRE_COVERS,
    hasPattern: true,
    coverTitle: 'font-serif font-bold tracking-wide text-[#f1d48a] [text-shadow:0_1px_0_rgb(0_0_0/0.8),0_0_18px_rgb(241_212_138/0.35)]',
    page: 'text-[#3b2a17]',
    edges: { light: '#f1d58c', dark: '#9c7424', line: 'rgb(90 60 10 / 0.35)' },
    pageMask: (side) => tornMask(side, 10, side === 'left' ? 3 : 7),
    pageStyle: (side, pattern = true) => ({
      background: `${curve(side, false)}, radial-gradient(120% 90% at 50% 50%, transparent 50%, rgb(110 70 20 / 0.34)), ${pattern ? `${speckles('.35 .2 .05', side === 'left' ? 2 : 9)}, ${spots('.5 .3 .08', 1, side === 'left' ? 4 : 11, 530)}, ${spots('.45 .28 .08', 0.8, side === 'left' ? 21 : 27, 790)}, ` : ''}${FOXING}, ${PAPER_FIBERS}, ${PAPER_GRAIN}, #ecdcb4`,
    }),
    header: 'font-serif italic tracking-[0.12em] text-[#7b5a2c]',
    headerAccent: 'bg-[linear-gradient(90deg,transparent,#b8893a,transparent)] opacity-80',
    slotEmpty:
      "rounded-[calc(var(--u)*0.6)] border border-[#b8934f]/60 shadow-[inset_0_0_0_calc(var(--u)*0.7)_#efe0bd,inset_0_0_0_calc(var(--u)*0.85)_rgb(184_147_79/0.45)] bg-[rgb(110_70_20/0.05)]",
    slotNumber: 'font-serif font-bold text-[#c9ad78]',
    slotLabel: 'font-serif italic text-[#6b4b22]',
    sticker:
      "after:pointer-events-none after:absolute after:inset-0 after:z-50 after:rounded-[inherit] after:bg-[linear-gradient(135deg,rgb(255_240_200/0.18),transparent_40%)] after:content-[''] [&>.wm-card]:shadow-[0_1px_2px_rgb(60_30_0/0.4),0_6px_14px_-4px_rgb(60_30_0/0.55)] [&>.wm-card]:sepia-[0.12]",
    tilt: 0.5,
    folio: 'font-serif italic text-[#8a6a3c]',
  },
  herbier: {
    id: 'herbier',
    name: 'Herbier',
    frameInset: { top: 3, side: 3, bottom: 3 },
    edges: { light: '#f2ebd8', dark: '#c6bc9f', line: 'rgb(80 90 60 / 0.22)' },
    // Toile de lin, la couleur de l'album adoucie vers le vert sauge.
    frame: (gradient) => ({
      background: `${LINEN}, linear-gradient(rgb(120 140 110 / 0.45), rgb(120 140 110 / 0.45)), ${gradient}`,
      boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.25), inset 0 -2px 4px rgb(0 0 0 / 0.25), 0 30px 60px -12px rgb(0 0 0 / 0.55)',
    }),
    cover: (gradient) => ({
      background: `${LINEN}, linear-gradient(rgb(120 140 110 / 0.4), rgb(120 140 110 / 0.4)), ${gradient}`,
      boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.2), inset -5px 0 10px rgb(0 0 0 / 0.2)',
    }),
    coverTitle:
      'font-serif font-semibold italic tracking-tight bg-[#f7f1e1] text-[#3d4a35] px-[calc(var(--u)*5)] py-[calc(var(--u)*2.5)] rounded-[calc(var(--u)*0.5)] shadow-[0_2px_6px_rgb(0_0_0/0.25)] outline outline-1 outline-offset-[calc(var(--u)*-1.2)] outline-[#3d4a35]/40',
    page: 'text-[#3d4a35]',
    pageMask: (side) => tornMask(side, 6, side === 'left' ? 5 : 13),
    hasPattern: true,
    pageStyle: (side, pattern = true) => ({
      background: `${curve(side, false)}, radial-gradient(130% 100% at 50% 50%, transparent 60%, rgb(90 100 60 / 0.14)), ${pattern ? `${BOTANICAL_A} ${side === 'left' ? '-30px -40px' : '-210px -130px'} / 470px 470px, ${BOTANICAL_B} ${side === 'left' ? '-80px -300px' : '-350px -60px'} / 610px 610px, ${speckles('.35 .33 .2', side === 'left' ? 6 : 15)}, ${spots('.45 .42 .25', 0.6, side === 'left' ? 8 : 17, 610)}, ` : ''}${BOARD}, ${PAPER_FIBERS}, #f4eddb`,
    }),
    header: 'font-serif italic tracking-[0.08em] text-[#5d6b52]',
    headerAccent: 'bg-[#8fa37f] opacity-70',
    // Case : simple trait fin, étiquette manuscrite collée en bas.
    slotEmpty: 'rounded-[calc(var(--u)*0.4)] border border-dashed border-[#9aa88c]/70',
    slotTag:
      'inset-x-[8%] -bottom-[calc(var(--u)*2)] h-[calc(var(--u)*3.4)] rounded-[calc(var(--u)*0.3)] bg-[#fffaf0] px-[calc(var(--u)*1)] text-center font-serif text-[calc(var(--u)*2.1)] leading-[calc(var(--u)*3.4)] italic text-[#4b5a40] shadow-[0_1px_2px_rgb(0_0_0/0.15)] outline outline-1 outline-[#c9bfa5]',
    slotNumber: 'font-serif italic text-[#c8cdb6]',
    slotLabel: 'font-serif italic text-[#4b5a40]',
    // Bande de papier gommé en travers du haut de la carte.
    sticker:
      "before:pointer-events-none before:absolute before:top-[calc(var(--u)*-1.2)] before:left-1/2 before:z-50 before:h-[calc(var(--u)*3.2)] before:w-[45%] before:-translate-x-1/2 before:-rotate-2 before:bg-[rgb(244_236_214/0.85)] before:shadow-[0_1px_2px_rgb(0_0_0/0.15)] before:content-[''] [&>.wm-card]:shadow-[0_1px_2px_rgb(40_50_30/0.3),0_5px_10px_-5px_rgb(40_50_30/0.45)]",
    tilt: 0.35,
    folio: 'font-serif italic text-[#8a957c]',
  },
};

export const ALBUM_STYLE_IDS = Object.keys(ALBUM_STYLES) as AlbumStyleId[];

/** Icône de chaque style, dans les sélecteurs (en-tête de l'album, création d'album à objectif). */
export const ALBUM_STYLE_ICONS: Record<AlbumStyleId, LucideIcon> = { relie: Book, classeur: NotebookTabs, grimoire: BookKey, herbier: Leaf };
