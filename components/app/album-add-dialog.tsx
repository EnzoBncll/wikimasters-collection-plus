import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, CheckSquare, Plus, Search, Square, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCollection } from '@/hooks/use-collection';
import type { SortKey, StatusFilter } from '@/hooks/use-review';
import { latestAcquisition } from '@/lib/acquisitions';
import { matchesQuery } from '@/lib/text';
import { systemTagIds } from '@/lib/trade';
import { RARITY_LABEL, RARITY_ORDER, type OwnedCard, type Rarity } from '@/lib/types';
import { cn } from '@/lib/utils';
import { WmCard } from './wm-card';

const MIN_TILE = 140;
const GAP = 12;

const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Tous statuts' },
  { id: 'trade', label: 'Trade' },
  { id: 'not_trade', label: 'Not Trade' },
  { id: 'discard', label: 'Discard' },
  { id: 'unset', label: 'Sans statut' },
];
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'rarity', label: 'Rareté' },
  { id: 'date', label: 'Plus récentes' },
  { id: 'title', label: 'Titre' },
  { id: 'count', label: 'Exemplaires' },
];

const rank = (r: Rarity | null) => (r ? RARITY_ORDER.indexOf(r) : 99);

const selectClass = 'h-8 cursor-pointer rounded-full bg-white/10 px-3 text-xs text-white outline-none transition hover:bg-white/15 [&>option]:bg-zinc-900';

