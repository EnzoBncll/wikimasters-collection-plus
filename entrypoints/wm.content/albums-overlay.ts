import { ALBUMS_EMBED_CLOSE } from '@/lib/messages';
import { onSettings, themedHost } from './ctx';

/**
 * Bouton Albums à droite de Collection+ : la page Albums de l'extension (bibliothèque, albums 3D, collage, tri)
 * s'ouvre dans une fenêtre posée par-dessus le site, sans changer d'onglet. La page est chargée au premier survol,
 * puis gardée : rouvrir la fenêtre est instantané et l'album consulté reste ouvert.
 */

/** Livre fermé dont la couverture s'entrouvre au survol. */
export const ALBUMS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path class="pages" d="M6 4.5h11.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6"/>
  <path class="pages" d="M15.5 8.5h-5M15.5 11.5h-5"/>
  <g class="cover"><path d="M5 3.5h10.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5Z" fill="var(--frame)"/><path d="M7 3.5v16"/><circle cx="11.5" cy="10" r="1.8" fill="currentColor" stroke="none"/></g>
</svg>`;

/** Styles du bouton, posés dans l'ombre du bouton Collection+. */
export const ALBUMS_BTN_CSS = `
  .albums { position: relative; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border-radius: 50%; }
  .albums svg { width: 22px; height: 22px; overflow: visible; }
  .albums .cover { transform-origin: 3.5px 12px; transform-box: view-box; transition: transform .35s cubic-bezier(.3,1.4,.5,1); }
  .albums .pages { opacity: .55; }
  .albums:hover { transform: translateY(-2px) rotate(-4deg); }
  .albums:hover .cover, .albums[aria-expanded="true"] .cover { transform: perspective(40px) rotateY(-55deg); }
  .albums::after {
    content: 'Albums'; position: absolute; left: 50%; bottom: calc(100% + 8px); translate: -50% 4px; pointer-events: none;
    padding: 5px 9px; border-radius: 8px; white-space: nowrap; opacity: 0; transition: opacity .15s, translate .15s;
    background: var(--frame); color: var(--frame-foreground); font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
    box-shadow: 0 6px 18px rgb(0 0 0 / .35);
  }
  .albums[hidden] { display: none; }
  .albums:hover::after { opacity: 1; translate: -50% 0; }
  .albums[aria-expanded="true"]::after { opacity: 0; }
`;

const OVERLAY_CSS = `
  :host { all: initial; }
  .scrim { position: fixed; inset: 0; z-index: 2147482990; background: rgb(6 6 14 / .55); backdrop-filter: blur(6px) saturate(1.1);
    opacity: 0; transition: opacity .25s ease; }
  .win {
    position: fixed; z-index: 2147482991; left: 50%; top: 50%; width: min(1280px, calc(100vw - 48px)); height: min(900px, calc(100vh - 96px));
    translate: -50% -50%; border-radius: 22px; overflow: hidden; background: var(--background);
    box-shadow: 0 40px 120px rgb(0 0 0 / .6), 0 0 0 1px color-mix(in oklch, var(--frame-foreground) 14%, transparent);
    transform-origin: var(--ox, 10%) var(--oy, 110%); transform: scale(.08); opacity: 0;
    transition: transform .42s cubic-bezier(.2,.9,.25,1.05), opacity .25s ease;
  }
  :host([data-open]) .scrim { opacity: 1; }
  :host([data-open]) .win { transform: none; opacity: 1; }
  :host(:not([data-open])) .scrim, :host(:not([data-open])) .win { pointer-events: none; }
  :host([data-gone]) .scrim, :host([data-gone]) .win { visibility: hidden; }
  iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: normal; }
  .close {
    position: absolute; right: 12px; top: 12px; z-index: 2; display: grid; place-items: center; width: 34px; height: 34px; padding: 0;
    border: 0; border-radius: 50%; cursor: pointer; color: var(--frame-foreground); background: var(--frame);
    box-shadow: 0 4px 14px rgb(0 0 0 / .35); transition: transform .15s;
  }
  .close:hover { transform: rotate(90deg); }
  .close svg { width: 16px; height: 16px; }
  .loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted-foreground);
    font: 600 13px ui-sans-serif, system-ui, sans-serif; pointer-events: none; transition: opacity .2s; }
  .win.ready .loading { opacity: 0; }
  @media (prefers-reduced-motion: reduce) { .win, .scrim { transition: none; } }
`;

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

export function startAlbumsOverlay(btn: HTMLButtonElement) {
  const extOrigin = new URL(browser.runtime.getURL('/'), location.href).origin;
  let layer: { host: HTMLElement; win: HTMLElement; frame: HTMLIFrameElement } | null = null;
  let open = false;
  let hideTimer = 0;
  let overflow = '';

  const build = () => {
    if (layer) return layer;
    const { host, root } = themedHost('wmt-albums');
    host.dataset.gone = '';
    root.innerHTML = `<style>${OVERLAY_CSS}</style><div class="scrim"></div>
      <div class="win" role="dialog" aria-label="Albums · Collection+"><div class="loading">Ouverture de la bibliothèque…</div>
      <button class="close" type="button" title="Fermer (Échap)">${CLOSE_ICON}</button></div>`;
    const win = root.querySelector<HTMLElement>('.win')!;
    const frame = document.createElement('iframe');
    frame.title = 'Albums · Collection+';
    frame.src = browser.runtime.getURL('/albums.html' as any);
    frame.addEventListener('load', () => win.classList.add('ready'));
    win.prepend(frame);
    root.querySelector('.scrim')!.addEventListener('click', close);
    root.querySelector('.close')!.addEventListener('click', close);
    document.documentElement.append(host);
    layer = { host, win, frame };
    return layer;
  };

  function show() {
    const { host, win, frame } = build();
    clearTimeout(hideTimer);
    // La fenêtre grandit depuis le bouton.
    const b = btn.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    if (w.width) {
      win.style.setProperty('--ox', `${b.left + b.width / 2 - w.left}px`);
      win.style.setProperty('--oy', `${b.top + b.height / 2 - w.top}px`);
    }
    delete host.dataset.gone;
    requestAnimationFrame(() => requestAnimationFrame(() => (host.dataset.open = '')));
    open = true;
    btn.setAttribute('aria-expanded', 'true');
    overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    frame.focus();
  }

  function close() {
    if (!open || !layer) return;
    const { host } = layer;
    delete host.dataset.open;
    open = false;
    btn.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = overflow;
    hideTimer = window.setTimeout(() => (host.dataset.gone = ''), 450);
    btn.focus();
  }

  // Préchargement au survol : la fenêtre s'ouvre déjà prête au clic.
  btn.addEventListener('pointerenter', () => void build(), { once: true });
  btn.addEventListener('click', () => (open ? close() : show()));
  btn.setAttribute('aria-expanded', 'false');

  window.addEventListener('message', (e) => {
    if (e.origin === extOrigin && e.source === layer?.frame.contentWindow && e.data?.type === ALBUMS_EMBED_CLOSE) close();
  });
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') close();
  });

  onSettings((s) => {
    btn.hidden = !s.albumsButton;
    if (!s.albumsButton) close();
  });
}
