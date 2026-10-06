import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus, RefreshCw, Wand2, X } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { albumSheetsItem, sheetText } from '@/lib/album-sheet';
import { recoDismissedItem, recommendForAlbum, type Recommendation } from '@/lib/related';
import type { OwnedCard } from '@/lib/types';
import { useCardViewer } from './card-viewer';
import { WmCard } from './wm-card';

/** Cartes affichées ; le calcul en garde davantage pour remplacer aussitôt celles qu'on ajoute. */
const SHOWN = 24;
/** Durée de l'animation de sortie de la carte ajoutée. */
const EXIT_MS = 260;
/** Délai sans clic avant de passer les ajouts à la boîte d'envoi (une seule mise à jour de l'album pour une rafale). */
const BATCH_MS = 600;

const RecoCard = memo(function RecoCard({
  reco,
  onAdd,
  onDismiss,
  onOpen,
}: {
  reco: Recommendation;
  onAdd: (card: OwnedCard) => void;
  onDismiss: (card: OwnedCard) => void;
  onOpen: (card: OwnedCard) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7, y: -40, pointerEvents: 'none', transition: { duration: EXIT_MS / 1000 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className="group relative w-full"
    >
      <button type="button" onClick={() => onOpen(reco.card)} className="block w-full cursor-zoom-in" title={`${reco.card.title} · voir en grand`}>
        <WmCard card={reco.card} className="w-full" />
      </button>
      <div className="absolute top-2 right-2 z-50 flex gap-1.5">
        <button
          type="button"
          onClick={() => onDismiss(reco.card)}
          title="Ne plus proposer pour cet album"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100 hover:scale-110"
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onAdd(reco.card)}
          title="Ajouter à l'album (en attente d'envoi)"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:scale-110 active:scale-95"
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
    </motion.div>
  );
});

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
  const discardId = useCollection((s) => s.tradeTags?.discard?.id);
  const stageIntoAlbum = useCollection((s) => s.stageIntoAlbum);
  const facts = useSuggestions((s) => s.facts);
  const labels = useSuggestions((s) => s.labels);
  const enriching = useSuggestions((s) => s.enriching);
  const [dismissed, setDismissed] = useState<string[]>([]);
  /** Cartes retirées de la liste dès le clic, avant que la collection ne suive. */
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    recoDismissedItem.getValue().then((stored) => setDismissed(stored[tagId] ?? []));
  }, [tagId]);

  // Fiche IA de l'album : ses mots-clés comptent comme la description.
  const [sheet, setSheet] = useState('');
  useEffect(() => {
    albumSheetsItem.getValue().then((all) => setSheet(sheetText(all[tagId])));
  }, [tagId]);

  // Liste figée pendant qu'on ajoute : pas de recalcul (ni de cartes qui changent de place) à chaque clic.
  // Elle se recalcule au changement de nom, de description, de faits Wikidata, ou sur « Actualiser ».
  const live = useRef({ all, cards, discardId });
  live.current = { all, cards, discardId };
  const snapshot = useMemo(() => {
    const { all, cards, discardId } = live.current;
    return recommendForAlbum({
      album: { name, description: `${description} ${sheet}`, cards },
      all: discardId ? all.filter((c) => !c.tagIds.includes(discardId)) : all,
      facts,
      labels,
      limit: SHOWN * 3,
    });
  }, [name, description, sheet, facts, labels, refresh, all.length, tagId]); // eslint-disable-line react-hooks/exhaustive-deps

  const inAlbum = useMemo(() => new Set(cards.map((c) => c.cardId)), [cards]);
  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);
  const available = snapshot.filter((r) => !inAlbum.has(r.card.cardId) && !dismissedSet.has(r.card.cardId));
  const remaining = available.filter((r) => !leaving.has(r.card.cardId));
  const shown = remaining.slice(0, SHOWN);

  // Réserve presque épuisée : on recalcule discrètement.
  useEffect(() => {
    if (snapshot.length >= SHOWN && available.length < SHOWN / 2) setRefresh((n) => n + 1);
  }, [available.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlers = useRef({ add: (_: OwnedCard[]) => {}, dismiss: (_: OwnedCard) => {}, open: (_: OwnedCard) => {} });
  // Clics rapides : la carte part aussitôt de la liste, les ajouts sont regroupés et mis dans la boîte d'envoi en une fois.
  const batch = useRef<{ cards: OwnedCard[]; timer?: number }>({ cards: [] });
  const flush = useRef(() => {});
  flush.current = () => {
    const { cards: targets } = batch.current;
    window.clearTimeout(batch.current.timer);
    batch.current = { cards: [] };
    if (!targets.length) return;
    stageIntoAlbum(targets, { id: tagId, name });
    setLeaving((prev) => {
      const next = new Set(prev);
      for (const c of targets) next.delete(c.cardId);
      return next;
    });
  };
  useEffect(() => () => flush.current(), []);
  handlers.current.add = (all) => {
    const queued = new Set(batch.current.cards.map((c) => c.cardId));
    const targets = all.filter((c) => !queued.has(c.cardId));
    if (!targets.length) return;
    setLeaving((prev) => new Set([...prev, ...targets.map((c) => c.cardId)]));
    batch.current.cards.push(...targets);
    window.clearTimeout(batch.current.timer);
    batch.current.timer = window.setTimeout(() => flush.current(), BATCH_MS);
  };
  handlers.current.dismiss = (card) => {
    setDismissed((prev) => {
      const next = [...prev, card.cardId];
      recoDismissedItem.getValue().then((stored) => recoDismissedItem.setValue({ ...stored, [tagId]: next }));
      return next;
    });
  };
  handlers.current.open = (card) => {
    const list = shown.map((r) => r.card);
    useCardViewer.getState().open(list, Math.max(0, list.findIndex((c) => c.cardId === card.cardId)));
  };
  // Références stables : les cartes mémoïsées ne se redessinent pas à chaque clic.
  const stable = useMemo(
    () => ({
      add: (card: OwnedCard) => handlers.current.add([card]),
      dismiss: (card: OwnedCard) => handlers.current.dismiss(card),
      open: (card: OwnedCard) => handlers.current.open(card),
    }),
    [],
  );

  const resetDismissed = async () => {
    setDismissed([]);
    const { [tagId]: _, ...rest } = await recoDismissedItem.getValue();
    await recoDismissedItem.setValue(rest);
  };
  const unanalyzed = useMemo(() => all.filter((c) => !facts[c.cardId]).length, [all.length, facts]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="w-full space-y-3 rounded-3xl bg-white/[0.06] p-6 text-white ring-1 ring-white/10 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <Wand2 className="size-4 text-emerald-300" />
        <h3 className="font-semibold">Cartes que tu as déjà et qui iraient bien ici</h3>
        <span className="text-sm text-white/50 tabular-nums">{remaining.length}</span>
        <button
          type="button"
          onClick={() => setRefresh((n) => n + 1)}
          title="Recalculer les recommandations"
          className="flex size-7 cursor-pointer items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onBrowse}
          className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20"
        >
          <Plus className="size-3.5" /> Choisir parmi toutes mes cartes
        </button>
        {shown.length > 1 && (
          <button
            type="button"
            onClick={() => handlers.current.add(shown.map((r) => r.card))}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold transition hover:bg-emerald-400 active:scale-95"
          >
            <Plus className="size-3.5" /> Tout ajouter ({shown.length})
          </button>
        )}
      </div>
      <p className="text-xs text-white/50">
        D'après les mots du titre et de la description des cartes, leur thème (roi, reine et pharaon vont ensemble) et Wikidata (métier, nature, pays…). Les ajouts
        vont dans la boîte d'envoi, en bas à gauche : clique autant de cartes que tu veux, puis envoie tout d'un coup.
        {dismissed.length > 0 && (
          <>
            {' '}
            <button type="button" onClick={resetDismissed} className="cursor-pointer underline underline-offset-2 hover:text-white">
              Revoir les {dismissed.length} carte(s) écartée(s)
            </button>
          </>
        )}
      </p>

      <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {shown.map((reco) => (
            <RecoCard key={reco.card.cardId} reco={reco} onAdd={stable.add} onDismiss={stable.dismiss} onOpen={stable.open} />
          ))}
        </AnimatePresence>
      </motion.div>
      {!shown.length && (
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
