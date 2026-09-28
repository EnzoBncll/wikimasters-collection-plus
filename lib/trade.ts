import type { SiteTagsApi } from './api';
import type { QueueProgress } from './queue';
import { applyTagChanges } from './tagging';
import { LEGACY_TRADE_TAG_NAMES, type Settings } from './store';
import type { OwnedCard, SiteTag, TradeStatus } from './types';

export interface TradeTags {
  trade: SiteTag;
  notTrade: SiteTag;
  /** Absente des caches antérieurs à la 0.3 : recréée à la synchro suivante. */
  discard?: SiteTag;
}

/** Statuts qu'on peut poser (le reste est « sans statut »). */
export type StatusTarget = Exclude<TradeStatus, 'unset'>;

/** Étiquette du site correspondant à chaque statut. */
export function statusTags(tradeTags: TradeTags): Partial<Record<StatusTarget, SiteTag>> {
  return { trade: tradeTags.trade, not_trade: tradeTags.notTrade, discard: tradeTags.discard };
}

/** Identifiants des étiquettes système (statuts), à exclure des étiquettes perso. */
export function systemTagIds(tradeTags: TradeTags | null | undefined): Set<string> {
  if (!tradeTags) return new Set();
  return new Set([tradeTags.trade.id, tradeTags.notTrade.id, ...(tradeTags.discard ? [tradeTags.discard.id] : [])]);
}

/**
 * Trouve (ou crée) les étiquettes Trade et Not Trade sur le site, nommées avec leur pastille (🟢 / 🔴).
 * Les anciennes étiquettes « Trade » / « Not Trade » sont renommées, pas dupliquées.
 */
export async function ensureTradeTags(api: SiteTagsApi, settings: Settings): Promise<{ tags: SiteTag[]; tradeTags: TradeTags }> {
  let tags = await api.list();
  const find = (name: string) => tags.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

  const ensure = async (name: string, legacy: string | null, color: string) => {
    let tag = find(name);
    if (tag) return tag;
    const old = legacy ? find(legacy) : undefined;
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
  const discard = await ensure(settings.discardTagName, null, '#71717a');
  return { tags, tradeTags: { trade, notTrade, discard } };
}

export function tradeStatus(card: OwnedCard, tradeTags: TradeTags, settings: Settings): TradeStatus {
  if (tradeTags.discard && card.tagIds.includes(tradeTags.discard.id)) return 'discard';
  if (card.tagIds.includes(tradeTags.notTrade.id)) return 'not_trade';
  if (card.tagIds.includes(tradeTags.trade.id)) return 'trade';
  return settings.defaultTrade ? 'trade' : 'unset';
}

/** Statut réellement posé sur le site (sans le défaut implicite). */
export function explicitStatus(card: OwnedCard, tradeTags: TradeTags): TradeStatus {
  if (tradeTags.discard && card.tagIds.includes(tradeTags.discard.id)) return 'discard';
  if (card.tagIds.includes(tradeTags.notTrade.id)) return 'not_trade';
  if (card.tagIds.includes(tradeTags.trade.id)) return 'trade';
  return 'unset';
}

/** Changements d'étiquettes pour poser un statut : ajoute l'étiquette cible, retire les deux autres. */
export function statusChanges(tradeTags: TradeTags, target: StatusTarget): { tagId: string; on: boolean }[] {
  const tags = statusTags(tradeTags);
  const on = tags[target];
  if (!on) return [];
  return [
    ...Object.entries(tags)
      .filter(([status, tag]) => status !== target && tag)
      .map(([, tag]) => ({ tagId: tag!.id, on: false })),
    { tagId: on.id, on: true },
  ];
}

/** Pose le statut voulu directement sur le site. */
export function applyTradeStatus(
  api: SiteTagsApi,
  cards: OwnedCard[],
  target: StatusTarget,
  tradeTags: TradeTags,
  onProgress?: (p: QueueProgress) => void,
): Promise<QueueProgress> {
  return applyTagChanges(api, cards, statusChanges(tradeTags, target), onProgress);
}

/** Cartes nouvelles depuis la dernière revue : jamais vues, ou avec des exemplaires en plus. */
export function newCardIds(cards: OwnedCard[], snapshot: Record<string, number> | null): Set<string> {
  if (!snapshot) return new Set(cards.map((c) => c.cardId));
  return new Set(cards.filter((c) => c.count > (snapshot[c.cardId] ?? 0)).map((c) => c.cardId));
}
