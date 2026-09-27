import { applyPalette, getPalette } from './palettes';
import type { Settings } from './store';

type Appearance = Pick<Settings, 'theme' | 'palette'>;

export function isDark(theme: Settings['theme']): boolean {
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** Mode clair / sombre + palette sur <html>. */
export function applyAppearance({ theme, palette }: Appearance, root: HTMLElement = document.documentElement) {
  const dark = isDark(theme);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  applyPalette(root, getPalette(palette), dark);
}

/** Suit les changements de thème du système tant que le mode est « auto ». Renvoie le désabonnement. */
export function watchAppearance(get: () => Appearance, root?: HTMLElement): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => applyAppearance(get(), root);
  apply();
  media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}

const CACHE_KEY = 'collection-plus:appearance';

/** Dernière apparence utilisée par les pages de l'extension, pour peindre les bonnes couleurs dès le chargement. */
export function cachedAppearance(): Appearance | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function rememberAppearance(appearance: Appearance) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ theme: appearance.theme, palette: appearance.palette }));
  } catch {
    // Stockage indisponible : sans conséquence.
  }
}
