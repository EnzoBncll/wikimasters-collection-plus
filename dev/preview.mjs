// Sert la build (.output/chrome-mv3) avec la simulation dev/preview-shim.js injectée dans review.html et popup.html.
// /pulls, /collection, /marketplace… : banc d'essai des scripts de contenu sur une imitation du site (dev/site-*.js).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '.output', 'chrome-mv3');
const SHIM = join(import.meta.dirname, 'preview-shim.js');
const PORT = Number(process.env.PORT) || 5178;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (path === '/__shim.js') {
      // Version simulée = version du projet : pas de bandeau « nouvelle version » sur les captures.
      const { version } = JSON.parse(await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
      res.writeHead(200, { 'content-type': TYPES['.js'] }).end((await readFile(SHIM, 'utf8')).replace("version: '0.1.0'", `version: '${version}'`));
      return;
    }
    if (path === '/draft' || /^\/draft-[a-z]+$/.test(path)) {
      const file = path === '/draft' ? 'draft-reveal.html' : `${path.slice(1)}.html`;
      res.writeHead(200, { 'content-type': TYPES['.html'] }).end(await readFile(join(import.meta.dirname, file), 'utf8'));
      return;
    }
    if (path === '/__site-shim.js' || path === '/__site-mock.js') {
      res.writeHead(200, { 'content-type': TYPES['.js'] }).end(await readFile(join(import.meta.dirname, path.slice(3)), 'utf8'));
      return;
    }
    if (/^\/(pulls|collection|global-collection|marketplace|trades)(\/|$)/.test(path)) {
      // Même ordre que dans Chrome : interception au démarrage, page du site, puis scripts de page et de contenu.
      const scripts = ['/__site-shim.js', '/content-scripts/intercept.js', '/__site-mock.js', '/content-scripts/page.js', '/content-scripts/wm.js'];
      res.writeHead(200, { 'content-type': TYPES['.html'] }).end(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>WikiMasters (banc d'essai)</title></head><body>${scripts.map((s) => `<script src="${s}"></script>`).join('')}</body></html>`,
      );
      return;
    }
    const file = join(ROOT, normalize(path === '/' ? '/review.html' : path));
    if (!file.startsWith(ROOT)) throw new Error('forbidden');
    let body = await readFile(file);
    if (/(review|popup)\.html$/.test(file)) body = body.toString().replace('<head>', '<head><script src="/__shim.js"></script>');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
})
  .on('error', (error) => {
    if (error.code !== 'EADDRINUSE') throw error;
    // Un aperçu tourne déjà : il relit les fichiers à chaque requête, la nouvelle build est donc servie.
    console.log(`Aperçu déjà lancé sur http://localhost:${PORT}/ — recharge la page pour voir la nouvelle build.`);
  })
  .listen(PORT, () => console.log(`Aperçu Collection+ : http://localhost:${PORT}/`));
