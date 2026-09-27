import type { OwnedCard } from '@/lib/types';
import { RARITY_VAR } from './rarity';

/** Visuel de remplacement (SVG) pour les cartes sans image. */
export function placeholderImage(card: OwnedCard) {
  const color = card.rarity ? getComputedStyle(document.documentElement).getPropertyValue(RARITY_VAR[card.rarity].slice(4, -1)).trim() || '#a1a1aa' : '#a1a1aa';
  const letter = (card.title.charAt(0) || '?').toUpperCase().replace(/[<&>"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#18181b"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="190" font-family="system-ui,sans-serif" font-size="140" font-weight="900" fill="rgba(255,255,255,.85)" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const cardImage = (card: OwnedCard) => card.imageUrl || placeholderImage(card);
