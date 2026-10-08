import { sleep } from './queue';
import { restAll } from './supabase';
import { transport } from './transport';
import type { CopyInfo, OwnedCard } from './types';

/**
 * Défausse réelle sur WikiMasters (le même appel que le bouton « Défausser » du site).
 * Règles : on garde toujours au moins un exemplaire de chaque carte,
 * et on ne touche jamais aux exemplaires shiny ni aux favoris.
 */

export interface DiscardPlanItem {
  card: OwnedCard;
  /** Un id d'exemplaire par défausse (une ligne de plusieurs exemplaires apparaît plusieurs fois). */
  units: string[];
  /** Exemplaires protégés (shiny ou favori), jamais défaussés. */
  protectedCount: number;
  /** Exemplaires restants après la défausse. */
  kept: number;
}

/** Exemplaires à défausser pour une carte : on garde le plus ancien exemplaire non protégé s'il n'y en a pas de protégé. */
export function planCard(card: OwnedCard, copies: Record<string, CopyInfo> = card.copies ?? {}): DiscardPlanItem {
  const rows = card.ownedIds.map((id) => ({ id, ...(copies[id] ?? { count: 1, shiny: false, starred: false, at: null }) }));
  const protectedRows = rows.filter((r) => r.shiny || r.starred);
  const free = rows.filter((r) => !r.shiny && !r.starred).sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  const units: string[] = [];
  free.forEach((row, i) => {
    const keep = !protectedRows.length && i === 0 ? 1 : 0;
    for (let n = 0; n < Math.max(0, row.count - keep); n++) units.push(row.id);
  });
  const protectedCount = protectedRows.reduce((n, r) => n + r.count, 0);
  const total = rows.reduce((n, r) => n + r.count, 0);
  return { card, units, protectedCount, kept: total - units.length };
}

export function planDiscards(cards: OwnedCard[]): DiscardPlanItem[] {
  return cards.map((card) => planCard(card)).filter((item) => item.units.length > 0);
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
  ) {
    super(message);
  }
}

export async function discardCopy(ownedId: string): Promise<void> {
  const { status, text } = await transport().siteFetch(`/api/user-cards/${encodeURIComponent(ownedId)}/discard`, {
    method: 'POST',
    headers: { accept: 'application/json' },
  });
  if (status >= 200 && status < 300) return;
  let message = status === 429 ? 'Le site demande de ralentir' : `Défausse refusée (HTTP ${status})`;
  try {
    const json = JSON.parse(text);
    if (typeof json?.error === 'string') message = json.error;
  } catch {
    /* réponse non JSON */
  }
  throw new DiscardError(message, status);
}

export interface DiscardProgress {
  done: number;
  total: number;
  current: string | null;
  error: string | null;
}

/** Défausse une à une, environ une par seconde ; pause de 10 s si le site demande de ralentir. */
export async function runDiscards(
  plan: DiscardPlanItem[],
  { onProgress, shouldStop }: { onProgress: (p: DiscardProgress) => void; shouldStop: () => boolean },
): Promise<{ done: number; error: string | null; discarded: Map<string, number> }> {
  const total = plan.reduce((n, item) => n + item.units.length, 0);
  const discarded = new Map<string, number>();
  let done = 0;
  for (const item of plan) {
    for (const ownedId of item.units) {
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
  return { done, error: null, discarded };
}
