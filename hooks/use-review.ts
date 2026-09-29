import { matchesQuery } from '@/lib/text';
import { systemTagIds } from '@/lib/trade';
import { useMemo } from 'react';
import { create } from 'zustand';
import { latestAcquisition } from '@/lib/acquisitions';
import { RARITY_ORDER, type OwnedCard, type Rarity, type TradeStatus } from '@/lib/types';
import { useCollection } from './use-collection';

export type SortKey = 'rarity' | 'date' | 'title' | 'count';
export type StatusFilter = 'all' | TradeStatus;
/** 'none' = cartes sans aucune étiquette personnelle. */
export type TagFilter = string | 'none';

interface ReviewState {
  query: string;
  onlyNew: boolean;
  status: StatusFilter;
  rarities: Set<Rarity>;
  tagFilters: Set<TagFilter>;
  duplicates: boolean;
  sort: SortKey;

  selected: Set<string>;
  anchor: number | null;
  focus: number;
  tagPickerOpen: boolean;

  set(patch: Partial<Omit<ReviewState, 'set' | 'toggleRarity' | 'toggleTagFilter' | 'resetFilters'>>): void;
  toggleRarity(r: Rarity): void;
  toggleTagFilter(t: TagFilter): void;
  resetFilters(): void;
}

const FILTER_DEFAULTS = {
  query: '',
  onlyNew: false,
  status: 'all' as StatusFilter,
  rarities: new Set<Rarity>(),
  tagFilters: new Set<TagFilter>(),
  duplicates: false,
};

export const useReview = create<ReviewState>((set, get) => ({
  ...FILTER_DEFAULTS,
  sort: 'rarity',
  selected: new Set(),
  anchor: null,
  focus: 0,
  tagPickerOpen: false,

  set: (patch) => set(patch),
  toggleRarity(r) {
    const rarities = new Set(get().rarities);
    if (rarities.has(r)) rarities.delete(r);
    else rarities.add(r);
    set({ rarities });
  },
  toggleTagFilter(t) {
    const tagFilters = new Set(get().tagFilters);
    if (tagFilters.has(t)) tagFilters.delete(t);
    else tagFilters.add(t);
    set({ tagFilters });
  },
  resetFilters: () => set({ ...FILTER_DEFAULTS, rarities: new Set(), tagFilters: new Set() }),
}));

export const hasActiveFilters = (s: ReviewState) =>
  Boolean(s.query || s.onlyNew || s.status !== 'all' || s.rarities.size || s.tagFilters.size || s.duplicates);

const rank = (r: Rarity | null) => (r ? RARITY_ORDER.indexOf(r) : 99);

/** Cartes visibles selon les filtres et le tri courants. */
export function useVisibleCards(): OwnedCard[] {
  const { cards, newIds, version, tradeTags, explicitOf } = useCollection();
  const settings = useCollection((s) => s.settings);
  const { query, onlyNew, status, rarities, tagFilters, duplicates, sort } = useReview();

  return useMemo(() => {
    const q = query.trim();
    const systemTags = systemTagIds(tradeTags);
    return cards
      .filter((c) => !onlyNew || newIds.has(c.cardId))
      .filter((c) => status === 'all' || explicitOf(c) === status)
      .filter((c) => !rarities.size || (c.rarity !== null && rarities.has(c.rarity)))
      .filter((c) => !duplicates || c.count > 1)
      .filter((c) => {
        if (!tagFilters.size) return true;
        const own = c.tagIds.filter((t) => !systemTags.has(t));
        return [...tagFilters].some((f) => (f === 'none' ? own.length === 0 : c.tagIds.includes(f)));
      })
      .filter((c) => !q || matchesQuery(c, q))
      .sort((a, b) => {
        // Plus récentes d'abord ; les cartes sans date connue (déjà là à l'installation) à la fin.
        if (sort === 'date') return (latestAcquisition(b)?.at ?? 0) - (latestAcquisition(a)?.at ?? 0) || rank(a.rarity) - rank(b.rarity) || a.title.localeCompare(b.title, 'fr');
        if (sort === 'title') return a.title.localeCompare(b.title, 'fr');
        if (sort === 'count') return b.count - a.count || a.title.localeCompare(b.title, 'fr');
        return rank(a.rarity) - rank(b.rarity) || a.title.localeCompare(b.title, 'fr');
      });
    // version : les cartes sont mutées en place lors des changements d'étiquettes.
  }, [cards, newIds, version, tradeTags, settings, query, onlyNew, status, rarities, tagFilters, duplicates, sort, explicitOf]);
}
