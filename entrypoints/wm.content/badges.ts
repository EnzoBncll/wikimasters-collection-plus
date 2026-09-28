import type { Settings } from '@/lib/store';
import { tradeStatus, type TradeTags } from '@/lib/trade';
import type { OwnedCard, TradeStatus } from '@/lib/types';

const BADGE_CLASS = 'wmt-trade-badge';
const STYLE_ID = 'wmt-badge-style';
const LABEL: Record<TradeStatus, string> = { trade: 'Trade', not_trade: 'Not Trade', discard: 'Discard', unset: 'Sans statut' };

const normalize = (s: string | null | undefined) =>
  (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Pastilles 🟢 / 🔴 / ⚪ sur les cartes affichées par le site ; le statut s'affiche au survol.
 * Les cartes du site sont des div[class*="glow-"] contenant un h3 avec le titre.
 */
export class Badges {
  private byTitle = new Map<string, TradeStatus>();
  private enabled = true;
  private observer = new MutationObserver(() => this.schedule());
  private pending = false;

  start() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .${BADGE_CLASS} {
          position: absolute; top: 8px; right: 8px; z-index: 30;
          display: flex; align-items: center; justify-content: flex-end;
          height: 14px; min-width: 14px; max-width: 14px; padding: 0; overflow: hidden;
          border-radius: 999px; box-sizing: border-box;
          background: var(--wmt-dot); color: var(--wmt-ink);
          box-shadow: 0 0 0 2px rgb(255 255 255 / .85), 0 2px 6px rgb(0 0 0 / .5);
          font: 700 10px/14px system-ui, sans-serif; white-space: nowrap;
          cursor: default; opacity: .9;
          transition: max-width .22s ease, padding .22s ease, opacity .15s ease, transform .15s ease, box-shadow .15s ease;
        }
        .${BADGE_CLASS}::before { content: attr(data-label); opacity: 0; transition: opacity .15s ease; }
        .${BADGE_CLASS}:hover {
          max-width: 120px; padding: 0 8px; opacity: 1; transform: scale(1.08);
          box-shadow: 0 0 0 2px rgb(255 255 255 / .95), 0 0 12px var(--wmt-dot), 0 2px 8px rgb(0 0 0 / .5);
        }
        .${BADGE_CLASS}:hover::before { opacity: 1; transition-delay: .08s; }
        *:hover > .${BADGE_CLASS} { opacity: 1; }
        .${BADGE_CLASS}[data-s="trade"] { --wmt-dot: #22c55e; --wmt-ink: #fff; }
        .${BADGE_CLASS}[data-s="not_trade"] { --wmt-dot: #ef4444; --wmt-ink: #fff; }
        .${BADGE_CLASS}[data-s="discard"] { --wmt-dot: #78716c; --wmt-ink: #fff; }
        .${BADGE_CLASS}[data-s="unset"] { --wmt-dot: #f4f4f5; --wmt-ink: #18181b; }
      `;
      document.head.append(style);
    }
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.schedule();
  }

  update(cards: OwnedCard[], tradeTags: TradeTags, settings: Settings) {
    this.enabled = settings.showBadges;
    this.byTitle = new Map(cards.map((c) => [normalize(c.title), tradeStatus(c, tradeTags, settings)]));
    this.schedule();
  }

  private schedule() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.paint();
    });
  }

  private paint() {
    for (const card of document.querySelectorAll<HTMLElement>('div[class*="glow-"]')) {
      const h3 = card.querySelector('h3');
      const existing = card.querySelector<HTMLElement>(`:scope > .${BADGE_CLASS}`);
      const status = this.enabled && h3 ? this.byTitle.get(normalize(h3.textContent)) : undefined;

      if (!status) {
        existing?.remove();
        continue;
      }
      if (existing?.dataset.s === status) continue;

      const badge = existing ?? document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.dataset.s = status;
      badge.dataset.label = LABEL[status];
      if (!existing) {
        if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
        card.append(badge);
      }
    }
  }
}
