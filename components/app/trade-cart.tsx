import { ShoppingCart, Trash2 } from 'lucide-react';
import type { TradeStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export const TRADE_LABEL: Record<TradeStatus, string> = { trade: 'Trade', not_trade: 'Not Trade', discard: 'Discard', unset: 'Sans statut' };

/** Caddie du statut d'échange : vert (Trade), rouge barré (Not Trade), gris avec « ! » (pas encore décidé) ; poubelle pour Discard. */
export function TradeCart({ status, className }: { status: TradeStatus; className?: string }) {
  if (status === 'discard') return <Trash2 className={cn('shrink-0', className)} strokeWidth={2.4} />;
  return (
    <span className={cn('relative inline-flex items-center justify-center', className)}>
      <ShoppingCart className="size-full" strokeWidth={2.4} />
      {status === 'not_trade' && (
        <span className="absolute top-1/2 left-1/2 h-[12%] w-[125%] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-current ring-[1.5px] ring-not-trade" />
      )}
      {status === 'unset' && (
        <span className="absolute -top-[30%] -right-[35%] flex size-[70%] items-center justify-center rounded-full bg-white text-[0.55em] leading-none font-black text-zinc-700">!</span>
      )}
    </span>
  );
}

/** Pastille ronde cliquable (fond selon le statut). */
export const tradeDotClass: Record<TradeStatus, string> = {
  trade: 'bg-trade text-white shadow-[0_0_0_2px_rgb(255_255_255/0.85)]',
  not_trade: 'bg-not-trade text-white shadow-[0_0_0_2px_rgb(255_255_255/0.85)]',
  discard: 'bg-discard text-white shadow-[0_0_0_2px_rgb(255_255_255/0.85)]',
  unset: 'bg-zinc-500/35 text-white/90 ring-1 ring-white/40 ring-inset backdrop-blur-sm',
};

/** Couleur de texte associée au statut (icônes des filtres, dossiers…). */
export const tradeTextClass: Record<TradeStatus, string> = {
  trade: 'text-trade',
  not_trade: 'text-not-trade',
  discard: 'text-discard',
  unset: 'text-muted-foreground',
};
