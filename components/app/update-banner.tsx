import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpCircle, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  applyUpdateNow,
  availableUpdate,
  checkForUpdate,
  currentVersion,
  forcedUpdate,
  isStoreInstall,
  requestStoreUpdate,
  updateReadyItem,
  type UpdateInfo,
} from '@/lib/updates';

/**
 * Nouvelle version disponible :
 *  - Chrome Web Store : Chrome la télécharge ; on propose de l'appliquer tout de suite (redémarrage de l'extension) ;
 *  - GitHub Releases (installation manuelle) : lien vers le zip.
 * Si la dernière Release exige une version minimale (`min-version: x.y.z` dans sa note), la fenêtre devient bloquante.
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [state, setState] = useState<'idle' | 'checking' | 'waiting' | 'none'>('idle');
  const store = isStoreInstall();

  useEffect(() => {
    void checkForUpdate().then(setInfo);
    void updateReadyItem.getValue().then((v) => setReady(v && v !== currentVersion() ? v : null));
    return updateReadyItem.watch((v) => setReady(v && v !== currentVersion() ? v : null));
  }, []);

  const available = availableUpdate(info);
  const forced = forcedUpdate(info);
  const latest = ready ?? available?.latest ?? null;
  if (!latest && !forced) return null;

  const updateNow = async () => {
    if (ready) return applyUpdateNow();
    setState('checking');
    const status = await requestStoreUpdate();
    // Chrome télécharge la mise à jour : onUpdateAvailable remplira updateReady, qui fera apparaître « Redémarrer ».
    setState(status === 'update_available' ? 'waiting' : 'none');
  };

  const action = store ? (
    <button
      type="button"
      onClick={updateNow}
      disabled={state === 'checking' || state === 'waiting'}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
      {state === 'checking' || state === 'waiting' ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {ready ? 'Redémarrer pour mettre à jour' : state === 'waiting' ? 'Téléchargement…' : 'Mettre à jour maintenant'}
    </button>
  ) : (
    <a href={(forced ?? available)?.url} target="_blank" rel="noopener" className="inline-block text-xs font-semibold text-primary hover:underline">
      Télécharger la mise à jour →
    </a>
  );

  const help = store
    ? ready
      ? 'La mise à jour est téléchargée : l’extension va redémarrer (ses onglets se ferment, rien n’est perdu).'
      : state === 'none'
        ? 'Chrome ne l’a pas encore reçue du Store. Réessaie dans quelques minutes, ou ouvre chrome://extensions, active le mode développeur et clique « Mettre à jour ».'
        : 'Chrome l’installe tout seul, mais tu peux l’appliquer tout de suite.'
    : 'Télécharge le zip, remplace le dossier de l’extension, puis clique « Recharger » dans chrome://extensions.';

  if (forced && !ready) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="forced-update-title">
        <div className="max-w-md space-y-3 rounded-2xl border bg-popover p-6 text-sm text-popover-foreground shadow-2xl">
          <ArrowUpCircle className="size-8 text-primary" />
          <h2 id="forced-update-title" className="text-lg font-semibold">
            Mise à jour obligatoire
          </h2>
          <p className="text-muted-foreground">
            Ta version ({currentVersion()}) n’est plus compatible : passe à la {forced.latest} pour continuer à utiliser Collection+.
          </p>
          <p className="text-xs text-muted-foreground">{help}</p>
          {action}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="fixed right-4 bottom-4 z-[60] flex max-w-sm items-start gap-3 rounded-2xl border bg-popover p-4 text-sm text-popover-foreground shadow-xl"
        >
          <ArrowUpCircle className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1.5">
            <p className="font-semibold">
              Version {latest} disponible <span className="font-normal text-muted-foreground">(tu as {currentVersion()})</span>
            </p>
            <p className="text-xs text-muted-foreground">{help}</p>
            {action}
            {available?.url && store && (
              <a href={available.url} target="_blank" rel="noopener" className="block text-xs text-muted-foreground hover:underline">
                Voir les nouveautés
              </a>
            )}
          </div>
          <button type="button" onClick={() => setHidden(true)} className="cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Masquer">
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
