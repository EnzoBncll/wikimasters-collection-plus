import { storage } from '#imports';
import { ctx, esc, onSettings, themedHost } from './ctx';

/**
 * Sur les cartes du site :
 *  - bouton plein écran (copie de la carte agrandie, inclinaison 3D et reflet qui suivent la souris) ;
 *  - en option, image libre (Wikipédia, Wikidata, Commons) avec son crédit pour les cartes sans image.
 * Les données de carte sont posées en data-wmt-* par le script de page (page.content.ts).
 */

const STYLE = `
  .wmt-tools { position: absolute; right: 6px; top: calc(45% - 28px); z-index: 40; display: flex; gap: 4px; opacity: 0; transform: translateY(4px);
    transition: opacity .18s, transform .18s; pointer-events: none; }
  .group:hover .wmt-tools, [class*="glow-"]:hover > .wmt-tools { opacity: 1; transform: none; pointer-events: auto; }
  @media (hover: none) { .wmt-tools { opacity: 1; transform: none; pointer-events: auto; } }
  .wmt-tools button { all: unset; box-sizing: border-box; width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; cursor: pointer;
    background: rgba(12,13,12,.72); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,.18); color: #f2f4f3; box-shadow: 0 2px 8px rgba(0,0,0,.35);
    transition: transform .12s, background .12s; }
  .wmt-tools button:hover { transform: translateY(-1px) scale(1.08); background: rgba(30,34,32,.9); }
  .wmt-tools svg { width: 13px; height: 13px; }
  .wmt-freeimg { position: absolute; inset: 0; z-index: 5; overflow: hidden; background: #111; }
  .wmt-freeimg img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .wmt-freeimg.logo { background: radial-gradient(circle at 50% 45%, #fff, #dfe4e1 80%); }
  .wmt-freeimg.logo img { object-fit: contain; padding: 10% 12% 16%; box-sizing: border-box; }
  .wmt-credit { position: absolute; left: 0; right: 0; bottom: 0; box-sizing: border-box; padding: 10px 6px 3px; font: 500 8px/1.2 system-ui, sans-serif; color: rgba(255,255,255,.85);
    background: linear-gradient(transparent, rgba(0,0,0,.7)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; cursor: pointer; }
  .wmt-credit:hover { color: #fff; text-decoration: underline; }
`;

const OVERLAY_CSS = `
  :host { all: initial; }
  .ov { position: fixed; inset: 0; z-index: 2147483200; display: grid; place-items: center; background: rgb(5 4 12 / .86); backdrop-filter: blur(6px);
    animation: fade .2s ease-out; cursor: zoom-out; }
  .ov.out { animation: fadeout .18s ease-in forwards; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes fadeout { to { opacity: 0; } }
  .bar { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; gap: 8px; cursor: default; }
  .b { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 999px; font: 600 12.5px/1 ui-sans-serif, system-ui, sans-serif;
    color: var(--frame-foreground); background: var(--frame-active); border: 1px solid color-mix(in oklch, var(--frame-foreground) 14%, transparent); }
  .b:hover { border-color: color-mix(in oklch, var(--frame-foreground) 34%, transparent); }
  kbd { font: 600 10px/1 ui-monospace, monospace; opacity: .7; }
`;

const ICON_FS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const RARITY_GLOW: Record<string, string> = { L: '#ffe144', UR: '#fa9931', SR: '#ed6fa3', R: '#c6a7f2', PC: '#b1cff2', C: '#b8f2d5' };
const stop = (e: Event) => e.stopPropagation();

