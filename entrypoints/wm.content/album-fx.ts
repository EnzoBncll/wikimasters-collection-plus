import { bareName } from '@/lib/album-kind';
import { collectionCache } from '@/lib/cache';
import { goalAlbumsItem, titleKey, type GoalAlbum } from '@/lib/goal-albums';
import { articleTitle } from '@/lib/wikidata';
import { skinElement } from './card-skin';
import { ctx, DISPLAY_FONT, esc, themedHost } from './ctx';
import { center } from './fx';
import type { PanelsApi } from './panels';
import { reveal, type ImpactInfo } from './reveal';
import { albumSfx } from './sound';

/**
 * Quand la carte tirée fait partie de la liste d'un album à objectif : l'album sort de sa ligne dans le volet
 * des collections, s'ouvre sur la bonne case, la carte s'y glisse en 3D, puis l'album se referme et y retourne.
 * Si le réglage est actif, la carte est vraiment ajoutée à l'album sur WikiMasters au moment où elle est collée.
 */

const CSS = `
  :host { all: initial; position: fixed; inset: 0; z-index: 2147482995; pointer-events: none; perspective: 1200px; }
  .book { position: absolute; left: 0; top: 0; width: 200px; height: 260px; transform-style: preserve-3d; opacity: 0; will-change: transform; }
  .book .back, .book .page, .book .cover, .book .cover-in { position: absolute; inset: 0; border-radius: 6px 14px 14px 6px; backface-visibility: hidden; }
  .book .back { background: color-mix(in srgb, var(--album) 55%, #111); transform: translateZ(-14px); box-shadow: 0 30px 60px rgb(0 0 0 / .6); }
  .book .page { background: #f6f1e6; transform: translateZ(-6px); padding: 16px 14px; display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 64px; gap: 8px;
    border-left: 6px solid color-mix(in srgb, var(--album) 30%, #ddd); box-sizing: border-box; }
  .slot { border-radius: 6px; border: 1.5px dashed #c8bfae; display: grid; place-items: center; font: 700 10px ui-monospace, monospace; color: #b2a891; background: rgb(0 0 0 / .02); overflow: hidden; }
  .slot.filled { border: none; background: #ddd4c2; box-shadow: 0 2px 4px rgb(0 0 0 / .25); }
  .slot.filled img { width: 100%; height: 100%; object-fit: cover; }
  .slot.target { border-color: var(--album); color: var(--album); animation: target 1s ease-in-out infinite; }
  @keyframes target { 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--album) 30%, transparent), 0 0 18px color-mix(in srgb, var(--album) 60%, transparent); } }
  .slot.stuck { border: none; box-shadow: 0 0 0 2px var(--rc), 0 0 16px var(--rc); }
  .book .cover { transform-origin: left center; transform-style: preserve-3d; box-sizing: border-box;
    background: linear-gradient(140deg, color-mix(in srgb, var(--album) 90%, #fff), var(--album) 45%, color-mix(in srgb, var(--album) 60%, #000));
    display: flex; flex-direction: column; justify-content: space-between; padding: 18px 16px; color: #fff; box-shadow: inset 6px 0 0 rgb(0 0 0 / .18); }
  .cover .emoji { font-size: 36px; line-height: 1; }
  .cover .t { font: 800 15px/1.15 ${DISPLAY_FONT}; overflow-wrap: anywhere; }
  .cover .p { font: 700 11px ui-monospace, monospace; opacity: .85; }
  .cover .p b { font-size: 15px; }
  .book .cover-in { transform: rotateY(180deg); background: color-mix(in srgb, var(--album) 35%, #f6f1e6); }
  .ghost { position: absolute; left: 0; top: 0; transform-origin: top left; opacity: 0; will-change: transform; filter: drop-shadow(0 20px 30px rgb(0 0 0 / .5)); }
  .ghost wmt-card-skin { position: absolute !important; inset: 0; }
  .plusone { position: absolute; left: 0; top: 0; font: 800 20px ${DISPLAY_FONT}; color: #fff; white-space: nowrap; opacity: 0;
    text-shadow: 0 0 14px var(--album), 0 2px 0 rgb(0 0 0 / .4); }
`;

