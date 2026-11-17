/**
 * Synchro des albums à objectif de Collection+, liée au compte WikiMasters (Cloudflare Workers + D1).
 *
 * Identité : l'extension envoie le jeton de session WikiMasters (en-tête Authorization). Il est vérifié une fois
 * auprès du service d'identité du site (Supabase /auth/v1/user), qui renvoie l'identifiant du joueur ; le jeton est
 * alors oublié (jamais écrit, jamais journalisé). L'identifiant lui-même n'est pas stocké : le compte est désigné
 * par HMAC(ACCOUNT_KEY, identifiant).
 *
 * Données : le même « paquet » que l'extension (lib/goal-sync.ts) — chaque album en code CP1 avec sa date de
 * modification, et les albums supprimés. Fusion album par album, le plus récent gagne.
 *
 * Routes (toutes sous /v1, jeton obligatoire) :
 *   GET    /v1/albums   → le paquet gardé pour ce compte
 *   POST   /v1/albums   → fusionne le paquet envoyé avec celui gardé, renvoie le résultat
 *   DELETE /v1/account  → efface tout ce qui concerne ce compte
 *   GET    /v1/health   → sans jeton : le service répond
 */

export interface Env {
  DB: D1Database;
  AUTH_URL: string;
  SUPABASE_ANON_KEY: string;
  ALLOWED_ORIGINS: string;
  ACCOUNT_KEY: string;
}

interface Bundle {
  v: 1;
  albums: Record<string, { c: string; at: number }>;
  gone: Record<string, number>;
}

/* ---------- Limites ---------- */

const MAX_BODY = 512 * 1024;
const MAX_ALBUMS = 500;
const MAX_GONE = 2000;
const MAX_CODE = 120_000;
/** Requêtes par minute et par compte (une synchro normale en fait une toutes les quelques secondes au plus). */
const PER_ACCOUNT_PER_MIN = 30;
/** Requêtes par minute et par adresse IP avant vérification du jeton (protège le service d'identité du site). */
const PER_IP_PER_MIN = 60;

const ALBUM_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CODE = /^CP1-[A-Za-z0-9_-]+$/;

/* ---------- Réponses ---------- */

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function allowedOrigin(env: Env, origin: string | null): boolean {
  if (!origin) return false;
  return env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((rule) => (rule.endsWith('*') ? origin.startsWith(rule.slice(0, -1)) : origin === rule));
}

function cors(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(origin ? cors(origin) : {}) },
  });
}

/* ---------- Débit avant identification (mémoire de l'instance, approximatif mais gratuit) ---------- */

const ipHits = new Map<string, { minute: number; n: number }>();

function checkIp(ip: string) {
  const minute = Math.floor(Date.now() / 60_000);
  const cur = ipHits.get(ip);
  if (!cur || cur.minute !== minute) {
    if (ipHits.size > 5000) ipHits.clear();
    ipHits.set(ip, { minute, n: 1 });
    return;
  }
  if (++cur.n > PER_IP_PER_MIN) throw new HttpError(429, 'Trop de requêtes, réessaie dans une minute.');
}

/* ---------- Identité ---------- */

async function hmacHex(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Vérifie le jeton auprès de WikiMasters et renvoie l'identifiant de compte (HMAC). Le jeton n'est pas gardé. */
async function accountFor(req: Request, env: Env): Promise<string> {
  if (!env.ACCOUNT_KEY) throw new HttpError(500, 'Serveur mal configuré (ACCOUNT_KEY manquant).');
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(auth)) throw new HttpError(401, 'Session WikiMasters manquante.');
  const res = await fetch(env.AUTH_URL, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: auth } });
  if (res.status === 401 || res.status === 403) throw new HttpError(401, 'Session WikiMasters expirée : recharge le site et réessaie.');
  if (!res.ok) throw new HttpError(502, `Vérification WikiMasters impossible (HTTP ${res.status}).`);
  const user = (await res.json().catch(() => null)) as { id?: unknown } | null;
  if (!user || typeof user.id !== 'string' || !user.id) throw new HttpError(502, 'Réponse inattendue de WikiMasters.');
  return hmacHex(env.ACCOUNT_KEY, `wikimasters:${user.id}`);
}

