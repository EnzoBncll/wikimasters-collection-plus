/**
 * Palettes de la charte « Holo » : chacune colore l'icône (carte irisée qui sort d'un dossier)
 * et l'interface (accent, neutres teintés, cadre de navigation), en clair comme en sombre.
 * Module pur (sans API d'extension) : aussi utilisé par dev/icons.mjs pour générer les PNG.
 */

export type PaletteId =
  | 'nuit-violette'
  | 'abysse'
  | 'rose-fume'
  | 'emeraude'
  | 'coucher-de-soleil'
  | 'chrome-argent'
  | 'or-noir'
  | 'cyberpunk'
  | 'aube'
  | 'lavande';

export interface Palette {
  id: PaletteId;
  name: string;
  /** Teinte oklch des neutres, du cadre et des dossiers. */
  hue: number;
  /** Intensité de la teinte (1 = normale, proche de 0 = gris). */
  tint: number;
  /** Couleur d'accent (boutons, liens, focus) en clair puis en sombre. */
  primary: { light: string; dark: string };
  /** Cadre de navigation clair en mode clair (palettes claires). */
  lightFrame?: boolean;
  icon: {
    /** Fond radial : centre lumineux, bord. */
    bg: [string, string];
    /** Dos du dossier, haut → bas. */
    back: [string, string];
    /** Façade du dossier, haut → bas. */
    front: [string, string];
    /** Reflets irisés de la carte. */
    iri: string[];
    /** Encre du W et du +. */
    ink: string;
  };
}

