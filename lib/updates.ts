import { storage } from '#imports';

/** Dépôt GitHub dont les Releases publient les nouvelles versions. */
export const REPO = 'EnzoBncll/wikimasters-collection-plus';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const CHECK_EVERY = 6 * 60 * 60 * 1000;

export interface UpdateInfo {
  checkedAt: number;
  latest: string | null;
  url: string;
  notes: string;
  /** Version minimale exigée, lue dans la note de la Release (ligne `min-version: x.y.z`). */
  minVersion?: string | null;
}

export const updateItem = storage.defineItem<UpdateInfo | null>('local:updateInfo', { fallback: null });

export const currentVersion = () => browser.runtime.getManifest().version;

/** « 1.2.10 » > « 1.2.9 ». */
export function isNewer(latest: string, current: string) {
  const a = latest.replace(/^v/, '').split('.').map(Number);
  const b = current.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** Interroge la dernière Release GitHub (au plus toutes les 6 h, sauf `force`). */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  const cached = await updateItem.getValue();
  if (!force && cached && Date.now() - cached.checkedAt < CHECK_EVERY) return cached;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = await response.json();
    const info: UpdateInfo = {
      checkedAt: Date.now(),
      latest: String(release.tag_name ?? '').replace(/^v/, '') || null,
      url: release.html_url ?? RELEASES_URL,
      notes: String(release.body ?? '').slice(0, 2000),
      minVersion: /min-version:\s*v?(\d+(?:\.\d+){1,2})/i.exec(String(release.body ?? ''))?.[1] ?? null,
    };
    await updateItem.setValue(info);
    return info;
  } catch {
    // Hors ligne ou dépôt pas encore publié : on réessaiera plus tard.
    return cached;
  }
}

/** Version plus récente disponible, sinon null. */
export function availableUpdate(info: UpdateInfo | null): UpdateInfo | null {
  return info?.latest && isNewer(info.latest, currentVersion()) ? info : null;
}

/** Installée depuis le Chrome Web Store (Chrome ajoute alors `update_url` au manifeste) : Chrome sait la mettre à jour seul. */
export const isStoreInstall = () => Boolean((browser.runtime.getManifest() as { update_url?: string }).update_url);

/** La version installée est sous le minimum exigé par la dernière Release : mise à jour obligatoire. */
export function forcedUpdate(info: UpdateInfo | null): UpdateInfo | null {
  return info?.minVersion && isNewer(info.minVersion, currentVersion()) ? info : null;
}

/** Une mise à jour du Store est téléchargée et attend un redémarrage de l'extension. */
export const updateReadyItem = storage.defineItem<string | null>('local:updateReady', { fallback: null });

/**
 * Demande à Chrome de chercher tout de suite une mise à jour sur le Store.
 * Renvoie « update_available » (elle s'installera au redémarrage de l'extension), « no_update » ou « throttled ».
 */
export async function requestStoreUpdate(): Promise<string> {
  try {
    const result: any = await (browser.runtime as any).requestUpdateCheck?.();
    const status = typeof result === 'string' ? result : result?.status;
    return status ?? 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/** Applique une mise à jour déjà téléchargée (recharge l'extension, ce qui ferme ses onglets). */
export const applyUpdateNow = () => browser.runtime.reload();
