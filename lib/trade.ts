import type { SiteTagsApi } from './api';
import { runQueue, type QueueProgress } from './queue';
import type { Settings } from './store';
import type { OwnedCard, SiteTag, TradeStatus } from './types';

export interface TradeTags {
  trade: SiteTag;
  notTrade: SiteTag;
}

/** Trouve (ou crée) les étiquettes Trade et Not Trade sur le site. */
export async function ensureTradeTags(api: SiteTagsApi, settings: Settings): Promise<{ tags: SiteTag[]; tradeTags: TradeTags }> {
  let tags = await api.list();
  const find = (name: string) => tags.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

  let trade = find(settings.tradeTagName);
  if (!trade) {
    trade = await api.create(settings.tradeTagName, '#22c55e');
    tags = [...tags, trade];
  }
  let notTrade = find(settings.notTradeTagName);
  if (!notTrade) {
    notTrade = await api.create(settings.notTradeTagName, '#ef4444');
    tags = [...tags, notTrade];
  }
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

/**
 * Pose le statut voulu sur tous les exemplaires des cartes : ajoute l'étiquette cible, retire l'autre.
 * Les appels sont groupés par lots (une requête pour des centaines d'exemplaires).
 */
export async function applyTradeStatus(
  api: SiteTagsApi,
  cards: OwnedCard[],
  target: 'trade' | 'not_trade',
  tradeTags: TradeTags,
  onProgress?: (p: QueueProgress) => void,
): Promise<QueueProgress> {
  const addTag = target === 'trade' ? tradeTags.trade.id : tradeTags.notTrade.id;
  const removeTag = target === 'trade' ? tradeTags.notTrade.id : tradeTags.trade.id;

  const toRemove: string[] = [];
  const toAdd: string[] = [];
  for (const card of cards) {
    for (const ownedId of card.ownedIds) {
      const tags = card.ownedTags[ownedId] ?? [];
      if (tags.includes(removeTag)) toRemove.push(ownedId);
      if (!tags.includes(addTag)) toAdd.push(ownedId);
    }
  }

  const BATCH = 80;
  const jobs = [
    ...chunk(toRemove, BATCH).map((ids) => ({ ids: new Set(ids), run: () => api.removeMany(removeTag, ids), tag: removeTag, add: false })),
    ...chunk(toAdd, BATCH).map((ids) => ({ ids: new Set(ids), run: () => api.addMany(addTag, ids), tag: addTag, add: true })),
  ];
  const touched = new Set<string>();

  const progress = await runQueue(
    jobs,
    async (job) => {
      await job.run();
      for (const card of cards) {
        for (const ownedId of card.ownedIds) {
          if (!job.ids.has(ownedId)) continue;
          const tags = card.ownedTags[ownedId] ?? [];
          card.ownedTags[ownedId] = job.add ? [...new Set([...tags, job.tag])] : tags.filter((t) => t !== job.tag);
          touched.add(card.cardId);
        }
      }
    },
    { concurrency: 2, minDelayMs: 150, onProgress },
  );

  for (const card of cards) {
    if (!touched.has(card.cardId)) continue;
    card.tagIds = [...new Set(Object.values(card.ownedTags).flat())];
  }
  return progress;
}

const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Cartes nouvelles depuis la dernière revue : jamais vues, ou avec des exemplaires en plus. */
export function newCardIds(cards: OwnedCard[], snapshot: Record<string, number> | null): Set<string> {
  if (!snapshot) return new Set(cards.map((c) => c.cardId));
  return new Set(cards.filter((c) => c.count > (snapshot[c.cardId] ?? 0)).map((c) => c.cardId));
}
