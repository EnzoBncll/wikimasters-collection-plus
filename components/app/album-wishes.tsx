import { Heart, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { enrichCards, PROPS } from '@/lib/wikidata';
import type { OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { detectTheme, fetchThemeSuggestions, ownedIndex, wishAsCard, wishlistsItem, type WishItem } from '@/lib/wishlist';
import { useCardViewer } from './card-viewer';
import { WmCard } from './wm-card';

/** Au-delà, l'analyse Wikidata des cartes de l'album attend un clic (quelques secondes par tranche de 50). */
const AUTO_ANALYZE_MAX = 80;

function GhostCard({
  item,
  rank,
  best,
  wished,
  onToggle,
  onOpen,
}: {
  item: WishItem;
  rank?: number;
  best: number;
  wished: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const card = useMemo(() => wishAsCard(item), [item]);
  return (
    <div className="group relative w-full">
      <button type="button" onClick={onOpen} className="block w-full cursor-zoom-in" title={`${item.title} · voir en grand`}>
        <WmCard
          card={card}
          className={cn('w-full transition', !wished && 'opacity-80 saturate-[0.7] group-hover:opacity-100 group-hover:saturate-100')}
          fallbackFooter={
            <span className="flex w-full items-center gap-[2cqw] text-black/60" title={`Présent dans ${item.sitelinks} éditions de Wikipédia`}>
              <span className="h-[2cqw] flex-1 overflow-hidden rounded-full bg-black/10">
                <span className="block h-full rounded-full bg-black/45" style={{ width: `${Math.max(8, (item.sitelinks / best) * 100)}%` }} />
              </span>
              {item.sitelinks} langues
            </span>
          }
          badges={
            rank !== undefined && (
              <span className="rounded-[2.5cqw] bg-black/60 px-[2.5cqw] py-[1.2cqw] text-[5.5cqw] leading-none font-bold text-white">#{rank}</span>
            )
          }
        />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={wished}
        title={wished ? 'Retirer de la liste de souhaits' : 'Ajouter à la liste de souhaits'}
        className={cn(
          'absolute top-2 right-2 z-50 flex size-8 cursor-pointer items-center justify-center rounded-full shadow-lg backdrop-blur transition hover:scale-110',
          wished ? 'bg-rose-500 text-white' : 'bg-black/55 text-white opacity-0 group-hover:opacity-100',
        )}
      >
        {wished ? <Heart className="size-4 fill-current" /> : <Heart className="size-4" />}
      </button>
    </div>
  );
}

/** Sous l'album : liste de souhaits et meilleures cartes à ajouter selon le thème de l'album. */
export function AlbumWishes({ albumKey, cards }: { albumKey: string; cards: OwnedCard[] }) {
  const allCards = useCollection((s) => s.cards);
  const facts = useSuggestions((s) => s.facts);
  const labels = useSuggestions((s) => s.labels);
  const [wishes, setWishes] = useState<WishItem[]>([]);
  const [suggestions, setSuggestions] = useState<WishItem[] | null>(null);
  const [busy, setBusy] = useState<'analyze' | 'fetch' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    wishlistsItem.getValue().then((all) => setWishes(all[albumKey] ?? []));
    return wishlistsItem.watch((all) => setWishes(all?.[albumKey] ?? []));
  }, [albumKey]);

  const missing = useMemo(() => cards.filter((c) => !facts[c.cardId]), [cards, facts]);
  const theme = useMemo(() => detectTheme(cards, facts, labels), [cards, facts, labels]);

  const analyze = useCallback(async () => {
    setBusy('analyze');
    setError(null);
    try {
      const result = await enrichCards(cards);
      useSuggestions.setState({ facts: result.facts, labels: result.labels });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [cards]);

  const load = useCallback(
    async (force = false) => {
      if (!theme.length) return;
      setBusy('fetch');
      setError(null);
      try {
        const exclude = ownedIndex(allCards, useSuggestions.getState().facts);
        setSuggestions(await fetchThemeSuggestions(theme, exclude, { force }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [theme, allCards],
  );

  // Analyse automatique des petits albums, puis suggestions dès qu'un thème ressort.
  useEffect(() => {
    if (missing.length && missing.length <= AUTO_ANALYZE_MAX && !busy) analyze();
  }, [missing.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [theme.map((c) => c.value).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveWishes = async (next: WishItem[]) => {
    setWishes(next);
    const all = await wishlistsItem.getValue();
    await wishlistsItem.setValue({ ...all, [albumKey]: next });
  };
  const wishedIds = new Set(wishes.map((w) => w.qid));
  const toggle = (item: WishItem) => saveWishes(wishedIds.has(item.qid) ? wishes.filter((w) => w.qid !== item.qid) : [...wishes, item]);
  const open = (items: WishItem[], i: number) => useCardViewer.getState().open(items.map(wishAsCard), i);

  const shown = (suggestions ?? []).filter((s) => !wishedIds.has(s.qid));
  const best = Math.max(1, ...(suggestions ?? []).map((s) => s.sitelinks), ...wishes.map((w) => w.sitelinks));

  return (
    <div className="w-full space-y-8 rounded-3xl bg-white/[0.06] p-6 text-white ring-1 ring-white/10 backdrop-blur">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Heart className="size-4 fill-rose-500 text-rose-500" />
          <h3 className="font-semibold">Liste de souhaits</h3>
          <span className="text-sm text-white/50">{wishes.length}</span>
        </div>
        {wishes.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
            {wishes.map((item, i) => (
              <GhostCard key={item.qid} item={item} best={best} wished onToggle={() => toggle(item)} onOpen={() => open(wishes, i)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/50">Ajoute ici les cartes que tu cherches : clique le ♡ d'une suggestion ci-dessous.</p>
        )}
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
          {theme.length > 0 && (
            <button
              type="button"
              onClick={() => load(true)}
              disabled={Boolean(busy)}
              className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20 disabled:opacity-40"
            >
              <RefreshCw className={cn('size-3.5', busy === 'fetch' && 'animate-spin')} /> Actualiser
            </button>
          )}
        </div>

        {busy === 'analyze' ? (
          <p className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="size-4 animate-spin" /> Analyse Wikidata des cartes de l'album…
          </p>
        ) : missing.length > AUTO_ANALYZE_MAX && !theme.length ? (
          <button type="button" onClick={analyze} className="cursor-pointer rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
            Analyser les {missing.length} cartes de l'album
          </button>
        ) : !theme.length ? (
          <p className="text-sm text-white/50">
            Pas encore de thème commun : il faut quelques cartes qui se ressemblent (même métier, même pays, même genre…) pour proposer des suggestions.
          </p>
        ) : busy === 'fetch' && !suggestions ? (
          <p className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="size-4 animate-spin" /> Recherche des meilleures cartes…
          </p>
        ) : shown.length ? (
          <>
            <p className="text-xs text-white/50">Classées par notoriété (nombre d'éditions de Wikipédia) : plus un article est lu, plus la carte est rare.</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
              {shown.map((item, i) => (
                <GhostCard key={item.qid} item={item} rank={i + 1} best={best} wished={false} onToggle={() => toggle(item)} onOpen={() => open(shown, i)} />
              ))}
            </div>
          </>
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
  );
}
