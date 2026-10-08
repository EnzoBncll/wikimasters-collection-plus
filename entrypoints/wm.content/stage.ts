import { fmtDuration, packMetaItem, packStateItem, periodFor, predict, RARITY_COLOR, type PackMeta, type PackState } from '@/lib/packs';
import { getPalette, holoGradient, paletteVars } from '@/lib/palettes';
import { ctx, DISPLAY_FONT, onSettings, themedHost } from './ctx';

/**
 * Nouvelle interface de la page d'ouverture et du révélé (/pulls).
 * Le site est une appli React : on ne déplace ni ne supprime rien, on restyle, on masque visuellement
 * ce qu'on remplace et on ajoute nos blocs (fond, halo, bouton rond entouré de paquets en 3D).
 * Trois pistes de couleur (réglage « Style sur le site ») : pleine + halo, ambiance teintée, irisé réservé aux paquets.
 */

const PAGE_CSS = `
  [data-wmt-stage] { position: relative; isolation: isolate; }
  .wmt-bg { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none;
    -webkit-mask: linear-gradient(to bottom, transparent, #000 5%, #000 90%, transparent); mask: linear-gradient(to bottom, transparent, #000 5%, #000 90%, transparent); }
  .wmt-bg .blob { position: absolute; border-radius: 50%; filter: blur(100px); opacity: var(--wmt-blob, .22); transition: background 1.2s ease, opacity .6s; }
  .wmt-bg .b1 { width: 50vmax; height: 50vmax; left: -14vmax; top: -20vmax; background: var(--wmt-t1); animation: wmt-drift1 26s ease-in-out infinite alternate; }
  .wmt-bg .b2 { width: 42vmax; height: 42vmax; right: -12vmax; top: 8vmax; background: var(--wmt-t2); animation: wmt-drift2 32s ease-in-out infinite alternate; }
  .wmt-bg .b3 { width: 38vmax; height: 38vmax; left: 22%; bottom: -22vmax; background: var(--wmt-t3); animation: wmt-drift1 38s ease-in-out infinite alternate-reverse; }
  .wmt-bg .stars, .wmt-bg .stars2 { position: absolute; inset: -100% 0 0 0;
    background-image: radial-gradient(1.2px 1.2px at 20px 30px, var(--wmt-star), transparent), radial-gradient(1px 1px at 140px 90px, var(--wmt-star), transparent),
      radial-gradient(1.5px 1.5px at 260px 160px, var(--wmt-star), transparent), radial-gradient(1px 1px at 80px 220px, var(--wmt-star), transparent),
      radial-gradient(1.3px 1.3px at 330px 40px, var(--wmt-star), transparent), radial-gradient(1px 1px at 200px 280px, var(--wmt-star), transparent);
    background-size: 360px 320px; opacity: .5; animation: wmt-rise 110s linear infinite, wmt-twinkle 5s ease-in-out infinite alternate; }
  .wmt-bg .stars2 { background-size: 540px 480px; opacity: .3; animation-duration: 170s, 7s; animation-delay: 0s, -3s; }
  .wmt-bg .grain { position: absolute; inset: 0; opacity: .06; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
  .wmt-bg .vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, transparent 45%, rgba(0,0,0,.45) 100%); }
  .wmt-halo { position: absolute; width: 760px; height: 760px; margin: -380px 0 0 -380px; pointer-events: none; transition: opacity .5s; }
  .wmt-halo::before { content: ""; position: absolute; inset: 0; border-radius: 50%;
    background: repeating-conic-gradient(from 0deg, rgba(255,255,255,.07) 0deg 3deg, transparent 3deg 12deg);
    -webkit-mask: radial-gradient(circle, transparent 0 12%, #000 20%, transparent 62%); mask: radial-gradient(circle, transparent 0 12%, #000 20%, transparent 62%);
    animation: wmt-spin 80s linear infinite; }
  .wmt-halo::after { content: ""; position: absolute; inset: 20%; border-radius: 50%; background: radial-gradient(circle, var(--wmt-t1) 0, transparent 66%);
    opacity: .26; transition: background 1.2s ease; animation: wmt-breathe 5s ease-in-out infinite; }
  @keyframes wmt-drift1 { to { transform: translate(8vmax, 6vmax) scale(1.15); } }
  @keyframes wmt-drift2 { to { transform: translate(-10vmax, -4vmax) scale(.9); } }
  @keyframes wmt-rise { to { transform: translateY(50%); } }
  @keyframes wmt-twinkle { to { filter: brightness(.55); } }
  @keyframes wmt-spin { to { transform: rotate(360deg); } }
  @keyframes wmt-breathe { 50% { opacity: .42; transform: scale(1.07); } }
  @keyframes wmt-float { 0%, 100% { transform: translateY(0) rotate(-1.2deg); } 50% { transform: translateY(-10px) rotate(1.2deg); } }

  [data-wmt-stage="idle"] > .text-center h1 { font-family: ${DISPLAY_FONT} !important; font-weight: 800; font-size: clamp(30px, 4.4vw, 46px) !important; letter-spacing: -.01em;
    color: #fff !important; text-shadow: 0 4px 30px rgb(0 0 0 / .45); }
  [data-wmt-stage="idle"] > .text-center { order: -3; }
  [data-wmt-stage="idle"] > .wmt-open-btn { order: -2; overflow: visible; }
  [data-wmt-stage="idle"] > wmt-hud { order: -1; }
  .wmt-open-btn img { animation: wmt-float 4.5s ease-in-out infinite; filter: drop-shadow(0 16px 26px rgba(0,0,0,.5)) !important; }
  .wmt-open-btn > span { display: none !important; }
  .wmt-open-btn:disabled img { filter: grayscale(1) brightness(.55) drop-shadow(0 16px 26px rgba(0,0,0,.5)) !important; animation: none; }
  .wmt-hidden { position: absolute !important; width: 1px !important; height: 1px !important; overflow: hidden !important; clip-path: inset(50%) !important; opacity: 0 !important; pointer-events: none !important; }

  [data-wmt-stage="reveal"] .wmt-counter { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 999px;
    background: rgb(20 18 30 / .72); border: 1px solid rgb(255 255 255 / .1); backdrop-filter: blur(8px); color: rgb(255 255 255 / .6) !important;
    font-family: ${DISPLAY_FONT}; letter-spacing: .12em; text-transform: uppercase; font-size: 10.5px !important; }
  [data-wmt-stage="reveal"] .wmt-counter > span:nth-child(2) { font-size: 17px !important; color: var(--wmt-t1) !important; text-shadow: 0 0 12px color-mix(in srgb, var(--wmt-t1) 70%, transparent); transition: color .6s; }
  [data-wmt-stage="reveal"] .wmt-nav button.w-12 { background: rgb(20 18 30 / .72) !important; backdrop-filter: blur(8px); border-color: rgb(255 255 255 / .12) !important; transition: transform .15s, box-shadow .2s, border-color .2s; }
  [data-wmt-stage="reveal"] .wmt-nav > button.w-12:last-of-type { transform: scale(1.15); border-color: color-mix(in srgb, var(--wmt-t1) 60%, transparent) !important; box-shadow: 0 0 18px color-mix(in srgb, var(--wmt-t1) 45%, transparent); }
  [data-wmt-stage="reveal"] .wmt-nav button.w-12:not(:disabled):hover { transform: scale(1.2); }
  [data-wmt-stage="reveal"] .wmt-nav button.w-3.scale-125 { background: var(--wmt-t1) !important; box-shadow: 0 0 10px var(--wmt-t1); }
`;

