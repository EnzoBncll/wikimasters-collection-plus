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
