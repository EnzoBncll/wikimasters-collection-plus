import { Loader2, Plus, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { recoDismissedItem, recommendForAlbum, type Recommendation } from '@/lib/related';
import type { OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useCardViewer } from './card-viewer';
import { WmCard } from './wm-card';

function RecoCard({ reco, onAdd, onDismiss, onOpen }: { reco: Recommendation; onAdd: () => void; onDismiss: () => void; onOpen: () => void }) {
  return (
    <div className="group relative w-full">
      <button type="button" onClick={onOpen} className="block w-full cursor-zoom-in" title={`${reco.card.title} · voir en grand`}>
        <WmCard card={reco.card} className="w-full" />
      </button>
      <div className="absolute top-2 right-2 z-50 flex gap-1.5">
        <button
          type="button"
          onClick={onDismiss}
          title="Ne plus proposer pour cet album"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100 hover:scale-110"
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          onClick={onAdd}
          title="Ajouter à l'album (pose l'étiquette)"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:scale-110"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {reco.reasons.map((r) => (
          <span key={r} className="truncate rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70" title={r}>
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Sous l'album : cartes déjà possédées qui ressemblent à celles de l'album, à y ajouter en un clic. */
export function AlbumRecommendations({
  tagId,
  name,
  description,
  cards,
  onBrowse,
}: {
  tagId: string;
  name: string;
  description: string;
  cards: OwnedCard[];
  /** Ouvre la fenêtre pour choisir parmi toutes ses cartes. */
  onBrowse: () => void;
}) {
  const all = useCollection((s) => s.cards);
  const version = useCollection((s) => s.version);
  const discardId = useCollection((s) => s.tradeTags?.discard?.id);
  const changeTags = useCollection((s) => s.changeTags);
  const facts = useSuggestions((s) => s.facts);
  const labels = useSuggestions((s) => s.labels);
  const enriching = useSuggestions((s) => s.enriching);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    recoDismissedItem.getValue().then((all) => setDismissed(all[tagId] ?? []));
  }, [tagId]);

  const recos = useMemo(
    () =>
      recommendForAlbum({
        album: { name, description, cards },
        all: discardId ? all.filter((c) => !c.tagIds.includes(discardId)) : all,
        facts,
        labels,
        exclude: new Set(dismissed),
      }),
    // version : les étiquettes des cartes sont modifiées en place.
    [name, description, cards, all, version, discardId, facts, labels, dismissed],
  );
  const unanalyzed = useMemo(() => all.filter((c) => !facts[c.cardId]).length, [all, facts]);

  const add = async (targets: OwnedCard[]) => {
    if (!targets.length) return;
    setBusy(true);
    try {
      await changeTags(targets, [{ tagId, on: true }], `« ${name} » · ${targets.length} carte(s)`);
    } finally {
      setBusy(false);
    }
  };
  const dismiss = async (card: OwnedCard) => {
    const next = [...dismissed, card.cardId];
    setDismissed(next);
    const stored = await recoDismissedItem.getValue();
    await recoDismissedItem.setValue({ ...stored, [tagId]: next });
  };
  const resetDismissed = async () => {
    setDismissed([]);
    const { [tagId]: _, ...rest } = await recoDismissedItem.getValue();
    await recoDismissedItem.setValue(rest);
  };

  return (
    <section className="w-full space-y-3 rounded-3xl bg-white/[0.06] p-6 text-white ring-1 ring-white/10 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <Wand2 className="size-4 text-emerald-300" />
        <h3 className="font-semibold">Cartes que tu as déjà et qui iraient bien ici</h3>
        <span className="text-sm text-white/50">{recos.length}</span>
        <button
          type="button"
          onClick={onBrowse}
          className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20"
        >
          <Plus className="size-3.5" /> Choisir parmi toutes mes cartes
        </button>
        {recos.length > 1 && (
          <button
            type="button"
            onClick={() => add(recos.map((r) => r.card))}
            disabled={busy}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold transition hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Tout ajouter
          </button>
        )}
      </div>
      <p className="text-xs text-white/50">
        D'après les mots du titre et de la description des cartes, leur thème (roi, reine et pharaon vont ensemble) et Wikidata (métier, nature, pays…).
        {dismissed.length > 0 && (
          <>
            {' '}
            <button type="button" onClick={resetDismissed} className="cursor-pointer underline underline-offset-2 hover:text-white">
              Revoir les {dismissed.length} carte(s) écartée(s)
            </button>
          </>
        )}
      </p>

      {recos.length ? (
        <div className={cn('grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4', busy && 'pointer-events-none opacity-60')}>
          {recos.map((reco, i) => (
            <RecoCard
              key={reco.card.cardId}
              reco={reco}
              onAdd={() => add([reco.card])}
              onDismiss={() => dismiss(reco.card)}
              onOpen={() => useCardViewer.getState().open(recos.map((r) => r.card), i)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-white/50">
          {cards.length ? 'Aucune autre carte de ta collection ne ressemble à celles de cet album.' : "Donne un nom parlant à l'album ou ajoutes-y quelques cartes pour avoir des recommandations."}
        </p>
      )}

      {unanalyzed > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          {enriching ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Analyse Wikidata… {enriching.done}/{enriching.total}
            </>
          ) : (
            <>
              {unanalyzed} carte(s) pas encore analysée(s) sur Wikidata : les recommandations se fient seulement à leurs mots.
              <button type="button" onClick={() => useSuggestions.getState().analyze()} className="cursor-pointer rounded-full bg-white/10 px-2.5 py-0.5 text-white/80 transition hover:bg-white/20">
                Analyser la collection
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}
