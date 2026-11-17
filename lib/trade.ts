import type { SiteTagsApi } from './api';
import type { QueueProgress } from './queue';
import { applyTagChanges } from './tagging';
import { LEGACY_TRADE_TAG_NAMES, type Settings } from './store';
import type { OwnedCard, SiteTag, TradeStatus } from './types';

export interface TradeTags {
  trade: SiteTag;
  /** Statut « Favori » : l'étoile du site (user_cards.starred), vue comme une étiquette virtuelle (FAVORITE_TAG). */
  notTrade: SiteTag;
  /** Absente des caches antérieurs à la 0.3 : recréée à la synchro suivante. */
  discard?: SiteTag;
  /** Ancienne étiquette « Not Trade », remplacée par les favoris : masquée, à convertir (convertLegacyNotTrade). */
  legacyNotTrade?: SiteTag;
  /**
   * Étiquettes Trade et Discard désactivées (réglage « statusTags ») : `trade` vaut alors TRADE_OFF,
   * une étiquette virtuelle posée sur aucune carte, et `discard` est absente. Seul le favori (étoile) reste.
   */
  off?: boolean;
}

/**
 * Favori du site (étoile) : une carte en favori est verrouillée, plus échangeable ni défaussable.
 * Vu comme une étiquette virtuelle pour tout le reste de l'extension (boîte d'envoi, filtres, revue) ;
 * siteTagsApi la traduit en user_cards.starred.
 */
export const FAVORITE_TAG: SiteTag = { id: 'wmt-favori', name: '★ Favori', color: '#eab308' };
export const isFavoriteTag = (tagId: string) => tagId === FAVORITE_TAG.id;

/** Place de l'étiquette Trade quand les étiquettes de statut sont désactivées : n'existe pas sur le site, ne correspond à aucune carte. */
export const TRADE_OFF: SiteTag = { id: 'wmt-trade-off', name: 'Trade (désactivé)', color: '#22c55e' };

/** Statuts utilisables : sans les étiquettes Trade / Discard, il ne reste que le favori. */
export const statusTagsOn = (tradeTags: TradeTags | null | undefined) => !tradeTags?.off;

/**
 * Étiquettes Trade / Discard (et leur ancien nom « Trade ») présentes sur le site, cherchées par nom :
 * ce que « Supprimer du site » retire quand on s'en passe.
 */
export function findStatusSiteTags(tags: SiteTag[], settings: Settings): SiteTag[] {
  const names = [settings.tradeTagName, LEGACY_TRADE_TAG_NAMES.trade, settings.discardTagName].map((n) => n.trim().toLowerCase());
  return tags.filter((t) => names.includes(t.name.trim().toLowerCase()));
}

/** Statuts qu'on peut poser (le reste est « sans statut »). */
export type StatusTarget = Exclude<TradeStatus, 'unset'>;

/** Étiquette du site correspondant à chaque statut. */
export function statusTags(tradeTags: TradeTags): Partial<Record<StatusTarget, SiteTag>> {
  if (tradeTags.off) return { not_trade: tradeTags.notTrade };
  return { trade: tradeTags.trade, not_trade: tradeTags.notTrade, discard: tradeTags.discard };
}

/** Identifiants des étiquettes système (statuts), à exclure des étiquettes perso. */
export function systemTagIds(tradeTags: TradeTags | null | undefined): Set<string> {
  if (!tradeTags) return new Set();
  return new Set([
    tradeTags.trade.id,
    tradeTags.notTrade.id,
    ...(tradeTags.discard ? [tradeTags.discard.id] : []),
    ...(tradeTags.legacyNotTrade ? [tradeTags.legacyNotTrade.id] : []),
  ]);
}

/**
 * Trouve (ou crée) les étiquettes Trade et Discard sur le site ; Trade est nommée avec sa pastille (🟢).
 * L'ancienne étiquette « Trade » est renommée, pas dupliquée. « Not Trade » n'est plus créée : c'est le favori du site.
 * Réglage « statusTags » coupé : rien n'est créé ni renommé, Trade et Discard redeviennent des étiquettes ordinaires.
 */
export async function ensureTradeTags(api: SiteTagsApi, settings: Settings): Promise<{ tags: SiteTag[]; tradeTags: TradeTags }> {
  let tags = await api.list();
  const find = (name: string) => tags.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (settings.statusTags === false) {
    const legacyNotTrade = find(settings.notTradeTagName) ?? find(LEGACY_TRADE_TAG_NAMES.notTrade);
    return { tags, tradeTags: offTradeTags(legacyNotTrade) };
  }

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
  const discard = await ensure(settings.discardTagName, null, '#71717a');
  const legacyNotTrade = find(settings.notTradeTagName) ?? find(LEGACY_TRADE_TAG_NAMES.notTrade);
  return { tags, tradeTags: { trade, notTrade: FAVORITE_TAG, discard, legacyNotTrade } };
}

/** Statuts sans étiquettes Trade / Discard : le favori seul. */
export function offTradeTags(legacyNotTrade?: SiteTag): TradeTags {
  return { trade: TRADE_OFF, notTrade: FAVORITE_TAG, legacyNotTrade, off: true };
}

/** Favori : étoile du site, ou ancienne étiquette Not Trade pas encore convertie. */
function isFavorite(card: OwnedCard, tradeTags: TradeTags) {
  return card.tagIds.includes(tradeTags.notTrade.id) || Boolean(tradeTags.legacyNotTrade && card.tagIds.includes(tradeTags.legacyNotTrade.id));
}

export function tradeStatus(card: OwnedCard, tradeTags: TradeTags, settings: Settings): TradeStatus {
  if (tradeTags.discard && card.tagIds.includes(tradeTags.discard.id)) return 'discard';
  if (isFavorite(card, tradeTags)) return 'not_trade';
  if (tradeTags.off) return 'unset';
  if (card.tagIds.includes(tradeTags.trade.id)) return 'trade';
  return settings.defaultTrade ? 'trade' : 'unset';
}

/** Statut réellement posé sur le site (sans le défaut implicite). */
export function explicitStatus(card: OwnedCard, tradeTags: TradeTags): TradeStatus {
  if (tradeTags.discard && card.tagIds.includes(tradeTags.discard.id)) return 'discard';
  if (isFavorite(card, tradeTags)) return 'not_trade';
  if (card.tagIds.includes(tradeTags.trade.id)) return 'trade';
  return 'unset';
}

/** Changements d'étiquettes pour poser un statut : ajoute l'étiquette cible, retire les deux autres (et l'ancien Not Trade). */
export function statusChanges(tradeTags: TradeTags, target: StatusTarget): { tagId: string; on: boolean }[] {
  const tags = statusTags(tradeTags);
  const on = tags[target];
  if (!on) return [];
  return [
    ...Object.entries(tags)
      .filter(([status, tag]) => status !== target && tag)
      .map(([, tag]) => ({ tagId: tag!.id, on: false })),
    ...(tradeTags.legacyNotTrade ? [{ tagId: tradeTags.legacyNotTrade.id, on: false }] : []),
    { tagId: on.id, on: true },
  ];
}

/** Retire le statut : plus aucune étiquette de statut (carte neutre). */
export function clearStatusChanges(tradeTags: TradeTags): { tagId: string; on: boolean }[] {
  return [...Object.values(statusTags(tradeTags)), tradeTags.legacyNotTrade].filter((t): t is SiteTag => Boolean(t)).map((t) => ({ tagId: t.id, on: false }));
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