/** Choisir parmi toutes ses cartes (hors album) celles à ranger dans l'album, avec recherche, filtres et tri. */
export function AlbumAddDialog({ tagId, name, onClose }: { tagId: string; name: string; onClose: () => void }) {
  const all = useCollection((s) => s.cards);
  const version = useCollection((s) => s.version);
  const tags = useCollection((s) => s.tags);
  const tradeTags = useCollection((s) => s.tradeTags);
  const explicitOf = useCollection((s) => s.explicitOf);
  const stageIntoAlbum = useCollection((s) => s.stageIntoAlbum);

  const [query, setQuery] = useState('');
  const [rarities, setRarities] = useState<Set<Rarity>>(new Set());
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [duplicates, setDuplicates] = useState(false);
  const [sort, setSort] = useState<SortKey>('rarity');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const systemIds = useMemo(() => systemTagIds(tradeTags), [tradeTags]);
  const ownTags = useMemo(() => tags.filter((t) => !systemIds.has(t.id) && t.id !== tagId).sort((a, b) => a.name.localeCompare(b.name, 'fr')), [tags, systemIds, tagId]);

  const candidates = useMemo(() => all.filter((c) => !c.tagIds.includes(tagId)), [all, version, tagId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () =>
      candidates
        .filter((c) => !rarities.size || (c.rarity !== null && rarities.has(c.rarity)))
        .filter((c) => status === 'all' || explicitOf(c) === status)
        .filter((c) => !duplicates || c.count > 1)
        .filter((c) => {
          if (tagFilter === 'all') return true;
          if (tagFilter === 'none') return !c.tagIds.some((t) => !systemIds.has(t));
          return c.tagIds.includes(tagFilter);
        })
        .filter((c) => matchesQuery(c, query))
        .sort((a, b) => {
          if (sort === 'date') return (latestAcquisition(b)?.at ?? 0) - (latestAcquisition(a)?.at ?? 0) || a.title.localeCompare(b.title, 'fr');
          if (sort === 'title') return a.title.localeCompare(b.title, 'fr');
          if (sort === 'count') return b.count - a.count || a.title.localeCompare(b.title, 'fr');
          return rank(a.rarity) - rank(b.rarity) || a.title.localeCompare(b.title, 'fr');
        }),
    [candidates, rarities, status, duplicates, tagFilter, query, sort, explicitOf, systemIds],
  );

  // Les cartes ajoutées quittent la liste : on les retire aussi de la sélection.
  useEffect(() => {
    const ids = new Set(candidates.map((c) => c.cardId));
    setSelected((prev) => (([...prev].every((id) => ids.has(id))) ? prev : new Set([...prev].filter((id) => ids.has(id)))));
  }, [candidates]);

  // Échap ferme la fenêtre (et pas l'album derrière).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Grille virtualisée : une collection peut compter des milliers de cartes.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const columns = Math.max(1, Math.floor((width + GAP) / (MIN_TILE + GAP)));
  const tileWidth = width ? (width - GAP * (columns - 1)) / columns : MIN_TILE;
  const rowHeight = Math.round((tileWidth * 7) / 5);
  const virtualizer = useVirtualizer({
    count: Math.ceil(visible.length / columns),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight + GAP,
    overscan: 3,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, columns, virtualizer]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [query, rarities, status, tagFilter, duplicates, sort]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleRarity = (r: Rarity) =>
    setRarities((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.cardId));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visible) {
        if (allVisibleSelected) next.delete(c.cardId);
        else next.add(c.cardId);
      }
      return next;
    });
  const filtered = Boolean(query || rarities.size || status !== 'all' || tagFilter !== 'all' || duplicates);
  const resetFilters = () => {
    setQuery('');
    setRarities(new Set());
    setStatus('all');
    setTagFilter('all');
    setDuplicates(false);
  };

  const add = () => {
    const targets: OwnedCard[] = candidates.filter((c) => selected.has(c.cardId));
    if (!targets.length) return;
    stageIntoAlbum(targets, { id: tagId, name });
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm select-none"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Ajouter des cartes à ${name}`}
    >
      <div className="flex h-full max-h-[900px] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-zinc-950/95 text-white shadow-2xl ring-1 ring-white/10">
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">Ajouter à l'album</p>
            <h2 className="truncate text-lg font-bold">{name}</h2>
          </div>
          <span className="text-sm text-white/50 tabular-nums">
            {visible.length} / {candidates.length} cartes hors album
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-5 py-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (titre, description)…"
              className="h-9 w-full rounded-full bg-white/10 pr-3 pl-9 text-sm text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-white/30"
            />
          </div>
          <div className="flex gap-1">
            {RARITY_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRarity(r)}
                aria-pressed={rarities.has(r)}
                title={RARITY_LABEL[r]}
                className={cn('h-8 min-w-9 cursor-pointer rounded-full px-2 text-xs font-bold transition', rarities.has(r) ? 'text-[#0d1117]' : 'bg-white/10 text-white/70 hover:bg-white/15')}
                style={rarities.has(r) ? { backgroundColor: `var(--rarity-${r.toLowerCase()})` } : undefined}
              >
                {r}
              </button>
            ))}
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectClass} aria-label="Statut">
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={cn(selectClass, 'max-w-48')} aria-label="Étiquette">
            <option value="all">Toutes étiquettes</option>
            <option value="none">Sans étiquette</option>
            {ownTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setDuplicates((d) => !d)}
            aria-pressed={duplicates}
            className={cn('h-8 cursor-pointer rounded-full px-3 text-xs transition', duplicates ? 'bg-white text-zinc-900' : 'bg-white/10 text-white/80 hover:bg-white/15')}
          >
            Doublons
          </button>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectClass} aria-label="Tri">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Tri : {s.label}
              </option>
            ))}
          </select>
          {filtered && (
            <button type="button" onClick={resetFilters} className="cursor-pointer text-xs text-white/60 underline underline-offset-2 hover:text-white">
              Réinitialiser
            </button>
          )}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {visible.length ? (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((row) => (
                <div
                  key={row.key}
                  className="absolute inset-x-0 grid"
                  style={{ top: row.start, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: GAP }}
                >
                  {visible.slice(row.index * columns, row.index * columns + columns).map((card) => {
                    const on = selected.has(card.cardId);
                    return (
                      <button
                        key={card.cardId}
                        type="button"
                        onClick={() => toggle(card.cardId)}
                        aria-pressed={on}
                        title={card.description ? `${card.title} — ${card.description}` : card.title}
                        className={cn('relative cursor-pointer rounded-[4%] transition', on ? 'ring-3 ring-emerald-400' : 'opacity-85 hover:opacity-100')}
                      >
                        <WmCard card={card} tilt={false} className="w-full" />
                        <span
                          className={cn(
                            'absolute top-2 right-2 z-40 flex size-7 items-center justify-center rounded-full shadow-lg transition',
                            on ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white/80',
                          )}
                        >
                          {on ? <Check className="size-4" /> : <Plus className="size-4" />}
                        </span>
                        {card.count > 1 && (
                          <span className="absolute bottom-2 left-2 z-40 rounded-full bg-black/60 px-1.5 text-[11px] font-semibold text-white">×{card.count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-white/50">{candidates.length ? 'Aucune carte ne correspond à ces filtres.' : 'Toutes tes cartes sont déjà dans cet album.'}</p>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={toggleAllVisible}
            disabled={!visible.length}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs transition hover:bg-white/20 disabled:opacity-40"
          >
            {allVisibleSelected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
            {allVisibleSelected ? 'Désélectionner' : 'Sélectionner'} les {visible.length} affichée(s)
          </button>
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="cursor-pointer text-xs text-white/60 underline underline-offset-2 hover:text-white">
              Vider la sélection
            </button>
          )}
          <button
            type="button"
            onClick={add}
            disabled={!selected.size}
            className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold transition hover:bg-emerald-400 disabled:cursor-default disabled:opacity-40"
          >
            <Plus className="size-4" />
            {selected.size ? `Ajouter ${selected.size} carte${selected.size > 1 ? 's' : ''}` : 'Ajouter'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
