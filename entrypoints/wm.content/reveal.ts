import { addPull, cardName, packMetaItem, packStateItem, packsSince, periodFor, recordFromResponse, RARITY_COLOR, RARITY_RANK, SHINY_COLOR, today, type PackState, type PullRecord } from '@/lib/packs';
import { ctx, esc, typing } from './ctx';
import { center, Fx, rnd } from './fx';
import { applySkin, fillPackDescriptions } from './card-skin';
import { revealSound, sfx, type RevealSound } from './sound';

/**
 * Révélé carte par carte sur /pulls : mise en scène selon la rareté (sans rien dévoiler avant l'affichage),
 * pastille « New », récap du paquet, touche Espace, révélé rapide.
 * Expose aussi la carte affichée (volets de rangement) via `reveal`.
 */

const TIER: Record<string, number> = { C: 0, PC: 1, R: 2, SR: 3, UR: 4, L: 5 };

export interface CurrentPack {
  cards: any[];
  owned: Record<string, number> | null;
  seen: Set<number>;
  recapShown: boolean;
  record: PullRecord;
  sinceL: string | null;
}

type RevealListener = () => void;

export interface ImpactInfo {
  card: any;
  flip: HTMLElement;
  rect: () => DOMRect;
  color: string;
}

/** État partagé du révélé : paquet en cours et carte affichée. */
export const reveal = {
  pack: null as CurrentPack | null,
  active: false,
  idx: -1,
  card: null as any,
  flip: null as HTMLElement | null,
  listeners: new Set<RevealListener>(),
  /** Calque d'effets partagé (particules, ondes…). */
  fx: null as Fx | null,
  impactListeners: new Set<(info: ImpactInfo) => void>(),
  onImpact(fn: (info: ImpactInfo) => void) {
    this.impactListeners.add(fn);
  },
  on(fn: RevealListener) {
    this.listeners.add(fn);
  },
  emit() {
    this.listeners.forEach((fn) => fn());
  },
};

interface ReadReveal {
  flip: HTMLElement;
  wrap: HTMLElement;
  idx: number;
  rarity: string;
  shiny: boolean;
  data: any;
}

function readReveal(): ReadReveal | null {
  const flip = document.querySelector<HTMLElement>('main [class*="animate-card-flip"]');
  if (!flip) return null;
  const card = flip.querySelector('[class*="glow-"]') ?? flip.firstElementChild;
  const cls = card ? String((card as HTMLElement).className) : '';
  const col = flip.closest('.flex.flex-col') ?? flip.parentElement?.parentElement;
  let idx = -1;
  const counter = col && [...col.querySelectorAll('span')].find((s) => s.previousElementSibling?.textContent?.trim() === 'Carte');
  if (counter) idx = parseInt(counter.textContent ?? '', 10) - 1;
  const m = cls.match(/\bglow-(c|pc|r|sr|ur|l)\b/);
  const data = reveal.pack && idx >= 0 ? reveal.pack.cards[idx] : null;
  const rarity = data?.rarity ?? (m ? m[1]!.toUpperCase() : 'C');
  return { flip, wrap: flip.parentElement ?? flip, idx, rarity, shiny: /\bglow-shiny\b/.test(cls), data };
}

const zoomOf = () => parseFloat(document.documentElement.dataset.wmtZoom ?? '') || 1;

