import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Check, FolderInput, Heart, Loader2, RefreshCw, Search, Sparkles, Trash2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { enrichCards, PROPS, articleTitle } from '@/lib/wikidata';
import type { OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { detectTheme, fetchThemeSuggestions, ownedIndex, searchWishes, wishAsCard, wishlistsItem, type WishItem } from '@/lib/wishlist';
import { useCardViewer } from './card-viewer';
import { WmCard } from './wm-card';

/** Au-delà, l'analyse Wikidata des cartes de l'album attend un clic (quelques secondes par tranche de 50). */
const AUTO_ANALYZE_MAX = 80;

const norm = (t: string) => t.trim().toLowerCase();
const spring = { type: 'spring', stiffness: 420, damping: 34 } as const;

const GhostCard = memo(function GhostCard({
  item,
  rank,
  best,
  wished,
  owned,
  inAlbum,
  onToggle,
  onOpen,
  onFile,
}: {
  item: WishItem;
  rank?: number;
  best: number;
  wished: boolean;
  /** Carte de la collection correspondant à ce souhait, s'il est exaucé. */
  owned?: OwnedCard;
  inAlbum?: boolean;
  onToggle: (item: WishItem) => void;
  onOpen: (item: WishItem) => void;
  /** Range la carte obtenue dans l'album (absent quand ce n'est pas possible). */
  onFile?: (item: WishItem, card: OwnedCard) => void;
}) {
  const card = useMemo(() => owned ?? wishAsCard(item), [owned, item]);
  return (
    <motion.div
      layout
      layoutId={`wish-${item.qid}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, pointerEvents: 'none' }}
      transition={spring}
      className="group relative w-full"
    >
      <button type="button" onClick={() => onOpen(item)} className="block w-full cursor-zoom-in" title={`${item.title} · voir en grand`}>
        <WmCard
          card={card}
          className={cn('w-full transition', !wished && !owned && 'opacity-80 saturate-[0.7] group-hover:opacity-100 group-hover:saturate-100')}
          fallbackFooter={
            !owned && (
              <span className="flex w-full items-center gap-[2cqw] text-black/60" title={`Présent dans ${item.sitelinks} éditions de Wikipédia`}>
                <span className="h-[2cqw] flex-1 overflow-hidden rounded-full bg-black/10">
                  <span className="block h-full rounded-full bg-black/45" style={{ width: `${Math.max(8, (item.sitelinks / best) * 100)}%` }} />
                </span>
                {item.sitelinks} langues
              </span>
            )
          }
          badges={
            owned ? (
              <span className="flex items-center gap-[1cqw] rounded-[2.5cqw] bg-emerald-500 px-[2.5cqw] py-[1.2cqw] text-[5.5cqw] leading-none font-bold text-white">
                <Check className="size-[6cqw]" /> {inAlbum ? "Dans l'album" : 'Obtenue'}
              </span>
            ) : (
              rank !== undefined && (
                <span className="rounded-[2.5cqw] bg-black/60 px-[2.5cqw] py-[1.2cqw] text-[5.5cqw] leading-none font-bold text-white">#{rank}</span>
              )
            )
          }
        />
      </button>
      <div className="absolute top-2 right-2 z-50 flex gap-1.5">
        {owned && onFile && !inAlbum && (
          <button
            type="button"
            onClick={() => onFile(item, owned)}
            title="Ranger la carte obtenue dans l'album (en attente d'envoi) et la retirer des souhaits"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:scale-110 active:scale-95"
          >
            <FolderInput className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onToggle(item)}
          aria-pressed={wished}
          title={wished ? 'Retirer de la liste de souhaits' : 'Ajouter à la liste de souhaits'}
          className={cn(
            'flex size-8 cursor-pointer items-center justify-center rounded-full shadow-lg backdrop-blur transition hover:scale-110 active:scale-95',
            wished ? 'bg-rose-500 text-white' : 'bg-black/55 text-white/80 group-hover:text-white',
          )}
        >
          <Heart className={cn('size-4', wished && 'fill-current')} />
        </button>
      </div>
    </motion.div>
  );
});

/** Recherche libre d'un article à souhaiter, quand la carte voulue n'est pas dans les suggestions. */
function WishSearch({ wishedIds, isOwned, onAdd }: { wishedIds: Set<string>; isOwned: (item: WishItem) => boolean; onAdd: (item: WishItem) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      searchWishes(query, controller.signal)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((e) => !controller.signal.aborted && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !controller.signal.aborted && setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const add = (item: WishItem) => {
    onAdd(item);
    setQuery('');
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0] && !wishedIds.has(results[0].qid)) add(results[0]);
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              setQuery('');
            }
          }}
          placeholder="Ajouter un souhait : chercher un article Wikipédia…"
          className="h-9 w-full rounded-full bg-white/10 pr-9 pl-9 text-sm text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-white/30"
        />
        {loading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-white/50" />}
      </div>
      <AnimatePresence initial={false}>
        {query.trim().length >= 2 && (results.length > 0 || error) && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/10"
          >
            {error && <li className="px-4 py-3 text-sm text-rose-300">{error}</li>}
            {results.map((item) => {
              const wished = wishedIds.has(item.qid);
              const owned = isOwned(item);
              return (
                <li key={item.qid}>
                  <button
                    type="button"
                    disabled={wished}
                    onClick={() => add(item)}
                    className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition hover:bg-white/10 disabled:cursor-default disabled:opacity-50"
                  >
                    <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-white/10">
                      {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" className="size-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block truncate text-xs text-white/50">{item.description ?? '—'}</span>
                    </span>
                    {owned && <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">Déjà possédée</span>}
                    <span className="shrink-0 text-xs text-white/50 tabular-nums">{item.sitelinks ? `${item.sitelinks} langue${item.sitelinks > 1 ? 's' : ''}` : ''}</span>
                    <Heart className={cn('size-4 shrink-0', wished ? 'fill-rose-500 text-rose-500' : 'text-white/60')} />
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Sous l'album : liste de souhaits et meilleures cartes à ajouter selon le thème de l'album. */
export function AlbumWishes({ albumKey, cards, tagId, albumName }: { albumKey: string; cards: OwnedCard[]; tagId?: string; albumName?: string }) {
  const allCards = useCollection((s) => s.cards);
  const stageIntoAlbum = useCollection((s) => s.stageIntoAlbum);
  const facts = useSuggestions((s) => s.facts);
  const labels = useSuggestions((s) => s.labels);
  const [wishes, setWishes] = useState<WishItem[]>([]);
  const [suggestions, setSuggestions] = useState<WishItem[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    wishlistsItem.getValue().then((all) => setWishes(all[albumKey] ?? []));
    return wishlistsItem.watch((all) => setWishes(all?.[albumKey] ?? []));
  }, [albumKey]);

  const missing = useMemo(() => cards.filter((c) => !facts[c.cardId]), [cards, facts]);
  const theme = useMemo(() => detectTheme(cards, facts, labels), [cards, facts, labels]);
  const themeKey = theme.map((c) => `${c.prop}:${c.value}`).join();

  // Cartes possédées par élément Wikidata et par titre : repère les souhaits exaucés.
  const owned = useMemo(() => {
    const byQid = new Map<string, OwnedCard>();
    const byTitle = new Map<string, OwnedCard>();
    for (const card of allCards) {
      const qid = facts[card.cardId]?.qid;
      if (qid) byQid.set(qid, card);
      byTitle.set(norm(articleTitle(card)), card);
      byTitle.set(norm(card.title), card);
    }
    return { byQid, byTitle };
  }, [allCards, facts]);
  const ownedCard = useCallback((item: WishItem) => owned.byQid.get(item.qid) ?? owned.byTitle.get(norm(item.title)), [owned]);
  const inAlbum = useMemo(() => new Set(cards.map((c) => c.cardId)), [cards]);

  const analyze = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await enrichCards(cards);
      useSuggestions.setState({ facts: result.facts, labels: result.labels });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }, [cards]);

  const load = useCallback(
    async (force = false) => {
      if (!theme.length) return;
      setFetching(true);
      setError(null);
      try {
        const exclude = ownedIndex(useCollection.getState().cards, useSuggestions.getState().facts);
        setSuggestions(await fetchThemeSuggestions(theme, exclude, { force }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setFetching(false);
      }
    },
    [theme],
  );

  // Analyse automatique une seule fois à l'ouverture (pas à chaque carte ajoutée), puis suggestions dès qu'un thème ressort.
  const analyzedOnce = useRef(false);
  useEffect(() => {
    if (analyzedOnce.current || !missing.length || missing.length > AUTO_ANALYZE_MAX) return;
    analyzedOnce.current = true;
    analyze();
  }, [missing.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Écriture immédiate à l'écran, enregistrement ensuite.
  const saveWishes = useCallback(
    (update: (prev: WishItem[]) => WishItem[]) => {
      setWishes((prev) => {
        const next = update(prev);
        wishlistsItem.getValue().then((all) => wishlistsItem.setValue({ ...all, [albumKey]: next }));
        return next;
      });
    },
    [albumKey],
  );
  const toggle = useCallback(
    (item: WishItem) => saveWishes((prev) => (prev.some((w) => w.qid === item.qid) ? prev.filter((w) => w.qid !== item.qid) : [...prev, item])),
    [saveWishes],
  );
  const addWish = useCallback((item: WishItem) => saveWishes((prev) => (prev.some((w) => w.qid === item.qid) ? prev : [...prev, item])), [saveWishes]);
  const file = useCallback(
    (item: WishItem, card: OwnedCard) => {
      if (!tagId) return;
      saveWishes((prev) => prev.filter((w) => w.qid !== item.qid));
      stageIntoAlbum([card], { id: tagId, name: albumName ?? '' });
    },
    [tagId, albumName, saveWishes, stageIntoAlbum],
  );

  const wishedIds = useMemo(() => new Set(wishes.map((w) => w.qid)), [wishes]);
  const openRef = useRef<(item: WishItem) => void>(() => {});
  const shown = (suggestions ?? []).filter((s) => !wishedIds.has(s.qid) && !ownedCard(s));
  openRef.current = (item) => {
    const list = wishedIds.has(item.qid) ? wishes : shown;
    useCardViewer.getState().open(
      list.map((w) => ownedCard(w) ?? wishAsCard(w)),
      Math.max(0, list.findIndex((w) => w.qid === item.qid)),
    );
  };
  const open = useCallback((item: WishItem) => openRef.current(item), []);

  const obtained = wishes.filter((w) => ownedCard(w));
  const toFile = tagId ? obtained.filter((w) => !inAlbum.has(ownedCard(w)!.cardId)) : [];
  const best = Math.max(1, ...(suggestions ?? []).map((s) => s.sitelinks), ...wishes.map((w) => w.sitelinks));

  return (
    <LayoutGroup id={`wishes-${albumKey}`}>
      <div className="w-full space-y-8 rounded-3xl bg-white/[0.06] p-6 text-white ring-1 ring-white/10 backdrop-blur">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Heart className="size-4 fill-rose-500 text-rose-500" />
            <h3 className="font-semibold">Liste de souhaits</h3>
            <span className="text-sm text-white/50 tabular-nums">{wishes.length}</span>
            {obtained.length > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs text-emerald-300">
                {obtained.length} obtenue{obtained.length > 1 ? 's' : ''}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              {toFile.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const filed = new Set(toFile.map((w) => w.qid));
                    saveWishes((prev) => prev.filter((w) => !filed.has(w.qid)));
                    stageIntoAlbum(
                      toFile.map((w) => ownedCard(w)!),
                      { id: tagId!, name: albumName ?? '' },
                    );
                  }}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold transition hover:bg-emerald-400 active:scale-95"
                >
                  <FolderInput className="size-3.5" /> Ranger les {toFile.length} obtenue{toFile.length > 1 ? 's' : ''}
                </button>
              )}
              {obtained.length > 0 && (
                <button
                  type="button"
                  onClick={() => saveWishes((prev) => prev.filter((w) => !ownedCard(w)))}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20"
                >
                  <Trash2 className="size-3.5" /> Retirer les obtenues
                </button>
              )}
            </div>
          </div>

          <WishSearch wishedIds={wishedIds} isOwned={(item) => Boolean(ownedCard(item))} onAdd={addWish} />

          <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {wishes.map((item) => {
                const card = ownedCard(item);
                return (
                  <GhostCard
                    key={item.qid}
                    item={item}
                    best={best}
                    wished
                    owned={card}
                    inAlbum={card ? inAlbum.has(card.cardId) : false}
                    onToggle={toggle}
                    onOpen={open}
                    onFile={tagId ? file : undefined}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>
          {!wishes.length && <p className="text-sm text-white/50">Cherche un article ci-dessus ou clique le ♡ d'une suggestion ci-dessous. Une carte obtenue est repérée toute seule.</p>}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-4 text-amber-300" />
            <h3 className="font-semibold">Suggestions pour cet album</h3>
            {theme.map((c) => (
              <span key={c.prop} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/80" title={`${Math.round(c.share * 100)} % des cartes de l'album`}>
                {PROPS[c.prop]} : {c.label}
              </span>
            ))}
            {analyzing && (
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <Loader2 className="size-3.5 animate-spin" /> Analyse Wikidata…
              </span>
            )}
            {theme.length > 0 && (
              <button
                type="button"
                onClick={() => load(true)}
                disabled={fetching}
                className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20 disabled:opacity-40"
              >
                <RefreshCw className={cn('size-3.5', fetching && 'animate-spin')} /> Actualiser
              </button>
            )}
          </div>

          {shown.length ? (
            <>
              <p className="text-xs text-white/50">Classées par notoriété (nombre d'éditions de Wikipédia) : plus un article est lu, plus la carte est rare.</p>
              <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
                <AnimatePresence mode="popLayout" initial={false}>
                  {shown.map((item, i) => (
                    <GhostCard key={item.qid} item={item} rank={i + 1} best={best} wished={false} onToggle={toggle} onOpen={open} />
                  ))}
                </AnimatePresence>
              </motion.div>
            </>
          ) : missing.length > AUTO_ANALYZE_MAX && !theme.length && !analyzing ? (
            <button type="button" onClick={analyze} className="cursor-pointer rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
              Analyser les {missing.length} cartes de l'album
            </button>
          ) : fetching || analyzing ? (
            <p className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="size-4 animate-spin" /> Recherche des meilleures cartes…
            </p>
          ) : !theme.length ? (
            <p className="text-sm text-white/50">
              Pas encore de thème commun : il faut quelques cartes qui se ressemblent (même métier, même pays, même genre…) pour proposer des suggestions.
            </p>
          ) : (
            suggestions && <p className="text-sm text-white/50">Tu as déjà toutes les cartes les plus connues de ce thème.</p>
          )}
          {error && (
            <p className="flex items-center gap-2 text-sm text-rose-300">
              <X className="size-4" /> {error}
            </p>
          )}
        </section>
      </div>
    </LayoutGroup>
  );
}
