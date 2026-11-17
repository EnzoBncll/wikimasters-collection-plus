import { storage } from '#imports';
import { bareName } from './album-kind';
import { encodeAlbumCode } from './album-code';
import type { GoalAlbum } from './goal-albums';
import type { OwnedCard } from './types';

/**
 * Partage d'un album à objectif hors de l'extension :
 *  - une page HTML autonome et interactive (recherche, filtres, progression), qui s'ouvre partout sans rien installer ;
 *  - un PDF (la même page, mise en page pour l'impression, via « Enregistrer au format PDF » de Chrome) ;
 *  - un lien d'import : WikiMasters + « #collection-plus=CP1-… ». Avec Collection+ installée, le site propose
 *    d'ajouter l'album (entrypoints/wm.content/album-link.ts) ; sans, la page explique comment l'installer.
 * Le code CP1 (album-code.ts) contient la liste des cases, sans les cartes : les cartes possédées ne servent qu'à
 * l'affichage de la progression de celui qui partage.
 */

export const IMPORT_HASH = 'collection-plus=';
export const INSTALL_URL = 'https://github.com/EnzoBncll/wikimasters-collection-plus#installation';

export const importLink = (code: string) => `https://www.wiki-masters.com/collection#${IMPORT_HASH}${code}`;

/** Code reçu par un lien, en attente que l'app (vue Albums) le transforme en album. */
export const pendingAlbumCodeItem = storage.defineItem<string | null>('local:pendingAlbumCode', { fallback: null });