export const PALETTES: Palette[] = [
  {
    id: 'nuit-violette',
    name: 'Nuit violette',
    hue: 293,
    tint: 1,
    primary: { light: 'oklch(0.55 0.24 293)', dark: 'oklch(0.75 0.16 293)' },
    icon: {
      bg: ['#3B1D6E', '#0B0B1A'],
      back: ['#475569', '#0F172A'],
      front: ['#334155', '#020617'],
      iri: ['#7DD3FC', '#C4B5FD', '#F9A8D4', '#FDE68A', '#86EFAC'],
      ink: '#0B0B1A',
    },
  },
  {
    id: 'abysse',
    name: 'Abysse',
    hue: 225,
    tint: 1,
    primary: { light: 'oklch(0.55 0.14 230)', dark: 'oklch(0.8 0.11 210)' },
    icon: {
      bg: ['#0E3A5C', '#020B16'],
      back: ['#1E3A5F', '#0A1628'],
      front: ['#16324F', '#010814'],
      iri: ['#67E8F9', '#A5F3FC', '#C4B5FD', '#F0ABFC', '#FDE68A'],
      ink: '#020B16',
    },
  },
  {
    id: 'rose-fume',
    name: 'Rose fumé',
    hue: 350,
    tint: 1,
    primary: { light: 'oklch(0.57 0.2 355)', dark: 'oklch(0.8 0.12 355)' },
    icon: {
      bg: ['#5B1A3E', '#12060D'],
      back: ['#4A2037', '#1A0A13'],
      front: ['#3D1A2E', '#0D0409'],
      iri: ['#FBCFE8', '#F9A8D4', '#FDE68A', '#FED7AA', '#C4B5FD'],
      ink: '#3B0A24',
    },
  },
  {
    id: 'emeraude',
    name: 'Émeraude',
    hue: 162,
    tint: 1,
    primary: { light: 'oklch(0.53 0.13 162)', dark: 'oklch(0.8 0.14 162)' },
    icon: {
      bg: ['#065F46', '#021410'],
      back: ['#14532D', '#052E16'],
      front: ['#134E3A', '#02140E'],
      iri: ['#6EE7B7', '#A7F3D0', '#FDE68A', '#BAE6FD', '#DDD6FE'],
      ink: '#022C22',
    },
  },
  {
    id: 'coucher-de-soleil',
    name: 'Coucher de soleil',
    hue: 45,
    tint: 1,
    primary: { light: 'oklch(0.6 0.19 40)', dark: 'oklch(0.8 0.14 60)' },
    icon: {
      bg: ['#9A3412', '#1C0A05'],
      back: ['#7C2D12', '#2A0E05'],
      front: ['#5A200C', '#140602'],
      iri: ['#FDBA74', '#FDE68A', '#F9A8D4', '#C4B5FD', '#FCA5A5'],
      ink: '#431407',
    },
  },
  {
    id: 'chrome-argent',
    name: 'Chrome argent',
    hue: 260,
    tint: 0.25,
    primary: { light: 'oklch(0.42 0.03 260)', dark: 'oklch(0.88 0.02 260)' },
    icon: {
      bg: ['#52525B', '#09090B'],
      back: ['#A1A1AA', '#3F3F46'],
      front: ['#71717A', '#18181B'],
      iri: ['#E5E7EB', '#BAE6FD', '#E9D5FF', '#FBCFE8', '#F3F4F6'],
      ink: '#18181B',
    },
  },
  {
    id: 'or-noir',
    name: 'Or noir',
    hue: 85,
    tint: 0.7,
    primary: { light: 'oklch(0.55 0.11 75)', dark: 'oklch(0.84 0.13 88)' },
    icon: {
      bg: ['#4A360C', '#0A0804'],
      back: ['#6B4E16', '#1F1605'],
      front: ['#4A360C', '#0A0804'],
      iri: ['#FEF3C7', '#FCD34D', '#FDE68A', '#F9A8D4', '#BAE6FD'],
      ink: '#2A1E06',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    hue: 320,
    tint: 1.2,
    primary: { light: 'oklch(0.58 0.26 328)', dark: 'oklch(0.8 0.14 200)' },
    icon: {
      bg: ['#6B0F70', '#0B0213'],
      back: ['#312E81', '#0B0213'],
      front: ['#1E1B4B', '#05010A'],
      iri: ['#22D3EE', '#A855F7', '#F472B6', '#FACC15', '#22D3EE'],
      ink: '#0B0213',
    },
  },
  {
    id: 'aube',
    name: 'Aube',
    hue: 277,
    tint: 1,
    lightFrame: true,
    primary: { light: 'oklch(0.51 0.2 277)', dark: 'oklch(0.76 0.13 277)' },
    icon: {
      bg: ['#FFFFFF', '#C7D2FE'],
      back: ['#A5B4FC', '#6366F1'],
      front: ['#E0E7FF', '#818CF8'],
      iri: ['#7DD3FC', '#C4B5FD', '#F9A8D4', '#FDE68A', '#86EFAC'],
      ink: '#312E81',
    },
  },
  {
    id: 'lavande',
    name: 'Lavande',
    hue: 305,
    tint: 1,
    lightFrame: true,
    primary: { light: 'oklch(0.54 0.22 305)', dark: 'oklch(0.8 0.13 305)' },
    icon: {
      bg: ['#FDF4FF', '#E9D5FF'],
      back: ['#D8B4FE', '#A855F7'],
      front: ['#F3E8FF', '#C084FC'],
      iri: ['#BAE6FD', '#FBCFE8', '#FEF3C7', '#BBF7D0', '#DDD6FE'],
      ink: '#3B0764',
    },
  },
];

export const DEFAULT_PALETTE: PaletteId = 'nuit-violette';

export function getPalette(id: string | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

/** Dégradé irisé de la palette (logo, barres de progression, sélecteur). */
export function holoGradient(palette: Palette, angle = 135): string {
  return `linear-gradient(${angle}deg, ${palette.icon.iri.join(', ')})`;
}

/** Luminosité oklch d'une couleur « oklch(L C H) ». */
const lightness = (color: string) => Number(/oklch\(([\d.]+)/.exec(color)?.[1] ?? 0.5);

/** Variables CSS de l'interface pour une palette et un mode. */
export function paletteVars(palette: Palette, dark: boolean): Record<string, string> {
  const h = palette.hue;
  const t = palette.tint;
  const n = (c: number) => (c * t).toFixed(4);
  const primary = dark ? palette.primary.dark : palette.primary.light;
  const onPrimary = lightness(primary) > 0.68 ? `oklch(0.17 ${n(0.03)} ${h})` : 'oklch(0.99 0 0)';
  const frameLight = palette.lightFrame && !dark;

  const surface = dark
    ? {
        background: `oklch(0.185 ${n(0.018)} ${h})`,
        foreground: `oklch(0.975 ${n(0.006)} ${h})`,
        card: `oklch(0.225 ${n(0.022)} ${h})`,
        muted: `oklch(0.28 ${n(0.024)} ${h})`,
        'muted-foreground': `oklch(0.72 ${n(0.025)} ${h})`,
        accent: `oklch(0.3 ${n(0.05)} ${h})`,
        border: `oklch(1 0 0 / 9%)`,
        input: `oklch(1 0 0 / 14%)`,
        destructive: 'oklch(0.704 0.191 22.216)',
      }
    : {
        background: `oklch(0.985 ${n(0.005)} ${h})`,
        foreground: `oklch(0.2 ${n(0.025)} ${h})`,
        card: 'oklch(1 0 0)',
        muted: `oklch(0.962 ${n(0.01)} ${h})`,
        'muted-foreground': `oklch(0.52 ${n(0.025)} ${h})`,
        accent: `oklch(0.95 ${n(0.03)} ${h})`,
        border: `oklch(0.915 ${n(0.014)} ${h})`,
        input: `oklch(0.915 ${n(0.014)} ${h})`,
        destructive: 'oklch(0.577 0.245 27.325)',
      };

  const frame = frameLight
    ? {
        frame: `oklch(0.9 ${n(0.05)} ${h})`,
        'frame-foreground': `oklch(0.22 ${n(0.06)} ${h})`,
        'frame-muted': `oklch(0.45 ${n(0.06)} ${h})`,
        'frame-active': `oklch(0.99 ${n(0.01)} ${h})`,
        'frame-glow': `oklch(0.97 ${n(0.04)} ${h})`,
      }
    : {
        frame: dark ? `oklch(0.12 ${n(0.03)} ${h})` : `oklch(0.16 ${n(0.045)} ${h})`,
        'frame-foreground': `oklch(0.97 ${n(0.01)} ${h})`,
        'frame-muted': `oklch(0.68 ${n(0.04)} ${h})`,
        'frame-active': `oklch(0.27 ${n(0.07)} ${h})`,
        'frame-glow': `oklch(0.34 ${n(0.13)} ${h})`,
      };

  return {
    ...surface,
    ...frame,
    'card-foreground': surface.foreground,
    popover: surface.card,
    'popover-foreground': surface.foreground,
    secondary: surface.muted,
    'secondary-foreground': surface.foreground,
    'accent-foreground': surface.foreground,
    primary,
    'primary-foreground': onPrimary,
    ring: primary,
    'folder-back': `oklch(0.7 ${n(0.13)} ${h})`,
    'folder-front': `oklch(0.8 ${n(0.1)} ${h})`,
    'folder-tab': `oklch(0.63 ${n(0.15)} ${h})`,
    holo: holoGradient(palette),
    /** Irisé sur un cadre sombre ; sur un cadre clair, l'irisé pastel ne se lit pas : accent plein. */
    'frame-holo': frameLight ? `linear-gradient(${primary}, ${primary})` : holoGradient(palette),
  };
}

/** Applique la palette sur un élément (<html>, ou l'hôte d'un shadow DOM). */
export function applyPalette(el: HTMLElement, palette: Palette, dark: boolean) {
  for (const [key, value] of Object.entries(paletteVars(palette, dark))) el.style.setProperty(`--${key}`, value);
  el.dataset.palette = palette.id;
}
