import { FINISHED_COLOR, kindOf, STORAGE_COLOR, STORAGE_PREFIX } from '@/lib/album-kind';
import { collectionCache, collectionDirty } from '@/lib/cache';
import { siteTagsApi } from '@/lib/siteTags';
import { currentUserId, rest } from '@/lib/supabase';
import { randomTagColor } from '@/lib/tag-colors';
import type { TradeTags } from '@/lib/trade';
import type { SiteTag } from '@/lib/types';
import { ctx, DISPLAY_FONT, esc, onSettings, PANEL_CSS, siteModalOpen, themedHost, typing } from './ctx';
import { reveal } from './reveal';
import { sfx } from './sound';

/**
 * Rangement pendant le révélé, sans ouvrir la carte :
 *  - deux volets derrière la carte : rangements à gauche, collections à droite (finies en tête) ;
 *  - sous la carte, le statut d'échange en arc (Trade / Not Trade / Discard) ;
 *  - sous les boutons du site, une recherche qui filtre les deux volets et un « + » pour créer une étiquette.
 * Chaque clic pose ou retire tout de suite l'étiquette sur l'exemplaire tiré, sur WikiMasters.
 */

const PANEL_W = 250;
const OVERLAP = 40;

type Side = 'left' | 'right';
type Status = 'trade' | 'notTrade' | 'discard';

interface Copy {
  id: string;
  tagIds: Set<string>;
}

// La carte passe devant l'arc des statuts (même place, plan plus profond).
const PAGE_CSS = `.wmt-col { position: relative; z-index: 2; } .wmt-cardblock { position: relative; z-index: 2; }`;

const LAYER_CSS = `${PANEL_CSS}
  :host { position: absolute !important; inset: 0 !important; z-index: 1 !important; pointer-events: none; }
  .side { position: absolute; width: ${PANEL_W}px; transition: opacity .35s cubic-bezier(.2,.9,.3,1); pointer-events: auto; }
  .side.dim { opacity: .32; }
  .side .panel { position: static; padding: 14px 10px 10px; background: var(--glass); }
  .side.left .panel { padding-right: ${OVERLAP + 12}px; }
  .side.right .panel { padding-left: ${OVERLAP + 12}px; }
  h3 { margin: 0 6px 8px; font: 700 10.5px/1 ${DISPLAY_FONT}; letter-spacing: .14em; text-transform: uppercase; color: var(--muted-foreground); }
  .list { max-height: min(420px, calc(100vh - 220px)); overflow-y: auto; scrollbar-width: thin; }
  .item { display: flex; align-items: center; gap: 9px; padding: 0 8px; height: 34px; border-radius: 10px; cursor: pointer; overflow: hidden;
    transition: background .15s, opacity .3s cubic-bezier(.2,.9,.3,1), height .3s cubic-bezier(.2,.9,.3,1), transform .3s cubic-bezier(.2,.9,.3,1); }
  .item:hover { background: color-mix(in oklch, var(--foreground) 6%, transparent); }
  .item .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex: none; transition: box-shadow .2s, transform .2s; }
  .item .n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item .n mark { background: none; color: var(--foreground); font-weight: 700; text-decoration: underline; text-decoration-color: var(--primary); text-underline-offset: 3px; }
  .item.on { background: color-mix(in srgb, var(--c) 16%, transparent); }
  .item.on .dot { transform: scale(1.25); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 28%, transparent), 0 0 12px var(--c); }
  .item .chk { font-size: 12px; color: var(--c); opacity: 0; transition: opacity .2s; }
  .item.on .chk { opacity: 1; }
  .item .prog { font: 600 10.5px ui-monospace, monospace; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .item .prog.bump { animation: bump .5s cubic-bezier(.2,.9,.3,1.6); color: var(--foreground); }
  @keyframes bump { 40% { transform: scale(1.5); } }
  .item.glow { background: color-mix(in srgb, var(--c) 22%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 60%, transparent), 0 0 24px color-mix(in srgb, var(--c) 45%, transparent); }
  .item.out { height: 0; opacity: 0; transform: translateY(-4px); pointer-events: none; }
  .item.pop { animation: pop .3s; }
  @keyframes pop { 50% { transform: scale(1.04); } }
  .item.fin .n::after { content: ' 🏆'; }
  .msg { margin: 2px 8px; font-size: 12px; color: var(--muted-foreground); }
  .msg:empty { display: none; }
`;

