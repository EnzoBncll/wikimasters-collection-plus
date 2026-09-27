// Génère les PNG de l'icône (public/icon) à partir de lib/brand-icon.ts, via Chromium headless.
// Usage : pnpm icons   (CHROME=/chemin/vers/chrome pour choisir le navigateur)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { brandIconSvg } from '../lib/brand-icon.ts';
import { DEFAULT_PALETTE, getPalette, PALETTES } from '../lib/palettes.ts';

const OUT = join(import.meta.dirname, '..', 'public', 'icon');

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

// [fichier, palette, taille, version épurée]
const jobs = [];
const main = getPalette(DEFAULT_PALETTE);
for (const size of [16, 32]) jobs.push([`${size}.png`, main, size, true]);
for (const size of [48, 96, 128]) jobs.push([`${size}.png`, main, size, false]);
for (const palette of PALETTES) for (const size of [16, 32]) jobs.push([`themes/${palette.id}-${size}.png`, palette, size, true]);

const page = `<!doctype html><body><pre id="out"></pre><script>
const jobs = ${JSON.stringify(jobs.map(([file, palette, size, small]) => ({ file, size, svg: brandIconSvg(palette, { small }) })))};
Promise.all(jobs.map((job) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = job.size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, job.size, job.size);
    resolve([job.file, canvas.toDataURL('image/png').split(',')[1]]);
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(job.svg);
}))).then((r) => { document.getElementById('out').textContent = JSON.stringify(r); });
</script></body>`;

const html = join(tmpdir(), 'collection-plus-icons.html');
await writeFile(html, page);
const dom = execFileSync(findChrome(), ['--headless', '--disable-gpu', '--virtual-time-budget=5000', '--dump-dom', `file://${html}`], {
  maxBuffer: 64 * 1024 * 1024,
}).toString();
const json = /<pre id="out">(.*)<\/pre>/s.exec(dom)?.[1];
if (!json) throw new Error('Rendu vide');

await mkdir(join(OUT, 'themes'), { recursive: true });
for (const [file, base64] of JSON.parse(json.replaceAll('&quot;', '"'))) {
  await writeFile(join(OUT, file), Buffer.from(base64, 'base64'));
}
console.log(`${jobs.length} icônes écrites dans public/icon`);
