import { sleep } from './queue';
import { SITE_ORIGIN, transport } from './transport';

export const SUPABASE_URL = 'https://cyrxjeppjqsxxjayfrur.supabase.co';
/** Clé publique « anon » du site (présente dans son JS client, pas un secret). */
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5cnhqZXBwanFzeHhqYXlmcnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODAzMzksImV4cCI6MjA4OTQ1NjMzOX0.BZluyXygNxuQGDPxFX1zG5i-cqp10CVK-8GGtuak4Rg';
const AUTH_KEY = 'sb-cyrxjeppjqsxxjayfrur-auth-token';

interface Session {
  accessToken: string;
  userId: string;
  expiresAt: number;
}

/**
 * Lit la session Supabase du site (cookie supabase-ssr, éventuellement découpé en .0/.1…).
 * Le client du site rafraîchit lui-même le jeton : on le relit à chaque appel, sans jamais le stocker.
 */
async function readSession(): Promise<Session | null> {
  const cookies = await transport().cookies();

  let raw = cookies.get(AUTH_KEY) ?? '';
  if (!raw) {
    for (let i = 0; cookies.has(`${AUTH_KEY}.${i}`); i++) raw += cookies.get(`${AUTH_KEY}.${i}`);
  }
  if (!raw && location.origin === SITE_ORIGIN) raw = localStorage.getItem(AUTH_KEY) ?? '';
  if (!raw) return null;

  try {
    const json = raw.startsWith('base64-') ? base64UrlDecode(raw.slice(7)) : raw;
    const session = JSON.parse(json);
    const accessToken: string = session.access_token ?? session.currentSession?.access_token;
    if (!accessToken) return null;
    const payload = JSON.parse(base64UrlDecode(accessToken.split('.')[1] ?? ''));
    return { accessToken, userId: payload.sub, expiresAt: (payload.exp ?? 0) * 1000 };
  } catch {
    return null;
  }
}

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

/** Attend un jeton valide (le site le rafraîchit automatiquement quand il expire). */
async function getSession(): Promise<Session> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const session = await readSession();
    if (session && session.expiresAt - Date.now() > 15_000) return session;
    await sleep(1000);
  }
  throw new Error('Session WikiMasters introuvable ou expirée : recharge la page (F5) et reconnecte-toi si besoin.');
}

export async function currentUserId(): Promise<string> {
  return (await getSession()).userId;
}

/** Requête PostgREST authentifiée comme l'utilisateur connecté, avec retry sur 429 / 5xx. */
export async function rest<T = unknown>(
  path: string,
  { method = 'GET', body, prefer, range }: { method?: string; body?: unknown; prefer?: string; range?: [number, number] } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { accessToken } = await getSession();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json', 'content-profile': 'public' } : { 'accept-profile': 'public' }),
        ...(prefer ? { prefer } : {}),
        ...(range ? { 'range-unit': 'items', range: `${range[0]}-${range[1]}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.ok) {
      const text = await response.text();
      return (text ? JSON.parse(text) : null) as T;
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= 4) {
      const detail = await response.text().catch(() => '');
      throw Object.assign(new Error(`${method} ${path.split('?')[0]} : HTTP ${response.status} ${detail.slice(0, 200)}`), {
        status: response.status,
      });
    }
    await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
  }
}

/** Récupère toutes les lignes d'une requête PostgREST, page par page. */
export async function restAll<T>(path: string, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await rest<T[]>(path, { range: [from, from + pageSize - 1] });
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
