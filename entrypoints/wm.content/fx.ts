import { ctx, DISPLAY_FONT, esc, onSettings, PANEL_CSS, siteModalOpen, themedHost } from './ctx';

/**
 * Calque d'effets au-dessus de la page (shadow DOM, ne capte aucun clic) :
 * particules sur canvas, rayons, flash, bannière, reflet holographique, pastille « NOUVELLE » et récap du paquet.
 */

const CSS = `${PANEL_CSS}
  .fx { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
  .dim, .flash { position: absolute; inset: 0; opacity: 0; }
  .rays { position: absolute; width: 260vmax; height: 260vmax; margin: -130vmax 0 0 -130vmax; opacity: 0;
    background: repeating-conic-gradient(var(--c) 0deg 5deg, transparent 5deg 15deg);
    -webkit-mask: radial-gradient(circle, transparent 0 4%, #000 9%, transparent 36%);
    mask: radial-gradient(circle, transparent 0 4%, #000 9%, transparent 36%); }
  .holo { position: absolute; overflow: hidden; border-radius: 16px; opacity: 0; }
  .holo::before { content: ""; position: absolute; inset: -50%; transform: translateX(-100%) rotate(20deg);
    background: linear-gradient(90deg, transparent 30%, rgba(255,0,128,.35), rgba(255,200,0,.4), rgba(0,255,170,.4), rgba(0,160,255,.4), rgba(190,0,255,.35), transparent 70%);
    mix-blend-mode: screen; }
  .holo.go { opacity: 1; }
  .holo.go::before { animation: sweep 1.1s ease-in-out forwards; }
  @keyframes sweep { to { transform: translateX(100%) rotate(20deg); } }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .banner { position: absolute; transform: translate(-50%, -50%); opacity: 0; white-space: nowrap; text-align: center; color: #fff;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .banner .bt { display: flex; align-items: center; justify-content: center; gap: .35em; }
  .banner .w { font-size: clamp(34px, 5.6vw, 72px); line-height: 1; font-weight: 900; letter-spacing: .06em;
    text-shadow: 0 0 14px var(--c), 0 0 36px var(--c), 0 0 70px color-mix(in srgb, var(--c) 60%, transparent), 0 3px 0 rgba(0,0,0,.45); }
  .banner .o { font-size: clamp(18px, 2.6vw, 34px); color: var(--c); display: inline-block; animation: ospin 2s ease-out both; }
  .banner small { display: inline-flex; align-items: center; gap: 10px; margin-top: 10px; font: 600 13px/1 ui-sans-serif, system-ui, sans-serif;
    letter-spacing: .22em; text-transform: uppercase; color: rgba(255,255,255,.92); text-shadow: 0 1px 8px rgba(0,0,0,.8); }
  .banner small::before, .banner small::after { content: ""; width: 34px; height: 1px; background: linear-gradient(90deg, transparent, var(--c)); }
  .banner small::after { transform: scaleX(-1); }
  @keyframes ospin { from { transform: rotate(-180deg) scale(0); } 60% { transform: rotate(20deg) scale(1.3); } to { transform: none; } }
  .badge { position: absolute; transform: translate(-50%, -50%) scale(0); padding: 5px 12px 5px 10px; border-radius: 999px; overflow: hidden;
    display: flex; align-items: center; gap: 5px; font: 800 12px/1 ${DISPLAY_FONT}; letter-spacing: .06em; color: #16122b; background: var(--holo);
    box-shadow: 0 0 0 2px #0e0d14, 0 6px 18px rgb(0 0 0 / .45), 0 0 22px color-mix(in oklch, var(--primary) 55%, transparent); }
  .badge::before { content: '✦'; font-size: 11px; }
  :host([data-look="solid"]) .badge { background: var(--primary); color: var(--primary-foreground); }
  :host([data-look="ambient"]) .badge { background: #fff; color: #16122b; }
  .badge::after { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 35%, rgba(255,255,255,.9) 50%, transparent 65%);
    transform: translateX(-120%); animation: bshine 2.6s ease-in-out .5s infinite; }
  @keyframes bshine { 0%, 55% { transform: translateX(-120%); } 80%, 100% { transform: translateX(120%); } }
  .recap { position: fixed; right: 16px; bottom: 16px; width: min(340px, calc(100vw - 32px)); pointer-events: auto; padding: 12px 12px 10px;
    transform: translateY(20px); opacity: 0; transition: transform .35s cubic-bezier(.2,.9,.3,1.2), opacity .25s; }
  .recap.show { transform: none; opacity: 1; }
  .recap h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; color: var(--muted-foreground); }
  .recap h4 b { color: var(--foreground); }
  .recap h4 span { cursor: pointer; }
  .row { display: flex; align-items: center; gap: 8px; padding: 3px 0; opacity: 0; transform: translateX(12px); animation: in .3s forwards; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .new { flex: none; font: 800 10.5px/1 ${DISPLAY_FONT}; letter-spacing: .04em; background: var(--holo); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sh { flex: none; font-size: 10px; color: #e9c15a; border: 1px solid rgba(233,193,90,.5); border-radius: 4px; padding: 0 4px; }
  .own { flex: none; color: var(--muted-foreground); font-size: 11px; }
  .foot { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); color: var(--muted-foreground); font-size: 11px; }
  @keyframes in { to { opacity: 1; transform: none; } }
`;