/** Bouton rond et éventail de paquets en 3D (shadow DOM, couleurs de la palette). */
const HUD_CSS = `
  :host { all: initial; display: flex; flex-direction: column; align-items: center; font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #fff; }
  .dial { position: relative; width: 460px; height: 236px; margin-top: 26px; perspective: 700px; perspective-origin: 50% 40%; }
  .dial::before { content: ''; position: absolute; left: 50%; top: 158px; width: 300px; height: 70px; margin-left: -150px; border-radius: 50%; background: radial-gradient(closest-side, rgb(0 0 0 / .55), transparent); filter: blur(6px); }
  .pk { --W: 64px; --H: 96px; --T: 10px; position: absolute; left: 0; top: 0; width: var(--W); height: var(--H); margin: calc(var(--H) / -2) 0 0 calc(var(--W) / -2);
    transform-style: preserve-3d; z-index: var(--z); transform: translate(var(--x), var(--y)) rotate(var(--r)) rotateY(var(--ry)) rotateX(-18deg); transition: transform .4s cubic-bezier(.2,.9,.3,1); }
  .dial:hover .pk.ready { transform: translate(var(--x), var(--y)) rotate(var(--r)) translateY(-10px) rotateY(var(--ry)) rotateX(-18deg); }
  .f { position: absolute; backface-visibility: hidden; }
  .front, .back { inset: 0; }
  .front { transform: translateZ(calc(var(--T) / 2)); clip-path: var(--crimp);
    background:
      linear-gradient(115deg, rgb(255 255 255 / .55) 0%, rgb(255 255 255 / 0) 22%, rgb(255 255 255 / 0) 55%, rgb(255 255 255 / .3) 63%, rgb(255 255 255 / 0) 72%),
      radial-gradient(120% 70% at 50% 50%, rgb(255 255 255 / .16), rgb(0 0 0 / .32) 100%),
      repeating-linear-gradient(90deg, rgb(255 255 255 / .22) 0 1px, rgb(0 0 0 / .14) 1px 3px) top / 100% 12% no-repeat,
      repeating-linear-gradient(90deg, rgb(255 255 255 / .22) 0 1px, rgb(0 0 0 / .14) 1px 3px) bottom / 100% 12% no-repeat,
      var(--crinkle), var(--foil); }
  .front::before { content: ''; position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, rgb(255 255 255 / .9), rgb(255 255 255 / .2) 45%, transparent 70%), var(--emblem); box-shadow: inset 0 0 0 2px rgb(255 255 255 / .55), 0 2px 6px rgb(0 0 0 / .3); }
  .front::after { content: 'W'; position: absolute; left: 0; right: 0; top: 50%; margin-top: -8px; text-align: center; font: 800 14px/16px ${DISPLAY_FONT}; color: var(--ink); }
  .back { transform: rotateY(180deg) translateZ(calc(var(--T) / 2)); clip-path: var(--crimp); background: var(--crinkle), var(--side); }
  .l, .r { top: 6%; bottom: 6%; width: var(--T); left: calc((var(--W) - var(--T)) / 2); background: linear-gradient(90deg, rgb(0 0 0 / .25), rgb(255 255 255 / .12), rgb(0 0 0 / .3)), var(--side); }
  .r { transform: rotateY(90deg) translateZ(calc(var(--W) / 2)); }
  .l { transform: rotateY(-90deg) translateZ(calc(var(--W) / 2)); }
  .t, .b { left: 0; right: 0; height: var(--T); top: calc((var(--H) - var(--T)) / 2); background: repeating-linear-gradient(90deg, rgb(255 255 255 / .25) 0 1px, rgb(0 0 0 / .2) 1px 3px), var(--side); }
  .t { transform: rotateX(90deg) translateZ(calc(var(--H) / 2 - var(--H) * .03)); }
  .b { transform: rotateX(-90deg) translateZ(calc(var(--H) / 2 - var(--H) * .03)); }
  .pk.wait .f { filter: grayscale(1) brightness(.75); opacity: .32; }
  .pk.charging .front { animation: foilPulse 2.4s ease-in-out infinite; }
  .glow { position: absolute; inset: -16px; border-radius: 18px; background: radial-gradient(closest-side, var(--glow-c), transparent); filter: blur(8px); transform: translateZ(-6px); animation: halo 2.4s ease-in-out infinite; }
  @keyframes foilPulse { 0%, 100% { filter: brightness(.55) saturate(.5); opacity: .55; } 50% { filter: brightness(1.15) saturate(1.1); opacity: 1; } }
  @keyframes halo { 0%, 100% { opacity: 0; } 50% { opacity: .9; } }
  :host([data-look="holo"]) .front { background-size: auto, auto, 100% 12%, 100% 12%, auto, 220% 220%; animation: holoShift 6s linear infinite; }
  :host([data-look="holo"]) .pk.charging .front { animation: holoShift 6s linear infinite, foilPulse 2.4s ease-in-out infinite; }
  @keyframes holoShift { to { background-position: 0 0, 0 0, top, bottom, 0 0, 220% 0; } }

  .go { all: unset; box-sizing: border-box; position: absolute; z-index: 50; left: 50%; top: 168px; width: 136px; height: 136px; margin: -68px 0 0 -68px; border-radius: 50%; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: var(--btn-bg); color: var(--btn-fg); box-shadow: var(--btn-ring);
    transition: transform .2s cubic-bezier(.2,.9,.3,1), box-shadow .2s; }
  :host([data-look="holo"]) .go { background: linear-gradient(#17142a, #17142a) padding-box, var(--holo) border-box; border: 2px solid transparent; }
  .go:hover { transform: scale(1.05); }
  .go:active { transform: scale(.97); }
  .go b { font: 800 42px/1 ${DISPLAY_FONT}; }
  .go span { font: 700 11px/1 ${DISPLAY_FONT}; letter-spacing: .22em; }
  .go small { font: 600 10px/1 ui-sans-serif, system-ui; opacity: .6; margin-top: 4px; }
  .go.off { cursor: default; background: rgb(40 36 58 / .92); color: rgb(255 255 255 / .7); box-shadow: 0 0 0 2px rgb(255 255 255 / .06); border: 0; }
  .go.off b { font-size: 24px; }
  .meta { margin-top: 44px; font-size: 13px; color: rgb(255 255 255 / .6); }
  .meta b { color: #fff; font-variant-numeric: tabular-nums; }
  .hint { margin-top: 10px; font-size: 11.5px; color: rgb(255 255 255 / .55); }
  kbd { font: 700 10px ui-monospace, monospace; color: #fff; border: 1px solid rgb(255 255 255 / .14); background: rgb(255 255 255 / .08); border-radius: 6px; padding: 2px 7px; margin-right: 4px; }
`;

