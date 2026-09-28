import { ArrowLeftRight, Maximize2 } from 'lucide-react';
import { memo } from 'react';
import { describeAcquisition, fullDate, latestAcquisition } from '@/lib/acquisitions';
import { RARITY_LABEL, type OwnedCard, type SiteTag, type TradeStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { TRADE_LABEL, TradeCart, tradeDotClass } from './trade-cart';
import { WmCard } from './wm-card';

interface CardTileProps {
  card: OwnedCard;
  index: number;
  /** Statut posé ou en attente (sans le « Trade par défaut »). */
  status: TradeStatus;
  /** Des modifications de la carte attendent l'envoi au site. */
  pending: boolean;
  isNew: boolean;
  selected: boolean;
  focused: boolean;
  tags: SiteTag[];
  onToggleStatus: (index: number) => void;
  /** Affiche la carte en grand. */
  onOpen: (index: number) => void;
}

export const CardTile = memo(function CardTile({
  card,
  index,
  status,
  pending,
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
            {status === 'discard' && <div className="absolute inset-0 bg-zinc-900/45 backdrop-grayscale" />}
            {selected && <div className="absolute inset-0 bg-primary/20" />}
            {isNew && (
              <span
                title={acquired?.at ? `Obtenue ${describeAcquisition(acquired)} (${fullDate(acquired.at)})` : undefined}
                className="absolute bottom-[3cqw] left-[4.5cqw] flex items-center rounded-[2cqw] bg-holo px-[3cqw] py-[1cqw] text-[5cqw] font-bold tracking-wide text-zinc-950 uppercase shadow"
              >
                New
                {acquired?.source === 'trade' && <ArrowLeftRight className="ml-[1.5cqw] inline size-[5cqw] align-[-0.6cqw]" strokeWidth={3} aria-label="obtenue par échange" />}
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
              title={`${TRADE_LABEL[status]}${pending ? ' · pas encore envoyé' : ''} — cliquer pour passer en ${status === 'trade' ? 'Not Trade' : status === 'not_trade' ? 'Discard' : 'Trade'}`}
              aria-label={`Statut : ${TRADE_LABEL[status]}`}
              className={cn(
                'absolute top-[4cqw] right-[4cqw] z-10 flex size-[13cqw] cursor-pointer items-center justify-center rounded-full transition duration-150 hover:scale-115 active:scale-95',
                tradeDotClass[status],
                status === 'unset' && 'opacity-80 group-hover:opacity-100',
              )}
            >
              <TradeCart status={status} className="size-[6.5cqw]" />
              {pending && <span className="absolute -bottom-[0.5cqw] -left-[0.5cqw] size-[3.6cqw] rounded-full bg-amber-400 ring-[0.8cqw] ring-white" />}
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