interface Particle {
  k: 'star' | 'dot' | 'conf' | 'imp' | 'ring' | 'emit';
  [key: string]: any;
}

export class Fx {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private parts: Particle[] = [];
  private raf: number | null = null;
  private timers: number[] = [];
  private anims: Animation[] = [];

  constructor() {
    const { host, root } = themedHost('wmt-fx', 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;');
    root.innerHTML = `<style>${CSS}</style>
      <div class="fx"><div class="dim"></div><div class="rays"></div><div class="holo"></div><canvas></canvas><div class="flash"></div><div class="banner"></div><div class="badge">New</div></div>
      <div class="recap panel" role="status"></div>`;
    document.documentElement.append(host);
    this.host = host;
    this.root = root;
    this.canvas = root.querySelector('canvas')!;
    this.g = this.canvas.getContext('2d')!;
    onSettings(() => (host.dataset.look = ctx.settings.siteLook));
    // Une fenêtre du site par-dessus (détail de carte…) masque nos calques.
    setInterval(() => {
      const v = siteModalOpen() ? 'hidden' : '';
      if (host.style.visibility !== v) host.style.visibility = v;
    }, 400);
  }

  $<T extends HTMLElement = HTMLElement>(sel: string) {
    return this.root.querySelector<T>(sel)!;
  }

  // ---------------- particules ----------------
  private resize() {
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== innerWidth * dpr || this.canvas.height !== innerHeight * dpr) {
      this.canvas.width = innerWidth * dpr;
      this.canvas.height = innerHeight * dpr;
    }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  private add(p: Particle) {
    this.parts.push(p);
    if (!this.raf) {
      this.resize();
      this.raf = requestAnimationFrame(this.loop);
    }
  }
  sparks(x: number, y: number, color: string, n: number, speed = 9, opts: { up?: number; g?: number; size?: number; rainbow?: boolean } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rnd(speed * 0.3, speed);
      this.add({
        k: Math.random() < 0.4 ? 'star' : 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opts.up ?? 2),
        g: opts.g ?? 0.16, drag: 0.975, life: 1, decay: rnd(0.008, 0.018), size: rnd(1.5, opts.size ?? 4.5), rot: rnd(0, 6), vr: rnd(-0.3, 0.3),
        color: opts.rainbow ? rainbow() : Math.random() < 0.3 ? '#fff' : color,
      });
    }
  }
  confetti(x: number, y: number, colors: string[], n: number) {
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
      const v = rnd(6, 17);
      this.add({ k: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.22, drag: 0.985, life: 1, decay: rnd(0.004, 0.008),
        w: rnd(5, 10), h: rnd(3, 6), rot: rnd(0, 6), vr: rnd(-0.25, 0.25), flip: rnd(0, 6), color: colors[i % colors.length] });
    }
  }
  implode(x: number, y: number, color: string, n: number, dur: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rnd(160, Math.max(innerWidth, innerHeight) * 0.6);
      this.add({ k: 'imp', sx: x + Math.cos(a) * d, sy: y + Math.sin(a) * d, tx: x, ty: y, t0: performance.now() + rnd(0, dur * 0.7),
        dur: rnd(dur * 0.35, dur * 0.6), size: rnd(1.5, 3.5), color: Math.random() < 0.4 ? '#fff' : color, life: 1 });
    }
  }
  ring(x: number, y: number, color: string, maxR: number, width = 6, dur = 700) {
    this.add({ k: 'ring', x, y, t0: performance.now(), dur, maxR, width, color, life: 1 });
  }
  dust(rect: DOMRect, color: string, dur: number, rate = 3, rainbowMode = false) {
    this.add({ k: 'emit', end: performance.now() + dur, rect, color, rate, rainbowMode, life: 1 });
  }
  private star(x: number, y: number, r: number, rot: number) {
    const g = this.g;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.38 : r;
      const a = (i * Math.PI) / 4;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
  private loop = (now: number) => {
    const g = this.g;
    this.resize();
    g.clearRect(0, 0, innerWidth, innerHeight);
    const born: Particle[] = [];
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.parts) {
      if (p.k === 'emit') {
        if (now > p.end) {
          p.life = 0;
          continue;
        }
        for (let i = 0; i < p.rate; i++) {
          if (Math.random() >= 0.5) continue;
          const r = p.rect as DOMRect;
          born.push({ k: Math.random() < 0.5 ? 'star' : 'dot', x: rnd(r.left - 20, r.right + 20), y: rnd(r.top, r.bottom + 10), vx: rnd(-0.3, 0.3), vy: rnd(-1.6, -0.5),
            g: -0.005, drag: 0.99, life: 1, decay: rnd(0.008, 0.016), size: rnd(1, 2.8), rot: 0, vr: 0.05,
            color: p.rainbowMode ? rainbow() : Math.random() < 0.35 ? '#fff' : p.color });
        }
        continue;
      }
      if (p.k === 'imp') {
        const t = (now - p.t0) / p.dur;
        if (t < 0) continue;
        if (t >= 1) {
          p.life = 0;
          continue;
        }
        const e = t * t * t;
        g.globalAlpha = Math.min(1, t * 3) * (1 - e * 0.6);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.sx + (p.tx - p.sx) * e, p.sy + (p.ty - p.sy) * e, p.size, 0, 7);
        g.fill();
        continue;
      }
      if (p.k === 'ring') {
        const t = Math.max(0, (now - p.t0) / p.dur);
        if (t >= 1) {
          p.life = 0;
          continue;
        }
        const e = 1 - Math.pow(1 - t, 3);
        g.globalAlpha = 1 - t;
        g.strokeStyle = p.color;
        g.lineWidth = p.width * (1 - t) + 0.5;
        g.beginPath();
        g.arc(p.x, p.y, Math.max(0.1, 10 + e * p.maxR), 0, 7);
        g.stroke();
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.rot += p.vr;
      p.life -= p.decay;
      g.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      g.fillStyle = p.color;
      if (p.k === 'star') this.star(p.x, p.y, p.size * 1.7, p.rot);
      else if (p.k === 'conf') {
        p.flip += 0.15;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.cos(p.flip));
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, Math.max(0.1, p.size), 0, 7);
        g.fill();
      }
    }
    this.parts.push(...born);
    g.globalAlpha = 1;
    this.raf = this.parts.length ? requestAnimationFrame(this.loop) : null;
    if (!this.raf) g.clearRect(0, 0, innerWidth, innerHeight);
  };

  // ---------------- primitives ----------------
  later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }
  run(el: Element | null, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
    if (!el) return null;
    const a = el.animate(keyframes, opts);
    this.anims.push(a);
    return a;
  }
  clear() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.anims.splice(0).forEach((a) => a.cancel());
    // Les confettis et étincelles en vol retombent normalement.
    this.parts = this.parts.filter((p) => p.k === 'conf' || p.k === 'dot' || p.k === 'star');
    this.$('.holo').classList.remove('go');
  }
  spotlight(rect: DOMRect, strength: number, dur: number, hold: number) {
    const c = center(rect);
    const d = this.$('.dim');
    d.style.background = `radial-gradient(ellipse ${rect.width * 0.85}px ${rect.height * 0.7}px at ${c.x}px ${c.y}px, transparent 55%, rgba(0,0,0,${strength}) 100%)`;
    const total = dur + hold + 500;
    this.run(d, [{ opacity: 0 }, { opacity: 1, offset: dur / total }, { opacity: 1, offset: (dur + hold) / total }, { opacity: 0 }], { duration: total, easing: 'ease-out' });
  }
  rays(rect: DOMRect, color: string, dur: number, peak = 0.6, spin = 50) {
    const c = center(rect);
    const r = this.$('.rays');
    r.style.left = `${c.x}px`;
    r.style.top = `${c.y}px`;
    r.style.setProperty('--c', color);
    this.run(r, [
      { opacity: 0, transform: 'rotate(0deg) scale(.5)' },
      { opacity: peak, transform: `rotate(${spin * 0.3}deg) scale(1)`, offset: 0.25 },
      { opacity: 0, transform: `rotate(${spin}deg) scale(1.1)` },
    ], { duration: dur, easing: 'ease-out' });
  }
  flash(rect: DOMRect, color: string, strength: number, dur = 700) {
    const c = center(rect);
    const f = this.$('.flash');
    f.style.background = `radial-gradient(circle at ${c.x}px ${c.y}px, #fff 0%, ${color} 18%, transparent 60%)`;
    this.run(f, [{ opacity: 0 }, { opacity: strength, offset: 0.08 }, { opacity: 0 }], { duration: dur, easing: 'ease-out' });
  }
  banner(rect: DOMRect, text: string, sub: string, color: string, dur = 1800) {
    const b = this.$('.banner');
    b.innerHTML = `<div class="bt"><span class="o">✦</span><span class="w">${esc(text)}</span><span class="o">✦</span></div>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.style.left = `${rect.left + rect.width / 2}px`;
    b.style.top = `${rect.top + rect.height * 0.42}px`;
    b.style.setProperty('--c', color);
    this.run(b, [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.9)', filter: 'blur(10px)', easing: 'cubic-bezier(.2,.9,.3,1)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(.96)', filter: 'blur(0)', offset: 0.14, easing: 'ease-out' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', filter: 'blur(0)', offset: 0.8, easing: 'ease-in' },
      { opacity: 0, transform: 'translate(-50%,-75%) scale(1.03)', filter: 'blur(4px)' },
    ], { duration: dur, easing: 'linear' });
  }
  holo(rect: DOMRect) {
    const h = this.$('.holo');
    Object.assign(h.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    h.classList.remove('go');
    void h.offsetWidth;
    h.classList.add('go');
    this.later(1200, () => h.classList.remove('go'));
  }
  /** Pastille « New » en haut au centre de la carte (ne cache ni la rareté ni le favori). */
  newBadge(rect: DOMRect, zoom = 1) {
    const b = this.$('.badge');
    const z = Math.min(1.7, zoom);
    b.style.zoom = z === 1 ? '' : String(z);
    b.style.left = `${(rect.left + rect.width / 2) / z}px`;
    b.style.top = `${(rect.top + 2) / z}px`;
    this.run(b, [
      { transform: 'translate(-50%,-50%) rotate(-25deg) scale(0)' },
      { transform: 'translate(-50%,-50%) rotate(2deg) scale(1.25)', offset: 0.6 },
      { transform: 'translate(-50%,-50%) rotate(-4deg) scale(1)' },
    ], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.3)', fill: 'forwards' });
  }
  hideBadge() {
    this.$('.badge').getAnimations().forEach((a) => a.cancel());
  }
  shake(power: number, dur = 450) {
    const main = document.querySelector('main');
    if (!main) return;
    const kf: Keyframe[] = [];
    for (let i = 0; i < 10; i++) {
      const k = power * (1 - i / 10);
      kf.push({ transform: `translate(${rnd(-k, k)}px,${rnd(-k, k)}px)` });
    }
    kf.push({ transform: 'none' });
    this.run(main, kf, { duration: dur, easing: 'linear' });
  }

  // ---------------- récap ----------------
  private recapTimer = 0;
  showRecap(html: string) {
    const t = this.$('.recap');
    t.innerHTML = html;
    t.querySelector('h4 span')?.addEventListener('click', () => t.classList.remove('show'));
    t.classList.add('show');
    clearTimeout(this.recapTimer);
    this.recapTimer = window.setTimeout(() => t.classList.remove('show'), 9000);
    t.onmouseenter = () => clearTimeout(this.recapTimer);
    t.onmouseleave = () => (this.recapTimer = window.setTimeout(() => t.classList.remove('show'), 2500));
  }
}

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const rainbow = () => `hsl(${rnd(0, 360)},95%,68%)`;
export const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
