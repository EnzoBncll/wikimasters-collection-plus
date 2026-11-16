import { storage } from '#imports';
import { normalizeBundle, type GoalBundle } from './goal-sync';
import { sessionToken } from './supabase';

/**
 * Copie des albums à objectif sur le serveur de Collection+ (server/, Cloudflare Workers + D1), rattachée au compte
 * WikiMasters : suit le joueur partout où il se connecte au site, sans compte Google ni synchro de Chrome.
 * Désactivée par défaut. Le jeton de session WikiMasters est envoyé à chaque échange, uniquement pour que le serveur
 * vérifie l'identité auprès du site ; le serveur ne le garde pas. Seuls les codes CP1 des albums (listes de cases,
 * sans les cartes possédées) sont stockés.
 */

const URL_BASE: string | undefined = import.meta.env.WXT_SYNC_URL?.replace(/\/+$/, '') || undefined;

export const accountSyncItem = storage.defineItem<{ enabled: boolean; lastAt: number | null; error: string | null; albums: number }>('local:accountSync', {
  fallback: { enabled: false, lastAt: null, error: null, albums: 0 },
});

/** L'adresse du serveur est fixée à la construction de l'extension (WXT_SYNC_URL) ; sans elle, l'option est cachée. */
export const isAccountSyncAvailable = () => Boolean(URL_BASE);

async function call(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
  if (!URL_BASE) throw new Error('Serveur de synchro non configuré dans cette version.');
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${await sessionToken()}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Serveur Collection+ : HTTP ${res.status}`);
  return json;
}

/** Envoie le paquet local ; le serveur le fusionne avec sa copie (le plus récent gagne) et renvoie le résultat. */
export async function syncAccount(local: GoalBundle): Promise<GoalBundle> {
  try {
    const { bundle } = await call('POST', '/v1/albums', { bundle: local });
    const merged = normalizeBundle(bundle);
    await accountSyncItem.setValue({ ...(await accountSyncItem.getValue()), lastAt: Date.now(), error: null, albums: Object.keys(merged.albums).length });
    return merged;
  } catch (error) {
    await accountSyncItem.setValue({ ...(await accountSyncItem.getValue()), error: (error as Error).message ?? String(error) });
    throw error;
  }
}

/** Efface du serveur tout ce qui concerne ce compte WikiMasters (albums et compte). */
export async function deleteAccountData(): Promise<void> {
  await call('DELETE', '/v1/account');
  await accountSyncItem.setValue({ ...(await accountSyncItem.getValue()), lastAt: null, error: null, albums: 0 });
}