const ARC_W = 300;
const ARC_H = 72;
const P0 = [24, 16];
const P1 = [150, 70];
const P2 = [276, 16];
const CENTERS = [0.13, 0.5, 0.87];
const HALF = 0.085;

const ARC_CSS = `
  :host { all: initial; display: block; position: relative; z-index: 1; width: ${ARC_W}px; height: ${ARC_H}px; margin: -8px auto 2px; }
  svg { position: absolute; inset: 0; overflow: visible; }
  .seg { cursor: pointer; outline: none; transform-box: fill-box; transform-origin: center; transition: transform .25s cubic-bezier(.2,.9,.3,1.5); color: var(--muted-foreground); }
  .seg .rim { fill: none; stroke: oklch(1 0 0 / 11%); stroke-width: 40; stroke-linecap: round; stroke-linejoin: round; transition: stroke .2s; }
  .seg .band { fill: none; stroke: var(--glass); stroke-width: 38; stroke-linecap: round; stroke-linejoin: round; transition: stroke .2s; }
  .seg .ic { fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: color .2s; }
  .seg:hover, .seg:focus-visible { transform: translate(var(--nx), var(--ny)) rotate(var(--r)) scale(1.12, 1.18) rotate(calc(var(--r) * -1)); color: #fff; }
  .seg:hover .band, .seg:focus-visible .band, .seg.on .band { stroke: var(--c); }
  .seg:hover .rim, .seg:focus-visible .rim, .seg.on .rim { stroke: color-mix(in srgb, var(--c) 60%, #fff); }
  .seg.on { color: #fff; }
  .seg:hover { filter: drop-shadow(0 0 12px color-mix(in srgb, var(--c) 55%, transparent)); }
  .tip { position: absolute; transform: translate(-50%, -50%) rotate(var(--r)) translateY(-4px); white-space: nowrap; padding: 4px 9px; border-radius: 8px; pointer-events: none;
    font: 700 10px/1.3 ui-sans-serif, system-ui, sans-serif; letter-spacing: .02em; color: #fff; background: color-mix(in srgb, var(--c) 85%, #000); opacity: 0; transition: .18s cubic-bezier(.2,.9,.3,1); }
  .tip.show { opacity: 1; transform: translate(-50%, -50%) rotate(var(--r)); }
  .tip kbd { font: 600 9px ui-monospace, monospace; opacity: .65; margin-left: 4px; }
`;

const SEARCH_CSS = `
  :host { all: initial; display: block; margin: 14px auto 0; width: max-content; font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--foreground); }
  .search { position: relative; display: flex; align-items: center; gap: 8px; }
  .box { display: flex; align-items: center; gap: 10px; width: 380px; height: 48px; padding: 0 18px; border-radius: 999px; box-sizing: border-box;
    background: var(--glass); border: 1px solid var(--search-ring); backdrop-filter: blur(12px);
    box-shadow: 0 14px 40px rgb(0 0 0 / .45), var(--search-glow); transition: border-color .2s, box-shadow .2s; }
  .box:focus-within { border-color: var(--primary); box-shadow: 0 14px 40px rgb(0 0 0 / .45), 0 0 0 5px color-mix(in oklch, var(--primary) 20%, transparent); }
  .box svg { width: 17px; height: 17px; flex: none; color: var(--muted-foreground); }
  input { all: unset; flex: 1; min-width: 0; color: var(--foreground); font-size: 14.5px; font-weight: 500; }
  input::placeholder { color: var(--muted-foreground); font-weight: 400; }
  kbd { font: 600 10px ui-monospace, monospace; color: var(--muted-foreground); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; }
  .plus { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 16px; line-height: 1; color: var(--muted-foreground);
    border: 1px solid var(--border); transition: color .2s, background .2s, transform .2s cubic-bezier(.2,.9,.3,1), border-color .2s; }
  .plus:hover, .plus.open { color: var(--primary-foreground); background: var(--primary); border-color: transparent; transform: rotate(90deg); }
  .menu { position: absolute; bottom: calc(100% + 10px); right: -6px; width: 250px; padding: 8px; border-radius: 16px; box-sizing: border-box;
    background: var(--popover); border: 1px solid var(--border); box-shadow: 0 20px 50px rgb(0 0 0 / .5);
    transform-origin: bottom right; transform: scale(.9) translateY(6px); opacity: 0; pointer-events: none; transition: .22s cubic-bezier(.2,.9,.3,1); }
  .menu.open { transform: none; opacity: 1; pointer-events: auto; }
  .menu p { margin: 4px 8px 8px; font-size: 12px; color: var(--muted-foreground); }
  .menu p b { color: var(--foreground); }
  .menu button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 10px; font-size: 13px; }
  .menu button:hover { background: color-mix(in oklch, var(--foreground) 6%, transparent); }
  .menu button small { display: block; font-size: 11px; color: var(--muted-foreground); }
  .menu .ico { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; flex: none; font-weight: 800; }
  .err { position: absolute; top: calc(100% + 6px); left: 18px; font-size: 12px; color: var(--destructive); }
`;

