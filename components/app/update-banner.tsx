import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { availableUpdate, checkForUpdate, currentVersion, type UpdateInfo } from '@/lib/updates';

/** Bandeau « nouvelle version disponible » (distribution via GitHub Releases, installation manuelle). */
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    checkForUpdate().then((i) => setInfo(availableUpdate(i)));
  }, []);

  return (
    <AnimatePresence>
      {info && !hidden && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="fixed right-4 bottom-4 z-[60] flex max-w-sm items-start gap-3 rounded-2xl border bg-popover p-4 text-sm text-popover-foreground shadow-xl"
        >
          <ArrowUpCircle className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1.5">
            <p className="font-semibold">
              Version {info.latest} disponible <span className="font-normal text-muted-foreground">(tu as {currentVersion()})</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Télécharge le zip, remplace le dossier de l'extension, puis clique « Recharger » dans chrome://extensions.
            </p>
            <a href={info.url} target="_blank" rel="noopener" className="inline-block text-xs font-semibold text-primary hover:underline">
              Voir la mise à jour →
            </a>
          </div>
          <button type="button" onClick={() => setHidden(true)} className="cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Masquer">
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
