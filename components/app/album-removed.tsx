import { Undo2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { albumRemovedItem } from '@/lib/album';
import type { OwnedCard } from '@/lib/types';
import { useCardViewer } from './card-viewer';
import { WmCard } from './wm-card';

/** Cartes écartées de l'album pour cette étiquette (stockage local), tenues à jour. */
export function useRemovedFromAlbum(tagId: string) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    albumRemovedItem.getValue().then((all) => setIds(all[tagId] ?? []));
    return albumRemovedItem.watch((all) => setIds(all?.[tagId] ?? []));
  }, [tagId]);
  return ids;
}

export async function setRemovedFromAlbum(tagId: string, update: (ids: string[]) => string[]) {
  const all = await albumRemovedItem.getValue();
  const next = [...new Set(update(all[tagId] ?? []))];
  const { [tagId]: _, ...rest } = all;
  await albumRemovedItem.setValue(next.length ? { ...rest, [tagId]: next } : rest);
}

/** Sous les suggestions : cartes retirées de l'album à la main, à remettre d'un clic. */
export function AlbumRemoved({ tagId, name, cards }: { tagId: string; name: string; cards: OwnedCard[] }) {
  const ids = useRemovedFromAlbum(tagId);
  const all = useCollection((s) => s.cards);
  const pending = useCollection((s) => s.pending);
  const stageIntoAlbum = useCollection((s) => s.stageIntoAlbum);
  const inAlbum = useMemo(() => new Set(cards.map((c) => c.cardId)), [cards]);
  const byId = useMemo(() => new Map(all.map((c) => [c.cardId, c])), [all]);
  const removed = ids.map((id) => byId.get(id)).filter((c): c is OwnedCard => Boolean(c) && !inAlbum.has(c!.cardId));

  // Une carte revenue dans l'album (ou plus dans la collection) sort de la liste.
  useEffect(() => {
    const stale = ids.filter((id) => !byId.has(id) || inAlbum.has(id));
    if (stale.length && byId.size) setRemovedFromAlbum(tagId, (list) => list.filter((id) => !stale.includes(id)));
  }, [ids, byId, inAlbum, tagId]);

  if (!removed.length) return null;

  const restore = (card: OwnedCard) => {
    stageIntoAlbum([card], { id: tagId, name });
    setRemovedFromAlbum(tagId, (list) => list.filter((id) => id !== card.cardId));
  };

  return (
    <section className="w-full space-y-3 rounded-3xl bg-white/[0.06] p-6 text-white ring-1 ring-white/10 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <XCircle className="size-4 text-rose-300" />
        <h3 className="font-semibold">Écartées</h3>
        <span className="text-sm text-white/50 tabular-nums">{removed.length}</span>
      </div>
      <p className="text-xs text-white/50">Retirées de l'album à la main. Elles ne sont plus proposées pour cet album ; « Remettre » les y replace.</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
        {removed.map((card) => {
          const unsent = pending[card.cardId]?.[tagId] === false;
          return (
            <li key={card.cardId} className="flex items-center gap-3 rounded-xl bg-white/[0.05] p-2">
              <button
                type="button"
                onClick={() => useCardViewer.getState().open(removed, removed.indexOf(card))}
                title={`${card.title} · voir en grand`}
                className="w-9 shrink-0 cursor-zoom-in grayscale-[60%] transition hover:grayscale-0"
              >
                <WmCard card={card} tilt={false} className="w-full" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{card.title}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-white/50">
                  {unsent && <span className="size-1.5 rounded-full bg-amber-400" />}
                  {unsent ? 'Retrait pas encore envoyé' : "Retirée de l'album"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => restore(card)}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs transition hover:bg-white/20"
              >
                <Undo2 className="size-3.5" /> Remettre
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
