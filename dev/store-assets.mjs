// Génère les visuels du Chrome Web Store depuis l'aperçu simulé :
//  - store/screenshots : 5 captures 1280×800, chacune avec son titre au-dessus de l'écran ;
//  - store/promo : tuile 440×280 et bannière « marquee » 1400×560.
// Vraies captures : un fichier store/raw/album.png, library.png ou studio.png (fenêtre en 16:9, idéalement 2560×1440)
// remplace l'écran simulé des captures 02, 03 et 04 ; le cadre et le titre restent ceux du script.
// Usage : pnpm store:assets   (construit l'extension, lance l'aperçu, capture avec Chromium headless en temps réel)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { brandIconSvg } from '../lib/brand-icon.ts';
import { getPalette, holoGradient } from '../lib/palettes.ts';

const ROOT = join(import.meta.dirname, '..');
const SHOTS = join(ROOT, 'store', 'screenshots');
const PROMO = join(ROOT, 'store', 'promo');
const TMP = join(tmpdir(), 'collection-plus-store');
const PORT = 5198;
const BASE = `http://localhost:${PORT}`;
/** Fenêtre des captures brutes (16:9), prises en 2× pour rester nettes une fois réduites dans leur cadre. */
const VIEW = [1280, 720];

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ouvre `url` en temps réel (protocole DevTools) et passe à `fn` de quoi piloter la page : script, survol, capture. */
async function live(url, [width, height], fn, { scale = 2 } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, ['--headless', '--hide-scrollbars', '--disable-gpu', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, `--user-data-dir=${join(TMP, `p-${port}`)}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
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
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    await send('Page.navigate', { url });
    await fn({
      run: async (expression) => (await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true }))?.result?.value,
      hover: (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }),
      shot: async (name, clip) => {
        const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip && { clip: { ...clip, scale: 1 } }) });
        await writeFile(join(TMP, name), Buffer.from(data, 'base64'));
      },
    });
    ws.close();
  } finally {
    chrome.kill();
  }
}

/** Page de composition (cadre, bannière) rendue en image. */
async function compose(name, html, file, [width, height]) {
  const src = join(TMP, `${name}.html`);
  const font = join(ROOT, 'node_modules', '@fontsource-variable', 'outfit', 'files', 'outfit-latin-wght-normal.woff2');
  await writeFile(
    src,
    `<!doctype html><meta charset="utf-8"><style>
      @font-face { font-family: Outfit; src: url('file://${font}') format('woff2'); font-weight: 100 900; }
      * { box-sizing: border-box; } body { margin: 0; font-family: Outfit, -apple-system, 'Segoe UI', sans-serif; color: #f5f3ff; }
      .bg { position: relative; overflow: hidden; background: radial-gradient(70% 90% at 12% 10%, #3b1d6e, transparent 70%), radial-gradient(60% 80% at 100% 100%, #2a1650, transparent 70%), #0b0b1a; }
      .plus { background: ${HOLO}; -webkit-background-clip: text; color: transparent; }
    </style>${html}`,
  );
  execFileSync(CHROME, ['--headless', '--hide-scrollbars', '--disable-gpu', '--force-device-scale-factor=1', `--window-size=${width},${height}`, '--virtual-time-budget=4000', `--screenshot=${file}`, `file://${src}`], { stdio: 'ignore' });
  console.log('  ✓', file.replace(`${ROOT}/`, ''));
}

const main = getPalette('nuit-violette');
const HOLO = holoGradient(main);
const REAL = join(ROOT, 'store', 'raw');
const raw = (name) => `file://${existsSync(join(REAL, name)) ? join(REAL, name) : join(TMP, name)}`;

/** Capture du Store : titre et sous-titre, puis l'écran dans un cadre arrondi. */
const frame = (title, text, inner) => `<div class="bg" style="width:1280px;height:800px">
  <div style="position:absolute;inset:34px 96px auto;text-align:center">
    <h1 style="margin:0;font-size:40px;line-height:1.1;font-weight:800;letter-spacing:-.8px">${title}</h1>
    <p style="margin:10px 0 0;font-size:18px;color:#c4b5fd">${text}</p>
  </div>
  <div style="position:absolute;left:96px;top:152px;width:1088px;height:612px;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1)">${inner}</div>
</div>`;
const full = (name) => `<img src="${raw(name)}" style="display:block;width:100%;height:100%;object-fit:cover">`;
/** Morceau d'une capture brute : zone (x, y, w, h) en px de la fenêtre, affichée sur `width` px de large. */
const crop = (name, [x, y, w, h], width, [vw], style = '') => {
  const k = width / w;
  return `<div style="width:${width}px;height:${h * k}px;overflow:hidden;${style}"><img src="${raw(name)}" style="display:block;width:${vw * k}px;margin:${-y * k}px 0 0 ${-x * k}px"></div>`;
};

/** Historique simulé : ~110 paquets sur quatre semaines, quelques Pack ++. */
const SEED_PULLS = `
  const R = ['C','C','C','C','PC','PC','PC','R','R','SR','C','PC','C','R','UR','C','PC','C','C','R','C','C','PC','SR','L'];
  const names = ['Paris','Zinédine Zidane','Tokyo','Zeus','Wolfgang Amadeus Mozart','Pikachu','Albert Einstein','Lionel Messi','Marie Curie','Rome','Tour Eiffel','Napoléon Ier'];
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
  const now = Date.now(); const pulls = [];
  for (let d = 27; d >= 0; d--) { const n = Math.floor(rnd() * 8); for (let k = 0; k < n; k++) pulls.push({ t: now - d * 864e5 - (n - k) * 12e5, src: k === 0 && d % 4 === 0 ? 'pro-daily' : 'open',
    cards: Array.from({ length: 5 }, () => ({ r: R[Math.floor(rnd() * R.length)], name: names[Math.floor(rnd() * names.length)], s: rnd() < 0.03, o: rnd() < 0.3 ? 1 : 2 })) }); }
  await chrome.storage.local.set({ pulls });
`;
const SKIP_TOUR = `[...document.querySelectorAll('button')].find((b) => /Passer la visite/.test(b.textContent))?.click();`;
const rectOf = (selector) => `const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.left, r.top, r.width, r.height];`;

await mkdir(SHOTS, { recursive: true });
await mkdir(PROMO, { recursive: true });
await mkdir(TMP, { recursive: true });

// ---------------- 1. Captures brutes ----------------
const server = spawn('node', [join(import.meta.dirname, 'preview.mjs')], { env: { ...process.env, PORT: String(PORT) } });
await new Promise((resolve) => server.stdout.once('data', resolve));
let card;
let book;
try {
  const app = (query, hash = '') => `${BASE}/review.html?static&theme=dark&palette=nuit-violette&demo=groups&lib=1${query}${hash}`;
  console.log('Captures brutes…');

  // Révélé d'une Légendaire en habillage full-art, volets de rangement ouverts.
  await live(`${BASE}/pulls?palette=nuit-violette&style=fullart&open=0&rarities=L,SR,R,PC,C`, VIEW, async ({ run, shot }) => {
    await sleep(12000);
    card = await run(rectOf('.animate-card-flip'));
    await shot('reveal.png');
  });

  // Album à objectif en Grimoire 3D : la première double page (bannière), puis une double page avec des cases à trouver.
  await live(app('', '#album=t-byz'), VIEW, async ({ run, shot }) => {
    await sleep(7000);
    await run(SKIP_TOUR);
    // Fond noir uni derrière le livre : il disparaît une fois fondu (« screen ») sur la bannière.
    await run(`document.querySelector('[data-album-slot]').closest('.fixed').style.background = '#000'; document.querySelectorAll('[aria-label="Page suivante"], [aria-label="Page précédente"]').forEach((b) => (b.style.visibility = 'hidden'));`);
    await sleep(400);
    book = await run(`const r = document.querySelector('[data-album-slot]').closest('.touch-none').getBoundingClientRect(); return [r.left - 14, r.top - 12, r.width + 28, r.height + 44];`);
    await shot('book.png');
  });
  await live(app('', '#album=t-byz'), VIEW, async ({ run, shot }) => {
    await sleep(7000);
    await run(SKIP_TOUR);
    await run(`document.querySelector('[aria-label="Page suivante"]').click();`);
    await sleep(2200);
    await shot('album.png');
  });

  // Bibliothèque : un livre tiré de l'étagère, sa fiche au-dessus.
  await live(app('&shelf=glass', '#tags'), VIEW, async ({ run, hover, shot }) => {
    await sleep(5000);
    await run(SKIP_TOUR);
    await run(`document.querySelector('.lib-room').scrollIntoView({ block: 'center' });`);
    await sleep(600);
    const [x, y, w, h] = await run(`const r = [...document.querySelectorAll('.lib-book')].find((b) => /Empereurs/.test(b.getAttribute('aria-label'))).getBoundingClientRect(); return [r.left, r.top, r.width, r.height];`);
    await hover(x + w / 2, y + h / 2);
    await sleep(1600);
    await shot('library.png');
  });

  // Mode « Style d'album », volet Pages.
  await live(app('', '#album=t-byz'), VIEW, async ({ run, shot }) => {
    await sleep(7000);
    await run(SKIP_TOUR);
    await run(`document.querySelector('[aria-label="Style d\\'album"]').click();`);
    await sleep(1500);
    await run(`[...document.querySelectorAll('aside button')].find((b) => b.textContent.startsWith('Pages')).click();`);
    await sleep(1800);
    await shot('studio.png');
  });

  // Page d'ouverture et statistiques de tirage.
  await live(`${BASE}/pulls?palette=nuit-violette`, [1440, 1400], async ({ run, shot }) => {
    await sleep(2500);
    await run(SEED_PULLS);
    await sleep(2500);
    await run(`document.querySelector('wmt-pack-stats').shadowRoot.querySelector('[data-p="all"]').click();`);
    await sleep(1200);
    await shot('pulls.png');
  }, { scale: 1.5 });
} finally {
  server.kill();
}

// ---------------- 2. Captures du Store (1280×800) ----------------
console.log('Captures du Store…');
const size = [1280, 800];
await compose('s1', frame('Chaque paquet devient un moment', 'Révélé mis en scène selon la rareté, sons, et rangement de la carte sans l’ouvrir.', full('reveal.png')), join(SHOTS, '01-ouverture.png'), size);
await compose('s2', frame('Des albums à compléter, case par case', 'Décris un thème : Collection<span class="plus">+</span> construit l’album et te montre les cartes qu’il te manque.', full('album.png')), join(SHOTS, '02-albums-a-completer.png'), size);
await compose('s3', frame('Ta bibliothèque, un livre par collection', 'Chaque livre grandit à mesure qu’il se remplit ; halo et sceau une fois la collection finie.', full('library.png')), join(SHOTS, '03-bibliotheque.png'), size);
await compose('s4', frame('Des livres à ton goût', 'Relié, classeur, grimoire ou herbier, en 3D : couverture, pages, parties et cartes se règlent en direct.', full('studio.png')), join(SHOTS, '04-style-album.png'), size);
await compose(
  's5',
  frame(
    'Tes paquets, tes tirages, tes chiffres',
    'Paquets en éventail, temps avant la réserve pleine, taux de drop, prévisions et records.',
    `<div style="display:flex;align-items:center;gap:22px;height:100%;padding:0 22px;background:#121212">
      ${crop('pulls.png', [430, 40, 580, 760], 430, [1440], 'border-radius:14px;flex:none')}
      ${crop('pulls.png', [258, 808, 924, 592], 592, [1440], 'border-radius:14px;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.08)')}
    </div>`,
  ),
  join(SHOTS, '05-tirages.png'),
  size,
);

// ---------------- 3. Visuels promo ----------------
console.log('Visuels promo…');
const icon = (px, id) => `<div style="width:${px}px;height:${px}px;filter:drop-shadow(0 ${px / 8}px ${px / 3}px rgba(124,58,237,.55))">${brandIconSvg(main, { prefix: id })}</div>`;
const bookImg = (width, style) => crop('book.png', book, width, VIEW, style);
const cardImg = (width, style) =>
  crop('reveal.png', card, width, VIEW, `border-radius:${width * 0.065}px;box-shadow:0 0 ${width / 4}px rgba(255,214,64,.5),0 ${width / 10}px ${width / 4}px rgba(0,0,0,.6),0 0 0 2px rgba(255,225,68,.85);${style}`);

await compose(
  'marquee',
  `<div class="bg" style="width:1400px;height:560px">
    <div style="position:absolute;left:84px;top:96px;width:500px">
      ${icon(104, 'mq')}
      <h1 style="margin:28px 0 14px;font-size:66px;line-height:1;letter-spacing:-2px;font-weight:800">Collection<span class="plus">+</span></h1>
      <p style="margin:0;font-size:25px;line-height:1.35;color:#c4b5fd">Ta collection WikiMasters en albums à compléter. Et chaque paquet devient un moment.</p>
      <div style="margin-top:26px;height:6px;width:220px;border-radius:9px;background:${holoGradient(main, 90)}"></div>
    </div>
    <div style="position:absolute;left:640px;top:44px;perspective:1800px;mix-blend-mode:screen">
      ${bookImg(740, 'transform:rotateY(-14deg) rotateX(7deg) rotate(-1.5deg);transform-origin:left center')}
    </div>
    ${cardImg(176, 'position:absolute;left:1168px;top:250px;transform:rotate(9deg)')}
  </div>`,
  join(PROMO, 'marquee-1400x560.png'),
  [1400, 560],
);

await compose(
  'tile',
  `<div class="bg" style="width:440px;height:280px">
    <div style="position:absolute;left:28px;top:40px;width:215px">
      ${icon(56, 'tl')}
      <h1 style="margin:16px 0 8px;font-size:32px;line-height:1;letter-spacing:-1px;font-weight:800">Collection<span class="plus">+</span></h1>
      <p style="margin:0;font-size:14.5px;line-height:1.35;color:#c4b5fd">Tes cartes WikiMasters en albums à compléter.</p>
      <div style="margin-top:14px;height:4px;width:110px;border-radius:9px;background:${holoGradient(main, 90)}"></div>
    </div>
    <div style="position:absolute;left:226px;top:96px;perspective:900px;mix-blend-mode:screen">
      ${bookImg(300, 'transform:rotateY(-16deg) rotateX(8deg) rotate(-2deg);transform-origin:left center')}
    </div>
    ${cardImg(104, 'position:absolute;left:296px;top:22px;transform:rotate(8deg)')}
  </div>`,
  join(PROMO, 'small-tile-440x280.png'),
  [440, 280],
);

console.log('Visuels du Store à jour dans store/screenshots et store/promo');
