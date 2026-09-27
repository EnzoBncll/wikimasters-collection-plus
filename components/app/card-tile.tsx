import { memo } from 'react';
import { RARITY_LABEL, type OwnedCard, type SiteTag, type TradeStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { RARITY_BG, RARITY_VAR } from './rarity';

interface CardTileProps {
  card: OwnedCard;
  index: number;
  status: TradeStatus;
  /** Trade par défaut, sans étiquette posée. */
  implicit: boolean;
  isNew: boolean;
  selected: boolean;
  focused: boolean;
  tags: SiteTag[];
  onToggleStatus: (index: number) => void;
}

const STATUS_LABEL: Record<TradeStatus, string> = { trade: 'Trade', not_trade: 'Not Trade', unset: '—' };

export const CardTile = memo(function CardTile({
  card,
  index,
  status,
  implicit,
  isNew,
  selected,
  focused,
  tags,
  onToggleStatus,
}: CardTileProps) {
  const rarityColor = card.rarity ? RARITY_VAR[card.rarity] : 'var(--muted-foreground)';

  return (
    <div
      data-index={index}
      className={cn(
        'group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-card transition-[box-shadow,border-color,transform] duration-150 select-none',
        'hover:-translate-y-0.5 hover:shadow-lg',
        selected && 'border-primary shadow-[0_0_0_2px_var(--primary)]',
        focused && !selected && 'outline-2 outline-offset-2 outline-dashed outline-muted-foreground/60',
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="pointer-events-none size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="flex size-full items-center justify-center text-4xl font-black text-white/80"
            style={{ background: `linear-gradient(135deg, ${rarityColor}, color-mix(in oklab, ${rarityColor} 40%, black))` }}
          >
            {card.title.charAt(0).toUpperCase()}
          </div>
        )}

        {status === 'not_trade' && <div className="pointer-events-none absolute inset-0 bg-not-trade/15" />}

        {isNew && (
          <span className="absolute top-2 left-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary-foreground uppercase shadow">
            Nouveau
          </span>
        )}

        <button
          type="button"
          data-toggle
          onClick={(e) => {
            e.stopPropagation();
            onToggleStatus(index);
          }}
          title={implicit ? 'Trade par défaut (pas encore étiquetée) · cliquer pour basculer' : 'Cliquer pour basculer'}
          className={cn(
            'absolute top-2 right-2 flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-md backdrop-blur transition hover:scale-105',
            status === 'trade' && 'bg-trade/90',
            status === 'not_trade' && 'bg-not-trade/90',
            status === 'unset' && 'bg-zinc-500/80',
            implicit && 'bg-trade/55 ring-1 ring-white/40 ring-inset',
          )}
        >
          <span className="size-1.5 rounded-full bg-white/90" />
          {STATUS_LABEL[status]}
        </button>

        {selected && (
          <div className="pointer-events-none absolute inset-0 bg-primary/10" />
        )}
      </div>

      <div className="h-1 w-full" style={{ backgroundColor: rarityColor }} />

      <div className="flex flex-1 flex-col justify-between gap-1.5 p-2.5">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium" title={card.title}>
          {card.title}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {card.rarity && (
            <span
              className={cn('rounded px-1.5 py-px font-bold text-zinc-900', RARITY_BG[card.rarity])}
              title={RARITY_LABEL[card.rarity]}
            >
              {card.rarity}
            </span>
          )}
          <span className="tabular-nums">×{card.count}</span>
          <span className="ml-auto flex items-center -space-x-1">
            {tags.slice(0, 4).map((t) => (
              <span
                key={t.id}
                title={t.name}
                className="size-2.5 rounded-full ring-2 ring-card"
                style={{ backgroundColor: t.color ?? 'var(--muted-foreground)' }}
              />
            ))}
            {tags.length > 4 && <span className="pl-1.5 text-[10px]">+{tags.length - 4}</span>}
          </span>
        </div>
      </div>
    </div>
  );
});
