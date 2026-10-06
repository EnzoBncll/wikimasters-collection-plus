import { Copy, Sparkles, X } from 'lucide-react';
import { useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { tagCounts, useCollection } from '@/hooks/use-collection';
import { hasActiveFilters, useReview, useVisibleCards } from '@/hooks/use-review';
import { kindOf } from '@/lib/album-kind';
import { RARITY_LABEL, RARITY_ORDER, type SiteTag, type TradeStatus } from '@/lib/types';
import { systemTagIds } from '@/lib/trade';
import { cn } from '@/lib/utils';
import { RARITY_VAR } from './rarity';
import { TRADE_LABEL, TradeCart, tradeTextClass } from './trade-cart';

const STATUSES: { value: TradeStatus; short: string }[] = [
  { value: 'trade', short: 'Trade' },
  { value: 'not_trade', short: 'Not' },
  { value: 'discard', short: 'Discard' },
  { value: 'unset', short: 'Aucun' },
];

function SectionTitle({ children, active }: { children: React.ReactNode; active?: number }) {
  return (
    <h3 className="flex items-center gap-1.5 px-1 pb-2 text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
      {!!active && <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-bold tracking-normal text-primary-foreground tabular-nums">{active}</span>}
    </h3>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center gap-2 px-1 pt-2 pb-1.5 text-[11px] text-muted-foreground after:h-px after:flex-1 after:bg-border first:pt-0">{children}</p>;
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="flex max-w-full items-center gap-0.5 rounded-full border bg-background py-0.5 pr-0.5 pl-2 text-xs">
      <span className="flex min-w-0 items-center gap-1 truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Retirer ce filtre"
        className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-2.5" strokeWidth={3} />
      </button>
    </span>
  );
}

function TagPill({ tag, count, active, storage, onClick }: { tag?: SiteTag; count: number; active: boolean; storage?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        storage && 'border-dashed',
        active ? 'border-primary/55 bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {tag && !storage && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color ?? 'var(--muted-foreground)' }} />}
      <span className="truncate">{tag?.name ?? 'Sans étiquette'}</span>
      <span className="text-[10px] tabular-nums opacity-65">{count}</span>
    </button>
  );
}

/** Ce qui est affiché dans la vue, avec les filtres actifs retirables un à un. */
function ViewSummary() {
  const { cards, tags } = useCollection();
  const review = useReview();
  const visible = useVisibleCards();
  const active = hasActiveFilters(review);
  const tagName = (id: string) => (id === 'none' ? 'Sans étiquette' : (tags.find((t) => t.id === id)?.name ?? '?'));

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted p-3">
      <p className="flex items-baseline gap-1.5">
        <span className="font-heading text-xl leading-none font-bold tabular-nums">{visible.length}</span>
        <span className="text-xs text-muted-foreground">sur {cards.length} cartes</span>
      </p>
      {active ? (
        <>
          <div className="flex flex-wrap gap-1">
            {review.query && <Chip onRemove={() => review.set({ query: '' })}>« {review.query} »</Chip>}
            {review.onlyNew && (
              <Chip onRemove={() => review.set({ onlyNew: false })}>
                <Sparkles className="size-3" /> Nouvelles
              </Chip>
            )}
            {review.status !== 'all' && <Chip onRemove={() => review.set({ status: 'all' })}>{TRADE_LABEL[review.status]}</Chip>}
            {[...review.rarities].map((r) => (
              <Chip key={r} onRemove={() => review.toggleRarity(r)}>
                {RARITY_LABEL[r]}
              </Chip>
            ))}
            {[...review.tagFilters].map((t) => (
              <Chip key={t} onRemove={() => review.toggleTagFilter(t)}>
                {tagName(t)}
              </Chip>
            ))}
            {review.duplicates && <Chip onRemove={() => review.set({ duplicates: false })}>Doublons</Chip>}
          </div>
          <button type="button" onClick={review.resetFilters} className="cursor-pointer self-start text-xs font-semibold text-primary hover:underline">
            Tout effacer
          </button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Toutes les cartes, aucun filtre.</p>
      )}
    </div>
  );
}

export function FilterSidebar({ className }: { className?: string }) {
  const { cards, tags, tradeTags, explicitOf, version, settings } = useCollection();
  const review = useReview();

  const counts = useMemo(() => {
    const status = { trade: 0, not_trade: 0, discard: 0, unset: 0 };
    const rarity = new Map<string, number>();
    let duplicates = 0;
    for (const c of cards) {
      status[explicitOf(c)]++;
      if (c.rarity) rarity.set(c.rarity, (rarity.get(c.rarity) ?? 0) + 1);
      if (c.count > 1) duplicates++;
    }
    return { status, rarity, duplicates, tags: tagCounts(cards) };
  }, [cards, explicitOf, version]);

  const systemIds = systemTagIds(tradeTags);
  const ownTags = tags.filter((t) => !systemIds.has(t.id));
  const untagged = cards.filter((c) => !c.tagIds.some((t) => !systemIds.has(t))).length;
  const collection = settings.albumKinds ? ownTags.filter((t) => kindOf(t) === 'collection') : ownTags;
  const storage = settings.albumKinds ? ownTags.filter((t) => kindOf(t) === 'storage') : [];
  const pill = (tag: SiteTag, isStorage = false) => (
    <TagPill
      key={tag.id}
      tag={tag}
      storage={isStorage}
      count={counts.tags.get(tag.id) ?? 0}
      active={review.tagFilters.has(tag.id)}
      onClick={() => review.toggleTagFilter(tag.id)}
    />
  );
  const untaggedPill = <TagPill storage count={untagged} active={review.tagFilters.has('none')} onClick={() => review.toggleTagFilter('none')} />;

  return (
    <aside className={cn('flex h-full w-62 shrink-0 flex-col border-r', className)}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        <ViewSummary />

        <section>
          <SectionTitle active={(review.status !== 'all' ? 1 : 0) + review.rarities.size}>Statut · Rareté</SectionTitle>
          <div className="grid grid-cols-4 gap-0.5 rounded-xl bg-muted p-0.5" role="radiogroup" aria-label="Statut">
            {STATUSES.map(({ value, short }) => {
              const active = review.status === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={`${TRADE_LABEL[value]} · ${counts.status[value]}`}
                  onClick={() => review.set({ status: active ? 'all' : value })}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10.5px] transition',
                    active ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <TradeCart status={value} className={cn('size-3.5', tradeTextClass[value])} />
                  {short}
                  <span className="text-[9.5px] font-normal tabular-nums opacity-70">{counts.status[value]}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 grid grid-cols-6 gap-0.5">
            {RARITY_ORDER.map((r) => {
              const active = review.rarities.has(r);
              return (
                <button
                  key={r}
                  type="button"
                  title={RARITY_LABEL[r]}
                  aria-pressed={active}
                  onClick={() => review.toggleRarity(r)}
                  className={cn(
                    'flex cursor-pointer flex-col items-center rounded-lg border py-1 text-[11px] leading-tight font-extrabold transition',
                    active ? 'border-transparent text-zinc-900' : 'hover:bg-muted',
                  )}
                  style={active ? { backgroundColor: RARITY_VAR[r] } : { color: RARITY_VAR[r] }}
                >
                  {r}
                  <span className={cn('text-[9px] font-normal tabular-nums', active ? 'text-zinc-700' : 'text-muted-foreground')}>{counts.rarity.get(r) ?? 0}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionTitle active={review.tagFilters.size}>Étiquettes</SectionTitle>
          {ownTags.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">Aucune étiquette perso pour l'instant. Crée-en depuis l'onglet Albums.</p>
          ) : settings.albumKinds ? (
            <>
              {collection.length > 0 && (
                <>
                  <SubTitle>Collection</SubTitle>
                  <div className="flex flex-wrap gap-1">{collection.map((t) => pill(t))}</div>
                </>
              )}
              <SubTitle>Rangement</SubTitle>
              <div className="flex flex-wrap gap-1">
                {storage.map((t) => pill(t, true))}
                {untaggedPill}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-1">
              {collection.map((t) => pill(t))}
              {untaggedPill}
            </div>
          )}
        </section>

        <section>
          <SectionTitle active={review.duplicates ? 1 : 0}>Autres</SectionTitle>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm text-muted-foreground hover:text-foreground">
            <Copy className="size-3.5" />
            Doublons seulement
            <span className="ml-auto flex items-center gap-2">
              <span className="text-xs tabular-nums opacity-70">{counts.duplicates}</span>
              <Switch checked={review.duplicates} onCheckedChange={(duplicates) => review.set({ duplicates })} />
            </span>
          </label>
        </section>
      </div>
    </aside>
  );
}
