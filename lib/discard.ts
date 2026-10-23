import { sleep } from './queue';
import { restAll } from './supabase';
import { transport } from './transport';
import type { CopyInfo, OwnedCard } from './types';

/**
 * Défausse réelle sur WikiMasters (le même appel que le bouton « Défausser » du site).
 * Règles : Discard veut dire « je n'en veux plus » : tous les exemplaires partent (en wikibidoux),
 * sauf les shiny et les favoris, jamais touchés. « Mes doublons » garde un exemplaire (keepOne).
 */

export interface DiscardPlanItem {
  card: OwnedCard;
  /** Un id d'exemplaire par défausse (une ligne de plusieurs exemplaires apparaît plusieurs fois). */
  units: string[];
  /**
   * Les lignes d'un seul exemplaire qui partent en entier : celles-là peuvent partir en un seul appel groupé.
   * Pour une pile (plusieurs exemplaires sur une ligne), on ne sait pas si la défausse groupée en retire un ou tous.
   */
  singles: string[];
  /** Exemplaires protégés (shiny ou favori), jamais défaussés. */
  protectedCount: number;
  /** Exemplaires restants après la défausse. */
  kept: number;
}

/**
 * Exemplaires à défausser pour une carte. Avec `keepOne` (doublons), on garde le plus ancien exemplaire
 * non protégé s'il n'y en a pas de protégé ; sinon tout ce qui n'est pas protégé part.
 */
export function planCard(card: OwnedCard, copies: Record<string, CopyInfo> = card.copies ?? {}, keepOne = false): DiscardPlanItem {
  const rows = card.ownedIds.map((id) => ({ id, ...(copies[id] ?? { count: 1, shiny: false, starred: false, at: null }) }));
  const protectedRows = rows.filter((r) => r.shiny || r.starred);
  const free = rows.filter((r) => !r.shiny && !r.starred).sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  const units: string[] = [];
  const singles: string[] = [];
  free.forEach((row, i) => {
    const keep = keepOne && !protectedRows.length && i === 0 ? 1 : 0;
    for (let n = 0; n < Math.max(0, row.count - keep); n++) units.push(row.id);
    if (row.count === 1 && !keep) singles.push(row.id);
  });
  const protectedCount = protectedRows.reduce((n, r) => n + r.count, 0);
  const total = rows.reduce((n, r) => n + r.count, 0);
  return { card, units, singles, protectedCount, kept: total - units.length };
}

export function planDiscards(cards: OwnedCard[], keepOne = false): DiscardPlanItem[] {
  return cards.map((card) => planCard(card, card.copies, keepOne)).filter((item) => item.units.length > 0);
}

/** Shiny / favori / nombre relus sur le site juste avant de défausser (la collection en cache peut dater). */
export async function freshCopies(ownedIds: string[]): Promise<Record<string, CopyInfo>> {
  const out: Record<string, CopyInfo> = {};
  for (let i = 0; i < ownedIds.length; i += 80) {
    const ids = ownedIds.slice(i, i + 80);
    const rows = await restAll<{ id: string; count: number | null; is_shiny: boolean | null; starred: boolean | null; obtained_at: string | null }>(
      `user_cards?select=id,count,is_shiny,starred,obtained_at&id=in.(${ids.join(',')})`,
    );
    for (const r of rows) {
      const at = r.obtained_at ? Date.parse(r.obtained_at) : NaN;
      out[r.id] = { count: Math.max(1, Number(r.count) || 1), shiny: Boolean(r.is_shiny), starred: Boolean(r.starred), at: Number.isNaN(at) ? null : at };
    }
  }
  return out;
}

export class DiscardError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Le site demande une vérification humaine (Turnstile) : à faire sur WikiMasters avant de continuer. */
    readonly humanCheck = false,
  ) {
    super(message);
  }
}

/** Le site relit le solde de wikibidoux affiché sur cet événement (il l'émet lui-même après une défausse). */
export function refreshSiteBalance() {
  if (typeof window !== 'undefined' && location.hostname.endsWith('wiki-masters.com')) window.dispatchEvent(new CustomEvent('wikimasters:wikibidous-balance-refresh'));
}

export async function discardCopy(ownedId: string): Promise<void> {
  const { status, text } = await transport().siteFetch(`/api/user-cards/${encodeURIComponent(ownedId)}/discard`, {
    method: 'POST',
    headers: { accept: 'application/json' },
  });
  if (status >= 200 && status < 300) return;
  let message = status === 429 ? 'Le site demande de ralentir' : `Défausse refusée (HTTP ${status})`;
  let humanCheck = false;
  try {
    const json = JSON.parse(text);
    if (typeof json?.error === 'string') message = json.error;
    humanCheck = json?.code === 'human_verification_required' || json?.human_verification_required === true;
  } catch {
    /* réponse non JSON */
  }
  if (humanCheck) message = 'WikiMasters demande une vérification : fais-la sur le site (une défausse à la main la déclenche), puis relance';
  throw new DiscardError(message, status, humanCheck);
}

/** Ids d'exemplaires dans `failed` : le site ne documente pas sa forme (ids, ou objets avec un id). */
const failedIds = (failed: unknown): string[] =>
  Array.isArray(failed)
    ? failed.map((f) => (typeof f === 'string' ? f : typeof f === 'object' && f ? String((f as Record<string, unknown>).id ?? (f as Record<string, unknown>).card_id ?? (f as Record<string, unknown>).user_card_id ?? '') : '')).filter(Boolean)
    : [];

