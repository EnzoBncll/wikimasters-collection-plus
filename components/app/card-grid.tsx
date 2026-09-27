import { useVirtualizer } from '@tanstack/react-virtual';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { useReview } from '@/hooks/use-review';
import { explicitStatus } from '@/lib/trade';
import type { OwnedCard, SiteTag } from '@/lib/types';
import { CardTile } from './card-tile';
import { useCardViewer } from './card-viewer';

const MIN_TILE = 168;
const GAP = 12;

export interface CardGridHandle {
  columns: number;
  scrollToIndex(index: number): void;
}

interface CardGridProps {
  cards: OwnedCard[];
}

/** Grille virtualisée (seules les lignes visibles sont rendues) avec sélection souris. */
export const CardGrid = forwardRef<CardGridHandle, CardGridProps>(function CardGrid({ cards }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const painting = useRef<boolean | null>(null);

  const { tags, tradeTags, newIds, statusOf, setTrade } = useCollection();
  const { selected, focus } = useReview();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columns = Math.max(1, Math.floor((width + GAP) / (MIN_TILE + GAP)));
  const tileWidth = width ? (width - GAP * (columns - 1)) / columns : MIN_TILE;
  // Cartes au format 5/7, comme sur WikiMasters.
  const rowHeight = Math.round((tileWidth * 7) / 5);
  const rowCount = Math.ceil(cards.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight + GAP,
    overscan: 4,
  });

  useEffect(() => virtualizer.measure(), [rowHeight, columns, virtualizer]);

  useImperativeHandle(
    ref,
    () => ({
      columns,
      scrollToIndex: (index) => virtualizer.scrollToIndex(Math.floor(index / columns), { align: 'auto' }),
    }),
    [columns, virtualizer],
  );

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const systemTags = useMemo(
    () => new Set(tradeTags ? [tradeTags.trade.id, tradeTags.notTrade.id] : []),
    [tradeTags],
  );

  const setSelected = useCallback((index: number, on: boolean) => {
    const card = cards[index];
    if (!card) return;
    const next = new Set(useReview.getState().selected);
    if (on) next.add(card.cardId);
    else next.delete(card.cardId);
    useReview.getState().set({ selected: next });
  }, [cards]);

  const onMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const tile = target.closest<HTMLElement>('[data-index]');
    if (!tile || target.closest('[data-toggle]') || e.button !== 0) return;
    e.preventDefault();
    const index = Number(tile.dataset.index);
    const state = useReview.getState();

    if (e.shiftKey && state.anchor !== null) {
      const next = new Set(state.selected);
      const [a, b] = [Math.min(state.anchor, index), Math.max(state.anchor, index)];
      for (let i = a; i <= b; i++) if (cards[i]) next.add(cards[i]!.cardId);
      state.set({ selected: next, focus: index });
      return;
    }
    const on = !state.selected.has(cards[index]!.cardId);
    setSelected(index, on);
    state.set({ anchor: index, focus: index });
    painting.current = on;
  };

  const onMouseOver = (e: React.MouseEvent) => {
    if (painting.current === null) return;
    const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (tile) setSelected(Number(tile.dataset.index), painting.current);
  };

  useEffect(() => {
    const stop = () => (painting.current = null);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const toggleStatus = useCallback(
    (index: number) => {
      const card = cards[index];
      if (card) setTrade([card], statusOf(card) === 'not_trade' ? 'trade' : 'not_trade');
    },
    [cards, setTrade, statusOf],
  );

  const openCard = useCallback((index: number) => useCardViewer.getState().open(cards, index), [cards]);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto overscroll-contain px-4 pt-1 pb-28 sm:px-6"
      onMouseDown={onMouseDown}
      onMouseOver={onMouseOver}
      onDoubleClick={(e) => {
        const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
        if (tile) useCardViewer.getState().open(cards, Number(tile.dataset.index));
      }}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const start = row.index * columns;
          return (
            <div
              key={row.key}
              className="absolute left-0 grid w-full"
              style={{
                top: row.start,
                height: rowHeight,
                gap: GAP,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {cards.slice(start, start + columns).map((card, i) => {
                const index = start + i;
                const status = statusOf(card);
                const cardTags = card.tagIds
                  .filter((id) => !systemTags.has(id))
                  .map((id) => tagsById.get(id))
                  .filter((t): t is SiteTag => Boolean(t));
                return (
                  <CardTile
                    key={card.cardId}
                    card={card}
                    index={index}
                    status={status}
                    implicit={Boolean(tradeTags) && status === 'trade' && explicitStatus(card, tradeTags!) === 'unset'}
                    isNew={newIds.has(card.cardId)}
                    selected={selected.has(card.cardId)}
                    focused={index === focus}
                    tags={cardTags}
                    onToggleStatus={toggleStatus}
                    onOpen={openCard}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});
