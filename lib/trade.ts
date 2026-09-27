import type { SiteTagsApi } from './api';
import type { QueueProgress } from './queue';
import { applyTagChanges } from './tagging';
import { LEGACY_TRADE_TAG_NAMES, type Settings } from './store';
import type { OwnedCard, SiteTag, TradeStatus } from './types';

export interface TradeTags {
  trade: SiteTag;
  notTrade: SiteTag;
}

/**
 * Trouve (ou crée) les étiquettes Trade et Not Trade sur le site, nommées avec leur pastille (🟢 / 🔴).
 * Les anciennes étiquettes « Trade » / « Not Trade » sont renommées, pas dupliquées.
 */
export async function ensureTradeTags(api: SiteTagsApi, settings: Settings): Promise<{ tags: SiteTag[]; tradeTags: TradeTags }> {
  let tags = await api.list();
  const find = (name: string) => tags.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

  const ensure = async (name: string, legacy: string, color: string) => {
    let tag = find(name);
    if (tag) return tag;
    const old = find(legacy);
    if (old) {
      await api.update(old.id, { name });
      tag = { ...old, name };
      tags = tags.map((t) => (t.id === old.id ? tag! : t));
      return tag;
    }
    tag = await api.create(name, color);
    tags = [...tags, tag];
    return tag;
  };

  const trade = await ensure(settings.tradeTagName, LEGACY_TRADE_TAG_NAMES.trade, '#22c55e');
  const notTrade = await ensure(settings.notTradeTagName, LEGACY_TRADE_TAG_NAMES.notTrade, '#ef4444');
  return { tags, tradeTags: { trade, notTrade } };
}

export function tradeStatus(card: OwnedCard, tradeTags: TradeTags, settings: Settings): TradeStatus {
  if (card.tagIds.includes(tradeTags.notTrade.id)) return 'not_trade';
  if (card.tagIds.includes(tradeTags.trade.id)) return 'trade';
  return settings.defaultTrade ? 'trade' : 'unset';
}

/** Statut réellement posé sur le site (sans le défaut implicite). */
export function explicitStatus(card: OwnedCard, tradeTags: TradeTags): TradeStatus {
  if (card.tagIds.includes(tradeTags.notTrade.id)) return 'not_trade';
  if (card.tagIds.includes(tradeTags.trade.id)) return 'trade';
  return 'unset';
}

/** Pose le statut voulu : ajoute l'étiquette cible, retire l'autre. */
export function applyTradeStatus(
  api: SiteTagsApi,
  cards: OwnedCard[],
  target: 'trade' | 'not_trade',
  tradeTags: TradeTags,
  onProgress?: (p: QueueProgress) => void,
): Promise<QueueProgress> {
  const [on, off] = target === 'trade' ? [tradeTags.trade, tradeTags.notTrade] : [tradeTags.notTrade, tradeTags.trade];
  return applyTagChanges(api, cards, [{ tagId: off.id, on: false }, { tagId: on.id, on: true }], onProgress);
}

/** Cartes nouvelles depuis la dernière revue : jamais vues, ou avec des exemplaires en plus. */
export function newCardIds(cards: OwnedCard[], snapshot: Record<string, number> | null): Set<string> {
  if (!snapshot) return new Set(cards.map((c) => c.cardId));
  return new Set(cards.filter((c) => c.count > (snapshot[c.cardId] ?? 0)).map((c) => c.cardId));
}
