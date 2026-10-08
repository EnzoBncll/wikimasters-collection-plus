import cardCss from '@/assets/wm-card.css?inline';
import { RARITY_LABEL, type Rarity } from '@/lib/types';
import { ctx, esc } from './ctx';

/**
 * Habillage Collection+ des cartes révélées : la même carte que dans l'app (composant WmCard),
 * avec l'habillage choisi dans les réglages, posée par-dessus la carte du site. Les clics passent à la carte du site.
 */

const RARITY_VARS = `--rarity-c: #b8f2d5; --rarity-pc: #b1cff2; --rarity-r: #c6a7f2; --rarity-sr: #ed6fa3; --rarity-l: #ffe144; --rarity-ur: #fa9931;`;

const SHELL_CSS = `
  :host { all: initial; position: absolute; inset: 0; z-index: 60; display: block; border-radius: inherit; ${RARITY_VARS}
    --font-heading: 'WMT Unbounded', ui-sans-serif, system-ui, sans-serif; }
  ${cardCss}
  .slot { position: absolute; inset: 0; border-radius: inherit; }
  .wm-card { width: 100%; height: 100%; aspect-ratio: auto; cursor: pointer; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .art { position: absolute; left: 0; right: 0; top: 0; z-index: 20; height: 45%; background: rgb(0 0 0 / .2); }
  .art img { pointer-events: none; position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .art .fade { position: absolute; left: 0; right: 0; bottom: 0; height: 25%; background: linear-gradient(to top, rgb(0 0 0 / .5), transparent); }
  .art .ph { position: absolute; inset: 0; display: grid; place-items: center; font: 900 30cqw/1 ui-sans-serif, system-ui; color: rgb(255 255 255 / .85);
    background: linear-gradient(135deg, var(--c), #18181b); }
  .rar { position: absolute; left: 4.5cqw; top: 4.5cqw; z-index: 30; display: flex; align-items: center; gap: 2cqw; }
  .wm-rarity { border-radius: 2.5cqw; padding: 1.2cqw 3.5cqw; font-size: 6cqw; line-height: 1; font-weight: 700; color: #0d1117; }
  .body { position: absolute; left: 0; right: 0; top: 45%; bottom: 0; z-index: 30; display: flex; flex-direction: column; padding: 6.5cqw; }
  .wm-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex-shrink: 0; margin: 0; font-size: 7.5cqw; line-height: 1.25; font-weight: 700; color: #000; }
  .wm-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex-shrink: 0; margin: 1.5cqw 0 0; font-size: 5.8cqw; line-height: 1.375; color: rgb(23 23 23 / .85); }
  .wm-stats { margin-top: auto; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid rgb(0 0 0 / .2); padding-top: 3cqw; font-size: 5.8cqw; font-weight: 700; color: rgb(0 0 0 / .9); }
  .wm-stats span { display: flex; align-items: center; gap: 2cqw; }
  .wm-stats svg { width: 1em; height: 1em; flex-shrink: 0; }
`;

const SWORDS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Attaque" style="color:#991b1b"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>';
const SHIELD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Défense" style="color:#1e40af"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>';

const nf = new Intl.NumberFormat('fr-FR');
const firstString = (...v: unknown[]) => v.find((x): x is string => typeof x === 'string' && x.trim() !== '') ?? null;
const firstNumber = (...v: unknown[]) => {
  const f = v.find((x) => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)));
  return f === undefined ? null : Number(f);
};

