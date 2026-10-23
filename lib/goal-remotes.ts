import { driveSyncItem, isDriveAvailable, syncDrive } from './drive-sync';
import { applyBundle, goalBundleItem, rebuildBundle, sameBundle } from './goal-sync';
import { syncSiteVault } from './site-vault';
import { getSettings } from './store';

/**
 * Échange le paquet des albums à objectif avec les copies hors de Chrome : le coffre WikiMasters (réglage siteVault)
 * et Google Drive (si activé). Tourne depuis l'app (la session WikiMasters et la connexion Google y sont disponibles).
 */
let running: Promise<number> | null = null;

export function syncGoalRemotes({ interactive = false } = {}): Promise<number> {
  running ??= (async () => {
    try {
      const settings = await getSettings();
      const drive = (await driveSyncItem.getValue()).enabled && isDriveAvailable();
      if (!settings.siteVault && !drive) return 0;
      const local = await rebuildBundle();
      let merged = local;
      if (settings.siteVault) merged = await syncSiteVault(merged).catch((e) => (console.warn('[Collection+] coffre WikiMasters', e), merged));
      if (drive) {
        const before = merged;
        merged = await syncDrive(merged, interactive).catch((e) => (console.warn('[Collection+] Google Drive', e), merged));
        // Drive avait du neuf : le coffre le reçoit aussi.
        if (settings.siteVault && !sameBundle(before, merged)) merged = await syncSiteVault(merged).catch(() => merged);
      }
      return sameBundle(merged, local) ? 0 : applyBundle(merged);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Après chaque modification locale des albums, un échange quelques secondes plus tard. */
export function watchGoalRemotes(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unwatch = goalBundleItem.watch(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncGoalRemotes(), 4000);
  });
  return () => (clearTimeout(timer), unwatch());
}
