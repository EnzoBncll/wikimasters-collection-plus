import { AlertTriangle, Check, Heart, Loader2, Sparkles, Square, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCollection } from '@/hooks/use-collection';
import { toast } from '@/hooks/use-toast';
import { freshCopies, planCard, runDiscards, type DiscardPlanItem, type DiscardProgress } from '@/lib/discard';
import type { CopyInfo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { cardImage } from './card-image';
import { RARITY_BG } from './rarity';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

type Phase = 'loading' | 'ready' | 'running' | 'done';

/**
 * Récapitulatif avant envoi quand des cartes sont marquées Discard :
 * shiny et favoris relus sur le site, un exemplaire toujours gardé, défausse définitive après confirmation.
 */
export function DiscardDialog({ open, tagChanges, onClose }: { open: boolean; tagChanges: number; onClose: () => void }) {
  const discardMarked = useCollection((s) => s.discardMarked);
  const pushPending = useCollection((s) => s.pushPending);
  const finishDiscards = useCollection((s) => s.finishDiscards);
  const [phase, setPhase] = useState<Phase>('loading');
  const [plan, setPlan] = useState<DiscardPlanItem[]>([]);
  const [keptOnly, setKeptOnly] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DiscardProgress | null>(null);
  const [result, setResult] = useState<{ done: number; error: string | null } | null>(null);
  const stop = useRef(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase('loading');
    setResult(null);
    setProgress(null);
    setLoadError(null);
    stop.current = false;
    setStopping(false);
    const marked = discardMarked();
    freshCopies(marked.flatMap((c) => c.ownedIds))
      .catch((error): Record<string, CopyInfo> => {
        // Sans relecture, le détail en cache sert de référence ; on le signale.
        setLoadError(error instanceof Error ? error.message : String(error));
        return {};
      })
      .then((fresh) => {
        if (cancelled) return;
        const items = marked.map((card) => planCard(card, { ...card.copies, ...fresh }));
        setPlan(items.filter((i) => i.units.length > 0));
        setKeptOnly(items.filter((i) => i.units.length === 0).length);
        setPhase('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [open, discardMarked]);

  const units = useMemo(() => plan.reduce((n, i) => n + i.units.length, 0), [plan]);

  const run = async (withDiscards: boolean) => {
    if (tagChanges) await pushPending();
    if (!withDiscards || !units) {
      onClose();
      return;
    }
    setPhase('running');
    const out = await runDiscards(plan, { onProgress: setProgress, shouldStop: () => stop.current });
    setResult(out);
    setPhase('done');
    if (out.done) {
      toast(`${plural(out.done, 'exemplaire')} défaussé${out.done > 1 ? 's' : ''} sur WikiMasters`, out.error ? 'error' : 'success');
      await finishDiscards([...out.discarded.keys()]);
    }
  };

  const busy = phase === 'running';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent showCloseButton={!busy} className="max-h-[85vh] gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-5 text-discard" /> {phase === 'done' ? 'Défausse terminée' : 'Récapitulatif avant envoi'}
          </DialogTitle>
          <DialogDescription>
            {tagChanges > 0 && phase !== 'done' && `${plural(tagChanges, 'modification')} d'étiquettes et de statuts, puis `}
            {phase === 'done'
              ? `${plural(result?.done ?? 0, 'exemplaire')} défaussé${(result?.done ?? 0) > 1 ? 's' : ''} sur WikiMasters.`
              : phase === 'loading'
              ? 'lecture de tes exemplaires sur WikiMasters…'
              : units
                ? `${plural(units, 'exemplaire')} à défausser sur ${plural(plan.length, 'carte')}.`
                : 'aucun exemplaire à défausser.'}
          </DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {phase !== 'loading' && plan.length > 0 && (
          <ul className="-mx-2 max-h-72 space-y-1 overflow-y-auto px-2">
            {plan.map(({ card, units: u, protectedCount, kept }) => (
              <li key={card.cardId} className="flex items-center gap-3 rounded-xl bg-muted/60 px-2.5 py-2">
                <img src={cardImage(card)} alt="" className="h-10 w-7 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {card.rarity && <span className={cn('rounded px-1 text-[10px] font-bold text-zinc-900', RARITY_BG[card.rarity])}>{card.rarity}</span>}
                    <span className="truncate">{card.title}</span>
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    garde {kept}
                    {protectedCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Sparkles className="size-3" />
                        <Heart className="-ml-0.5 size-3" /> {protectedCount} protégé{protectedCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-discard tabular-nums">−{u.length}</span>
              </li>
            ))}
          </ul>
        )}

        {phase === 'ready' && (
          <div className="space-y-2 text-xs text-muted-foreground">
            {keptOnly > 0 && <p>{plural(keptOnly, 'carte')} marquée{keptOnly > 1 ? 's' : ''} Discard n'a plus qu'un exemplaire (ou que des shiny / favoris) : rien à défausser.</p>}
            {loadError && <p className="text-amber-700 dark:text-amber-300">Relecture impossible ({loadError}) : le détail en cache est utilisé.</p>}
            {units > 0 && (
              <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>
                  C'est définitif. Tu gardes toujours un exemplaire de chaque carte, et les shiny et favoris ne sont jamais défaussés. Une défausse par seconde, arrêt
                  possible à tout moment.
                </span>
              </p>
            )}
          </div>
        )}

        {(phase === 'running' || phase === 'done') && progress && (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-discard transition-[width] duration-500" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {phase === 'done'
                ? result?.error
                  ? `Arrêté après ${plural(result.done, 'défausse')} : ${result.error}`
                  : `${plural(result?.done ?? 0, 'exemplaire')} défaussé${(result?.done ?? 0) > 1 ? 's' : ''}.`
                : (progress.error ?? `${progress.done} / ${progress.total} · ${progress.current ?? ''}`)}
            </p>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {phase === 'ready' && (
            <>
              <Button variant="outline" onClick={onClose}>
                Annuler
              </Button>
              {tagChanges > 0 && units > 0 && (
                <Button variant="outline" onClick={() => run(false)}>
                  Envoyer sans défausser
                </Button>
              )}
              <Button variant={units ? 'destructive' : 'default'} onClick={() => run(true)} disabled={!units && !tagChanges}>
                {units ? <Trash2 className="size-4" /> : <Check className="size-4" />}
                {units ? `Défausser ${plural(units, 'exemplaire')}${tagChanges ? ' et envoyer' : ''}` : 'Envoyer'}
              </Button>
            </>
          )}
          {phase === 'running' && (
            <Button variant="outline" onClick={() => ((stop.current = true), setStopping(true))} disabled={stopping}>
              <Square className="size-3.5" /> {stopping ? 'Arrêt…' : 'Arrêter'}
            </Button>
          )}
          {phase === 'done' && <Button onClick={onClose}>Fermer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
