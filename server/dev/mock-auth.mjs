// Faux service d'identité pour `wrangler dev` : imite Supabase /auth/v1/user.
// Le jeton est un JWT de test « x.<payload>.y » (comme dev/preview-shim.js) : on renvoie son champ `sub` comme id.
import { createServer } from 'node:http';

const PORT = Number(process.env.AUTH_PORT) || 8788;
createServer((req, res) => {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  let id = null;
  try {
    id = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).sub ?? null;
  } catch {}
  if (!req.headers.apikey || !id || !req.url.startsWith('/auth/v1/user')) {
    res.writeHead(401, { 'content-type': 'application/json' }).end('{"msg":"invalid JWT"}');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id, aud: 'authenticated' }));
}).listen(PORT, () => console.log(`Faux service d'identité : http://127.0.0.1:${PORT}/auth/v1/user`));
