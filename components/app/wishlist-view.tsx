import { CircleCheck, Heart, Loader2, RefreshCw, Search, Trash2, Upload, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/hooks/use-collection';
import { toast } from '@/hooks/use-toast';
import {
  addWish,
  catalogAsCard,
  fetchSiteWishlist,
  findCatalogCard,
  removeWish,
  searchCatalog,
  type CatalogCard,
  type SiteWishlist,
} from '@/lib/site-wishlist';
import { RARITY_ORDER } from '@/lib/types';
import { cn } from '@/lib/utils';
import { articleTitle } from '@/lib/wikidata';
import { wishlistsItem, type WishItem } from '@/lib/wishlist';
import { useCardViewer } from './card-viewer';
import { WmCard } from './wm-card';

/**
 * Page Souhaits : la liste de souhaits de WikiMasters (la même que le cœur du site, partagée entre tes appareils),
 * avec les amis qui ont chaque carte, une recherche dans le catalogue, et les souhaits notés sous tes albums.
 */

type Filter = 'all' | 'missing' | 'friends';

const titleKey = (t: string) => t.replace(/_/g, ' ').trim().toLowerCase();
const rarityRank = (c: CatalogCard) => (c.rarity ? RARITY_ORDER.indexOf(c.rarity) : 99);

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex shrink-0 rounded-full border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition',
            value === o.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function HeartButton({ on, busy, onClick, label }: { on: boolean; busy?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className={cn(
        'flex size-8 cursor-pointer items-center justify-center rounded-full border shadow-sm backdrop-blur transition hover:scale-110 disabled:cursor-progress disabled:opacity-60',
        on ? 'border-transparent bg-[image:var(--holo)] text-zinc-900' : 'bg-background/80 text-foreground',
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Heart className="size-4" fill={on ? 'currentColor' : 'none'} />}
    </button>
  );
}

export function WishlistView() {
  const { cards, tags } = useCollection();
  const [list, setList] = useState<SiteWishlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [albumWishes, setAlbumWishes] = useState<Record<string, WishItem[]>>({});

  const ownedIds = useMemo(() => new Set(cards.filter((c) => c.count > 0).map((c) => c.cardId)), [cards]);
  const ownedTitles = useMemo(() => new Set(cards.filter((c) => c.count > 0).flatMap((c) => [titleKey(c.title), titleKey(articleTitle(c))])), [cards]);
  const isOwned = useCallback((c: CatalogCard) => ownedIds.has(c.cardId) || Boolean(list?.owned.has(c.cardId)), [ownedIds, list]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setList(await fetchSiteWishlist());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    void wishlistsItem.getValue().then((v) => setAlbumWishes(v ?? {}));
    return wishlistsItem.watch((v) => setAlbumWishes(v ?? {}));
  }, [load]);

  const wishedIds = useMemo(() => new Set(list?.cards.map((c) => c.cardId)), [list]);
  const wishedTitles = useMemo(() => new Set(list?.cards.map((c) => titleKey(c.title))), [list]);

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(id));
    try {
      await fn();
    } catch (e) {
      toast(`Liste de souhaits : ${String((e as Error)?.message ?? e)}`, 'error');
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(id);
        return next;
      });
    }
  };

  /** Ajoute ou retire une carte de la liste du site (un clic = une écriture, comme le cœur du site). */
  const toggle = (card: CatalogCard) =>
    withBusy(card.cardId, async () => {
      if (wishedIds.has(card.cardId)) {
        await removeWish(card.cardId);
        setList((l) => l && { ...l, cards: l.cards.filter((c) => c.cardId !== card.cardId) });
        toast(`« ${card.title} » retirée des souhaits`, 'success');
      } else {
        await addWish(card.cardId);
        setList((l) => l && { ...l, cards: [...l.cards, card] });
        toast(`« ${card.title} » ajoutée aux souhaits`, 'success');
      }
    });

  const shown = useMemo(() => {
    const all = [...(list?.cards ?? [])].sort((a, b) => Number(isOwned(a)) - Number(isOwned(b)) || rarityRank(a) - rarityRank(b) || a.title.localeCompare(b.title, 'fr'));
    if (filter === 'missing') return all.filter((c) => !isOwned(c));
    if (filter === 'friends') return all.filter((c) => !isOwned(c) && list?.friends[c.cardId]?.length);
    return all;
  }, [list, filter, isOwned]);
  const missing = list?.cards.filter((c) => !isOwned(c)).length ?? 0;
  const atFriends = list?.cards.filter((c) => !isOwned(c) && list.friends[c.cardId]?.length).length ?? 0;

  /* ---------- Souhaits des albums ---------- */
  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const albumGroups = Object.entries(albumWishes)
    .filter(([, items]) => items.length)
    .map(([key, items]) => ({ key, name: key === 'none' ? 'Sans étiquette' : (tagName.get(key) ?? 'Album supprimé'), items }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const removeAlbumWish = async (key: string, qid: string) => {
    const all = await wishlistsItem.getValue();
    await wishlistsItem.setValue({ ...all, [key]: (all[key] ?? []).filter((w) => w.qid !== qid) });
  };
  const sendToSite = (item: WishItem) =>
    withBusy(`album:${item.qid}`, async () => {
      const card = await findCatalogCard(item.title);
      if (!card) {
        toast(`« ${item.title} » n'existe pas encore en carte sur WikiMasters`, 'error');
        return;
      }
      await addWish(card.cardId);
      setList((l) => l && { ...l, cards: [...l.cards.filter((c) => c.cardId !== card.cardId), card] });
      toast(`« ${card.title} » ajoutée aux souhaits WikiMasters`, 'success');
    });

  /* ---------- Souhaits déjà exaucés ---------- */
  const ownedOnSite = list?.cards.filter(isOwned) ?? [];
  const ownedInAlbums = albumGroups.flatMap((g) => g.items.filter((w) => ownedTitles.has(titleKey(w.title))).map((w) => ({ key: g.key, item: w })));
  const doneCount = ownedOnSite.length + ownedInAlbums.length;
  const [cleaning, setCleaning] = useState(false);
  /** Retire d'un coup les cartes obtenues : de la liste du site (une écriture par carte) et des listes d'albums. */
  const removeObtained = async () => {
    setCleaning(true);
    let removed = 0;
    try {
      for (const card of ownedOnSite) {
        await removeWish(card.cardId);
        removed++;
      }
      if (ownedInAlbums.length) {
        const all = await wishlistsItem.getValue();
        const next = { ...all };
        for (const { key, item } of ownedInAlbums) next[key] = (next[key] ?? []).filter((w) => w.qid !== item.qid);
        await wishlistsItem.setValue(next);
      }
      setList((l) => l && { ...l, cards: l.cards.filter((c) => !isOwned(c)) });
      toast(`${removed + ownedInAlbums.length} souhait(s) exaucé(s) retiré(s)`, 'success');
    } catch (e) {
      toast(`Liste de souhaits : ${String((e as Error)?.message ?? e)}`, 'error');
      void load();
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-64 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Souhaits</h1>
          <p className="text-sm text-muted-foreground">
            Ta liste de souhaits WikiMasters (le cœur du site, la même sur tous tes appareils), les amis qui ont ces cartes, et les souhaits notés sous tes albums.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Actualiser
        </Button>
      </header>

      {doneCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3.5">
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              <b>{doneCount} souhait{doneCount > 1 ? 's' : ''} exaucé{doneCount > 1 ? 's' : ''}</b> : tu as déjà{' '}
              {[
                ownedOnSite.length && `${ownedOnSite.length} carte${ownedOnSite.length > 1 ? 's' : ''} de ta liste WikiMasters`,
                ownedInAlbums.length && `${ownedInAlbums.length} souhait${ownedInAlbums.length > 1 ? 's' : ''} d'album`,
              ]
                .filter(Boolean)
                .join(' et ')}
              . Les retirer ?
            </span>
          </p>
          <Button size="sm" onClick={removeObtained} disabled={cleaning}>
            {cleaning ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Retirer {doneCount > 1 ? 'les' : 'la'} carte{doneCount > 1 ? 's' : ''} obtenue{doneCount > 1 ? 's' : ''}
          </Button>
        </div>
      )}

      <CatalogSearch wishedIds={wishedIds} isOwned={isOwned} busy={busy} onToggle={toggle} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Heart className="size-3.5" /> Sur WikiMasters · {list?.cards.length ?? '…'}
          </h2>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Toutes' },
              { value: 'missing', label: `À trouver · ${missing}` },
              { value: 'friends', label: `Chez tes amis · ${atFriends}` },
            ]}
          />
        </div>
        {error ? (
          <p className="rounded-2xl border bg-card px-5 py-4 text-sm text-destructive">{error}</p>
        ) : !list ? (
          <p className="flex items-center gap-2 rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Lecture de ta liste sur WikiMasters…
          </p>
        ) : !shown.length ? (
          <p className="rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">
            {list.cards.length ? 'Aucune carte pour ce filtre.' : 'Ta liste est vide : cherche une carte ci-dessus, ou touche le cœur d’une carte sur le marché.'}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-5">
            {shown.map((card, i) => {
              const owned = isOwned(card);
              const friends = list.friends[card.cardId] ?? [];
              const asCards = shown.map((c) => catalogAsCard(c, isOwned(c) ? 1 : 0));
              return (
                <div key={card.cardId} className="group relative space-y-2">
                  <button type="button" className="block w-full cursor-zoom-in" onClick={() => useCardViewer.getState().open(asCards, i)} title={`${card.title} · voir en grand`}>
                    <WmCard
                      card={asCards[i]!}
                      showTags={false}
                      className={cn('w-full', owned && 'opacity-70')}
                      badges={
                        owned && (
                          <span className="rounded-[2.5cqw] bg-emerald-500 px-[2.5cqw] py-[1.2cqw] text-[5.5cqw] leading-none font-bold text-white">Obtenue</span>
                        )
                      }
                    />
                  </button>
                  <div className="absolute top-2 right-2 z-50">
                    <HeartButton on busy={busy.has(card.cardId)} onClick={() => toggle(card)} label="Retirer des souhaits" />
                  </div>
                  {owned && (
                    <button
                      type="button"
                      onClick={() => toggle(card)}
                      disabled={busy.has(card.cardId)}
                      className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-full border border-emerald-500/40 px-2 py-1 text-xs text-emerald-700 transition hover:bg-emerald-500/10 disabled:cursor-progress dark:text-emerald-300"
                    >
                      <CircleCheck className="size-3.5" /> Obtenue · retirer des souhaits
                    </button>
                  )}
                  {friends.length > 0 && !owned && (
                    <p className="flex items-center gap-1 truncate px-1 text-xs text-muted-foreground" title={`Possédée par ${friends.join(', ')}`}>
                      <Users className="size-3.5 shrink-0 text-primary" /> {friends.slice(0, 3).join(', ')}
                      {friends.length > 3 && ` +${friends.length - 3}`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4 pb-10">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Souhaits de tes albums · {albumGroups.reduce((n, g) => n + g.items.length, 0)}
        </h2>
        {!albumGroups.length ? (
          <p className="rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">
            Sous chaque album, le cœur d’une suggestion la note ici. Envoie-la ensuite sur WikiMasters pour qu’elle ressorte sur le marché.
          </p>
        ) : (
          albumGroups.map((group) => (
            <div key={group.key} className="overflow-hidden rounded-2xl border bg-card">
              <p className="border-b px-5 py-2.5 text-sm font-medium">
                {group.name} <span className="text-muted-foreground">· {group.items.length}</span>
              </p>
              <div className="divide-y">
                {group.items.map((item) => {
                  const onSite = wishedTitles.has(titleKey(item.title));
                  const have = ownedTitles.has(titleKey(item.title));
                  return (
                    <div key={item.qid} className="flex items-center gap-3 px-5 py-2.5">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="size-10 shrink-0 rounded-md bg-muted object-cover" loading="lazy" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-bold text-muted-foreground">
                          {item.title.charAt(0)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <a href={item.wikipediaUrl} target="_blank" rel="noopener" className="block truncate text-sm font-medium hover:underline">
                          {item.title}
                        </a>
                        <p className="truncate text-xs text-muted-foreground">{item.description ?? `${item.sitelinks} éditions de Wikipédia`}</p>
                      </div>
                      {have ? (
                        <button
                          type="button"
                          onClick={() => removeAlbumWish(group.key, item.qid)}
                          title="Tu as cette carte : la retirer de la liste de l'album"
                          className="flex cursor-pointer items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-500/25 dark:text-emerald-300"
                        >
                          <CircleCheck className="size-3.5" /> Obtenue · retirer
                        </button>
                      ) : onSite ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Heart className="size-3.5 text-primary" fill="currentColor" /> Sur WikiMasters
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full px-2.5 text-xs"
                          disabled={busy.has(`album:${item.qid}`) || !list}
                          onClick={() => sendToSite(item)}
                          title="Ajouter cette carte à ta liste de souhaits WikiMasters"
                        >
                          {busy.has(`album:${item.qid}`) ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} WikiMasters
                        </Button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAlbumWish(group.key, item.qid)}
                        title="Retirer de la liste de l’album"
                        aria-label="Retirer de la liste de l’album"
                        className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/** Recherche dans le catalogue WikiMasters, cœur pour ajouter à la liste. */
function CatalogSearch({
  wishedIds,
  isOwned,
  busy,
  onToggle,
}: {
  wishedIds: Set<string>;
  isOwned: (c: CatalogCard) => boolean;
  busy: Set<string>;
  onToggle: (c: CatalogCard) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogCard[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults(null);
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchCatalog(q);
        if (!stale) setResults(found.slice(0, 12));
      } catch {
        if (!stale) setResults([]);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <section className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ajouter une carte : cherche dans le catalogue WikiMasters (3 lettres minimum)"
          className="h-11 rounded-full pl-10"
        />
        {searching && <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {results && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {!results.length ? (
            <p className="px-5 py-3 text-sm text-muted-foreground">Aucune carte trouvée.</p>
          ) : (
            <div className="divide-y">
              {results.map((card) => {
                const wished = wishedIds.has(card.cardId);
                return (
                  <div key={card.cardId} className="flex items-center gap-3 px-5 py-2">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt="" className="size-9 shrink-0 rounded-md bg-muted object-cover" loading="lazy" />
                    ) : (
                      <span className="size-9 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {card.title} {card.rarity && <span className="ml-1 rounded bg-muted px-1 text-[10px] font-bold">{card.rarity}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{card.description ?? ''}</p>
                    </div>
                    {isOwned(card) && <span className="text-xs text-emerald-600 dark:text-emerald-400">Possédée</span>}
                    <HeartButton
                      on={wished}
                      busy={busy.has(card.cardId)}
                      onClick={() => onToggle(card)}
                      label={wished ? 'Retirer des souhaits' : 'Ajouter aux souhaits'}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