/** Soudures crantées en haut et en bas des paquets. */
const CRIMP = (() => {
  const n = 12;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) pts.push(`${(i / n) * 100}% ${i % 2 ? 0 : 3.5}%`);
  for (let i = n; i >= 0; i--) pts.push(`${(i / n) * 100}% ${i % 2 ? 100 : 96.5}%`);
  return `polygon(${pts.join(',')})`;
})();
/** Aluminium froissé (bruit SVG, aucune image). */
const CRINKLE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.035 .09' numOctaves='3' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .7 -.32'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") center / cover`;

const mk = (cls: string, html = '') => {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
};

/** Ton plus clair (k > 0) ou plus sombre (k < 0) d'une couleur hex. */
function shade(hex: string, k: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${ch((n >> 16) & 255)} ${ch((n >> 8) & 255)} ${ch(n & 255)})`;
}

export function startStage() {
  const style = document.createElement('style');
  style.id = 'wmt-stage-css';
  style.textContent = PAGE_CSS;
  (document.head ?? document.documentElement).append(style);

  let packState: PackState | null = null;
  let meta: PackMeta | null = null;
  packStateItem.getValue().then((v) => (packState = v));
  packStateItem.watch((v) => (packState = v));
  packMetaItem.getValue().then((v) => (meta = v));
  packMetaItem.watch((v) => (meta = v));

  const bg = mk('wmt-bg', '<div class="stars"></div><div class="stars2"></div><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="wmt-halo"></div><div class="grain"></div><div class="vignette"></div>');
  const halo = bg.querySelector<HTMLElement>('.wmt-halo')!;

  const hud = themedHost('wmt-hud');
  hud.root.innerHTML = `<style>${HUD_CSS}</style>
    <div class="dial"><button class="go" type="button"><b>–</b><span>OUVRIR</span><small></small></button></div>
    <div class="meta"></div>
    <div class="hint"><kbd>Espace</kbd>pour ouvrir</div>`;
  const dial = hud.root.querySelector<HTMLElement>('.dial')!;
  const go = hud.root.querySelector<HTMLButtonElement>('.go')!;
  let openBtnRef: HTMLButtonElement | null = null;
  go.addEventListener('click', (e) => {
    e.preventDefault();
    if (!openBtnRef || openBtnRef.disabled) return;
    go.animate([{ transform: 'scale(.95)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
    openBtnRef.click();
  });

  let stageEl: HTMLElement | null = null;
  let zoomed: { col: HTMLElement; stage: HTMLElement } | null = null;
  let dialKey = '';

  /** Couleurs de la scène, du bouton et des paquets selon la piste choisie. */
  const lookColors = () => {
    const palette = getPalette(ctx.settings.palette);
    const vars = paletteVars(palette, true);
    const iri = palette.icon.iri;
    const look = ctx.settings.siteLook;
    // Paquets : une couleur du thème qui contraste avec le bouton (pleine, ambiance), irisé en C.
    const base = look === 'solid' ? iri[0]! : iri[2]!;
    const pack =
      look === 'holo'
        ? { foil: holoGradient(palette, 115), side: '#5b4d93', emblem: `conic-gradient(${[...iri, iri[0]].join(', ')})`, ink: '#16122b', glow: `${iri[1]}e6` }
        : { foil: `linear-gradient(160deg, ${shade(base, 0.55)}, ${base} 45%, ${shade(base, -0.45)})`, side: shade(base, -0.5), emblem: shade(base, -0.15), ink: shade(base, -0.8), glow: `${base}e6` };
    const btn =
      look === 'solid'
        ? { bg: vars.primary!, fg: vars['primary-foreground']!, ring: `0 0 0 6px color-mix(in oklch, ${vars.primary} 14%, transparent), 0 0 40px color-mix(in oklch, ${vars.primary} 55%, transparent)` }
        : look === 'ambient'
          ? { bg: '#f5f3ff', fg: '#16122b', ring: '0 0 0 6px rgb(255 255 255 / .08), 0 18px 40px rgb(0 0 0 / .45)' }
          : { bg: '#17142a', fg: '#fff', ring: '0 0 0 2px rgb(255 255 255 / .08), 0 18px 40px rgb(0 0 0 / .5)' };
    return { vars, iri, look, pack, btn };
  };

  const paint = () => {
    const { vars, iri, look, btn } = lookColors();
    hud.host.dataset.look = look;
    hud.host.style.setProperty('--btn-bg', btn.bg);
    hud.host.style.setProperty('--btn-fg', btn.fg);
    hud.host.style.setProperty('--btn-ring', btn.ring);
    dialKey = '';
    if (!stageEl) return;
    const set = (k: string, v: string) => stageEl!.style.getPropertyValue(k) !== v && stageEl!.style.setProperty(k, v);
    set('--wmt-blob', look === 'ambient' ? '.5' : look === 'holo' ? '.14' : '.22');
    set('--wmt-star', look === 'ambient' ? (iri[1] ?? '#fff') : '#fff');
    set('--wmt-t2', look === 'ambient' ? (iri[2] ?? vars['folder-tab']!) : vars['folder-tab']!);
    set('--wmt-t3', vars['frame-glow']!);
    if (!stageEl.dataset.wmtTint) set('--wmt-t1', vars.primary!);
  };

  const unscale = () => {
    if (!zoomed) return;
    zoomed.col.style.zoom = '';
    zoomed.stage.style.minHeight = '';
    delete document.documentElement.dataset.wmtZoom;
    zoomed = null;
  };

  /** Révélé agrandi : la carte prend la hauteur disponible, en laissant la place aux volets de chaque côté. */
  const scaleReveal = (col: HTMLElement, main: HTMLElement, stage: HTMLElement) => {
    const cur = parseFloat(col.style.zoom) || 1;
    const r = col.getBoundingClientRect();
    const w = r.width / cur;
    const h = r.height / cur;
    if (!w || !h) return;
    const reserve = ctx.settings.revealPanels ? 2 * (250 - 40 + 16) : 80;
    const z = Math.max(1, Math.min(1.6, (main.clientHeight - 48) / h, (main.clientWidth - reserve) / w));
    if (Math.abs(z - cur) > 0.03) col.style.zoom = z.toFixed(3);
    const zz = (parseFloat(col.style.zoom) || 1).toFixed(3);
    if (document.documentElement.dataset.wmtZoom !== zz) document.documentElement.dataset.wmtZoom = zz;
    const mh = `${main.clientHeight}px`;
    if (stage.style.minHeight !== mh) stage.style.minHeight = mh;
    zoomed = { col, stage };
  };

  const cleanup = () => {
    unscale();
    bg.remove();
    hud.host.remove();
    document.querySelectorAll('[data-wmt-stage]').forEach((e) => e.removeAttribute('data-wmt-stage'));
    document.querySelectorAll('.wmt-hidden,.wmt-open-btn,.wmt-counter,.wmt-nav').forEach((e) => e.classList.remove('wmt-hidden', 'wmt-open-btn', 'wmt-counter', 'wmt-nav'));
    stageEl = null;
  };

  const setTint = (rarity: string | null) => {
    if (!stageEl) return;
    const c = rarity ? RARITY_COLOR[rarity as keyof typeof RARITY_COLOR] : null;
    if (c) {
      stageEl.dataset.wmtTint = rarity!;
      stageEl.style.setProperty('--wmt-t1', c);
    } else if (stageEl.dataset.wmtTint) {
      delete stageEl.dataset.wmtTint;
      paint();
    }
  };

  const parseFrame = (frame: Element) => {
    const t = frame.textContent ?? '';
    const m = t.match(/(\d+)\s*\/\s*(\d+)/);
    const c = t.match(/(\d+):(\d{2})/);
    return m ? { n: Number(m[1]), max: Number(m[2]), secs: c ? Number(c[1]) * 60 + Number(c[2]) : null } : null;
  };

  /** Éventail de paquets : prêts (couleur de la piste), en charge (pulsation diffuse), à venir (gris). */
  const drawDial = (n: number, max: number) => {
    const key = `${n}/${max}/${ctx.settings.siteLook}/${ctx.settings.palette}`;
    if (key === dialKey) return;
    dialKey = key;
    dial.querySelectorAll('.pk').forEach((p) => p.remove());
    const { pack } = lookColors();
    const cx = 230;
    const cy = 168;
    const dist = 82;
    const from = -152;
    const to = -28;
    for (let i = 0; i < max; i++) {
      const u = max > 1 ? i / (max - 1) : 0.5;
      const deg = from + (to - from) * u;
      const a = (deg * Math.PI) / 180;
      const kind = i < n ? 'ready' : i === n ? 'charging' : 'wait';
      const el = document.createElement('div');
      el.className = `pk ${kind}`;
      const props: Record<string, string> = {
        '--x': `${cx + dist * Math.cos(a)}px`,
        '--y': `${cy + dist * Math.sin(a)}px`,
        '--r': `${deg + 90}deg`,
        '--ry': `${(u - 0.5) * -64}deg`,
        '--z': String(10 + i),
        '--crimp': CRIMP,
        '--crinkle': CRINKLE,
        '--foil': pack.foil,
        '--side': pack.side,
        '--emblem': pack.emblem,
        '--ink': pack.ink,
        '--glow-c': pack.glow,
      };
      for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
      el.innerHTML = `${kind === 'charging' ? '<i class="glow"></i>' : ''}<i class="f back"></i><i class="f l"></i><i class="f r"></i><i class="f t"></i><i class="f b"></i><i class="f front"></i>`;
      dial.append(el);
    }
  };

  const renderHud = (frame: { n: number; max: number; secs: number | null } | null, openBtn: HTMLButtonElement) => {
    const per = periodFor(ctx.settings.regenMode, meta?.detectedPeriod ?? null);
    const p = predict(packState);
    const n = frame ? frame.n : (p?.n ?? 0);
    const max = frame ? frame.max : (p?.max ?? 10);
    const secs = frame?.secs != null ? frame.secs : p?.nextAt ? Math.max(0, Math.round((p.nextAt - Date.now()) / 1000)) : null;
    drawDial(n, max);
    const opening = /Ouverture/i.test(openBtn.textContent ?? '');
    const off = openBtn.disabled || n <= 0;
    go.classList.toggle('off', off && !opening);
    const clock = secs != null ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    const want = opening ? ['…', 'OUVERTURE', ''] : off ? [clock || '–', 'PROCHAIN', ''] : [String(n), 'OUVRIR', `/ ${max}`];
    const [b, span, small] = [go.querySelector('b')!, go.querySelector('span')!, go.querySelector('small')!];
    if (b.textContent !== want[0]) b.textContent = want[0]!;
    if (span.textContent !== want[1]) span.textContent = want[1]!;
    if (small.textContent !== want[2]) small.textContent = want[2]!;
    let metaHtml = '';
    if (n >= max) metaHtml = 'Réserve pleine, la régénération est en pause';
    else if (secs != null) metaHtml = `Prochain dans <b>${clock}</b> · plein dans <b>${fmtDuration(secs * 1000 + (max - n - 1) * per)}</b>`;
    const metaEl = hud.root.querySelector('.meta')!;
    if (metaEl.innerHTML !== metaHtml) metaEl.innerHTML = metaHtml;
    (hud.root.querySelector('.hint') as HTMLElement).style.display = ctx.settings.spaceKey ? '' : 'none';
  };

  const placeHalo = (target: Element | null) => {
    if (!stageEl || !target) {
      halo.style.opacity = '0';
      return;
    }
    const s = stageEl.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    halo.style.opacity = '1';
    halo.style.left = `${r.left - s.left + r.width / 2}px`;
    halo.style.top = `${r.top - s.top + r.height / 2}px`;
  };

  /** Le fond couvre toute la zone de la page, pas seulement le bloc du paquet. */
  const fitBg = (main: HTMLElement) => {
    const r = main.getBoundingClientRect();
    const top = Math.max(0, r.top);
    const h = Math.min(innerHeight, r.bottom) - top;
    const want: Record<string, string> = { position: 'fixed', left: `${r.left}px`, top: `${top}px`, width: `${r.width}px`, height: `${h}px`, right: 'auto', bottom: 'auto' };
    for (const k in want) if ((bg.style as any)[k] !== want[k]) (bg.style as any)[k] = want[k];
    const b = bg.getBoundingClientRect();
    const dx = r.left - b.left;
    const dy = top - b.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      bg.style.left = `${parseFloat(bg.style.left) + dx}px`;
      bg.style.top = `${parseFloat(bg.style.top) + dy}px`;
    }
  };

  const addCls = (el: Element, c: string) => !el.classList.contains(c) && el.classList.add(c);

  function tick() {
    if (!ctx.settings.packStage || !location.pathname.startsWith('/pulls')) {
      if (stageEl) cleanup();
      return;
    }
    const main = document.querySelector<HTMLElement>('main');
    const flip = main?.querySelector('[class*="animate-card-flip"]');
    // Le bouton du paquet, reconnu aussi pendant l'animation d'ouverture (« Ouverture… »).
    const openBtn = main
      ? [...main.querySelectorAll('button')].find((b) => {
          const im = b.querySelector('img');
          return im && (/card_pack|Ouvrir un paquet/i.test(`${im.getAttribute('src') ?? ''} ${im.alt}`) || /Ouv(rir|erture)/.test(b.textContent ?? ''));
        })
      : undefined;
    const mode = flip ? 'reveal' : openBtn ? 'idle' : null;
    const stage = (mode === 'reveal' ? main!.firstElementChild : openBtn?.parentElement) as HTMLElement | null;
    if (!stage || !main) {
      if (stageEl) cleanup();
      return;
    }
    if (stage !== stageEl || stage.getAttribute('data-wmt-stage') !== mode) {
      cleanup();
      stageEl = stage;
      stage.setAttribute('data-wmt-stage', mode!);
      paint();
    }
    if (bg.parentElement !== stage) stage.append(bg);
    fitBg(main);

    if (mode === 'idle' && openBtn) {
      setTint(null);
      openBtnRef = openBtn;
      addCls(openBtn, 'wmt-open-btn');
      const frame = [...stage.querySelectorAll('.card-frame')].find((f) => /paquets? disponibles?/i.test(f.textContent ?? ''));
      if (frame) addCls(frame, 'wmt-hidden');
      if (hud.host.parentElement !== stage) stage.append(hud.host);
      renderHud(frame ? parseFrame(frame) : null, openBtn);
      placeHalo(openBtn.querySelector('img') ?? openBtn);
    } else if (flip) {
      hud.host.remove();
      const col = flip.closest<HTMLElement>('.flex.flex-col');
      if (col) {
        const counter = [...col.children].find((c) => /^\s*Carte/.test(c.textContent ?? ''));
        if (counter) addCls(counter, 'wmt-counter');
        const nav = [...col.children].find((c) => c.querySelector('button.w-12'));
        if (nav) addCls(nav, 'wmt-nav');
        scaleReveal(col, main, stage);
      }
      const card = flip.querySelector('[class*="glow-"]');
      const m = card && String((card as HTMLElement).className).match(/\bglow-(c|pc|r|sr|ur|l|shiny)\b/);
      setTint(m ? (m[1] === 'shiny' ? 'L' : m[1]!.toUpperCase()) : null);
      placeHalo(flip);
    }
  }

  onSettings(() => {
    paint();
    tick();
  });
  setInterval(tick, 500);
  window.addEventListener('resize', tick);
  const ours = (n: Node | null) => !!n && (bg.contains(n) || n === hud.host);
  // Réappliqué avant l'affichage quand le site change d'écran, pour ne jamais voir l'ancienne interface.
  new MutationObserver((muts) => {
    if (!ctx.settings.packStage || !location.pathname.startsWith('/pulls')) {
      if (stageEl) tick();
      return;
    }
    if (muts.every((m) => ours(m.target))) return;
    tick();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
