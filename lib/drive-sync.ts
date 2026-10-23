import { storage } from '#imports';
import { emptyBundle, mergeBundles, normalizeBundle, sameBundle, type GoalBundle } from './goal-sync';

/**
 * Copie des albums à objectif dans Google Drive, dans le dossier caché réservé à l'extension (appDataFolder :
 * invisible dans Drive, sans limite de taille). Suit le compte Google, même sur un profil Chrome sans synchro.
 * Utilise le même client OAuth que l'export Sheets (scope drive.appdata en plus).
 */

const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata'];
const FILE = 'collection-plus-albums.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export const driveSyncItem = storage.defineItem<{ enabled: boolean; lastAt: number | null; error: string | null }>('local:driveSync', {
  fallback: { enabled: false, lastAt: null, error: null },
});

export const isDriveAvailable = () => Boolean(browser.runtime.getManifest().oauth2?.client_id && browser.identity);

async function token(interactive: boolean): Promise<string> {
  const result = await browser.identity.getAuthToken({ interactive, scopes: SCOPES });
  const t = typeof result === 'string' ? result : result?.token;
  if (!t) throw new Error('Connexion Google refusée ou annulée.');
  return t;
}

async function call(t: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${t}`, ...init.headers } });
  if (res.status === 401) {
    await browser.identity.removeCachedAuthToken({ token: t });
    throw new Error('Jeton Google expiré, réessaie.');
  }
  if (!res.ok) throw new Error(`Google Drive : HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function findFile(t: string): Promise<string | null> {
  const q = encodeURIComponent(`name = '${FILE}'`);
  const json = await (await call(t, `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)`)).json();
  return json.files?.[0]?.id ?? null;
}

async function writeFile(t: string, id: string | null, bundle: GoalBundle) {
  const body = JSON.stringify(bundle);
  if (id) {
    await call(t, `${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body });
    return;
  }
  const boundary = `wmt${Date.now()}`;
  const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'] });
  const multipart = `--${boundary}\r\ncontent-type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  await call(t, `${UPLOAD}/files?uploadType=multipart`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: multipart });
}

/** Échange avec Drive : lit, fusionne, réécrit si besoin ; renvoie le paquet fusionné. `interactive` : peut ouvrir la fenêtre Google. */
export async function syncDrive(local: GoalBundle, interactive = false): Promise<GoalBundle> {
  try {
    const t = await token(interactive);
    const id = await findFile(t);
    const remote = id ? normalizeBundle(await (await call(t, `${API}/files/${id}?alt=media`)).json().catch(() => null)) : emptyBundle();
    const merged = mergeBundles(local, remote);
    if (!id || !sameBundle(merged, remote)) await writeFile(t, id, merged);
    await driveSyncItem.setValue({ ...(await driveSyncItem.getValue()), lastAt: Date.now(), error: null });
    return merged;
  } catch (error) {
    await driveSyncItem.setValue({ ...(await driveSyncItem.getValue()), error: (error as Error).message ?? String(error) });
    throw error;
  }
}
