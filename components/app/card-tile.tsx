import { Maximize2 } from 'lucide-react';
import { memo } from 'react';
import { describeAcquisition, fullDate, latestAcquisition, SOURCE_LABEL } from '@/lib/acquisitions';
import { RARITY_LABEL, type OwnedCard, type SiteTag, type TradeStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { WmCard } from './wm-card';

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
  /** Affiche la carte en grand. */
  onOpen: (index: number) => void;
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
  onOpen,
}: CardTileProps) {
  const acquired = latestAcquisition(card);
  return (
    <div data-index={index} className="group relative h-full cursor-pointer">
      <WmCard
        card={card}
        className={cn(
          'w-full',
          selected && 'shadow-none ring-[3px] ring-primary ring-offset-2 ring-offset-background',
          focused && !selected && 'outline-2 outline-offset-3 outline-dashed outline-muted-foreground/60',
        )}
        badges={
          card.count > 1 && (
            <span className="rounded-[2.5cqw] bg-black/60 px-[2.5cqw] py-[1.2cqw] text-[5.5cqw] leading-none font-bold text-white tabular-nums backdrop-blur">
              ×{card.count}
            </span>
          )
        }
        imageOverlay={
          <>
            {status === 'not_trade' && <div className="absolute inset-0 bg-not-trade/25" />}
            {selected && <div className="absolute inset-0 bg-primary/20" />}
            {isNew && (
              <span
                title={acquired?.at ? `Obtenue ${describeAcquisition(acquired)} (${fullDate(acquired.at)})` : undefined}
                className="absolute bottom-[3cqw] left-[4.5cqw] rounded-[2cqw] bg-holo px-[3cqw] py-[1cqw] text-[5cqw] font-bold tracking-wide text-zinc-950 uppercase shadow"
              >
                Nouveau{acquired?.source && ` · ${SOURCE_LABEL[acquired.source]}`}
              </span>
            )}
            {tags.length > 0 && (
              <span className="absolute right-[4.5cqw] bottom-[3.5cqw] flex items-center -space-x-[1.5cqw]">
                {tags.slice(0, 4).map((t) => (
                  <span
                    key={t.id}
                    title={t.name}
                    className="size-[5.5cqw] rounded-full ring-[1.2cqw] ring-white/90"
                    style={{ backgroundColor: t.color ?? 'var(--muted-foreground)' }}
                  />
                ))}
                {tags.length > 4 && <span className="pl-[2.5cqw] text-[5cqw] font-bold text-white">+{tags.length - 4}</span>}
              </span>
            )}
            <button
              type="button"
              data-toggle
              onClick={(e) => {
                e.stopPropagation();
                onOpen(index);
              }}
              title="Afficher en grand (double-clic ou Entrée)"
              aria-label="Afficher en grand"
              className="absolute top-1/2 left-1/2 z-10 flex size-[16cqw] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 hover:scale-110 hover:bg-black/70"
            >
              <Maximize2 className="size-[7cqw]" />
            </button>
            <button
              type="button"
              data-toggle
              onClick={(e) => {
                e.stopPropagation();
                onToggleStatus(index);
              }}
              title={implicit ? 'Trade par défaut (pas encore étiquetée) · cliquer pour basculer' : 'Cliquer pour basculer'}
              className={cn(
                'absolute top-[4.5cqw] right-[4.5cqw] z-10 flex cursor-pointer items-center gap-[1.5cqw] rounded-full px-[3cqw] py-[1.2cqw] text-[5.5cqw] leading-none font-bold text-white shadow-md backdrop-blur transition hover:scale-105',
                status === 'trade' && 'bg-trade/90',
                status === 'not_trade' && 'bg-not-trade/90',
                status === 'unset' && 'bg-zinc-500/80',
                implicit && 'bg-trade/55 ring-1 ring-white/40 ring-inset',
              )}
            >
              <span className="size-[2.5cqw] rounded-full bg-white/90" />
              {STATUS_LABEL[status]}
            </button>
          </>
        }
        fallbackFooter={
          <span className="text-black/60" title={card.rarity ? RARITY_LABEL[card.rarity] : undefined}>
            {card.rarity ? RARITY_LABEL[card.rarity] : 'Carte'}
          </span>
        }
      />
    </div>
  );
});