/** Carte au format Collection+ à partir des données d'une carte du site. */
export function skinHtml(card: any): string {
  const rarity = (['C', 'PC', 'R', 'SR', 'UR', 'L'] as Rarity[]).includes(card?.rarity) ? (card.rarity as Rarity) : null;
  const title = String(card?.wikipedia_title ?? card?.name ?? '');
  const desc = firstString(card?.description, card?.short_description, card?.wikidata_description, card?.wiki_description, card?.subtitle);
  const atk = firstNumber(card?.atk, card?.attack, card?.stats?.attack);
  const def = firstNumber(card?.def, card?.defense, card?.stats?.defense);
  const image = !card?.hide_image && card?.image_url ? String(card.image_url) : null;
  const r = rarity?.toLowerCase();
  return `<div class="wm-card" data-rarity="${rarity ?? ''}" data-style="${esc(ctx.settings.cardStyle)}" data-rarity-label="${rarity ? esc(RARITY_LABEL[rarity]) : ''}">
    <div class="wm-face">
      <div class="wm-paper"></div>
      <div class="wm-art art">${image ? `<img src="${esc(image)}" alt="" draggable="false">` : `<div class="ph">${esc(title.charAt(0).toUpperCase())}</div>`}<div class="fade"></div></div>
      <div class="rar">${rarity ? `<span class="wm-rarity" style="background-color:var(--rarity-${r});box-shadow:0 0 10px color-mix(in srgb, var(--rarity-${r}) 60%, transparent)">${rarity}</span>` : ''}</div>
      <div class="wm-body body">
        <h3 class="wm-title">${esc(title)}</h3>
        ${desc ? `<p class="wm-desc">${esc(desc)}</p>` : ''}
        <div class="wm-stats">${atk != null || def != null ? `<span>${SWORDS}${atk != null ? nf.format(atk) : '—'}</span><span>${SHIELD}${def != null ? nf.format(def) : '—'}</span>` : ''}</div>
      </div>
    </div>
    <div class="wm-shine"></div><div class="wm-holo"></div><div class="wm-foil"></div><div class="wm-glitter"></div><div class="wm-glare"></div><div class="wm-rim"></div>
  </div>`;
}

/** Suit le pointeur comme dans l'app : position du reflet et motif holographique. */
function track(el: HTMLElement, e: PointerEvent) {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  el.style.setProperty('--cx', `${(50 + (x - 0.5) * 40).toFixed(1)}%`);
  el.style.setProperty('--cy', `${(45 + (y - 0.5) * 40).toFixed(1)}%`);
  el.style.setProperty('--hue', `${((x + y) * 180).toFixed(0)}deg`);
  el.style.setProperty('--holo-angle', `${(95 + (x - 0.5) * 40).toFixed(0)}deg`);
}

/** Pose (ou met à jour) l'habillage sur la carte du site affichée dans `flip`. */
export function applySkin(flip: HTMLElement, card: any) {
  const target = (flip.querySelector('[class*="glow-"]') as HTMLElement | null) ?? (flip.firstElementChild as HTMLElement | null);
  if (!target) return;
  let host = target.querySelector<HTMLElement>(':scope > wmt-card-skin');
  if (!ctx.settings.revealSkin || !card) {
    host?.remove();
    return;
  }
  const key = `${card.id}|${ctx.settings.cardStyle}`;
  if (host?.dataset.key === key) return;
  if (!host) {
    host = document.createElement('wmt-card-skin');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${SHELL_CSS}</style><div class="slot"></div>`;
    root.addEventListener('pointermove', (e) => {
      const card = root.querySelector<HTMLElement>('.wm-card');
      if (card) track(card, e as PointerEvent);
    });
    // Les clics vont à la carte du site (retournement des L shiny, détail de la carte…).
    host.addEventListener('click', (e) => {
      e.stopPropagation();
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
    });
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.append(host);
  }
  host.dataset.key = key;
  host.shadowRoot!.querySelector('.slot')!.innerHTML = skinHtml(card);
}

/** Copie visuelle autonome (pour l'animation de l'album). */
export function skinElement(card: any): HTMLElement {
  const host = document.createElement('wmt-card-skin');
  host.attachShadow({ mode: 'open' }).innerHTML = `<style>${SHELL_CSS}</style>${skinHtml(card)}`;
  return host;
}
