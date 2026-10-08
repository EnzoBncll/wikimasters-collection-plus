import { isDark } from '@/lib/appearance';
import { applyPalette, getPalette, paletteVars } from '@/lib/palettes';
import { DEFAULT_SETTINGS, getSettings, settingsItem, type Settings } from '@/lib/store';

/** Réglages courants et habillage des éléments ajoutés au site, aux couleurs de la palette Collection+. */
export const ctx: { settings: Settings } = { settings: DEFAULT_SETTINGS };

const listeners = new Set<(s: Settings) => void>();
const themedHosts = new Set<HTMLElement>();

export function onSettings(fn: (s: Settings) => void) {
  listeners.add(fn);
  fn(ctx.settings);
}

function paint(host: HTMLElement) {
  const dark = isDark(ctx.settings.theme);
  applyPalette(host, getPalette(ctx.settings.palette), dark);
  host.dataset.mode = dark ? 'dark' : 'light';
}

/** Hôte de shadow DOM qui suit la palette et le mode (clair / sombre) choisis dans Collection+. */
export function themedHost(tag = 'wmt-layer', cssText = ''): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement(tag);
  // Position d'abord : la palette est posée ensuite en propriétés de style sur le même hôte.
  host.style.cssText = cssText;
  const root = host.attachShadow({ mode: 'open' });
  themedHosts.add(host);
  paint(host);
  return { host, root };
}

/** Quelques couleurs de la palette sur <html>, pour les styles posés directement dans la page du site. */
function paintRoot() {
  const vars = paletteVars(getPalette(ctx.settings.palette), true);
  const root = document.documentElement.style;
  root.setProperty('--wmt-primary', vars.primary!);
  root.setProperty('--wmt-on-primary', vars['primary-foreground']!);
  root.setProperty('--wmt-holo', vars.holo!);
  root.setProperty('--wmt-frame', vars.frame!);
  root.setProperty('--wmt-frame-fg', vars['frame-foreground']!);
}

/** Police des titres et boutons ajoutés au site (Unbounded, embarquée dans l'extension). */
export const DISPLAY_FONT = `'WMT Unbounded', ui-sans-serif, system-ui, sans-serif`;

function injectFont() {
  const url = (file: string) => browser.runtime.getURL(`/fonts/${file}` as any);
  const style = document.createElement('style');
  style.textContent = `
    @font-face { font-family: 'WMT Unbounded'; font-weight: 200 900; font-display: swap; src: url(${url('unbounded-latin.woff2')}) format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: 'WMT Unbounded'; font-weight: 200 900; font-display: swap; src: url(${url('unbounded-latin-ext.woff2')}) format('woff2');
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }`;
  (document.head ?? document.documentElement).append(style);
}

export async function initCtx() {
  ctx.settings = await getSettings();
  injectFont();
  paintRoot();
  const apply = async () => {
    ctx.settings = await getSettings();
    paintRoot();
    themedHosts.forEach(paint);
    listeners.forEach((fn) => fn(ctx.settings));
  };
  settingsItem.watch(apply);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => themedHosts.forEach(paint));
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]!);

/** Une fenêtre du site (détail de carte, confirmation…) est-elle ouverte par-dessus la page ? */
export function siteModalOpen(): boolean {
  for (const el of document.body?.children ?? []) {
    const c = typeof el.className === 'string' ? el.className : '';
    if (/\bfixed\b/.test(c) && /\binset-0\b/.test(c) && el.getBoundingClientRect().width > 0) return true;
  }
  return Boolean(document.querySelector('body > [role="dialog"], body > [aria-modal="true"]'));
}

export const typing = () => {
  // Les champs de Collection+ vivent dans des shadow roots : document.activeElement n'y montre que l'hôte.
  let a = document.activeElement as HTMLElement | null;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement as HTMLElement;
  return Boolean(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
};

/** Styles communs des volets Collection+ sur le site (variables de palette posées sur l'hôte). */
export const PANEL_CSS = `
  :host { all: initial; }
  .panel {
    box-sizing: border-box; color: var(--foreground);
    background: color-mix(in oklch, var(--card) 88%, transparent);
    border: 1px solid var(--border); border-radius: 16px;
    box-shadow: 0 14px 40px rgb(0 0 0 / .35), inset 0 1px 0 rgb(255 255 255 / .04);
    backdrop-filter: blur(12px) saturate(1.2);
    font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  .muted { color: var(--muted-foreground); }
  .kbd {
    display: inline-block; padding: 0 5px; border-radius: 5px; font: 600 10px/1.6 ui-monospace, SFMono-Regular, monospace;
    color: var(--muted-foreground); border: 1px solid var(--border); background: var(--muted);
  }
  .chip { display: inline-block; min-width: 22px; text-align: center; font-weight: 800; font-size: 10px; padding: 1px 4px; border-radius: 5px; color: #111; }
  button { font: inherit; color: inherit; }
`;
