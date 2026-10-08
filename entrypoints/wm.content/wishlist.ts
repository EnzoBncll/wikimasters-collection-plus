import { addWish, removeWish, wishlistIds } from '@/lib/site-wishlist';
import { ctx, onSettings } from './ctx';
import { sfx } from './sound';

/**
 * Liste de souhaits sur le marché et les échanges : les cartes souhaitées sont mises en avant,
 * et sur le marché un cœur ajoute ou retire la carte de la liste native du site.
 */

const STYLE = `
  [class*="glow-"].wmt-wish { outline: 2px solid var(--wmt-primary); outline-offset: 2px;
    box-shadow: 0 0 18px color-mix(in oklch, var(--wmt-primary) 55%, transparent) !important; }
  .wmt-wish-tag { position: absolute; left: 50%; top: 4px; transform: translateX(-50%); z-index: 42; padding: 2px 8px; border-radius: 999px; white-space: nowrap;
    font: 800 10px/1.4 ui-sans-serif, system-ui, sans-serif; letter-spacing: .04em; color: #0b0b1a; background: var(--wmt-holo); box-shadow: 0 2px 8px rgb(0 0 0 / .4); pointer-events: none; }
  .wmt-wish-btn { all: unset; position: absolute; left: 6px; top: calc(45% - 28px); z-index: 41; width: 26px; height: 26px; border-radius: 999px; display: grid; place-items: center;
    cursor: pointer; background: rgba(12,13,12,.72); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,.18); color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35);
    opacity: .0; transform: scale(.9); transition: opacity .15s, transform .15s, background .15s; }
  .group:hover .wmt-wish-btn, [class*="glow-"]:hover > .wmt-wish-btn, .wmt-wish-btn.on { opacity: 1; transform: none; }
  @media (hover: none) { .wmt-wish-btn { opacity: 1; transform: none; } }
  .wmt-wish-btn:hover { transform: scale(1.1); }
  .wmt-wish-btn.on { background: var(--wmt-holo); color: #0b0b1a; border-color: transparent; box-shadow: 0 0 0 2px rgb(0 0 0 / .35), 0 4px 12px rgb(0 0 0 / .4); }
  .wmt-wish-btn svg { width: 14px; height: 14px; }
  .wmt-wish-btn.busy { opacity: .6; cursor: progress; }
`;

const HEART = (filled: boolean) =>
  `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

export function startWishlist() {
  const style = document.createElement('style');
  style.textContent = STYLE;
  (document.head ?? document.documentElement).append(style);

  let wish = new Set<string>();
  let loadedAt = 0;
  let loading = false;
  const onMarket = () => /^\/marketplace/.test(location.pathname);
  const onWishPage = () => /^\/(marketplace|trades)/.test(location.pathname);

  const refresh = async (force = false) => {
    if (loading || (!force && Date.now() - loadedAt < 60_000)) return;
    loading = true;
    try {
      wish = await wishlistIds();
      loadedAt = Date.now();
      scan();
    } catch (e) {
      console.warn('[Collection+] liste de souhaits', e);
    } finally {
      loading = false;
    }
  };

  const mark = (el: HTMLElement, on: boolean) => {
    el.classList.toggle('wmt-wish', on);
    let tag = [...el.children].find((c) => c.classList.contains('wmt-wish-tag'));
    if (on && !tag) {
      tag = document.createElement('span');
      tag.className = 'wmt-wish-tag';
      tag.textContent = '♥ Souhaitée';
      el.append(tag);
    } else if (!on) tag?.remove();
  };

  const heart = (el: HTMLElement, id: string) => {
    let btn = [...el.children].find((c) => c.classList.contains('wmt-wish-btn')) as HTMLButtonElement | undefined;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wmt-wish-btn';
      for (const t of ['pointerdown', 'mousedown', 'touchstart']) btn.addEventListener(t, (e) => e.stopPropagation());
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const b = e.currentTarget as HTMLButtonElement;
        const cardId = b.dataset.id!;
        if (b.classList.contains('busy')) return;
        const was = wish.has(cardId);
        b.classList.add('busy');
        try {
          await (was ? removeWish(cardId) : addWish(cardId));
          if (was) wish.delete(cardId);
          else wish.add(cardId);
          sfx.toggle(!was);
        } catch (err) {
          console.warn('[Collection+] liste de souhaits', err);
          b.title = 'Échec, réessaie';
        } finally {
          b.classList.remove('busy');
          scan();
        }
      });
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.append(btn);
    }
    const on = wish.has(id);
    if (btn.dataset.id !== id || btn.classList.contains('on') !== on || !btn.innerHTML) {
      btn.dataset.id = id;
      btn.classList.toggle('on', on);
      btn.innerHTML = HEART(on);
      btn.title = on ? 'Retirer de ma liste de souhaits (Collection+)' : 'Ajouter à ma liste de souhaits (Collection+)';
    }
  };

  function scan() {
    const enabled = ctx.settings.wishHighlight && onWishPage();
    for (const el of document.querySelectorAll<HTMLElement>('main [class*="glow-"][data-wmt-id]')) {
      const id = el.dataset.wmtId!;
      mark(el, enabled && wish.has(id));
      if (enabled && onMarket()) heart(el, id);
      else [...el.children].find((c) => c.classList.contains('wmt-wish-btn'))?.remove();
    }
    if (enabled) refresh();
  }

  let t = 0;
  const schedule = () => {
    clearTimeout(t);
    t = window.setTimeout(scan, 250);
  };
  new MutationObserver((muts) => {
    if (muts.every((m) => (m.target as Element).closest?.('.wmt-wish-btn, .wmt-wish-tag'))) return;
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-wmt-id'] });
  onSettings(schedule);
  // Le site a modifié la liste (cœur de « Toutes les cartes ») : on relit au retour sur l'onglet.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh(true));
}
