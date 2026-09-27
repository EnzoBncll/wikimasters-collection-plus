import { Copy, Tag, X } from 'lucide-react';
import { useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { tagCounts, useCollection } from '@/hooks/use-collection';
import { hasActiveFilters, useReview, type StatusFilter } from '@/hooks/use-review';
import { RARITY_LABEL, RARITY_ORDER } from '@/lib/types';
import { cn } from '@/lib/utils';
import { RARITY_VAR } from './rarity';

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
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

export function FilterSidebar({ className }: { className?: string }) {
  const { cards, tags, tradeTags, statusOf, version } = useCollection();
  const review = useReview();

  const counts = useMemo(() => {
    const status = { trade: 0, not_trade: 0, unset: 0 };
    const rarity = new Map<string, number>();
    let duplicates = 0;
    for (const c of cards) {
      status[statusOf(c)]++;
      if (c.rarity) rarity.set(c.rarity, (rarity.get(c.rarity) ?? 0) + 1);
      if (c.count > 1) duplicates++;
    }
    return { status, rarity, duplicates, tags: tagCounts(cards) };
  }, [cards, statusOf, version]);

  const systemIds = new Set(tradeTags ? [tradeTags.trade.id, tradeTags.notTrade.id] : []);
  const ownTags = tags.filter((t) => !systemIds.has(t.id));
  const untagged = cards.filter((c) => !c.tagIds.some((t) => !systemIds.has(t))).length;

  const statusRows: { value: StatusFilter; label: string; dot?: string; count: number }[] = [
    { value: 'all', label: 'Toutes les cartes', count: cards.length },
    { value: 'trade', label: 'Trade', dot: 'bg-trade', count: counts.status.trade },
    { value: 'not_trade', label: 'Not Trade', dot: 'bg-not-trade', count: counts.status.not_trade },
    ...(counts.status.unset ? [{ value: 'unset' as const, label: 'Sans statut', dot: 'bg-zinc-400', count: counts.status.unset }] : []),
  ];

  return (
    <aside className={cn('flex h-full w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r px-3 py-4', className)}>
      <Section
        title="Statut"
        action={
          hasActiveFilters(review) && (
            <button
              type="button"
              onClick={review.resetFilters}
              className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" /> Réinitialiser
            </button>
          )
        }
      >
        {statusRows.map((row) => (
          <Row key={row.value} active={review.status === row.value} onClick={() => review.set({ status: row.value })} count={row.count}>
            <span className={cn('size-2 rounded-full', row.dot ?? 'bg-foreground/40')} />
            {row.label}
          </Row>
        ))}
      </Section>

      <Section title="Rareté">
        <div className="grid grid-cols-3 gap-1.5 px-1">
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

      <Section title="Étiquettes">
        {ownTags.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground">Aucune étiquette perso pour l'instant. Crée-en depuis l'onglet Étiquettes.</p>
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

      <Section title="Autres">
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted">
          <Copy className="size-3.5" />
          Doublons seulement
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs tabular-nums opacity-70">{counts.duplicates}</span>
            <Switch checked={review.duplicates} onCheckedChange={(duplicates) => review.set({ duplicates })} />
          </span>
        </label>
      </Section>
    </aside>
  );
}
