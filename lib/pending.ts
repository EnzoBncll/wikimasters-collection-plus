import { storage } from '#imports';
import type { TagChange } from './tagging';
import type { OwnedCard } from './types';

/**
 * Modifications d'étiquettes pas encore envoyées au site : carte → étiquette → posée (true) / retirée (false).
 * Le statut Trade / Not Trade n'est qu'un cas particulier (deux étiquettes système).
 */
export type PendingChanges = Record<string, Record<string, boolean>>;

export const pendingItem = storage.defineItem<PendingChanges>('local:pendingTagChanges', { fallback: {} });

/** Ajoute des changements ; un changement qui ramène la carte à son état sur le site s'annule. */
export function stageChanges(pending: PendingChanges, remote: Map<string, OwnedCard>, cardIds: string[], changes: TagChange[]): PendingChanges {
  const next: PendingChanges = { ...pending };
  for (const cardId of cardIds) {
    const card = remote.get(cardId);
    if (!card) continue;
    const entry = { ...next[cardId] };
    for (const { tagId, on } of changes) {
      if (card.tagIds.includes(tagId) === on) delete entry[tagId];
      else entry[tagId] = on;
    }
    if (Object.keys(entry).length) next[cardId] = entry;
    else delete next[cardId];
  }
  return next;
}

/** Retire ce qui est déjà vrai sur le site (après une synchro ou un envoi) et les cartes disparues. */
export function prunePending(pending: PendingChanges, remote: Map<string, OwnedCard>, knownTags?: Set<string>): PendingChanges {
  const next: PendingChanges = {};
  for (const [cardId, entry] of Object.entries(pending)) {
    const card = remote.get(cardId);
    if (!card) continue;
    const kept = Object.fromEntries(
      Object.entries(entry).filter(([tagId, on]) => (!knownTags || knownTags.has(tagId)) && card.tagIds.includes(tagId) !== on),
    );
    if (Object.keys(kept).length) next[cardId] = kept;
  }
  return next;
}

/** Cartes telles qu'elles seront après envoi : copies avec `tagIds` modifié (les exemplaires restent ceux du site). */
export function withPending(cards: OwnedCard[], pending: PendingChanges): OwnedCard[] {
  if (!Object.keys(pending).length) return cards;
  return cards.map((card) => {
    const entry = pending[card.cardId];
    if (!entry) return card;
    const tagIds = new Set(card.tagIds);
    for (const [tagId, on] of Object.entries(entry)) {
      if (on) tagIds.add(tagId);
      else tagIds.delete(tagId);
    }
    return { ...card, tagIds: [...tagIds] };
  });
}

/** Regroupe par (étiquette, pose/retrait) pour envoyer en lots. */
export function groupPending(pending: PendingChanges): { tagId: string; on: boolean; cardIds: string[] }[] {
  const groups = new Map<string, { tagId: string; on: boolean; cardIds: string[] }>();
  for (const [cardId, entry] of Object.entries(pending)) {
    for (const [tagId, on] of Object.entries(entry)) {
      const key = `${tagId}:${on}`;
      const group = groups.get(key) ?? { tagId, on, cardIds: [] };
      group.cardIds.push(cardId);
      groups.set(key, group);
    }
  }
  // Retraits d'abord : passer de Trade à Not Trade ne laisse jamais les deux étiquettes posées.
  return [...groups.values()].sort((a, b) => Number(a.on) - Number(b.on));
}

export function pendingCount(pending: PendingChanges) {
  return Object.keys(pending).length;
}
