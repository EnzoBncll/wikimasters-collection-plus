import { apiJson } from '@/lib/api';
import { ctx, esc, onSettings } from './ctx';

/**
 * Page Échanges : les puces de cartes au nom tronqué (span[title] coloré par la rareté) deviennent des mini-cartes
 * avec l'image, la rareté et le titre complet. Les images viennent de /api/trades (les cartes de chaque échange),
 * relu quand une puce inconnue apparaît.
 */

const STYLE = `
  .wmt-trade-mini { --acc: #b7c1ce; display: inline-flex; flex-direction: column; width: 84px; flex: 0 0 84px; vertical-align: top;
    overflow: hidden; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--acc) 70%, transparent);
    background: #0a0c10; box-shadow: 0 4px 12px rgb(0 0 0 / .28), 0 0 10px color-mix(in srgb, var(--acc) 22%, transparent);
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; text-align: left; }
  .wmt-trade-mini[data-rarity="C"] { --acc: var(--color-rarity-c, #b8f2d5); }
  .wmt-trade-mini[data-rarity="PC"] { --acc: var(--color-rarity-pc, #b1cff2); }
  .wmt-trade-mini[data-rarity="R"] { --acc: var(--color-rarity-r, #c6a7f2); }
  .wmt-trade-mini[data-rarity="SR"] { --acc: var(--color-rarity-sr, #ed6fa3); }
  .wmt-trade-mini[data-rarity="UR"] { --acc: var(--color-rarity-ur, #fa9931); }
  .wmt-trade-mini[data-rarity="L"] { --acc: var(--color-rarity-l, #ffe144); }
  .wmt-trade-mini .art { position: relative; height: 76px;
    background: radial-gradient(circle at 30% 22%, color-mix(in srgb, var(--acc) 30%, transparent), transparent 50%), linear-gradient(145deg, #1b2029, #080a0e); }
  .wmt-trade-mini img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .wmt-trade-mini .ph { position: absolute; inset: 0; display: grid; place-items: center; color: var(--acc); font: 900 24px/1 ui-sans-serif, system-ui; }
  .wmt-trade-mini .rar { position: absolute; top: 4px; left: 4px; padding: 2px 5px; border-radius: 5px; background: var(--acc); color: #0d1117;
    font-size: 8px; font-weight: 900; line-height: 1; box-shadow: 0 0 6px color-mix(in srgb, var(--acc) 60%, transparent); }
  .wmt-trade-mini .t { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; min-height: 30px;
    padding: 5px 6px 6px; color: #f8fafc; font-size: 9px; font-weight: 700; line-height: 1.16; }
  .wmt-trade-mini + span[title][style*="--color-rarity-"] { display: none !important; }
`;

const CHIP = 'span[title][style*="--color-rarity-"]';
const RARITIES = ['C', 'PC', 'R', 'SR', 'UR', 'L'];
const REFETCH_MS = 15_000;

const norm = (s: string) => s.replace(/_/g, ' ').trim().normalize('NFC').toLowerCase();

const initials = (title: string) =>
  title
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function startTradePreviews() {
  const style = document.createElement('style');
  style.textContent = STYLE;
  (document.head ?? document.documentElement).append(style);

  /** Titre normalisé → image de la carte (null : la carte n'en a pas). */
  const images = new Map<string, string | null>();
  let fetchedAt = 0;
  let fetching = false;
  const onTrades = () => /^\/trades(\/|$)/.test(location.pathname);

  const load = async () => {
    if (fetching || Date.now() - fetchedAt < REFETCH_MS) return;
    fetching = true;
    try {
      const json = await apiJson<{ trades?: { items?: { card?: any }[] }[] }>('/api/trades');
      for (const trade of json?.trades ?? [])
        for (const item of trade.items ?? []) {
          const card = item?.card;
          if (card?.wikipedia_title) images.set(norm(String(card.wikipedia_title)), !card.hide_image && card.image_url ? String(card.image_url) : null);
        }
    } catch (e) {
      console.warn('[Collection+] aperçu des échanges', e);
    } finally {
      fetchedAt = Date.now();
      fetching = false;
      scan();
    }
  };

  const mini = (title: string, rarity: string, image: string | null | undefined) => {
    const el = document.createElement('span');
    el.className = 'wmt-trade-mini';
    el.dataset.rarity = rarity;
    el.title = title;
    el.innerHTML = `<span class="art">${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<span class="ph">${esc(initials(title))}</span>`}<span class="rar">${esc(rarity)}</span></span><span class="t">${esc(title)}</span>`;
    el.querySelector('img')?.addEventListener('error', (e) => (e.currentTarget as HTMLElement).replaceWith(Object.assign(document.createElement('span'), { className: 'ph', textContent: initials(title) })), { once: true });
    return el;
  };

  function scan() {
    const enabled = ctx.settings.tradePreviews && onTrades();
    if (!enabled) {
      document.querySelectorAll('.wmt-trade-mini').forEach((el) => el.remove());
      return;
    }
    let unknown = false;
    for (const chip of document.querySelectorAll<HTMLElement>(CHIP)) {
      if (chip.closest('.wmt-trade-mini')) continue;
      const title = chip.getAttribute('title')?.trim() ?? '';
      const rarity = (chip.getAttribute('style') ?? '').match(/--color-rarity-([a-z]+)/i)?.[1]?.toUpperCase() ?? '';
      if (!title || !RARITIES.includes(rarity)) continue;
      const key = norm(title);
      if (!images.has(key)) unknown = true;
      const image = images.get(key);
      const stamp = `${key}|${rarity}|${image ?? ''}`;
      const prev = chip.previousElementSibling as HTMLElement | null;
      if (prev?.classList.contains('wmt-trade-mini')) {
        if (prev.dataset.key === stamp) continue;
        prev.remove();
      }
      const el = mini(title, rarity, image);
      el.dataset.key = stamp;
      chip.before(el);
    }
    if (unknown) void load();
  }

  let t = 0;
  const schedule = () => {
    clearTimeout(t);
    t = window.setTimeout(scan, 200);
  };
  new MutationObserver((muts) => {
    if (!onTrades() && !document.querySelector('.wmt-trade-mini')) return;
    if (muts.every((m) => (m.target as Element).closest?.('.wmt-trade-mini'))) return;
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  onSettings(schedule);
  schedule();
}
