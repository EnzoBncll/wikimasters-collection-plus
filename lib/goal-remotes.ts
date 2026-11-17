import { accountSyncItem, isAccountSyncAvailable, syncAccount } from './account-sync';
import { driveSyncItem, isDriveAvailable, syncDrive } from './drive-sync';
import { applyBundle, goalBundleItem, rebuildBundle, sameBundle, type GoalBundle } from './goal-sync';
import { syncSiteVault } from './site-vault';
import { getSettings } from './store';

/**
 * Échange le paquet des albums à objectif avec les copies hors de Chrome : le coffre WikiMasters (réglage siteVault),
 * le serveur Collection+ lié au compte (si activé) et Google Drive (si activé). Tourne depuis l'app (la session
 * WikiMasters et la connexion Google y sont disponibles).
 */
let running: Promise<number> | null = null;

interface Remote {
  name: string;
  run: (bundle: GoalBundle) => Promise<GoalBundle>;
}

export function syncGoalRemotes({ interactive = false } = {}): Promise<number> {
  running ??= (async () => {
    try {
      const settings = await getSettings();
      const remotes: Remote[] = [];
      if (settings.siteVault) remotes.push({ name: 'coffre WikiMasters', run: syncSiteVault });
      if (isAccountSyncAvailable() && (await accountSyncItem.getValue()).enabled) remotes.push({ name: 'serveur Collection+', run: syncAccount });
      if ((await driveSyncItem.getValue()).enabled && isDriveAvailable()) remotes.push({ name: 'Google Drive', run: (b) => syncDrive(b, interactive) });
      if (!remotes.length) return 0;
      const local = await rebuildBundle();
      let merged = local;
      const seen: GoalBundle[] = [];
      for (const r of remotes) {
        merged = await r.run(merged).catch((e) => (console.warn(`[Collection+] ${r.name}`, e), merged));
        seen.push(merged);
      }
      // Une copie plus loin dans la liste avait du neuf : les précédentes le reçoivent aussi.
      for (let i = 0; i < remotes.length - 1; i++) {
        if (!sameBundle(seen[i]!, merged)) await remotes[i]!.run(merged).catch(() => merged);
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
