// Génère les captures du Chrome Web Store (store/screenshots, 1280×800) depuis l'aperçu simulé.
// Usage : pnpm store:assets   (construit l'extension, lance l'aperçu, capture avec Chromium headless en temps réel)
// « 02-albums-a-completer.png » est une capture de l'extension réelle (album « ◇ Départements français de 1811 ») : elle n'est pas régénérée.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'store', 'screenshots');
const TMP = join(tmpdir(), 'collection-plus-store');
const PORT = 5198;
const BASE = `http://localhost:${PORT}`;
const SIZE = [1280, 800];

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

/**
 * Capture en temps réel (protocole DevTools) : `setup` s'exécute dans la page une fois chargée (données simulées),
 * `wait` ms plus tard `before` (défilement…), puis la capture.
 */
async function shoot(url, file, { wait = 6000, setup = '', before = '', mobile = false } = {}) {
  const [width, height] = SIZE;
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, ['--headless', '--hide-scrollbars', '--disable-gpu', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, `--user-data-dir=${join(TMP, `p-${port}`)}`, 'about:blank'], { stdio: 'ignore' });
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
    const run = (expression) => send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 2500));
    if (setup) await run(setup);
    await new Promise((r) => setTimeout(r, wait));
    if (before) await run(before);
    await new Promise((r) => setTimeout(r, 600));
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(file, Buffer.from(data, 'base64'));
    ws.close();
    console.log('  ✓', file.replace(OUT + '/', ''));
  } finally {
    chrome.kill();
  }
}

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

await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

const server = spawn('node', [join(import.meta.dirname, 'preview.mjs')], { env: { ...process.env, PORT: String(PORT) } });
await new Promise((resolve) => server.stdout.once('data', resolve));
try {
  const app = (query, hash = '') => `${BASE}/review.html?static&${query}${hash}`;
  // 1. Le révélé sur WikiMasters : habillage, description, volets de rangement, statut au clavier.
  await shoot(`${BASE}/pulls?palette=nuit-violette&style=foil&open=0&rarities=SR,R,L,PC,C&nodesc`, join(OUT, '01-revele.png'), { wait: 12000 });
  // 3. Cartes : la collection, ses filtres et la barre de navigation.
  await shoot(app('theme=light&palette=nuit-violette'), join(OUT, '03-cartes.png'), { wait: 5000 });
  // 4. Statistiques de tirage, sous le bouton d'ouverture.
  await shoot(`${BASE}/pulls?palette=nuit-violette`, join(OUT, '04-statistiques.png'), {
    setup: SEED_PULLS,
    wait: 2500,
    before: `const h = document.querySelector('wmt-pack-stats'); h.shadowRoot.querySelector('[data-p="all"]').click(); h.scrollIntoView({ block: 'start' });`,
  });
  // 5. Souhaits : liste du site, amis qui ont la carte, souhaits des albums.
  await shoot(app('theme=dark&palette=nuit-violette&demo=groups', '#wishes'), join(OUT, '05-souhaits.png'), { wait: 5000 });
} finally {
  server.kill();
}
console.log('Captures du Store à jour dans store/screenshots');
