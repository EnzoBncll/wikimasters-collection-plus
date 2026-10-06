import { Check, FolderPlus, Layers, Plus, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { toast } from '@/hooks/use-toast';
import { albumDescriptionsItem } from '@/lib/album';
import { sheetText, type AlbumSheet } from '@/lib/album-sheet';
import { kindOf } from '@/lib/album-kind';
import { consolidate, type Consolidation } from '@/lib/consolidate';
import { recoDismissedItem } from '@/lib/related';
import { systemTagIds } from '@/lib/trade';
import type { OwnedCard, SiteTag } from '@/lib/types';
import type { CardFacts } from '@/lib/wikidata';
import { cn } from '@/lib/utils';
import { useCardViewer } from './card-viewer';
import { useAlbumSheets } from './sheets-view';
import { WmCard } from './wm-card';

/** Cartes affichées par album avant « Voir plus ». */
const PER_ALBUM = 12;

const tagDot = (tag: SiteTag) => <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color ?? '#71717a' }} />;

function Reasons({ reasons }: { reasons: string[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r} className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title={r}>
          {r}
        </span>
      ))}
    </div>
  );
}

type CollectionState = ReturnType<typeof useCollection.getState>;

/** Recommandations fortes de tous les albums de collection (rangement exclu si l'option est active). */
function runConsolidation(
  { cards, tags, tradeTags, settings }: Pick<CollectionState, 'cards' | 'tags' | 'tradeTags' | 'settings'>,
  facts: Record<string, CardFacts>,
  labels: Record<string, string>,
  dismissed: Record<string, string[]>,
  notes: Record<string, string>,
  sheets: Record<string, AlbumSheet>,
): Consolidation {
  const systemIds = systemTagIds(tradeTags);
  const targets = tags.filter((t) => !systemIds.has(t.id) && !(settings.albumKinds && kindOf(t) === 'storage'));
  const byTag = new Map(targets.map((t) => [t.id, [] as OwnedCard[]]));
  for (const card of cards) for (const id of card.tagIds) byTag.get(id)?.push(card);
  const discardId = tradeTags?.discard?.id;
  return consolidate({
    // Description de chaque album : note libre + mots-clés de sa fiche IA.
    albums: targets.map((tag) => ({ tag, cards: byTag.get(tag.id)!, description: `${notes[tag.id] ?? ''} ${sheetText(sheets[tag.id])}`.trim() })),
    all: discardId ? cards.filter((c) => !c.tagIds.includes(discardId)) : cards,
    facts,
    labels,
    dismissed,
  });
}

/**
 * Nombre de cartes à ajouter par album (badges « +N » de la page Albums) et au total.
 * Calculé en différé, pour ne pas ralentir l'ouverture de la page.
 */
export function useImproveCounts() {
  const { cards, tags, tradeTags, settings, version } = useCollection();
  const facts = useSuggestions((s) => s.facts);
  const labels = useSuggestions((s) => s.labels);
  const sheets = useAlbumSheets();
  const [counts, setCounts] = useState<{ byTag: Map<string, number>; total: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const [dismissed, notes] = await Promise.all([recoDismissedItem.getValue(), albumDescriptionsItem.getValue()]);
      if (cancelled) return;
      const result = runConsolidation({ cards, tags, tradeTags, settings }, facts, labels, dismissed, notes, sheets);
      const byTag = new Map<string, number>();
      for (const g of result.albums) byTag.set(g.tag.id, g.matches.length);
      for (const m of result.multi) for (const x of m.matches) byTag.set(x.tag.id, (byTag.get(x.tag.id) ?? 0) + 1);
      setCounts({ byTag, total: result.multi.length + result.albums.reduce((n, g) => n + g.matches.length, 0) });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cards, tags, tradeTags, settings, version, facts, labels, sheets]);
  return counts;
}

/**
 * Consolider : recommandations fortes de tous les albums de collection, à valider en lot.
 * Les cartes qui conviennent à plusieurs albums sont mises à part : ici, là, ou les deux.
 */
