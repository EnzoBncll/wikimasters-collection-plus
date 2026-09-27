import type { Settings } from '@/lib/store';
import { tradeStatus, type TradeTags } from '@/lib/trade';
import type { OwnedCard, TradeStatus } from '@/lib/types';

const BADGE_CLASS = 'wmt-trade-badge';
const STYLE_ID = 'wmt-badge-style';

const normalize = (s: string | null | undefined) =>
  (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Pastilles 🟢 / 🔴 sur les cartes affichées par le site.
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
          position: absolute; top: 6px; left: 50%; transform: translateX(-50%); z-index: 30;
          padding: 1px 8px; border-radius: 999px; font: 700 10px/1.6 system-ui, sans-serif;
          color: #fff; pointer-events: none; box-shadow: 0 2px 6px rgb(0 0 0 / .45);
        }
        .${BADGE_CLASS}[data-s="trade"] { background: #22c55e; }
        .${BADGE_CLASS}[data-s="not_trade"] { background: #ef4444; }
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

      if (!status || status === 'unset') {
        existing?.remove();
        continue;
      }
      if (existing?.dataset.s === status) continue;

      const badge = existing ?? document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.dataset.s = status;
      badge.textContent = status === 'trade' ? 'Trade' : 'Not Trade';
      if (!existing) {
        if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
        card.append(badge);
      }
    }
  }
}