// ---------------- plein écran ----------------
function fullscreen(el: HTMLElement) {
  const { host, root } = themedHost('wmt-fullscreen');
  const color = el.dataset.wmtShiny ? '#e9c15a' : (RARITY_GLOW[el.dataset.wmtRarity ?? ''] ?? '#b8f2d5');
  // La copie garde les classes du site : ses styles ne s'appliquent qu'hors shadow DOM, d'où un conteneur dans la page.
  const frame = document.createElement('div');
  frame.style.cssText = 'position:fixed;inset:0;z-index:2147483201;display:grid;place-items:center;pointer-events:none;';
  const tilt = document.createElement('div');
  tilt.style.cssText = `position:relative;transition:transform .12s ease-out;transform-style:preserve-3d;border-radius:18px;pointer-events:auto;box-shadow:0 40px 90px rgb(0 0 0 / .6),0 0 60px ${color}55;`;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.wmt-tools, .wmt-trade-badge, .wmt-wish-tag, .wmt-wish-btn').forEach((n) => n.remove());
  const w = el.offsetWidth || 224;
  const h = el.offsetHeight || 320;
  const k = Math.min((innerHeight * 0.82) / h, (innerWidth * 0.9) / w, 4);
  clone.style.cssText += `;width:${w}px;height:${h}px;margin:0;transform:none;zoom:${k};`;
  const shine = document.createElement('div');
  shine.style.cssText = 'position:absolute;inset:0;border-radius:18px;pointer-events:none;mix-blend-mode:soft-light;';
  tilt.append(clone, shine);
  frame.append(tilt);

  const wiki = el.dataset.wmtWiki;
  root.innerHTML = `<style>${OVERLAY_CSS}</style><div class="ov"><div class="bar">
    ${wiki ? `<a class="b" href="${esc(wiki)}" target="_blank" rel="noopener"><b style="font-family:Georgia,serif">W</b> Wikipédia</a>` : ''}
    <button class="b x">Fermer <kbd>Échap</kbd></button></div></div>`;
  const ov = root.querySelector<HTMLElement>('.ov')!;
  // Dans <body> : la copie hérite des polices et couleurs du site.
  document.body.append(host, frame);

  const close = () => {
    removeEventListener('keydown', onKey, true);
    ov.classList.add('out');
    frame.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.96)' }], { duration: 180, fill: 'forwards' });
    setTimeout(() => (host.remove(), frame.remove()), 180);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  addEventListener('keydown', onKey, true);
  ov.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.bar')) close();
  });
  root.querySelector('.x')!.addEventListener('click', close);
  frame.addEventListener('click', (e) => e.target === frame && close());
  tilt.addEventListener('click', stop, true);
  const move = (e: PointerEvent) => {
    const r = tilt.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const cx = Math.max(-0.6, Math.min(0.6, x - 0.5));
    const cy = Math.max(-0.6, Math.min(0.6, y - 0.5));
    tilt.style.transform = `perspective(1400px) rotateY(${cx * 16}deg) rotateX(${-cy * 14}deg)`;
    shine.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,.45), transparent 45%)`;
  };
  window.addEventListener('pointermove', move);
  const cleanup = new MutationObserver(() => {
    if (!frame.isConnected) {
      window.removeEventListener('pointermove', move);
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true });
  frame.animate([{ opacity: 0, transform: 'scale(.9) translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
}

// ---------------- images libres ----------------
interface FreeImage {
  src: string;
  artist: string;
  license: string;
  page: string;
  logo: boolean;
}
interface ImageEntry {
  t: number;
  img: FreeImage | null;
}

const imagesItem = storage.defineItem<Record<string, ImageEntry>>('local:freeImages', { fallback: {} });
const TTL = 7 * 24 * 3600 * 1000;
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const strip = (h: unknown) => String(h ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function wikiRef(el: HTMLElement): { host: string; title: string } | null {
  try {
    const u = new URL(el.dataset.wmtWiki ?? '');
    return { host: u.host, title: decodeURIComponent(u.pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' ') };
  } catch {
    const title = el.dataset.wmtTitle;
    return title ? { host: `${el.dataset.wmtLang || 'fr'}.wikipedia.org`, title } : null;
  }
}

async function credits(api: string, files: string[]): Promise<Record<string, Omit<FreeImage, 'logo' | 'src'> & { src?: string }>> {
  const out: Record<string, Omit<FreeImage, 'logo' | 'src'> & { src?: string }> = {};
  const norm = (n: string) => n.replace(/^[^:]+:/, '').replace(/_/g, ' ').trim();
  for (const group of chunk(files, 40)) {
    const url = `${api}?action=query&format=json&origin=*&prop=imageinfo&iiprop=extmetadata|url&iiurlwidth=640&iiextmetadatafilter=Artist|LicenseShortName|UsageTerms&titles=${encodeURIComponent(group.map((f) => `File:${f}`).join('|'))}`;
    const json = await fetch(url).then((r) => r.json());
    const renamed: Record<string, string> = {};
    for (const n of json.query?.normalized ?? []) renamed[norm(n.to)] = norm(n.from);
    for (const p of Object.values<any>(json.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const em = ii.extmetadata ?? {};
      const name = norm(p.title);
      out[renamed[name] ?? name] = {
        src: ii.thumburl || ii.url,
        artist: strip(em.Artist?.value) || 'Auteur inconnu',
        license: strip(em.LicenseShortName?.value) || strip(em.UsageTerms?.value) || 'Licence libre',
        page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`,
      };
    }
  }
  return out;
}