async function checkAccountRate(db: D1Database, account: string) {
  const minute = Math.floor(Date.now() / 60_000);
  const row = await db
    .prepare('INSERT INTO hits (account_id, minute, n) VALUES (?1, ?2, 1) ON CONFLICT (account_id, minute) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(account, minute)
    .first<{ n: number }>();
  // De temps en temps, on oublie les minutes passées.
  if (Math.random() < 0.02) await db.prepare('DELETE FROM hits WHERE minute < ?1').bind(minute - 5).run();
  if ((row?.n ?? 0) > PER_ACCOUNT_PER_MIN) throw new HttpError(429, 'Trop de synchros d’un coup, réessaie dans une minute.');
}

/* ---------- Paquet ---------- */

function parseBundle(v: unknown): Bundle {
  const bad = (why: string) => new HttpError(400, `Paquet refusé : ${why}.`);
  if (typeof v !== 'object' || v === null || (v as Bundle).v !== 1) throw bad('format inconnu');
  const { albums = {}, gone = {} } = v as Partial<Bundle>;
  if (typeof albums !== 'object' || typeof gone !== 'object' || albums === null || gone === null) throw bad('format inconnu');
  const out: Bundle = { v: 1, albums: {}, gone: {} };
  const ids = Object.keys(albums);
  if (ids.length > MAX_ALBUMS) throw bad(`plus de ${MAX_ALBUMS} albums`);
  for (const id of ids) {
    const a = (albums as Record<string, unknown>)[id] as { c?: unknown; at?: unknown } | null;
    if (!ALBUM_ID.test(id)) throw bad('identifiant d’album invalide');
    if (!a || typeof a.c !== 'string' || !CODE.test(a.c) || a.c.length > MAX_CODE) throw bad('code d’album invalide');
    if (typeof a.at !== 'number' || !Number.isFinite(a.at) || a.at < 0) throw bad('date invalide');
    out.albums[id] = { c: a.c, at: Math.floor(a.at) };
  }
  const goneIds = Object.keys(gone);
  if (goneIds.length > MAX_GONE) throw bad('trop d’albums supprimés');
  for (const id of goneIds) {
    const at = (gone as Record<string, unknown>)[id];
    if (!ALBUM_ID.test(id) || typeof at !== 'number' || !Number.isFinite(at) || at < 0) throw bad('suppression invalide');
    out.gone[id] = Math.floor(at);
  }
  return out;
}

/** Même règle que mergeBundles() de l'extension : album par album, le plus récent gagne. */
function mergeBundles(a: Bundle, b: Bundle): Bundle {
  const out: Bundle = { v: 1, albums: {}, gone: {} };
  for (const [id, at] of [...Object.entries(a.gone), ...Object.entries(b.gone)]) out.gone[id] = Math.max(out.gone[id] ?? 0, at);
  for (const src of [a, b]) {
    for (const [id, album] of Object.entries(src.albums)) {
      const cur = out.albums[id];
      if (!cur || album.at > cur.at) out.albums[id] = album;
    }
  }
  for (const [id, album] of Object.entries(out.albums)) {
    if ((out.gone[id] ?? 0) >= album.at) delete out.albums[id];
    else delete out.gone[id];
  }
  return out;
}

interface Row {
  album_id: string;
  code: string | null;
  at: number;
  gone_at: number | null;
}

async function readBundle(db: D1Database, account: string): Promise<{ bundle: Bundle; rows: Map<string, Row> }> {
  const { results } = await db.prepare('SELECT album_id, code, at, gone_at FROM albums WHERE account_id = ?1').bind(account).all<Row>();
  const bundle: Bundle = { v: 1, albums: {}, gone: {} };
  const rows = new Map<string, Row>();
  for (const r of results ?? []) {
    rows.set(r.album_id, r);
    if (r.code !== null) bundle.albums[r.album_id] = { c: r.code, at: r.at };
    else if (r.gone_at !== null) bundle.gone[r.album_id] = r.gone_at;
  }
  return { bundle, rows };
}

async function writeMerged(db: D1Database, account: string, incoming: Bundle) {
  const { bundle: stored, rows } = await readBundle(db, account);
  const merged = mergeBundles(stored, incoming);
  if (Object.keys(merged.gone).length > MAX_GONE || Object.keys(merged.albums).length > MAX_ALBUMS) throw new HttpError(413, 'Trop d’albums pour ce compte.');
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT INTO accounts (id, created_at, updated_at) VALUES (?1, ?2, ?2) ON CONFLICT (id) DO UPDATE SET updated_at = ?2').bind(account, now),
  ];
  const upsert = db.prepare(
    `INSERT INTO albums (account_id, album_id, code, at, gone_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (account_id, album_id) DO UPDATE SET code = ?3, at = ?4, gone_at = ?5, updated_at = ?6`,
  );
  for (const [id, a] of Object.entries(merged.albums)) {
    const r = rows.get(id);
    if (r && r.code === a.c && r.at === a.at && r.gone_at === null) continue;
    stmts.push(upsert.bind(account, id, a.c, a.at, null, now));
  }
  for (const [id, at] of Object.entries(merged.gone)) {
    const r = rows.get(id);
    if (r && r.code === null && r.gone_at === at) continue;
    stmts.push(upsert.bind(account, id, null, 0, at, now));
  }
  // Une seule transaction : tout ou rien.
  if (stmts.length > 1 || !rows.size) await db.batch(stmts);
  return merged;
}

