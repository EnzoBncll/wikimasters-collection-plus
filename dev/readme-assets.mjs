// Génère les images du README (docs/images) : bannière, captures de l'aperçu simulé, palettes.
// Usage : pnpm readme:assets   (construit l'extension, lance l'aperçu, capture avec Chromium headless)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { brandIconSvg } from '../lib/brand-icon.ts';
import { getPalette, holoGradient, PALETTES } from '../lib/palettes.ts';

const OUT = join(import.meta.dirname, '..', 'docs', 'images');
const TMP = join(tmpdir(), 'collection-plus-readme');
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  const playwright = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(playwright)) {
    for (const dir of readdirSync(playwright).filter((d) => d.startsWith('chromium_headless_shell'))) {
      candidates.unshift(join(playwright, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'));
    }
  }
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error('Chrome introuvable : définis CHROME=/chemin/vers/chrome');
  return found;
}
const CHROME = findChrome();

function shoot(url, file, [width, height], { scale = 1, wait = 6000 } = {}) {
  execFileSync(CHROME, [
    '--headless',
    '--hide-scrollbars',
    '--disable-gpu',
    `--force-device-scale-factor=${scale}`,
    `--window-size=${width},${height}`,
    `--virtual-time-budget=${wait}`,
    `--screenshot=${file}`,
    url,
  ], { stdio: 'ignore' });
  console.log('  ✓', file.replace(OUT + '/', ''));
}

/**
 * Capture en temps réel par le protocole DevTools : le temps virtuel de --screenshot fige les animations
 * (Web Animations) à mi-course, ce qui gâche le révélé. Ici on attend vraiment `wait` ms.
 */
async function shootLive(url, file, [width, height], { wait = 12000 } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, ['--headless', '--hide-scrollbars', '--disable-gpu', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, `--user-data-dir=${join(TMP, `live-${port}`)}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await new Promise((r) => setTimeout(r, 200));
      target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const n = ++id;
        const onMessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.id === n) (ws.removeEventListener('message', onMessage), resolve(msg.result));
        };
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, wait));
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(file, Buffer.from(data, 'base64'));
    ws.close();
    console.log('  ✓', file.replace(OUT + '/', ''));
  } finally {
    chrome.kill();
  }
}

async function page(name, html) {
  const file = join(TMP, `${name}.html`);
  await writeFile(file, `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif}</style>${html}`);
  return `file://${file}`;
}

/**
 * Planche des six raretés, au repos puis avec le reflet du survol (forcé) : même balisage que WmCard,
 * stylé par la feuille de style de la build.
 */
function raritiesPage() {
  const css = readdirSync(join(import.meta.dirname, '..', '.output', 'chrome-mv3', 'assets')).find((f) => /\.css$/.test(f));
  const card = (rarity, hover, x, y) => `
    <div style="width:190px"><div class="wm-card ${hover ? 'force' : ''}" data-rarity="${rarity}"
      style="--mx:${x}%;--my:${y}%;--holo-angle:${95 + (x / 100 - 0.5) * 40}deg">
      <div class="wm-paper"></div>
      <div class="absolute inset-x-0 top-0 z-20 h-[45%] bg-black/20"><img src="https://picsum.photos/seed/wm${rarity}/320/240" class="absolute inset-0 size-full object-cover"></div>
      <div class="absolute top-[4.5cqw] left-[4.5cqw] z-30"><span class="rounded-[2.5cqw] px-[3.5cqw] py-[1.2cqw] text-[6cqw] leading-none font-bold text-[#0d1117]" style="background:var(--rarity-${rarity.toLowerCase()})">${rarity}</span></div>
      <div class="absolute inset-x-0 top-[45%] bottom-0 z-30 flex flex-col p-[6.5cqw]">
        <h3 class="text-[7.5cqw] leading-tight font-bold text-black">Albert Einstein</h3>
        <p class="mt-[1.5cqw] text-[5.8cqw] leading-snug text-neutral-900/85">physicien helvético-américain</p>
        <div class="mt-auto flex justify-between border-t border-black/20 pt-[3cqw] text-[5.8cqw] font-bold text-black/90"><span>⚔ 7 470</span><span>⛨ 8 000</span></div>
      </div>
      <div class="wm-shine"></div><div class="wm-holo"></div><div class="wm-foil"></div><div class="wm-glitter"></div><div class="wm-glare"></div><div class="wm-rim"></div>
    </div></div>`;
  const force = `.force[data-rarity=SR] .wm-holo{opacity:.55}.force[data-rarity=UR] .wm-holo{opacity:.7}.force[data-rarity=L] .wm-holo{opacity:.4}
    .force[data-rarity=UR] .wm-foil{opacity:.22}.force[data-rarity=L] .wm-foil{opacity:.35}.force[data-rarity=L] .wm-glitter{opacity:.7}.force[data-rarity=L] .wm-rim{opacity:.55}.force .wm-glare{opacity:.7}
    *{transition:none!important}`;
  const row = (hover, x, y) => `<div style="display:flex;gap:18px;margin-bottom:22px">${['C', 'PC', 'R', 'SR', 'UR', 'L'].map((r) => card(r, hover, x, y)).join('')}</div>`;
  return `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/${css}"><style>${force}body{margin:0;padding:28px 36px;background:#0b0b1a}</style>${row(false, 50, 50)}${row(true, 32, 30)}`;
}

await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

// 1. Captures de l'application (aperçu simulé)
const server = spawn('node', [join(import.meta.dirname, 'preview.mjs')], { env: { ...process.env, PORT: String(PORT) } });
await new Promise((resolve) => server.stdout.once('data', resolve));
try {
  const app = (query, hash = '') => `${BASE}/review.html?static&${query}${hash}`;
  shoot(app('theme=light'), join(OUT, 'review-light.png'), [1440, 900]);
  shoot(app('theme=dark'), join(OUT, 'review-dark.png'), [1440, 900]);
  shoot(app('theme=light', '#tags'), join(OUT, 'tags.png'), [1440, 900], { wait: 20000 });
  shoot(app('theme=light&tagsLayout=list', '#tags'), join(OUT, 'tags-list.png'), [1440, 760]);
  shoot(app('theme=dark&albumStyle=relie', '#album=none'), join(OUT, 'album-relie.png'), [1440, 900], { wait: 12000 });
  shoot(app('theme=dark&albumStyle=classeur', '#album=none'), join(OUT, 'album-classeur.png'), [1440, 900], { wait: 12000 });
  shoot(app('theme=dark&albumStyle=relie&demo=viewer', '#album=t-foot'), join(OUT, 'viewer.png'), [1440, 900], { wait: 12000 });
  shoot(app('theme=dark&albumStyle=relie&demo=wishes', '#album=t-foot'), join(OUT, 'wishes.png'), [1440, 1000], { wait: 30000 });
  await writeFile(join(import.meta.dirname, '..', '.output', 'chrome-mv3', '__rarities.html'), raritiesPage());
  shoot(`${BASE}/__rarities.html`, join(OUT, 'rarities.png'), [1340, 640]);
  shoot(app('theme=dark&palette=cyberpunk', '#export'), join(OUT, 'settings.png'), [1440, 1180]);
  await shootLive(`${BASE}/pulls?palette=nuit-violette`, join(OUT, 'site-pulls.png'), [1440, 900], { wait: 5000 });
  // ?nodesc : descriptions venues de Wikipédia, comme sur le vrai site.
  await shootLive(`${BASE}/pulls?palette=nuit-violette&style=foil&open=0&rarities=SR,R,L,PC,C&nodesc`, join(OUT, 'site-reveal.png'), [1440, 900], { wait: 14000 });
  shoot(app('theme=light&onboarding=2'), join(OUT, 'onboarding.png'), [1440, 900], { wait: 12000 });
  shoot(`${BASE}/popup.html?static&theme=dark`, join(OUT, 'popup.png'), [360, 325], { scale: 2 });
  for (const [palette, theme] of [['abysse', 'dark'], ['aube', 'light'], ['coucher-de-soleil', 'dark'], ['emeraude', 'light']]) {
    shoot(app(`theme=${theme}&palette=${palette}`), join(TMP, `theme-${palette}.png`), [1440, 900]);
  }
} finally {
  server.kill();
}

// 2. Bannière
const main = getPalette('nuit-violette');
shoot(
  await page(
    'banner',
    `<div style="position:relative;width:1280px;height:640px;overflow:hidden;color:#f5f3ff;
      background:radial-gradient(70% 90% at 15% 20%,#3b1d6e,transparent 70%),radial-gradient(60% 80% at 100% 100%,#1e1b4b,transparent 70%),#0b0b1a">
      <div style="position:absolute;left:84px;top:150px;width:520px">
        <div style="width:132px;height:132px;filter:drop-shadow(0 18px 40px rgba(124,58,237,.55))">${brandIconSvg(main)}</div>
        <h1 style="margin:34px 0 12px;font-size:64px;letter-spacing:-2px;font-weight:800">Collection<span style="background:${holoGradient(main)};-webkit-background-clip:text;color:transparent">+</span></h1>
        <p style="margin:0;font-size:24px;line-height:1.4;color:#c4b5fd">Range ta collection WikiMasters&nbsp;: Trade / Not Trade, étiquettes, suggestions et export.</p>
        <div style="margin-top:28px;height:6px;width:240px;border-radius:9px;background:${holoGradient(main, 90)}"></div>
      </div>
      <img src="file://${join(OUT, 'review-dark.png')}" style="position:absolute;left:640px;top:96px;width:900px;border-radius:18px;
        box-shadow:0 40px 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);transform:perspective(1800px) rotateY(-16deg) rotateX(6deg);transform-origin:left center">
    </div>`,
  ),
  join(OUT, 'banner.png'),
  [1280, 640],
);

// 3. Palettes : les 10 icônes
shoot(
  await page(
    'palettes',
    `<div style="width:1280px;padding:48px 56px;background:#0b0b1a;display:grid;grid-template-columns:repeat(5,1fr);gap:36px 24px">
      ${PALETTES.map(
        (p) => `<div style="display:flex;flex-direction:column;align-items:center;gap:14px;color:#e4e4f0;font-size:18px;font-weight:600">
          <div style="width:112px;height:112px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.5))">${brandIconSvg(p, { prefix: 'pal' })}</div>
          ${p.name}
          <div style="width:120px;height:5px;border-radius:9px;background:${holoGradient(p, 90)}"></div>
        </div>`,
      ).join('')}
    </div>`,
  ),
  join(OUT, 'palettes.png'),
  [1280, 440],
);

// 4. Mosaïque de thèmes
shoot(
  await page(
    'themes',
    `<div style="width:1280px;padding:24px;background:#0b0b1a;display:grid;grid-template-columns:1fr 1fr;gap:20px">
      ${['abysse', 'aube', 'coucher-de-soleil', 'emeraude']
        .map((id) => `<figure style="margin:0;color:#c4b5fd;font-size:16px;font-weight:600">
          <img src="file://${join(TMP, `theme-${id}.png`)}" style="display:block;width:100%;border-radius:12px;box-shadow:0 0 0 1px rgba(255,255,255,.08)">
          <figcaption style="margin-top:10px;text-align:center">${getPalette(id).name}</figcaption></figure>`)
        .join('')}
    </div>`,
  ),
  join(OUT, 'themes.png'),
  [1280, 900],
);

console.log('Images du README à jour dans docs/images');