const ICONS: Record<Status, string> = {
  trade: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  notTrade: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/><path d="M3 21 21 3"/>',
  discard: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
};
const STATUS: { key: Status; label: string; color: string; kbd: string }[] = [
  { key: 'trade', label: 'Trade', color: 'oklch(0.696 0.17 162.48)', kbd: 'T' },
  { key: 'notTrade', label: 'Not Trade', color: 'oklch(0.637 0.237 25.331)', kbd: 'N' },
  { key: 'discard', label: 'Discard', color: 'oklch(0.55 0.02 60)', kbd: 'D' },
];

const at = (t: number) => [0, 1].map((k) => (1 - t) ** 2 * P0[k]! + 2 * (1 - t) * t * P1[k]! + t ** 2 * P2[k]!) as [number, number];
const slope = (t: number) => {
  const dx = 2 * (1 - t) * (P1[0]! - P0[0]!) + 2 * t * (P2[0]! - P1[0]!);
  const dy = 2 * (1 - t) * (P1[1]! - P0[1]!) + 2 * t * (P2[1]! - P1[1]!);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

/** Vecteur perpendiculaire à l'arc (vers l'extérieur, loin de la carte), de longueur `len`. */
const normal = (t: number, len: number): [number, number] => {
  const a = (slope(t) * Math.PI) / 180;
  return [-Math.sin(a) * len, Math.cos(a) * len];
};

function arcMarkup() {
  const segs = STATUS.map((st, i) => {
    const c = CENTERS[i]!;
    const pts = Array.from({ length: 9 }, (_, k) => at(c - HALF + (2 * HALF * k) / 8));
    const d = `M ${pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L ')}`;
    const [x, y] = at(c);
    const [nx, ny] = normal(c, 5);
    return `<g class="seg" data-st="${st.key}" tabindex="0" role="button" aria-label="${st.label}" style="--c:${st.color};--r:${slope(c).toFixed(1)}deg;--nx:${nx.toFixed(1)}px;--ny:${ny.toFixed(1)}px">
      <path class="rim" d="${d}"/><path class="band" d="${d}"/>
      <g class="ic" transform="translate(${(x - 9).toFixed(1)} ${(y - 9).toFixed(1)}) rotate(${slope(c).toFixed(1)} 9 9) scale(.75)">${ICONS[st.key]}</g>
    </g>`;
  }).join('');
  // Étiquette sous le segment, le long de sa normale et inclinée comme lui.
  const tips = STATUS.map((st, i) => {
    const c = CENTERS[i]!;
    const [x, y] = at(c);
    const [nx, ny] = normal(c, 34);
    return `<span class="tip" data-tip="${st.key}" style="--c:${st.color};--r:${slope(c).toFixed(1)}deg;left:${(x + nx).toFixed(1)}px;top:${(y + ny).toFixed(1)}px">${st.label}<kbd>${st.kbd}</kbd></span>`;
  }).join('');
  return `<svg viewBox="0 0 ${ARC_W} ${ARC_H}">${segs}</svg>${tips}`;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Verre des volets et anneau de recherche selon la piste de couleur choisie. */
function paintLook(hosts: HTMLElement[]) {
  const look = ctx.settings.siteLook;
  for (const h of hosts) {
    h.style.setProperty('--glass', look === 'ambient' ? 'color-mix(in oklch, oklch(0.32 0.08 293) 55%, transparent)' : 'color-mix(in oklch, var(--card) 80%, transparent)');
    h.style.setProperty('--search-ring', look === 'solid' ? 'color-mix(in oklch, var(--primary) 55%, transparent)' : look === 'ambient' ? 'rgb(255 255 255 / .35)' : 'rgb(255 255 255 / .22)');
    h.style.setProperty('--search-glow', look === 'solid' ? '0 0 26px color-mix(in oklch, var(--primary) 25%, transparent)' : '0 0 0 transparent');
  }
}

export interface PanelsApi {
  /** Ligne d'une étiquette dans le volet des collections (pour l'animation des albums à objectif). */
  rowOf(tagId: string): HTMLElement | null;
  /** Pose l'étiquette sur l'exemplaire affiché si elle n'y est pas. */
  ensureTag(tagId: string): Promise<boolean>;
  hasTag(tagId: string): boolean;
}

export function startPanels(): PanelsApi {
  const pageStyle = document.createElement('style');
  pageStyle.textContent = PAGE_CSS;
  (document.head ?? document.documentElement).append(pageStyle);

  const layer = themedHost('wmt-panels');
  layer.root.innerHTML = `<style>${LAYER_CSS}</style>
    <div class="side left"><div class="panel"><h3>Rangement</h3><div class="list"></div><div class="msg"></div></div></div>
    <div class="side right"><div class="panel"><h3>Collections</h3><div class="list"></div><div class="msg"></div></div></div>`;
  const side = (s: Side) => layer.root.querySelector<HTMLElement>(`.side.${s}`)!;

  const arc = themedHost('wmt-status-arc');
  arc.root.innerHTML = `<style>${ARC_CSS}</style>${arcMarkup()}`;

  const search = themedHost('wmt-tag-search');
  search.root.innerHTML = `<style>${SEARCH_CSS}</style>
    <div class="search">
      <div class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input placeholder="Ranger dans… (chercher une étiquette)" autocomplete="off" spellcheck="false"><kbd>/</kbd></div>
      <button class="plus" type="button" aria-label="Nouvelle étiquette" title="Nouvelle étiquette">+</button>
      <div class="menu" role="menu">
        <p>Créer <b class="nm">une étiquette</b> dans :</p>
        <button data-k="right" role="menuitem"><span class="ico" style="background:color-mix(in oklch, var(--primary) 22%, transparent);color:var(--primary)">★</span><span>Collections<small>Couleur vive, volet de droite</small></span></button>
        <button data-k="left" role="menuitem"><span class="ico" style="background:#71717a33;color:#a1a1aa">·</span><span>Rangement<small>« · Nom », gris, volet de gauche</small></span></button>
      </div>
      <span class="err"></span>
    </div>`;
  const input = search.root.querySelector('input')!;
  const menu = search.root.querySelector<HTMLElement>('.menu')!;
  const plus = search.root.querySelector<HTMLElement>('.plus')!;
  const errEl = search.root.querySelector<HTMLElement>('.err')!;
  const hosts = [layer.host, arc.host, search.host];

  let tags: SiteTag[] = [];
  let tradeTags: TradeTags | null = null;
  let tagsFresh = false;
  let copies: Record<string, Copy> = {};
  let packKey = '';
  let loading = false;
  let error: string | null = null;
  let query = '';
  let errTimer = 0;

  collectionCache.getValue().then((cache) => {
    if (!cache) return;
    tags = cache.tags;
    tradeTags = cache.tradeTags;
    render();
  });

  const systemIds = () => new Set([tradeTags?.trade.id, tradeTags?.notTrade.id, tradeTags?.discard?.id].filter(Boolean) as string[]);
  const byName = (a: SiteTag, b: SiteTag) => a.name.localeCompare(b.name, 'fr');
  const lists = () => {
    const sys = systemIds();
    const own = tags.filter((t) => !sys.has(t.id));
    return {
      left: own.filter((t) => kindOf(t) === 'storage').sort(byName),
      right: [...own.filter((t) => kindOf(t) === 'finished').sort(byName), ...own.filter((t) => kindOf(t) === 'collection').sort(byName)],
    };
  };
  const display = (t: SiteTag) => (kindOf(t) === 'storage' ? t.name.replace(/^·\s*/, '') : t.name.replace(/\s*[✓✔]\s*$/u, ''));
  const currentCopy = () => (reveal.card ? copies[String(reveal.card.id)] : undefined);

  const flash = (text: string) => {
    errEl.textContent = text;
    clearTimeout(errTimer);
    errTimer = window.setTimeout(() => (errEl.textContent = ''), 2400);
  };

  // ---------------- données ----------------
  const pickCopies = (cards: any[], rows: any[]) => {
    const out: Record<string, Copy> = {};
    for (const card of cards) {
      const mine = rows.filter((u) => String(u.card_id) === String(card.id));
      // Même règle que le site : l'exemplaire dont l'état shiny correspond à la carte tirée.
      const u = mine.find((x) => Boolean(x.is_shiny) === Boolean(card.is_shiny)) ?? mine[0];
      if (u) out[String(card.id)] = { id: String(u.id), tagIds: new Set((u.user_card_tags ?? []).map((t: any) => String(t.tag_id ?? t.tag?.id)).filter(Boolean)) };
    }
    return out;
  };

  let loaded: Promise<void> = Promise.resolve();
  const loadPack = () =>
    (loaded = (async () => {
      const pack = reveal.pack;
      if (!pack) return;
      error = null;
      loading = true;
      render();
      try {
        const jobs: Promise<unknown>[] = [];
        if (!tagsFresh) {
          jobs.push(
            siteTagsApi.list().then((list) => {
              tags = list;
              tagsFresh = true;
              const find = (name: string) => list.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
              const trade = find(ctx.settings.tradeTagName);
              const notTrade = find(ctx.settings.notTradeTagName);
              if (trade && notTrade) tradeTags = { trade, notTrade, discard: find(ctx.settings.discardTagName) };
            }),
          );
        }
        const ids = [...new Set(pack.cards.map((c) => String(c.id)))];
        jobs.push(
          (async () => {
            const uid = await currentUserId();
            const rows = await rest<any[]>(`user_cards?select=id,card_id,is_shiny,user_card_tags(tag_id)&user_id=eq.${uid}&card_id=in.(${ids.join(',')})`);
            copies = pickCopies(pack.cards, rows ?? []);
          })(),
        );
        await Promise.all(jobs);
      } catch (e) {
        error = 'Impossible de lire tes étiquettes';
        console.warn('[Collection+] volets', e);
      }
      loading = false;
      render();
    })());

  const toggle = async (tag: SiteTag, force?: boolean) => {
    const copy = currentCopy();
    if (!copy) return false;
    const on = copy.tagIds.has(tag.id);
    if (force !== undefined && force === on) return true;
    on ? copy.tagIds.delete(tag.id) : copy.tagIds.add(tag.id);
    render(tag.id);
    if (force === undefined) sfx.toggle(!on);
    try {
      await (on ? siteTagsApi.removeMany(tag.id, [copy.id]) : siteTagsApi.addMany(tag.id, [copy.id]));
      collectionDirty.setValue(true);
      return true;
    } catch {
      on ? copy.tagIds.add(tag.id) : copy.tagIds.delete(tag.id);
      flash('Échec, réessaie');
      render();
      return false;
    }
  };

  /** Statut d'échange exclusif : pose la cible, retire les deux autres (un second appui le retire). */
  const setStatus = async (target: Status) => {
    const copy = currentCopy();
    const tt = tradeTags;
    if (!copy || !tt) return;
    const all: Record<Status, SiteTag | undefined> = { trade: tt.trade, notTrade: tt.notTrade, discard: tt.discard };
    const tag = all[target];
    if (!tag) return;
    const before = new Set(copy.tagIds);
    const turningOff = copy.tagIds.has(tag.id);
    for (const t of Object.values(all)) if (t) copy.tagIds.delete(t.id);
    if (!turningOff) copy.tagIds.add(tag.id);
    renderArc();
    sfx.toggle(!turningOff);
    try {
      for (const t of Object.values(all)) if (t && before.has(t.id) && !copy.tagIds.has(t.id)) await siteTagsApi.removeMany(t.id, [copy.id]);
      if (!turningOff) await siteTagsApi.addMany(tag.id, [copy.id]);
      collectionDirty.setValue(true);
    } catch {
      copy.tagIds = before;
      flash('Échec, réessaie');
      renderArc();
    }
  };

  const createTag = async (where: Side, raw: string) => {
    const name = raw.trim();
    if (!name) {
      input.focus();
      flash('Tape le nom dans la recherche, puis choisis où le créer');
      return;
    }
    const full = where === 'left' ? `${STORAGE_PREFIX}${name.replace(/^·\s*/, '')}` : name;
    const existing = tags.find((t) => t.name.trim().toLowerCase() === full.toLowerCase());
    try {
      const tag = existing ?? (await siteTagsApi.create(full, where === 'left' ? STORAGE_COLOR : randomTagColor()));
      if (!existing) tags = [...tags, tag];
      query = '';
      input.value = '';
      if (!currentCopy()?.tagIds.has(tag.id)) await toggle(tag);
      else render();
    } catch {
      flash('Étiquette non créée');
    }
  };

  // ---------------- affichage ----------------
  const highlight = (name: string) => {
    const q = norm(query.trim());
    const i = q ? norm(name).indexOf(q) : -1;
    return i >= 0 ? `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}` : esc(name);
  };
  const matches = (t: SiteTag) => {
    const q = norm(query.trim());
    return !q || norm(display(t)).includes(q);
  };
  const emptyText = (s: Side, filtered: boolean) => (filtered ? (s === 'left' ? 'Aucun rangement' : 'Aucune collection') : s === 'left' ? 'Pas encore de rangement' : 'Pas encore de collection');

  function render(popId?: string) {
    const card = reveal.card;
    const copy = currentCopy();
    const all = lists();
    const filtered = Boolean(query.trim());
    for (const s of ['left', 'right'] as Side[]) {
      const el = side(s);
      const list = el.querySelector('.list')!;
      const msg = el.querySelector<HTMLElement>('.msg')!;
      const items = all[s];
      if (loading && !copy) {
        list.innerHTML = '';
        msg.textContent = 'Chargement…';
      } else if (error) {
        list.innerHTML = '';
        msg.textContent = error;
      } else if (!copy) {
        list.innerHTML = '';
        msg.textContent = card ? 'Exemplaire introuvable' : '';
      } else {
        list.innerHTML = items
          .map((t) => {
            const color = kindOf(t) === 'finished' ? FINISHED_COLOR : (t.color ?? '#71717a');
            return `<div class="item${copy.tagIds.has(t.id) ? ' on' : ''}${matches(t) ? '' : ' out'}${popId === t.id ? ' pop' : ''}${kindOf(t) === 'finished' ? ' fin' : ''}" data-id="${esc(t.id)}" style="--c:${esc(color)}">
              <span class="dot"></span><span class="n">${highlight(display(t))}</span><span class="chk">✓</span></div>`;
          })
          .join('');
        const shown = items.filter(matches).length;
        msg.textContent = shown ? '' : emptyText(s, filtered);
        el.classList.toggle('dim', filtered && !shown);
      }
    }
    search.root.querySelector('.nm')!.textContent = query.trim() ? `« ${query.trim()} »` : 'une étiquette';
    renderArc();
  }

  /** Filtrage en direct : on replie les lignes qui ne correspondent pas, sans reconstruire la liste. */
  const applyFilter = () => {
    const filtered = Boolean(query.trim());
    for (const s of ['left', 'right'] as Side[]) {
      const el = side(s);
      let shown = 0;
      el.querySelectorAll<HTMLElement>('.item').forEach((it) => {
        const tag = tags.find((t) => t.id === it.dataset.id);
        if (!tag) return;
        const hit = matches(tag);
        it.classList.toggle('out', !hit);
        it.querySelector('.n')!.innerHTML = highlight(display(tag));
        if (hit) shown++;
      });
      if (currentCopy()) el.querySelector<HTMLElement>('.msg')!.textContent = shown ? '' : emptyText(s, filtered);
      el.classList.toggle('dim', filtered && !shown);
    }
    search.root.querySelector('.nm')!.textContent = query.trim() ? `« ${query.trim()} »` : 'une étiquette';
  };

  function renderArc() {
    const copy = currentCopy();
    const tt = tradeTags;
    arc.root.querySelectorAll<SVGGElement>('.seg').forEach((g) => {
      const key = g.dataset.st as Status;
      const tag = tt ? { trade: tt.trade, notTrade: tt.notTrade, discard: tt.discard }[key] : undefined;
      g.classList.toggle('on', Boolean(copy && tag && copy.tagIds.has(tag.id)));
      g.style.display = tag || !tt ? '' : 'none';
    });
  }

  // ---------------- interactions ----------------
  layer.root.addEventListener('click', (e) => {
    const it = (e.target as HTMLElement).closest<HTMLElement>('.item');
    const tag = it && tags.find((t) => t.id === it.dataset.id);
    if (tag) toggle(tag);
  });
  arc.root.querySelectorAll<SVGGElement>('.seg').forEach((g) => {
    const tip = arc.root.querySelector<HTMLElement>(`[data-tip="${g.dataset.st}"]`)!;
    g.addEventListener('click', () => setStatus(g.dataset.st as Status));
    g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.stopPropagation(), setStatus(g.dataset.st as Status)));
    g.addEventListener('pointerenter', () => tip.classList.add('show'));
    g.addEventListener('pointerleave', () => tip.classList.remove('show'));
  });
  const closeMenu = () => {
    menu.classList.remove('open');
    plus.classList.remove('open');
  };
  input.addEventListener('input', () => {
    query = input.value;
    applyFilter();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Espace, chiffres et lettres s'écrivent dans le champ.
    if (e.key === 'Escape') {
      query = '';
      input.value = '';
      applyFilter();
      input.blur();
      closeMenu();
    }
    if (e.key === 'Enter') {
      const { left, right } = lists();
      const hits = [...right, ...left].filter(matches);
      if (hits.length === 1) {
        toggle(hits[0]!);
        query = '';
        input.value = '';
        applyFilter();
      } else if (!hits.length && query.trim()) {
        menu.classList.add('open');
        plus.classList.add('open');
      }
    }
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  plus.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
    plus.classList.toggle('open', menu.classList.contains('open'));
  });
  menu.querySelectorAll<HTMLElement>('button').forEach((b) =>
    b.addEventListener('click', () => {
      closeMenu();
      createTag(b.dataset.k as Side, query);
    }),
  );
  document.addEventListener('click', (e) => {
    if (!e.composedPath().includes(search.host)) closeMenu();
  });

  // ---------------- placement ----------------
  const colOf = (flip: HTMLElement) => flip.closest<HTMLElement>('.flex.flex-col');
  /** Enfant direct de la colonne qui contient la carte (l'arc s'insère juste dessous). */
  const cardBlock = (flip: HTMLElement, col: HTMLElement) => {
    let n: HTMLElement = flip;
    while (n.parentElement && n.parentElement !== col) n = n.parentElement;
    return n;
  };

  /** Volets de part et d'autre de la carte, calés sur la mise en page (pas sur la carte qui s'anime). */
  const place = (flip: HTMLElement, col: HTMLElement, stage: HTMLElement) => {
    const block = cardBlock(flip, col);
    const cardEl = (flip.querySelector('[class*="glow-"]') as HTMLElement | null) ?? (flip.firstElementChild as HTMLElement | null) ?? flip;
    const z = parseFloat(col.style.zoom) || 1;
    const colRect = col.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const blockCenter = colRect.left + (block.offsetLeft + block.offsetWidth / 2) * z;
    const w = cardEl.offsetWidth * z;
    const top = colRect.top + block.offsetTop * z - stageRect.top + 24;
    const left = blockCenter - w / 2 - stageRect.left;
    const right = blockCenter + w / 2 - stageRect.left;
    const width = Math.max(170, Math.min(PANEL_W, left + OVERLAP - 8));
    for (const s of ['left', 'right'] as Side[]) {
      const el = side(s);
      el.style.width = `${width}px`;
      el.style.top = `${top}px`;
      el.style.left = `${s === 'left' ? left + OVERLAP - width : right - OVERLAP}px`;
    }
  };

  const detach = () => {
    for (const h of hosts) if (h.isConnected) h.remove();
    document.querySelectorAll('.wmt-col').forEach((c) => c.classList.remove('wmt-col'));
    document.querySelectorAll('.wmt-cardblock').forEach((c) => c.classList.remove('wmt-cardblock'));
  };

  let lastCardId = '';
  const sync = () => {
    const enabled = ctx.settings.revealPanels && location.pathname.startsWith('/pulls');
    const flip = reveal.flip;
    const col = flip && colOf(flip);
    const stage = col?.closest<HTMLElement>('[data-wmt-stage]') ?? (col?.parentElement as HTMLElement | null);
    if (!enabled || !reveal.active || !reveal.pack || !flip || !col || !stage) {
      detach();
      return;
    }
    const hidden = siteModalOpen();
    for (const h of hosts) h.style.visibility = hidden ? 'hidden' : '';
    if (!col.classList.contains('wmt-col')) col.classList.add('wmt-col');
    if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
    if (layer.host.parentElement !== stage) stage.append(layer.host);
    const block = cardBlock(flip, col);
    if (!block.classList.contains('wmt-cardblock')) block.classList.add('wmt-cardblock');
    if (block.nextElementSibling !== arc.host) block.after(arc.host);
    if (search.host.parentElement !== col || col.lastElementChild !== search.host) col.append(search.host);

    const key = reveal.pack.cards.map((c) => c.id).join('|');
    if (key !== packKey) {
      packKey = key;
      copies = {};
      query = '';
      input.value = '';
      loadPack();
    }
    const id = String(reveal.card?.id ?? '');
    if (id !== lastCardId) {
      lastCardId = id;
      render();
    }
    place(flip, col, stage);
  };
  reveal.on(sync);
  onSettings(() => {
    paintLook(hosts);
    sync();
  });
  setInterval(sync, 200);

  // Raccourcis : / recherche, T / N / D statut, 1–9 collections, ⇧1–9 rangements.
  document.addEventListener(
    'keydown',
    (e) => {
      if (!arc.host.isConnected || e.ctrlKey || e.metaKey || e.altKey || typing()) return;
      if (e.key === '/' || e.code === 'Slash') {
        e.preventDefault();
        input.focus();
        return;
      }
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) {
        const { left, right } = lists();
        const tag = (e.shiftKey ? left : right)[Number(digit[1]) - 1];
        if (!tag) return;
        e.preventDefault();
        e.stopPropagation();
        toggle(tag);
        return;
      }
      const status = ({ KeyT: 'trade', KeyN: 'notTrade', KeyD: 'discard' } as const)[e.code as 'KeyT' | 'KeyN' | 'KeyD'];
      if (status && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setStatus(status);
      }
    },
    true,
  );

  return {
    rowOf: (tagId) => layer.root.querySelector<HTMLElement>(`.item[data-id="${CSS.escape(tagId)}"]`),
    hasTag: (tagId) => Boolean(currentCopy()?.tagIds.has(tagId)),
    async ensureTag(tagId) {
      await loaded;
      const tag = tags.find((t) => t.id === tagId);
      return tag ? toggle(tag, true) : false;
    },
  };
}
