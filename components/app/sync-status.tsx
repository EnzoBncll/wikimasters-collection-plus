import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { cn } from '@/lib/utils';

export function ago(ts: number) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}

/** Statut de synchronisation + bouton de rechargement complet (dans l'encoche de droite). */
export function SyncStatus() {
  const { syncing, syncProgress, syncedAt, error, sync } = useCollection();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const label = syncing
    ? syncProgress?.step === 'collection'
      ? `Page ${(syncProgress.page ?? 0) + 1} · ${syncProgress.cards} cartes`
      : syncProgress?.step === 'tags'
        ? 'Étiquettes…'
        : 'Vérification…'
    : error
      ? 'Hors ligne'
      : syncedAt
        ? ago(syncedAt)
        : '';

  return (
    <div className="flex h-8.5 items-center gap-2 text-xs">
      <span
        className={cn(
          'size-1.5 rounded-full',
          syncing ? 'animate-pulse bg-primary' : error ? 'bg-destructive' : 'bg-trade',
        )}
      />
      <span className="hidden text-frame-muted sm:inline" title={error ?? undefined}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => sync(true)}
        disabled={syncing}
        title="Recharger toute la collection depuis le site"
        className="flex size-7 cursor-pointer items-center justify-center rounded-full text-frame-muted transition hover:bg-frame-active hover:text-frame-foreground disabled:cursor-default"
      >
        <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} />
      </button>
    </div>
  );
}
