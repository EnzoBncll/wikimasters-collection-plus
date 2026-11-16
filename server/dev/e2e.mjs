// Bout en bout contre `pnpm dev` (+ `pnpm dev:auth`) : un profil écrit, un 2e profil du même joueur relit,
// un autre joueur ne voit rien, la suppression efface tout.
import assert from 'node:assert/strict';

const BASE = process.env.SYNC_URL ?? 'http://127.0.0.1:8787';
const ORIGIN = 'chrome-extension://npnhlblglinajejkkjcigeebgbogpbii';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** Deux « profils » (jetons différents) du même joueur, et un autre joueur. */
const token = (sub, n) => `eyJ${'x'.repeat(20)}.${b64({ sub, n, exp: 9e9 })}.sig${n}`;
const profileA = token('player-1', 1);
const profileB = token('player-1', 2);
const stranger = token('player-2', 3);

async function call(method, path, tok, body, origin = ORIGIN) {
  const res = await fetch(BASE + path, {
    method,
    headers: { origin, ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), cors: res.headers.get('access-control-allow-origin') };
}

const album = { c: 'CP1-AbCdEf_123-xyz', at: 1_700_000_000_000 };

await call('DELETE', '/v1/account', profileA);
await call('DELETE', '/v1/account', stranger);

let r = await call('GET', '/v1/albums', null);
assert.equal(r.status, 401, 'sans jeton');
r = await call('GET', '/v1/albums', profileA, null, 'https://evil.example');
assert.equal(r.status, 403, 'origine refusée');
assert.equal(r.cors, null);

r = await call('POST', '/v1/albums', profileA, { bundle: { v: 1, albums: { 'tag-1': album, 'tag-2': { ...album, at: album.at + 5 } }, gone: {} } });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.cors, ORIGIN);
console.log('✓ profil A écrit 2 albums');

r = await call('GET', '/v1/albums', profileB);
assert.deepEqual(Object.keys(r.body.bundle.albums).sort(), ['tag-1', 'tag-2']);
assert.equal(r.body.bundle.albums['tag-1'].c, album.c);
console.log('✓ profil B (autre jeton, même joueur) relit les 2 albums');

// B modifie tag-1 (plus récent), supprime tag-2 ; A envoie une vieille version de tag-1 : la plus récente gagne.
r = await call('POST', '/v1/albums', profileB, { bundle: { v: 1, albums: { 'tag-1': { c: 'CP1-NEW', at: album.at + 100 } }, gone: { 'tag-2': album.at + 100 } } });
r = await call('POST', '/v1/albums', profileA, { bundle: { v: 1, albums: { 'tag-1': album, 'tag-2': { ...album, at: album.at + 5 } }, gone: {} } });
assert.deepEqual(r.body.bundle, { v: 1, albums: { 'tag-1': { c: 'CP1-NEW', at: album.at + 100 } }, gone: { 'tag-2': album.at + 100 } });
console.log('✓ fusion album par album : le plus récent gagne, la suppression tient');

r = await call('GET', '/v1/albums', stranger);
assert.deepEqual(r.body.bundle.albums, {});
console.log('✓ un autre joueur ne voit rien');

r = await call('POST', '/v1/albums', profileA, { bundle: { v: 1, albums: { '../x': album }, gone: {} } });
assert.equal(r.status, 400);
r = await call('POST', '/v1/albums', profileA, { bundle: { v: 1, albums: { a: { c: 'pas un code', at: 1 } }, gone: {} } });
assert.equal(r.status, 400);
console.log('✓ paquets invalides refusés');

r = await call('DELETE', '/v1/account', profileB);
assert.equal(r.status, 200);
r = await call('GET', '/v1/albums', profileA);
assert.deepEqual(r.body.bundle, { v: 1, albums: {}, gone: {} });
console.log('✓ suppression du compte : plus rien');

let limited = false;
for (let i = 0; i < 40 && !limited; i++) limited = (await call('GET', '/v1/albums', stranger)).status === 429;
assert.ok(limited, 'limite de débit');
console.log('✓ limite de débit (429)');
console.log('Tout est bon.');