/* ---------- Routes ---------- */

async function handle(req: Request, env: Env, origin: string): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/v1/health' && req.method === 'GET') return json({ ok: true }, 200, origin);

  const route = `${req.method} ${url.pathname}`;
  if (!['GET /v1/albums', 'POST /v1/albums', 'DELETE /v1/account'].includes(route)) throw new HttpError(404, 'Route inconnue.');

  checkIp(req.headers.get('cf-connecting-ip') ?? 'local');
  const account = await accountFor(req, env);
  await checkAccountRate(env.DB, account);

  if (route === 'GET /v1/albums') {
    const { bundle } = await readBundle(env.DB, account);
    return json({ bundle }, 200, origin);
  }
  if (route === 'POST /v1/albums') {
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > MAX_BODY) throw new HttpError(413, 'Paquet trop gros.');
    const text = await req.text();
    if (text.length > MAX_BODY) throw new HttpError(413, 'Paquet trop gros.');
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, 'JSON invalide.');
    }
    const merged = await writeMerged(env.DB, account, parseBundle((body as { bundle?: unknown })?.bundle));
    return json({ bundle: merged }, 200, origin);
  }
  // DELETE /v1/account : tout disparaît (albums, compte, compteurs de débit).
  await env.DB.batch([
    env.DB.prepare('DELETE FROM albums WHERE account_id = ?1').bind(account),
    env.DB.prepare('DELETE FROM follows WHERE follower_id = ?1').bind(account),
    env.DB.prepare('DELETE FROM hits WHERE account_id = ?1').bind(account),
    env.DB.prepare('DELETE FROM accounts WHERE id = ?1').bind(account),
  ]);
  return json({ deleted: true }, 200, origin);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('origin');
    const ok = allowedOrigin(env, origin);
    if (req.method === 'OPTIONS') return ok ? new Response(null, { status: 204, headers: cors(origin!) }) : new Response(null, { status: 403 });
    if (!ok) return json({ error: 'Origine non autorisée.' }, 403, null);
    try {
      return await handle(req, env, origin!);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, origin);
      // Pas de détail (ni en-têtes, ni corps) dans le journal : seulement le message d'erreur.
      console.error('erreur interne', (e as Error)?.message);
      return json({ error: 'Erreur interne du serveur.' }, 500, origin);
    }
  },
};