/**
 * Défausse groupée du site (le bouton « Défausser la sélection » de la collection) : un appel pour plusieurs lignes.
 * Rend les ids défaussés et ceux que le site a refusés ; `null` si la route n'existe plus (on repasse alors une à une).
 */
export async function bulkDiscard(ownedIds: string[]): Promise<{ count: number; discarded: string[]; failed: string[] } | null> {
  const { status, text } = await transport().siteFetch('/api/user-cards/bulk-discard', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ card_ids: ownedIds }),
  });
  if (status === 404 || status === 405) return null;
  let json: { error?: unknown; code?: unknown; human_verification_required?: unknown; discarded_count?: unknown; failed?: unknown } = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* réponse non JSON */
  }
  if (status < 200 || status >= 300) {
    const humanCheck = json.code === 'human_verification_required' || json.human_verification_required === true;
    const message = humanCheck
      ? 'WikiMasters demande une vérification : fais-la sur le site (une défausse à la main la déclenche), puis relance'
      : typeof json.error === 'string'
        ? json.error
        : status === 429
          ? 'Le site demande de ralentir'
          : `Défausse refusée (HTTP ${status})`;
    throw new DiscardError(message, status, humanCheck);
  }
  const failed = new Set(failedIds(json.failed));
  // Sans liste d'échecs lisible, on ne garde que le nombre : on ne sait pas lesquels sont partis, la synchro le dira.
  if (!failed.size && typeof json.discarded_count === 'number' && json.discarded_count < ownedIds.length) {
    return { count: json.discarded_count, discarded: [], failed: [] };
  }
  const discarded = ownedIds.filter((id) => !failed.has(id));
  return { count: discarded.length, discarded, failed: [...failed] };
}

export interface DiscardProgress {
  done: number;
  total: number;
  current: string | null;
  error: string | null;
}

/**
 * D'abord les exemplaires seuls, par paquets de 50 en un appel groupé ; puis les piles, une à une,
 * environ une par seconde ; pause de 10 s si le site demande de ralentir.
 */
export async function runDiscards(
  plan: DiscardPlanItem[],
  { onProgress, shouldStop }: { onProgress: (p: DiscardProgress) => void; shouldStop: () => boolean },
): Promise<{ done: number; error: string | null; discarded: Map<string, number> }> {
  const total = plan.reduce((n, item) => n + item.units.length, 0);
  const discarded = new Map<string, number>();
  let done = 0;
  let refused = 0;
  const cardOf = new Map(plan.flatMap((item) => item.singles.map((id) => [id, item.card] as const)));
  const sent = new Set<string>();
  const singles = [...cardOf.keys()];
  let slowedAt = -1;
  for (let i = 0; i < singles.length; i += 50) {
    if (shouldStop()) return { done, error: null, discarded };
    const batch = singles.slice(i, i + 50);
    onProgress({ done, total, current: batchLabel(batch.length), error: null });
    let out: Awaited<ReturnType<typeof bulkDiscard>>;
    try {
      out = await bulkDiscard(batch);
      if (out === null) break; // route absente : le reste part une à une
    } catch (error) {
      if (!(error instanceof DiscardError) || error.status !== 429 || slowedAt === i) return { done, error: (error as Error).message, discarded };
      onProgress({ done, total, current: batchLabel(batch.length), error: 'Le site demande de ralentir, pause de 10 s…' });
      await sleep(10_000);
      slowedAt = i;
      i -= 50; // on renvoie ce paquet une seule fois
      continue;
    }
    for (const id of batch) sent.add(id);
    for (const id of out.discarded) {
      const card = cardOf.get(id)!;
      discarded.set(card.cardId, (discarded.get(card.cardId) ?? 0) + 1);
    }
    done += out.count;
    refused += out.failed.length;
    onProgress({ done, total, current: null, error: null });
    await sleep(1000);
  }
  for (const item of plan) {
    for (const ownedId of item.units) {
      if (sent.has(ownedId)) continue;
      if (shouldStop()) return { done, error: null, discarded };
      onProgress({ done, total, current: item.card.title, error: null });
      try {
        await discardCopy(ownedId);
      } catch (error) {
        if (!(error instanceof DiscardError) || error.status !== 429) return { done, error: (error as Error).message, discarded };
        onProgress({ done, total, current: item.card.title, error: 'Le site demande de ralentir, pause de 10 s…' });
        await sleep(10_000);
        try {
          await discardCopy(ownedId);
        } catch (again) {
          return { done, error: (again as Error).message, discarded };
        }
      }
      done++;
      discarded.set(item.card.cardId, (discarded.get(item.card.cardId) ?? 0) + 1);
      onProgress({ done, total, current: item.card.title, error: null });
      await sleep(1000);
    }
  }
  return { done, error: refused ? `${refused} exemplaire${refused > 1 ? 's' : ''} refusé${refused > 1 ? 's' : ''} par le site (favori, échange en cours…)` : null, discarded };
}

const batchLabel = (n: number) => `${n} exemplaire${n > 1 ? 's' : ''} d'un coup`;