const LEADING_EMOJI = /^((?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)+)/u;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cardKey = (card: any) => {
  try {
    if (card?.wikipedia_url) return titleKey(decodeURIComponent(new URL(card.wikipedia_url).pathname.replace(/^\/wiki\//, '')));
  } catch {
    /* adresse invalide : le titre suffit */
  }
  return titleKey(String(card?.wikipedia_title ?? ''));
};

export function startAlbumFx(panels: PanelsApi) {
  const { host, root } = themedHost('wmt-album-fx');
  root.innerHTML = `<style>${CSS}</style>
    <div class="book"><div class="back"></div><div class="page"></div>
      <div class="cover"><div class="emoji"></div><div class="t"></div><div class="p">n° <b class="np"></b> / <span class="tot"></span></div><div class="cover-in"></div></div></div>
    <div class="ghost"></div><div class="plusone"></div>`;
  const book = root.querySelector<HTMLElement>('.book')!;
  const cover = root.querySelector<HTMLElement>('.cover')!;
  const page = root.querySelector<HTMLElement>('.page')!;
  const ghost = root.querySelector<HTMLElement>('.ghost')!;
  const plusone = root.querySelector<HTMLElement>('.plusone')!;

  let goals: Record<string, GoalAlbum> = {};
  goalAlbumsItem.getValue().then((v) => (goals = v));
  goalAlbumsItem.watch((v) => (goals = v ?? {}));
  let busy = false;

  /** Albums à objectif dont la liste contient la carte (et où elle n'est pas encore collée). */
  const findGoal = (card: any) => {
    const key = cardKey(card);
    for (const [tagId, goal] of Object.entries(goals)) {
      const index = goal.entries.findIndex((e) => titleKey(e.title) === key);
      if (index >= 0 && !panels.hasTag(tagId)) return { tagId, goal, index };
    }
    return null;
  };

  const rel = (el: Element) => el.getBoundingClientRect();

  async function play(info: ImpactInfo) {
    const fx = reveal.fx;
    if (busy || !fx || !ctx.settings.goalAlbumFx) return;
    const found = findGoal(info.card);
    if (!found) return;
    const row = panels.rowOf(found.tagId);
    if (!row) return;
    busy = true;
    try {
      const { tagId, goal, index } = found;
      const cache = await collectionCache.getValue();
      const tag = cache?.tags.find((t) => t.id === tagId);
      const owned = new Set(
        (cache?.cards ?? []).filter((c) => c.tagIds.includes(tagId)).map((c) => titleKey(articleTitle(c))),
      );
      const before = goal.entries.filter((e) => owned.has(titleKey(e.title))).length;
      const total = goal.entries.length;
      const color = tag?.color ?? '#8b5cf6';
      const name = tag?.name ?? '';
      host.style.setProperty('--album', color);
      host.style.setProperty('--rc', info.color);
      root.querySelector('.emoji')!.textContent = name.match(LEADING_EMOJI)?.[1] ?? '📖';
      root.querySelector('.t')!.textContent = bareName(name);
      root.querySelector('.np')!.textContent = String(before);
      root.querySelector('.tot')!.textContent = String(total);

      // Page : quelques cases déjà collées, la case de la carte, puis des cases vides.
      const start = Math.max(0, index - 4);
      page.innerHTML = Array.from({ length: 9 }, (_, k) => {
        const i = start + k;
        const entry = goal.entries[i];
        if (!entry) return '<div class="slot"></div>';
        if (i === index) return `<div class="slot target">n° ${i + 1}</div>`;
        if (owned.has(titleKey(entry.title))) return `<div class="slot filled">${entry.thumbnail ? `<img src="${esc(entry.thumbnail)}" alt="">` : ''}</div>`;
        return `<div class="slot">n° ${i + 1}</div>`;
      }).join('');
      if (!host.isConnected) document.documentElement.append(host);

      // 1. La ligne de l'album s'illumine, l'album en sort.
      row.classList.add('glow');
      const r = rel(row);
      fx.sparks(r.left + 20, r.top + r.height / 2, color, 16, 5, { size: 3 });
      await wait(450);
      albumSfx.emerge();
      const card = info.rect();
      const right = card.right + 230 < innerWidth;
      const target = { x: right ? card.right + 20 : card.left - 220, y: card.top + 30 };
      const from = { x: r.left - 60, y: r.top + r.height / 2 - 130 };
      book.style.opacity = '1';
      const tilt = right ? -24 : 24;
      const emerge = book.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px) scale(.12) rotateY(-70deg) rotateX(20deg)`, opacity: 0 },
          { offset: 0.3, opacity: 1 },
          { transform: `translate(${target.x}px, ${target.y}px) scale(1) rotateY(${tilt}deg) rotateX(8deg) rotateZ(-4deg)`, opacity: 1 },
        ],
        { duration: 800, easing: 'cubic-bezier(.2,.9,.3,1.15)', fill: 'forwards' },
      );
      const trail = (el: Element, c: string) =>
        setInterval(() => {
          const p = center(rel(el));
          fx.sparks(p.x, p.y, c, 2, 1.5, { size: 2.4, up: 0.2, g: -0.01 });
        }, 30);
      let t = trail(book, color);
      await emerge.finished;
      clearInterval(t);
      const b0 = center(rel(book));
      fx.ring(b0.x, b0.y, color, 140, 4, 600);

      // 2. L'album s'ouvre sur la case.
      albumSfx.open();
      await cover.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-165deg)' }], { duration: 650, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }).finished;

      // 3. Une copie de la carte s'envole et se glisse dans la case.
      albumSfx.fly();
      const slot = root.querySelector<HTMLElement>('.slot.target')!;
      const s = rel(slot);
      const c2 = info.rect();
      ghost.replaceChildren(skinElement(info.card));
      ghost.style.width = `${c2.width}px`;
      ghost.style.height = `${c2.height}px`;
      ghost.style.opacity = '1';
      info.flip.animate([{ opacity: 1 }, { opacity: 0.25 }], { duration: 400, fill: 'forwards' });
      const k = s.width / c2.width;
      const flight = ghost.animate(
        [
          { transform: `translate(${c2.left}px, ${c2.top}px) rotateY(0) rotateZ(0) scale(1)` },
          { offset: 0.45, transform: `translate(${(c2.left + s.left) / 2 + 30}px, ${Math.min(c2.top, s.top) - 70}px) rotateY(200deg) rotateZ(-10deg) scale(${(1 + k) / 2})` },
          { transform: `translate(${s.left}px, ${s.top}px) rotateY(360deg) rotateZ(0) scale(${k})` },
        ],
        { duration: 900, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' },
      );
      t = trail(ghost, info.color);
      await flight.finished;
      clearInterval(t);

      // 4. Collée : la carte rejoint vraiment l'album (si le réglage est actif).
      albumSfx.stick();
      ghost.style.opacity = '0';
      slot.className = 'slot stuck';
      slot.replaceChildren();
      const img = info.card?.image_url ? Object.assign(document.createElement('img'), { src: info.card.image_url, alt: '' }) : null;
      if (img) {
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        slot.append(img);
      }
      const sc = center(s);
      fx.ring(sc.x, sc.y, color, 90, 5, 700);
      fx.ring(sc.x, sc.y, '#fff', 60, 3, 500);
      fx.sparks(sc.x, sc.y, color, 40, 8, { size: 3.5 });
      const now = getComputedStyle(book).transform;
      book.animate([{ transform: now }, { transform: `${now} translateY(6px) rotateZ(1.5deg)` }, { transform: now }], { duration: 260, easing: 'ease-out' });
      plusone.textContent = `+1 · ${before + 1} / ${total}`;
      plusone.style.left = `${sc.x - 60}px`;
      plusone.style.top = `${s.top - 10}px`;
      plusone.animate(
        [
          { opacity: 0, transform: 'translateY(10px) scale(.6)' },
          { opacity: 1, transform: 'translateY(-14px) scale(1.1)', offset: 0.3 },
          { opacity: 1, transform: 'translateY(-24px) scale(1)', offset: 0.75 },
          { opacity: 0, transform: 'translateY(-40px)' },
        ],
        { duration: 1500, easing: 'ease-out' },
      );
      root.querySelector('.np')!.textContent = String(before + 1);
      if (ctx.settings.goalAutoStick) panels.ensureTag(tagId);
      await wait(900);

      // 5. L'album se referme et rentre dans sa ligne.
      albumSfx.close();
      await cover.animate([{ transform: 'rotateY(-165deg)' }, { transform: 'rotateY(0deg)' }], { duration: 500, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' }).finished;
      albumSfx.home();
      const r2 = rel(panels.rowOf(tagId) ?? row);
      const home = { x: r2.left - 60, y: r2.top + r2.height / 2 - 130 };
      const back = book.animate(
        [
          { transform: getComputedStyle(book).transform, opacity: 1 },
          { transform: `translate(${home.x}px, ${home.y}px) scale(.1) rotateY(-80deg) rotateX(20deg)`, opacity: 0 },
        ],
        { duration: 650, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
      );
      t = trail(book, color);
      await back.finished;
      clearInterval(t);
      fx.sparks(r2.left + 20, r2.top + r2.height / 2, color, 26, 6, { size: 3 });
      fx.ring(r2.left + 20, r2.top + r2.height / 2, color, 60, 4, 500);
      info.flip.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 400, fill: 'forwards' });
      await wait(700);
      (panels.rowOf(tagId) ?? row).classList.remove('glow');
    } catch (e) {
      console.warn('[Collection+] album à objectif', e);
    } finally {
      for (const el of [book, cover, ghost]) el.getAnimations().forEach((a) => a.cancel());
      book.style.opacity = '0';
      ghost.style.opacity = '0';
      busy = false;
    }
  }

  reveal.onImpact((info) => play(info));
}