export function ConsolidateView() {
  const { cards, tags, tradeTags, settings, version, stageIntoAlbum } = useCollection();
  const facts = useSuggestions((s) => s.facts);
  const labels = useSuggestions((s) => s.labels);
  const [dismissed, setDismissed] = useState<Record<string, string[]> | null>(null);
  const [notes, setNotes] = useState<Record<string, string> | null>(null);
  const sheets = useAlbumSheets();
  /** Paires « album:carte » déjà traitées (ajoutées ou écartées), masquées tout de suite. */
  const [done, setDone] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    recoDismissedItem.getValue().then(setDismissed);
    albumDescriptionsItem.getValue().then(setNotes);
  }, []);

  // Calcul figé pendant qu'on valide : il ne se refait qu'avec « Actualiser » ou de nouvelles données.
  const live = useRef({ cards, tags, tradeTags, settings });
  live.current = { cards, tags, tradeTags, settings };
  const result: Consolidation | null = useMemo(() => {
    if (!dismissed || !notes) return null;
    return runConsolidation(live.current, facts, labels, dismissed, notes, sheets);
  }, [dismissed, notes, sheets, facts, labels, refresh, tags.length, settings.albumKinds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Après « Actualiser », la collection a suivi : on repart d'une liste propre.
  useEffect(() => setDone(new Set()), [result]);

  const key = (tagId: string, cardId: string) => `${tagId}:${cardId}`;
  const markDone = (pairs: string[]) => setDone((prev) => new Set([...prev, ...pairs]));

  const add = (targets: OwnedCard[], tag: SiteTag) => {
    if (!targets.length) return;
    stageIntoAlbum(targets, { id: tag.id, name: tag.name });
    markDone(targets.map((c) => key(tag.id, c.cardId)));
  };

  const dismiss = async (targets: OwnedCard[], tag: SiteTag) => {
    const stored = await recoDismissedItem.getValue();
    const next = { ...stored, [tag.id]: [...new Set([...(stored[tag.id] ?? []), ...targets.map((c) => c.cardId)])] };
    await recoDismissedItem.setValue(next);
    markDone(targets.map((c) => key(tag.id, c.cardId)));
  };

  if (!result) return null;

  const multi = result.multi.filter((m) => m.matches.some((x) => !done.has(key(x.tag.id, m.card.cardId))) && !done.has(`multi:${m.card.cardId}`));
  const albums = result.albums
    .map((g) => ({ ...g, matches: g.matches.filter((m) => !done.has(key(g.tag.id, m.card.cardId))) }))
    .filter((g) => g.matches.length);
  const total = multi.length + albums.reduce((n, g) => n + g.matches.length, 0);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {total
            ? `${total} carte${total > 1 ? 's' : ''} que tu possèdes ${total > 1 ? 'vont' : 'va'} clairement dans un de tes albums`
            : 'Rien de net à proposer : tes albums sont à jour.'}
          {settings.albumKinds && ' · albums de rangement exclus'}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setRefresh((n) => n + 1)}>
            <RefreshCw className="size-4" /> Actualiser
          </Button>
        </div>
      </div>

      {multi.length > 0 && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Layers className="size-3.5" /> Plusieurs albums possibles · {multi.length}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {multi.map(({ card, matches }) => {
              const open = matches.filter((m) => !done.has(key(m.tag.id, card.cardId)));
              return (
                <div key={card.cardId} className="flex gap-3 rounded-2xl border bg-card p-3">
                  <button type="button" className="w-24 shrink-0 cursor-zoom-in" onClick={() => useCardViewer.getState().open([card], 0)}>
                    <WmCard card={card} tilt={false} className="w-full" />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="truncate text-sm font-semibold" title={card.title}>
                      {card.title}
                    </p>
                    {open.map((m) => (
                      <button
                        key={m.tag.id}
                        type="button"
                        onClick={() => add([card], m.tag)}
                        title={m.reasons.join(' · ')}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 text-left text-xs transition hover:bg-muted"
                      >
                        {tagDot(m.tag)}
                        <span className="min-w-0 flex-1 truncate">{m.tag.name}</span>
                        <Plus className="size-3.5 text-emerald-500" />
                      </button>
                    ))}
                    <div className="mt-auto flex gap-1.5 pt-1">
                      {open.length > 1 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 flex-1 rounded-full text-xs"
                          onClick={() => {
                            for (const m of open) add([card], m.tag);
                            toast(`« ${card.title} » ajoutée à ${open.length} albums`, 'success');
                          }}
                        >
                          <Check className="size-3.5" /> Tous
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-full text-xs"
                        onClick={async () => {
                          for (const m of open) await dismiss([card], m.tag);
                          markDone([`multi:${card.cardId}`]);
                        }}
                      >
                        <X className="size-3.5" /> Aucun
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {albums.map(({ tag, matches }) => {
        const showAll = expanded.has(tag.id);
        const shown = showAll ? matches : matches.slice(0, PER_ALBUM);
        return (
          <section key={tag.id} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {tagDot(tag)} {tag.name} · {matches.length}
              </h2>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => dismiss(matches.map((m) => m.card), tag)}>
                  <X className="size-4" /> Tout écarter
                </Button>
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    add(
                      matches.map((m) => m.card),
                      tag,
                    );
                    toast(`${matches.length} carte${matches.length > 1 ? 's' : ''} ajoutée${matches.length > 1 ? 's' : ''} à « ${tag.name} »`, 'success');
                  }}
                >
                  <FolderPlus className="size-4" /> Tout ajouter
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
              {shown.map(({ card, reasons }, i) => (
                <div key={card.cardId} className="group relative">
                  <button
                    type="button"
                    className="block w-full cursor-zoom-in"
                    onClick={() =>
                      useCardViewer.getState().open(
                        shown.map((m) => m.card),
                        i,
                      )
                    }
                  >
                    <WmCard card={card} className="w-full" />
                  </button>
                  <div className="absolute top-2 right-2 z-50 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => dismiss([card], tag)}
                      title="Ne plus proposer pour cet album"
                      className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100 hover:scale-110"
                    >
                      <X className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => add([card], tag)}
                      title="Ajouter à l'album (en attente d'envoi)"
                      className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:scale-110 active:scale-95"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  <Reasons reasons={reasons} />
                </div>
              ))}
            </div>
            {matches.length > PER_ALBUM && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => new Set(showAll ? [...prev].filter((id) => id !== tag.id) : [...prev, tag.id]))}
                className={cn('cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline')}
              >
                {showAll ? 'Voir moins' : `Voir les ${matches.length - PER_ALBUM} autres`}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