export interface ExportInput {
  name: string;
  color: string | null;
  goal: GoalAlbum;
  /** Case → carte possédée (matchEntries), pour la progression ; vide pour un album « à remplir ». */
  owned: Map<number, OwnedCard>;
}

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safeUrl = (u: string | null | undefined) => (u && /^https:\/\//.test(u) ? u : '');
const wikiUrl = (title: string) => `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

const RARITY_COLORS: Record<string, string> = { C: '#9ca3af', PC: '#4ade80', R: '#60a5fa', SR: '#c084fc', L: '#fbbf24', UR: '#f472b6' };

export async function buildAlbumHtml({ name, color, goal, owned }: ExportInput): Promise<{ html: string; code: string; filename: string }> {
  const code = await encodeAlbumCode(name, color, goal);
  const title = bareName(name);
  const accent = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#8b5cf6';
  const have = owned.size;
  const total = goal.entries.length;
  const pct = total ? Math.round((have / total) * 100) : 0;
  const link = importLink(code);
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  let section: string | null = null;
  const cells: string[] = [];
  goal.entries.forEach((e, i) => {
    if (e.section && e.section !== section) {
      section = e.section;
      cells.push(`<h2 class="sec">${esc(section)}</h2>`);
    }
    const card = owned.get(i);
    const img = safeUrl(card?.imageUrl) || safeUrl(e.thumbnail);
    const rar = card?.rarity ?? null;
    cells.push(
      `<a class="cell${card ? ' got' : ''}" href="${esc(wikiUrl(e.title))}" target="_blank" rel="noopener" data-q="${esc(`${e.title} ${e.description ?? ''}`.toLowerCase())}">` +
        `<span class="n">${i + 1}</span>` +
        (img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ph">${esc(e.title.slice(0, 1))}</span>`) +
        `<span class="t">${esc(e.title)}</span>` +
        (e.description ? `<span class="d">${esc(e.description)}</span>` : '') +
        (card ? `<span class="r" style="--rc:${RARITY_COLORS[rar ?? ''] ?? accent}">${esc(rar ?? '✓')}</span>` : '') +
        `</a>`,
    );
  });

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="WikiMasters Collection+">
<title>${esc(title)} · album WikiMasters</title>
<style>
:root{--a:${accent};--bg:#0f0e17;--fg:#f4f3fb;--mut:#a7a5bf;--card:#1a1826;--line:#2c2a3d}
@media (prefers-color-scheme:light){:root{--bg:#f7f6fb;--fg:#17151f;--mut:#5e5b72;--card:#fff;--line:#e3e1ee}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}
main{max-width:1100px;margin:0 auto;padding:28px 16px 48px}
header{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between;margin-bottom:18px}
h1{margin:0;font-size:30px;letter-spacing:-.02em}
.src{color:var(--mut);font-size:13px;margin-top:4px}
.prog{min-width:220px;flex:1;max-width:360px}
.bar{height:10px;border-radius:99px;background:var(--line);overflow:hidden}
.bar i{display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,var(--a),color-mix(in oklch,var(--a) 50%,#fff))}
.prog b{font-size:22px}.prog span{color:var(--mut);font-size:13px}
.cta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--card);margin-bottom:18px}
.cta p{margin:0;flex:1;min-width:240px;color:var(--mut);font-size:13px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:99px;border:1px solid var(--line);background:transparent;color:var(--fg);font:600 13px system-ui,sans-serif;text-decoration:none;cursor:pointer}
.btn.main{background:var(--a);border-color:var(--a);color:#fff}
.tools{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.tools input{flex:1;min-width:180px;padding:9px 14px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit}
.tools .btn[aria-pressed=true]{background:var(--fg);color:var(--bg)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.sec{grid-column:1/-1;margin:14px 0 2px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
.cell{position:relative;display:flex;flex-direction:column;gap:4px;padding:8px 8px 10px;border-radius:12px;border:1.5px dashed var(--line);color:inherit;text-decoration:none;background:color-mix(in oklch,var(--card) 60%,transparent);break-inside:avoid}
.cell.got{border:1.5px solid var(--a);background:var(--card)}
.cell img,.cell .ph{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:var(--line)}
.cell:not(.got) img{filter:grayscale(1);opacity:.45}
.ph{display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:var(--mut)}
.n{position:absolute;top:12px;left:12px;padding:1px 7px;border-radius:99px;background:rgb(0 0 0 / .6);color:#fff;font-size:11px;font-weight:700}
.r{position:absolute;top:12px;right:12px;padding:1px 7px;border-radius:99px;background:var(--rc);color:#111;font-size:11px;font-weight:800}
.t{font-weight:600;font-size:13px;line-height:1.25}
.d{color:var(--mut);font-size:11.5px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.code{display:none}
footer{margin-top:28px;color:var(--mut);font-size:12px}
footer a{color:inherit}
.hide{display:none!important}
@media print{
  :root{--bg:#fff;--fg:#111;--mut:#555;--card:#fff;--line:#ccc}
  @page{margin:12mm}
  main{padding:0;max-width:none}
  .tools,.cta .btn{display:none}
  .cta{break-inside:avoid}
  .code{display:block;margin-top:8px;font:9px/1.3 ui-monospace,monospace;word-break:break-all;color:#555}
  .grid{grid-template-columns:repeat(5,1fr);gap:6px}
  .cell{padding:5px}
  .hide{display:flex!important}
}
</style>
</head>
<body>
<main>
<header>
  <div><h1>${esc(title)}</h1><div class="src">Album à objectif WikiMasters · ${esc(goal.source.label)} · ${esc(date)}</div></div>
  <div class="prog"><b>${have}</b> <span>/ ${total} cases · ${pct} %</span><div class="bar"><i></i></div></div>
</header>
<section class="cta">
  <p><strong>Ajoute cet album à ta collection.</strong> Avec l'extension Collection+ installée, ouvre le lien : WikiMasters te propose de l'ajouter, et tes cartes s'y rangent toutes seules.
  <span class="code">Lien : <a href="${esc(link)}">${esc(link)}</a><br>Pas encore l'extension ? ${esc(INSTALL_URL)}</span></p>
  <a class="btn main" href="${esc(link)}">Ajouter à Collection+</a>
  <a class="btn" href="${esc(INSTALL_URL)}" target="_blank" rel="noopener">Installer Collection+</a>
  <button class="btn" id="copy" type="button">Copier le code</button>
  <button class="btn" id="print" type="button">PDF</button>
</section>
<div class="tools">
  <input id="q" type="search" placeholder="Chercher une case…">
  <button class="btn" data-f="all" aria-pressed="true">Toutes</button>
  <button class="btn" data-f="miss" aria-pressed="false">Manquantes (${total - have})</button>
  <button class="btn" data-f="got" aria-pressed="false">Obtenues (${have})</button>
</div>
<div class="grid" id="grid">${cells.join('')}</div>
<footer>Fait avec <a href="${esc(INSTALL_URL)}">WikiMasters Collection+</a>, extension non officielle. Titres et images : Wikipédia et WikiMasters.</footer>
<textarea id="cp1" hidden>${esc(code)}</textarea>
</main>
<script>
(function(){
  var q=document.getElementById('q'),f='all',cells=[].slice.call(document.querySelectorAll('.cell')),secs=[].slice.call(document.querySelectorAll('.sec'));
  function apply(){var s=q.value.trim().toLowerCase();cells.forEach(function(c){var ok=(f==='all'||(f==='got')===c.classList.contains('got'))&&(!s||c.dataset.q.indexOf(s)>=0);c.classList.toggle('hide',!ok)});
    secs.forEach(function(h){var n=h.nextElementSibling,any=false;while(n&&!n.classList.contains('sec')){if(!n.classList.contains('hide'))any=true;n=n.nextElementSibling}h.classList.toggle('hide',!any)})}
  q.addEventListener('input',apply);
  [].forEach.call(document.querySelectorAll('[data-f]'),function(b){b.addEventListener('click',function(){f=b.dataset.f;[].forEach.call(document.querySelectorAll('[data-f]'),function(x){x.setAttribute('aria-pressed',String(x===b))});apply()})});
  document.getElementById('copy').addEventListener('click',function(e){var t=document.getElementById('cp1').value;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){e.target.textContent='Code copié ✓'},function(){prompt('Copie ce code :',t)})});
  document.getElementById('print').addEventListener('click',function(){print()});
})();
</script>
</body>
</html>`;
  const filename = `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'album'} · Collection+.html`;
  return { html, code, filename };
}

/** Télécharge la page HTML de l'album. */
export async function downloadAlbumHtml(input: ExportInput) {
  const { html, filename } = await buildAlbumHtml(input);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * PDF : la même page, imprimée depuis un cadre caché (les scripts de la page n'y tournent pas, l'impression est
 * lancée d'ici). Chrome propose « Enregistrer au format PDF » ; les liens restent cliquables dans le PDF.
 */
export async function printAlbumPdf(input: ExportInput) {
  const { html } = await buildAlbumHtml(input);
  const frame = Object.assign(document.createElement('iframe'), { srcdoc: html, title: 'Impression de l’album' });
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  document.body.append(frame);
  await new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
  const doc = frame.contentDocument!;
  // Les images (cartes, miniatures Wikipédia) doivent être là avant l'impression ; 8 s au plus.
  const imgs = [...doc.images];
  imgs.forEach((img) => (img.loading = 'eager'));
  await Promise.race([
    Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => {
        img.addEventListener('load', r, { once: true });
        img.addEventListener('error', r, { once: true });
      })))),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  frame.contentWindow!.document.title = doc.title;
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 60_000);
}
