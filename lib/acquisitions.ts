import { storage } from '#imports';
import type { Acquisition, AcquisitionSource, OwnedCard } from './types';

/** Action du site qui modifie la collection, repérée par le script d'interception. */
export interface SiteAction {
  at: number;
  path: string;
  source: AcquisitionSource | null;
  /** Identifiants trouvés dans la réponse (cartes / exemplaires reçus, le plus souvent). */
  ids: string[];
}

interface StoredAcquisition extends Acquisition {
  /** Exemplaires connus pour cette entrée : s'il augmente, un nouvel exemplaire est arrivé. */
  count: number;
}

const MAX_ACTIONS = 40;
const ACTION_TTL = 3 * 24 * 60 * 60 * 1000;

/** Date et provenance de chaque exemplaire (user_card id), mémorisées d'une synchro à l'autre. */
const acquisitionsItem = storage.defineItem<Record<string, StoredAcquisition> | null>('local:acquisitions', {
  fallback: null,
});

/** Dernières actions du site (ouverture de paquet, échange…), pour attribuer les nouveaux exemplaires. */
const siteActionsItem = storage.defineItem<SiteAction[]>('local:siteActions', { fallback: [] });

export function sourceFromPath(path: string): AcquisitionSource | null {
  const p = path.toLowerCase();
  if (/trade|exchange|echange|swap|offer/.test(p)) return 'trade';
  if (/pack|booster|open|draw|tirage|gacha|daily|reward|claim/.test(p)) return 'pack';
  return null;
}

export async function recordSiteAction(path: string, ids: string[] = []) {
  const now = Date.now();
  const actions = (await siteActionsItem.getValue()).filter((a) => now - a.at < ACTION_TTL);
  actions.push({ at: now, path, source: sourceFromPath(path), ids: ids.slice(0, 500) });
  await siteActionsItem.setValue(actions.slice(-MAX_ACTIONS));
}

/**
 * Complète `card.acquired` après un chargement complet :
 *  - les infos renvoyées par l'API (date, provenance) sont prioritaires ;
 *  - sinon, un exemplaire (ou un exemplaire en plus) jamais vu est rattaché à l'action du site
 *    qui l'a renvoyé, ou à défaut aux actions faites depuis la synchro précédente ;
 *  - au tout premier passage, la collection existante n'a pas de date connue.
 */
export async function mergeAcquisitions(cards: OwnedCard[], previousFullAt: number | null) {
  const [stored, actions] = await Promise.all([acquisitionsItem.getValue(), siteActionsItem.getValue()]);
  const firstRun = stored === null;
  const known = stored ?? {};
  const now = Date.now();
  const recent = actions.filter((a) => previousFullAt === null || a.at > previousFullAt - 5_000);
  const next: Record<string, StoredAcquisition> = {};

  const guess = (ownedId: string, cardId: string): Acquisition => {
    const exact = [...recent].reverse().find((a) => a.ids.includes(String(ownedId)) || a.ids.includes(String(cardId)));
    if (exact) return { at: exact.at, source: exact.source, estimated: false };
    const sources = new Set(recent.map((a) => a.source).filter(Boolean));
    const last = recent.at(-1);
    return {
      at: last?.at ?? now,
      source: sources.size === 1 ? [...sources][0]! : null,
      estimated: true,
    };
  };

  for (const card of cards) {
    card.acquired ??= {};
    for (const ownedId of card.ownedIds) {
      const count = card.ownedIds.length === 1 ? card.count : 1;
      const fromApi = card.acquired[ownedId];
      const prev = known[ownedId];
      let info: Acquisition;

      if (fromApi?.at && fromApi.source) info = fromApi;
      else if (firstRun) info = fromApi ?? { at: null, source: null, estimated: false };
      else if (!prev || count > prev.count) {
        const g = guess(ownedId, card.cardId);
        info = { at: fromApi?.at ?? g.at, source: fromApi?.source ?? g.source, estimated: !fromApi?.at && g.estimated };
      } else info = { at: fromApi?.at ?? prev.at, source: fromApi?.source ?? prev.source, estimated: !fromApi?.at && prev.estimated };

      card.acquired[ownedId] = info;
      next[ownedId] = { ...info, count };
    }
  }

  await acquisitionsItem.setValue(next);
  // Les actions déjà rattachées ne servent plus.
  await siteActionsItem.setValue([]);
}

/** Exemplaire le plus récemment obtenu. */
export function latestAcquisition(card: OwnedCard): Acquisition | null {
  let best: Acquisition | null = null;
  for (const a of Object.values(card.acquired ?? {})) if (a.at && (!best?.at || a.at > best.at)) best = a;
  return best;
}

export const SOURCE_LABEL: Record<AcquisitionSource, string> = { pack: 'Paquet', trade: 'Échange' };

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const dtf = new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' });

export function formatAcquiredAt(at: number, estimated = false) {
  const diff = (at - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rel =
    abs < 60 ? 'à l’instant'
    : abs < 3600 ? rtf.format(Math.round(diff / 60), 'minute')
    : abs < 86400 ? rtf.format(Math.round(diff / 3600), 'hour')
    : abs < 7 * 86400 ? rtf.format(Math.round(diff / 86400), 'day')
    : dtf.format(at);
  return estimated ? `≈ ${rel}` : rel;
}

export function describeAcquisition(a: Acquisition) {
  const parts = [a.source ? SOURCE_LABEL[a.source] : null, a.at ? formatAcquiredAt(a.at, a.estimated) : null].filter(Boolean);
  return parts.join(' · ');
}

export function fullDate(at: number) {
  return dtf.format(at);
}
