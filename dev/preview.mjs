// Sert la build (.output/chrome-mv3) avec la simulation dev/preview-shim.js injectée dans review.html.
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
      res.writeHead(200, { 'content-type': TYPES['.js'] }).end(await readFile(SHIM));
      return;
    }
    const file = join(ROOT, normalize(path === '/' ? '/review.html' : path));
    if (!file.startsWith(ROOT)) throw new Error('forbidden');
    let body = await readFile(file);
    if (file.endsWith('review.html')) body = body.toString().replace('<head>', '<head><script src="/__shim.js"></script>');
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