export function startReveal() {
  const fx = new Fx();
  reveal.fx = fx;
  let cur: { el: HTMLElement | null; idx: number; shiny: boolean } = { el: null, idx: -1, shiny: false };

  const isNew = (r: ReadReveal) => {
    const pack = reveal.pack;
    if (!pack?.owned || !r.data) return false;
    const n = pack.owned[String(r.data.id)];
    const inPack = pack.cards.filter((c) => c.id === r.data.id).length;
    return typeof n === 'number' && n <= inPack;
  };

  const check = () => {
    const r = readReveal();
    if (!r) {
      if (reveal.active) {
        reveal.active = false;
        reveal.flip = null;
        reveal.card = null;
        cur = { el: null, idx: -1, shiny: false };
        fx.clear();
        fx.hideBadge();
        onRevealEnd();
        reveal.emit();
      }
      return;
    }
    reveal.active = true;
    if (r.flip !== cur.el || r.idx !== cur.idx) {
      cur = { el: r.flip, idx: r.idx, shiny: r.shiny };
      reveal.idx = r.idx;
      reveal.flip = r.flip;
      reveal.card = r.data;
      fx.hideBadge();
      onCardShown(r);
      reveal.emit();
    } else if (r.shiny && !cur.shiny) {
      cur.shiny = true;
      onShinyFlip(r);
    }
  };

  /** Charge (ms) avant l'apparition : silhouette pour SR, tremblement pour UR, longue montée pour L. */
  const CHARGE: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 700, 4: 1300, 5: 2100 };
  const FLIP = 1100;
  const FLIP_HIT = 0.55;

  const onCardShown = (r: ReadReveal) => {
    fx.clear();
    const s = ctx.settings;
    const pack = reveal.pack;
    const firstTime = !pack?.seen.has(r.idx);
    pack?.seen.add(r.idx);
    const fresh = s.newBadge && isNew(r);
    const el = r.flip;
    const rect = () => r.wrap.getBoundingClientRect();
    const tier = TIER[r.rarity] ?? 0;
    const shiny = Boolean(r.shiny || (r.data?.is_shiny && tier < 5));
    const color = shiny ? SHINY_COLOR : (RARITY_COLOR[r.rarity as keyof typeof RARITY_COLOR] ?? '#fff');
    applySkin(el, r.data);
    /** Respiration douce de la carte révélée (va-et-vient 112 %, oscillation 2,4°), décalée pour un mouvement naturel. */
    const breathe = (delay: number) =>
      fx.later(delay, () => {
        if (cur.el !== el || !ctx.settings.cardBreathe) return;
        fx.run(r.wrap, [{ scale: '1' }, { scale: '1.12' }, { scale: '1' }], { duration: 5200, iterations: Infinity, easing: 'ease-in-out' });
        fx.run(r.wrap, [{ rotate: '0deg' }, { rotate: '-2.4deg', offset: 0.25 }, { rotate: '2.4deg', offset: 0.75 }, { rotate: '0deg' }], { duration: 7400, iterations: Infinity, easing: 'ease-in-out' });
      });
    const impactEvent = (delay: number) =>
      fx.later(delay, () => {
        if (cur.el !== el || !r.data) return;
        reveal.impactListeners.forEach((fn) => fn({ card: r.data, flip: el, rect, color }));
      });
    const badge = (delay: number) =>
      fx.later(delay, () => {
        if (cur.el !== el) return;
        fx.newBadge(rect(), zoomOf());
        sfx.fresh();
      });

    if (!s.revealFx) {
      if (fresh && firstTime) badge(200);
      breathe(300);
      if (firstTime) impactEvent(300);
      return;
    }
    // On remplace l'animation d'entrée du site (avant l'affichage : pas de flash).
    el.style.animation = 'none';

    if (!firstTime) {
      fx.run(el, [{ opacity: 0, transform: 'perspective(900px) rotateY(-70deg)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'ease-out' });
      breathe(300);
      return;
    }

    if (s.fastReveal && tier <= 2 && !shiny) {
      fx.run(el, [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 150, easing: 'ease-out' });
      revealSound(['C', 'PC', 'R'][tier] as RevealSound, 0.05);
      if (fresh) badge(80);
      breathe(200);
      impactEvent(200);
      return;
    }

    const charge = CHARGE[tier] ?? 0;
    const hit = charge + FLIP * FLIP_HIT;
    revealSound(shiny && tier < 3 ? 'S' : (['C', 'PC', 'R', 'SR', 'UR', 'L'][tier] as RevealSound), hit / 1000);
    if (shiny && tier >= 3) revealSound('S', hit / 1000 + 0.4);

    // Charge : silhouette sombre qui s'illumine et tremble de plus en plus.
    if (charge) {
      const amp = tier === 5 ? 8 : tier === 4 ? 5 : 2;
      const steps = 18;
      const kf: Keyframe[] = [];
      for (let i = 0; i <= steps; i++) {
        const k = amp * (i / steps) ** 2;
        kf.push({
          offset: i / steps,
          opacity: Math.min(1, i / 3),
          transform: `perspective(1000px) translate(${rnd(-k, k)}px,${rnd(-k, k) - (tier >= 4 ? 18 : 6) * (i / steps)}px) scale(${0.82 + 0.08 * (i / steps)})`,
          filter: `brightness(0) drop-shadow(0 0 ${6 + 34 * (i / steps)}px ${color})`,
        });
      }
      fx.run(el, kf, { duration: charge, easing: 'linear' });
      if (tier >= 4) fx.spotlight(rect(), tier === 5 ? 0.88 : 0.7, charge, tier === 5 ? 2600 : 1600);
      fx.implode(center(rect()).x, center(rect()).y, color, tier === 5 ? 140 : tier === 4 ? 80 : 30, charge);
    }

    // Le retournement en 3D, commun à toutes les raretés.
    fx.run(el, [
      { opacity: charge ? 1 : 0, transform: 'perspective(1000px) rotateY(160deg) translateZ(80px) scale(.85)', filter: charge ? `brightness(0) drop-shadow(0 0 30px ${color})` : 'none' },
      { offset: FLIP_HIT, opacity: 1, transform: 'perspective(1000px) rotateY(-14deg) translateZ(120px) scale(1.06)', filter: `brightness(${charge ? 1.8 : 1.15})` },
      { opacity: 1, transform: 'none', filter: 'none' },
    ], { duration: FLIP, delay: charge, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });

    // Impact : plus la carte est rare, plus il est grand.
    fx.later(hit, () => {
      if (cur.el !== el) return;
      const rc = rect();
      const c = center(rc);
      if (tier <= 1) fx.sparks(c.x, c.y, color, tier ? 16 : 8, tier ? 6 : 4.5, { size: 3 });
      if (tier === 2) {
        fx.ring(c.x, c.y, color, rc.width * 0.9, 5, 650);
        fx.sparks(c.x, c.y, color, 28, 8);
      }
      if (tier === 3) {
        fx.flash(rc, color, 0.55, 600);
        fx.ring(c.x, c.y, color, rc.width, 7, 700);
        fx.sparks(c.x, c.y, color, 60, 10);
        fx.rays(rc, color, 1400, 0.35, 30);
      }
      if (tier >= 4) {
        const L = tier === 5;
        fx.flash(rc, color, L ? 1 : 0.75, L ? 1100 : 800);
        fx.ring(c.x, c.y, '#fff', rc.width * 1.4, 8, 800);
        fx.later(120, () => fx.ring(c.x, c.y, color, rc.width * 2, 5, 1000));
        fx.rays(rc, color, L ? 3200 : 2200, L ? 0.7 : 0.5, L ? 80 : 50);
        fx.sparks(c.x, c.y, color, L ? 180 : 110, L ? 15 : 12);
        if (L) fx.confetti(c.x, rc.top, ['#ffe144', '#fa9931', '#fff', '#fff6d0', '#e9c15a'], 140);
        fx.shake(L ? 16 : 9, L ? 600 : 420);
        fx.banner(rc, L ? 'LÉGENDAIRE' : 'ULTRA RARE', r.data ? cardName(r.data) : '', color, L ? 2400 : 1800);
        fx.dust(rc, color, L ? 6000 : 3000, L ? 3 : 2);
      }
      if (shiny) shinyFx(rc, tier);
    });
    if (fresh) badge(hit + 120);
    breathe(charge + FLIP);
    impactEvent(hit + 600);
  };

  const shinyFx = (rc: DOMRect, tier: number) => {
    const c = center(rc);
    fx.holo(rc);
    fx.ring(c.x, c.y, '#fff', rc.width * 1.2, 4, 800);
    fx.sparks(c.x, c.y, '#fff', 70 + tier * 10, 11, { rainbow: true });
    fx.dust(rc, '#fff', 4000, 2, true);
    if (tier < 4) fx.banner(rc, 'SHINY', '', SHINY_COLOR, 1500);
  };

  // Les L shiny se retournent au clic sur le site.
  const onShinyFlip = (r: ReadReveal) => {
    if (!ctx.settings.revealFx) return;
    const rc = r.wrap.getBoundingClientRect();
    const c = center(rc);
    revealSound('S', 0);
    fx.flash(rc, SHINY_COLOR, 0.8, 900);
    fx.rays(rc, SHINY_COLOR, 2600, 0.6, 70);
    fx.confetti(c.x, rc.top, ['#ff4fa3', '#ffd84f', '#4fffc3', '#4fb8ff', '#b94fff', '#fff'], 120);
    fx.shake(10, 450);
    shinyFx(rc, 5);
    fx.banner(rc, 'SHINY', r.data ? cardName(r.data) : '', SHINY_COLOR, 2200);
  };

  // Inclinaison 3D de la carte révélée, qui suit la souris.
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!ctx.settings.revealFx || !cur.el || e.buttons) return;
      const wrap = cur.el.parentElement;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const inside = e.clientX > r.left - 40 && e.clientX < r.right + 40 && e.clientY > r.top - 40 && e.clientY < r.bottom + 40;
      if (!inside) {
        if (wrap.style.transform) wrap.style.transform = '';
        return;
      }
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      wrap.style.transition = 'transform .12s ease-out';
      wrap.style.transform = `perspective(1000px) rotateX(${(-y * 12).toFixed(2)}deg) rotateY(${(x * 14).toFixed(2)}deg)`;
    },
    { passive: true },
  );
  document.addEventListener('pointerdown', () => cur.el?.parentElement && (cur.el.parentElement.style.transform = ''), true);

  // Ouverture du paquet (rien n'est révélé : seulement le paquet qui se charge).
  document.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as Element | null)?.closest?.('main button') as HTMLButtonElement | null;
      if (!btn || !/^Ouvrir/.test(btn.textContent?.trim() ?? '') || btn.disabled || !ctx.settings.revealFx) return;
      const img = btn.querySelector('img') ?? btn;
      const rc = img.getBoundingClientRect();
      const c = center(rc);
      const acc = getComputedStyle(fx.host).getPropertyValue('--primary').trim() || '#a78bfa';
      fx.implode(c.x, c.y, acc, 60, 650);
      fx.run(img, [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.06) rotate(-2deg)', filter: `brightness(1.3) drop-shadow(0 0 20px ${acc})`, offset: 0.5 },
        { transform: 'scale(1.1) rotate(2deg)', filter: `brightness(1.8) drop-shadow(0 0 40px ${acc})` },
      ], { duration: 620, easing: 'ease-in' });
      sfx.charge();
      fx.later(620, () => {
        fx.flash(rc, acc, 0.7, 600);
        fx.ring(c.x, c.y, '#fff', 260, 6, 600);
        fx.sparks(c.x, c.y, acc, 50, 11);
      });
    },
    true,
  );

  // Réponses d'ouverture relayées par le script d'interception.
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.source !== 'wmt-intercept' || e.data.type !== 'pack') return;
    const { path, data } = e.data as { path: string; data: any };
    if (typeof data?.packs_remaining === 'number') {
      const regen = data.packs_last_regen_at ? Date.parse(data.packs_last_regen_at) : NaN;
      await pushState({ n: data.packs_remaining, max: 10, nextAt: Number.isNaN(regen) ? null : regen + (await period()) });
    }
    if (path.endsWith('pro-daily')) await packMetaItem.setValue({ ...(await packMetaItem.getValue()), proClaimedDate: today() });
    const parsed = recordFromResponse(path, data);
    if (!parsed) return;
    const pack: CurrentPack = { cards: data.cards, owned: parsed.owned, seen: new Set(), recapShown: false, record: parsed.record, sinceL: null };
    reveal.pack = pack;
    reveal.emit();
    // Descriptions cherchées pendant l'animation d'ouverture, avant la première carte.
    if (Array.isArray(data.cards)) void fillPackDescriptions(data.cards).then(() => reveal.flip && reveal.card && applySkin(reveal.flip, reveal.card));
    const pulls = await addPull(parsed.record);
    pack.sinceL = packsSince(pulls, (c) => c.r === 'L');
  });

  const onRevealEnd = () => {
    const pack = reveal.pack;
    if (!pack || pack.recapShown || !ctx.settings.packRecap) return;
    pack.recapShown = true;
    const inPack = (id: unknown) => pack.cards.filter((x) => x.id === id).length;
    const items = pack.cards
      .map((c) => ({ c, o: pack.owned ? pack.owned[String(c.id)] : undefined }))
      .sort((a, b) => (RARITY_RANK[a.c.rarity] ?? 9) - (RARITY_RANK[b.c.rarity] ?? 9));
    const isFresh = ({ c, o }: { c: any; o: number | undefined }) => typeof o === 'number' && o <= inPack(c.id);
    const nNew = items.filter(isFresh).length;
    const rows = items
      .map((it, i) => {
        const { c, o } = it;
        return `<div class="row" style="animation-delay:${i * 60}ms">
          <span class="chip" style="background:${RARITY_COLOR[c.rarity as keyof typeof RARITY_COLOR] ?? '#9ca3af'}">${esc(c.rarity ?? '?')}</span>
          <span class="name">${esc(cardName(c))}</span>${c.is_shiny ? '<span class="sh">shiny</span>' : ''}
          ${isFresh(it) ? '<span class="new">New</span>' : typeof o === 'number' ? `<span class="own" title="Exemplaires possédés">×${o}</span>` : ''}
        </div>`;
      })
      .join('');
    const foot = [
      pack.owned && `${nNew} nouvelle${nNew > 1 ? 's' : ''} carte${nNew > 1 ? 's' : ''}`,
      pack.sinceL != null && `${pack.sinceL} paquet${pack.sinceL === '1' || pack.sinceL === '0' ? '' : 's'} depuis ta dernière L`,
    ]
      .filter(Boolean)
      .join(' · ');
    fx.showRecap(`<h4><b>Récap du paquet</b><span title="Fermer">✕</span></h4>${rows}${foot ? `<div class="foot">${foot}</div>` : ''}`);
  };

  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // ---------------- compteur de paquets (page /pulls) et titre d'onglet ----------------
  const period = async () => periodFor(ctx.settings.regenMode, (await packMetaItem.getValue()).detectedPeriod);
  let lastSent = '';
  const pushState = async (s: Omit<PackState, 'period' | 'observedAt'>) => {
    const state: PackState = { ...s, period: await period(), observedAt: Date.now() };
    const key = `${state.n}|${Math.round((state.nextAt ?? 0) / 5000)}`;
    if (key === lastSent) return;
    lastSent = key;
    await packStateItem.setValue(state);
  };

  const readDom = async () => {
    const main = document.querySelector('main');
    if (!main) return;
    const txt = main.innerText || '';
    const m = txt.match(/(\d+)\s*\/\s*(\d+)\s*paquets? disponibles?/i);
    if (m) {
      const n = Number(m[1]);
      const max = Number(m[2]);
      const c = txt.match(/Prochain dans\s+(?:(\d+)\s*h\s*)?(\d+):(\d{2})/i);
      const meta = await packMetaItem.getValue();
      let nextAt: number | null = null;
      if (c && n < max) {
        const secs = Number(c[1] || 0) * 3600 + Number(c[2]) * 60 + Number(c[3]);
        nextAt = Date.now() + secs * 1000;
        if (secs > 185 && meta.detectedPeriod !== 600_000) await packMetaItem.setValue({ ...meta, detectedPeriod: 600_000 });
      }
      if (!meta.detectedPeriod && /Pack PRO du jour/i.test(txt) && /Déjà réclamé|Réclamer/i.test(txt)) await packMetaItem.setValue({ ...meta, detectedPeriod: 180_000 });
      await pushState({ n, max, nextAt });
    }
    if (/Déjà réclamé aujourd/i.test(txt)) {
      const meta = await packMetaItem.getValue();
      if (meta.proClaimedDate !== today()) await packMetaItem.setValue({ ...meta, proClaimedDate: today() });
    }
  };

  let lastRead = 0;
  setInterval(() => {
    if (location.pathname.startsWith('/pulls') && !reveal.active && Date.now() - lastRead > 2000) {
      lastRead = Date.now();
      readDom();
    }
  }, 1000);

  // ---------------- Espace : ouvrir un paquet, puis carte suivante ----------------
  document.addEventListener(
    'keydown',
    (e) => {
      if (!ctx.settings.spaceKey || e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!location.pathname.startsWith('/pulls') || typing()) return;
      let btn: HTMLButtonElement | null | undefined = null;
      if (reveal.active && cur.el) {
        const col = cur.el.closest('.flex.flex-col') ?? cur.el.parentElement?.parentElement;
        const buttons = [...(col?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const round = buttons.filter((b) => /\bw-12\b/.test(b.className));
        const next = round[round.length - 1];
        btn = next && !next.disabled ? next : buttons.find((b) => /\bpx-8\b/.test(b.className) && !b.disabled);
      } else {
        btn = [...document.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent?.trim() === 'Ouvrir' && !b.disabled);
      }
      if (!btn) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      btn.click();
      sfx.tick();
    },
    true,
  );
}
