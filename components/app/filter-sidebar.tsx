import { ChevronDown, Copy, Sparkles, Tag, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { tagCounts, useCollection } from '@/hooks/use-collection';
import { hasActiveFilters, useReview, useVisibleCards, type StatusFilter } from '@/hooks/use-review';
import { RARITY_LABEL, RARITY_ORDER } from '@/lib/types';
import { systemTagIds } from '@/lib/trade';
import { cn } from '@/lib/utils';
import { PendingPanel } from './pending-panel';
import { RARITY_VAR } from './rarity';
import { TRADE_LABEL, TradeCart, tradeTextClass } from './trade-cart';

const COLLAPSED_KEY = 'collectionPlus.sidebarCollapsed';

function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {}
  };
  return [collapsed, toggle] as const;
}

/** Section repliable ; le compteur d'éléments actifs reste visible quand elle est repliée. */
function Section({ id, title, active, collapsed, onToggle, children }: { id: string; title: string; active?: number; collapsed: boolean; onToggle: (id: string) => void; children: React.ReactNode }) {
  return (
    <section>
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={!collapsed}
        className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left"
      >
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground">{title}</h3>
        {!!active && <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-bold text-primary-foreground tabular-nums">{active}</span>}
        <ChevronDown className={cn('ml-auto size-3.5 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
      </button>
      <div className={cn('grid transition-[grid-template-rows] duration-200', collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')}>
        <div className="min-h-0 space-y-0.5 overflow-hidden pt-1">{children}</div>
      </div>
    </section>
  );
}

function Row({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
      {count !== undefined && <span className="ml-auto text-xs tabular-nums opacity-70">{count}</span>}
    </button>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-accent py-0.5 pr-1 pl-2 text-xs text-accent-foreground">
      {children}
      <button type="button" onClick={onRemove} aria-label="Retirer ce filtre" className="flex size-4 cursor-pointer items-center justify-center rounded-full hover:bg-foreground/10">
        <X className="size-3" />
      </button>
    </span>
  );
}

/** Ce qui est affiché dans la vue, avec les filtres actifs retirables un à un et la réinitialisation. */
function ViewSummary() {
  const { cards, tags } = useCollection();
  const review = useReview();
  const visible = useVisibleCards();
  const active = hasActiveFilters(review);
  const tagName = (id: string) => (id === 'none' ? 'Sans étiquette' : (tags.find((t) => t.id === id)?.name ?? '?'));

  return (
    <div className="space-y-2 rounded-xl bg-muted/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm whitespace-nowrap">
          <span className="font-semibold tabular-nums">{visible.length}</span>
          <span className="text-muted-foreground"> / {cards.length} cartes</span>
        </p>
        <button
          type="button"
          onClick={review.resetFilters}
          disabled={!active}
          className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <X className="size-3" /> Réinitialiser
        </button>
      </div>
      {active ? (
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
      ) : (
        <p className="text-xs text-muted-foreground">Toutes les cartes, aucun filtre.</p>
      )}
    </div>
  );
}

export function FilterSidebar({ className }: { className?: string }) {
  const { cards, tags, tradeTags, explicitOf, version } = useCollection();
  const review = useReview();
  const [collapsed, toggle] = useCollapsed();

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

  const statusRows: { value: StatusFilter; count: number }[] = [
    { value: 'all', count: cards.length },
    { value: 'trade', count: counts.status.trade },
    { value: 'not_trade', count: counts.status.not_trade },
    { value: 'discard', count: counts.status.discard },
    { value: 'unset', count: counts.status.unset },
  ];
  const sectionProps = (id: string) => ({ id, collapsed: collapsed.has(id), onToggle: toggle });

  return (
    <aside className={cn('flex h-full w-60 shrink-0 flex-col border-r', className)}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
        <ViewSummary />

        <Section title="Statut" active={review.status !== 'all' ? 1 : 0} {...sectionProps('status')}>
          {statusRows.map((row) => (
            <Row key={row.value} active={review.status === row.value} onClick={() => review.set({ status: row.value })} count={row.count}>
              {row.value === 'all' ? (
                <span className="size-2 rounded-full bg-foreground/40" />
              ) : (
                <TradeCart
                  status={row.value}
                  className={cn('size-3.5', tradeTextClass[row.value])}
                />
              )}
              {row.value === 'all' ? 'Toutes les cartes' : TRADE_LABEL[row.value]}
            </Row>
          ))}
        </Section>

        <Section title="Rareté" active={review.rarities.size} {...sectionProps('rarity')}>
          <div className="grid grid-cols-3 gap-1.5 px-1 pb-1">
            {RARITY_ORDER.map((r) => {
              const active = review.rarities.has(r);
              return (
                <button
                  key={r}
                  type="button"
                  title={RARITY_LABEL[r]}
                  onClick={() => review.toggleRarity(r)}
                  className={cn(
                    'flex cursor-pointer flex-col items-center rounded-lg border py-1.5 text-xs font-bold transition',
                    active ? 'border-transparent text-zinc-900' : 'hover:bg-muted',
                  )}
                  style={active ? { backgroundColor: RARITY_VAR[r] } : { color: RARITY_VAR[r] }}
                >
                  {r}
                  <span className={cn('text-[10px] font-normal tabular-nums', active ? 'text-zinc-800' : 'text-muted-foreground')}>
                    {counts.rarity.get(r) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Étiquettes" active={review.tagFilters.size} {...sectionProps('tags')}>
          {ownTags.length === 0 && (
            <p className="px-2 text-xs text-muted-foreground">Aucune étiquette perso pour l'instant. Crée-en depuis l'onglet Albums.</p>
          )}
          {ownTags.map((tag) => (
            <Row key={tag.id} active={review.tagFilters.has(tag.id)} onClick={() => review.toggleTagFilter(tag.id)} count={counts.tags.get(tag.id) ?? 0}>
              <span className="size-2.5 rounded-full" style={{ backgroundColor: tag.color ?? 'var(--muted-foreground)' }} />
              <span className="truncate">{tag.name}</span>
            </Row>
          ))}
          {ownTags.length > 0 && (
            <Row active={review.tagFilters.has('none')} onClick={() => review.toggleTagFilter('none')} count={untagged}>
              <Tag className="size-3.5" />
              Sans étiquette
            </Row>
          )}
        </Section>

        <Section title="Autres" active={review.duplicates ? 1 : 0} {...sectionProps('other')}>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted">
            <Copy className="size-3.5" />
            Doublons seulement
            <span className="ml-auto flex items-center gap-2">
              <span className="text-xs tabular-nums opacity-70">{counts.duplicates}</span>
              <Switch checked={review.duplicates} onCheckedChange={(duplicates) => review.set({ duplicates })} />
            </span>
          </label>
        </Section>
      </div>

      <PendingPanel className="m-3 mt-0" />
    </aside>
  );
}