/** Image d'article Wikipédia sous licence libre, sinon image Wikidata (Commons) : photo, affiche puis logo. */
async function resolveImages(cards: { id: string; ref: { host: string; title: string } }[]): Promise<Record<string, FreeImage | null>> {
  const result: Record<string, FreeImage | null> = {};
  const byHost = new Map<string, typeof cards>();
  for (const c of cards) byHost.set(c.ref.host, [...(byHost.get(c.ref.host) ?? []), c]);
  for (const [host, list] of byHost) {
    for (const part of chunk(list, 40)) {
      const api = `https://${host}/w/api.php`;
      const titles = part.map((c) => c.ref.title);
      const json = await fetch(
        `${api}?action=query&format=json&origin=*&redirects=1&prop=pageprops|pageimages&ppprop=wikibase_item&piprop=thumbnail|name&pithumbsize=640&pilicense=free&titles=${encodeURIComponent(titles.join('|'))}`,
      ).then((r) => r.json());
      const map: Record<string, string> = Object.fromEntries(titles.map((t) => [t, t]));
      for (const n of [...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])]) for (const k of Object.keys(map)) if (map[k] === n.from) map[k] = n.to;
      const pages: Record<string, any> = {};
      for (const p of Object.values<any>(json.query?.pages ?? {})) pages[p.title] = p;
      const pageImage: Record<string, string> = {};
      const qids: Record<string, string> = {};
      for (const c of part) {
        const p = pages[map[c.ref.title]!];
        if (p?.pageimage && p.thumbnail) pageImage[c.id] = p.pageimage;
        else if (p?.pageprops?.wikibase_item) qids[c.id] = p.pageprops.wikibase_item;
      }
      const fromWiki = await credits(api, [...new Set(Object.values(pageImage))]);
      for (const c of part) {
        const file = pageImage[c.id];
        const info = file ? fromWiki[file.replace(/_/g, ' ')] : undefined;
        result[c.id] = info?.src ? { ...info, src: info.src, logo: false } : null;
      }
      // Pas d'image libre sur l'article : élément Wikidata (P18 photo, P3383 affiche, P154 logo).
      const ids = [...new Set(Object.values(qids))];
      const files: Record<string, { name: string; logo: boolean }> = {};
      for (const group of chunk(ids, 50)) {
        const wd = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=claims&ids=${group.join('|')}`).then((r) => r.json());
        for (const entity of Object.values<any>(wd.entities ?? {})) {
          const claim = (p: string) => entity.claims?.[p]?.[0]?.mainsnak?.datavalue?.value as string | undefined;
          const photo = claim('P18') ?? claim('P3383');
          const logo = claim('P154');
          if (photo || logo) files[entity.id] = { name: (photo ?? logo)!, logo: !photo };
        }
      }
      const fromCommons = await credits('https://commons.wikimedia.org/w/api.php', [...new Set(Object.values(files).map((f) => f.name))]);
      for (const [cardId, qid] of Object.entries(qids)) {
        const f = files[qid];
        const info = f && fromCommons[f.name.replace(/_/g, ' ')];
        result[cardId] = info?.src ? { ...info, src: info.src, logo: f!.logo } : null;
      }
    }
  }
  return result;
}

const proxied = (u: string) => `/_next/image?url=${encodeURIComponent(u)}&w=640&q=75`;

function addFreeImage(el: HTMLElement, img: FreeImage) {
  if (el.querySelector('.wmt-freeimg')) return;
  const area = [...el.children].find((c) => /\bh-\[45%\]/.test(String((c as HTMLElement).className))) as HTMLElement | undefined;
  if (!area) return;
  const d = document.createElement('div');
  d.className = `wmt-freeimg${img.logo ? ' logo' : ''}`;
  const credit = `${img.artist} · ${img.license}`;
  d.innerHTML = `<img src="${esc(proxied(img.src))}" data-direct="${esc(img.src)}" alt="" loading="lazy" decoding="async">
    <a class="wmt-credit" href="${esc(img.page)}" target="_blank" rel="noopener" title="${esc(credit)} (Wikimedia)">${esc(credit)}</a>`;
  const image = d.querySelector('img')!;
  image.addEventListener('error', () => {
    if (!image.dataset.fallback) {
      image.dataset.fallback = '1';
      image.src = image.dataset.direct!;
    } else d.remove();
  });
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click']) d.querySelector('.wmt-credit')!.addEventListener(t, stop);
  if (getComputedStyle(area).position === 'static') area.style.position = 'relative';
  area.append(d);
}

export function startCardTools() {
  const style = document.createElement('style');
  style.textContent = STYLE;
  (document.head ?? document.documentElement).append(style);

  let cache: Record<string, ImageEntry> = {};
  imagesItem.getValue().then((v) => (cache = v));
  const queue = new Map<string, { id: string; ref: { host: string; title: string } }>();
  let running = false;

  const pump = async () => {
    if (running || !queue.size) return;
    running = true;
    const batch = [...queue.values()].slice(0, 80);
    batch.forEach((c) => queue.delete(c.id));
    try {
      const found = await resolveImages(batch);
      const now = Date.now();
      for (const c of batch) cache[c.id] = { t: now, img: found[c.id] ?? null };
      await imagesItem.setValue(cache);
    } catch (e) {
      console.warn('[Collection+] images libres', e);
    } finally {
      running = false;
      scan();
      if (queue.size) setTimeout(pump, 500);
    }
  };

  const scan = () => {
    const cards = document.querySelectorAll<HTMLElement>('main [class*="glow-"][data-wmt-id]');
    for (const el of cards) {
      // Bouton plein écran.
      const tools = [...el.children].find((c) => c.classList.contains('wmt-tools'));
      if (ctx.settings.cardFullscreen && !tools && el.getBoundingClientRect().width > 90) {
        const tb = document.createElement('div');
        tb.className = 'wmt-tools';
        tb.innerHTML = `<button type="button" title="Plein écran (Collection+)">${ICON_FS}</button>`;
        for (const t of ['pointerdown', 'mousedown', 'touchstart']) tb.addEventListener(t, stop);
        tb.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          fullscreen(el);
        });
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.append(tb);
      } else if (!ctx.settings.cardFullscreen && tools) tools.remove();

      // Image libre.
      if (!ctx.settings.freeImages) continue;
      if (el.dataset.wmtNoimg !== '1') continue;
      const id = el.dataset.wmtId!;
      const hit = cache[id];
      if (hit && Date.now() - hit.t < TTL) {
        if (hit.img) addFreeImage(el, hit.img);
        continue;
      }
      const ref = wikiRef(el);
      if (ref && !queue.has(id)) queue.set(id, { id, ref });
    }
    if (!ctx.settings.freeImages) document.querySelectorAll('.wmt-freeimg').forEach((n) => n.remove());
    if (queue.size) pump();
  };

  let t = 0;
  const schedule = () => {
    clearTimeout(t);
    t = window.setTimeout(scan, 250);
  };
  new MutationObserver((muts) => {
    if (muts.every((m) => (m.target as Element).closest?.('.wmt-tools, .wmt-freeimg'))) return;
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-wmt-id'] });
  onSettings(schedule);
}
