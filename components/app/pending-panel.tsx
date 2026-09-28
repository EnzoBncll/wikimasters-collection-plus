import { Loader2, Send, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { systemTagIds } from '@/lib/trade';
import { cn } from '@/lib/utils';

/** Modifications en attente et bouton d'envoi au site (une requête à la fois). */
export function PendingPanel({ className, compact }: { className?: string; compact?: boolean }) {
  const { pending, tradeTags, job, pushPending, discardPending } = useCollection();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const entries = Object.values(pending);
  const systemIds = systemTagIds(tradeTags);
  const statusCards = entries.filter((e) => Object.keys(e).some((id) => systemIds.has(id))).length;
  const tagCards = entries.filter((e) => Object.keys(e).some((id) => !systemIds.has(id))).length;
  const sending = job?.label === 'Envoi sur WikiMasters';

  useEffect(() => {
    if (!confirmDiscard) return;
    const t = setTimeout(() => setConfirmDiscard(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDiscard]);

  if (!entries.length && !sending) return null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={pushPending}
        disabled={Boolean(job)}
        className={cn('flex h-9 cursor-pointer items-center gap-2 rounded-full bg-amber-400 px-3.5 text-sm font-semibold text-zinc-900 shadow transition hover:bg-amber-300 disabled:opacity-60', className)}
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {sending ? `${job!.done}/${job!.total}` : `Envoyer · ${entries.length}`}
      </button>
    );
  }

  return (
    <div className={cn('space-y-2.5 rounded-xl border border-amber-400/50 bg-amber-400/10 p-3', className)}>
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-2 rounded-full bg-amber-400" />
          {entries.length} carte{entries.length > 1 ? 's' : ''} modifiée{entries.length > 1 ? 's' : ''}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[statusCards && `${statusCards} statut${statusCards > 1 ? 's' : ''}`, tagCards && `${tagCards} avec étiquettes`].filter(Boolean).join(' · ') || 'Envoi en cours'}
          {' · pas encore sur WikiMasters'}
        </p>
      </div>
      {sending ? (
        <div className="space-y-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${job!.total ? (job!.done / job!.total) * 100 : 0}%` }} />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Envoi calme, lot {job!.done}/{job!.total}…
          </p>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={pushPending}
            disabled={Boolean(job)}
            title="Envoyer toutes les modifications sur WikiMasters, une requête à la fois"
            className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-amber-400 text-xs font-semibold text-zinc-900 transition hover:bg-amber-300 disabled:opacity-50"
          >
            <Send className="size-3.5" /> Envoyer
          </button>
          <button
            type="button"
            onClick={() => (confirmDiscard ? (discardPending(), setConfirmDiscard(false)) : setConfirmDiscard(true))}
            title="Annuler toutes les modifications en attente"
            className={cn(
              'flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium transition',
              confirmDiscard ? 'bg-destructive text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Undo2 className="size-3.5" /> {confirmDiscard && 'Sûr ?'}
          </button>
        </div>
      )}
    </div>
  );
}
