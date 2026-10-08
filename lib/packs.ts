import { storage } from '#imports';
import type { Rarity } from './types';

/**
 * Tirages de paquets observés sur le site (lecture seule des réponses d'ouverture),
 * et estimation du nombre de paquets disponibles sans interroger le site.
 */

export const RARITY_COLOR: Record<Rarity, string> = { L: '#ffe144', UR: '#fa9931', SR: '#ed6fa3', R: '#c6a7f2', PC: '#b1cff2', C: '#b8f2d5' };
export const RARITIES: Rarity[] = ['L', 'UR', 'SR', 'R', 'PC', 'C'];
export const RARITY_RANK: Record<string, number> = { L: 0, UR: 1, SR: 2, R: 3, PC: 4, C: 5 };
export const SHINY_COLOR = '#e9c15a';

export interface PullCard {
  id: string | null;
  name: string;
  r: Rarity | '?';
  /** Shiny. */
  s: boolean;
  /** Exemplaires possédés après le tirage (1 = nouvelle carte), si le site le dit. */
  o: number | null;
}

export interface PullRecord {
  t: number;
  /** open | special | pro-daily | grace */
  src: string;
  cards: PullCard[];
}

export interface PackState {
  n: number;
  max: number;
  /** Prochain paquet (ms), null si plein. */
  nextAt: number | null;
  period: number;
  observedAt: number;
}

export interface PackMeta {
  /** Période de régénération détectée (10 min, ou 3 min en PRO). */
  detectedPeriod: number | null;
  /** Jour (AAAA-MM-JJ) du dernier pack PRO réclamé. */
  proClaimedDate: string | null;
  /** Cycle déjà notifié (évite deux notifications pour le même remplissage). */
  notifiedFor: string | null;
}

const MAX_PULLS = 20000;

export const pullsItem = storage.defineItem<PullRecord[]>('local:pulls', { fallback: [] });
export const packStateItem = storage.defineItem<PackState | null>('local:packState', { fallback: null });
export const packMetaItem = storage.defineItem<PackMeta>('local:packMeta', {
  fallback: { detectedPeriod: null, proClaimedDate: null, notifiedFor: null },
});

export const NORMAL_PERIOD = 600_000;
export const PRO_PERIOD = 180_000;

export function periodFor(mode: 'auto' | 'normal' | 'pro', detected: number | null): number {
  if (mode === 'pro') return PRO_PERIOD;
  if (mode === 'normal') return NORMAL_PERIOD;
  return detected || NORMAL_PERIOD;
}

/** Paquets disponibles à un instant donné, d'après le dernier état observé. */
export function predict(state: PackState | null, now = Date.now()) {
  if (!state || typeof state.n !== 'number') return null;
  const { max, period } = state;
  if (state.n >= max || !state.nextAt) return { n: Math.min(state.n, max), max, nextAt: null, fullAt: null, period };
  const fullAt = state.nextAt + (max - state.n - 1) * period;
  let n = state.n;
  let nextAt: number | null = state.nextAt;
  if (now >= nextAt) {
    const k = 1 + Math.floor((now - nextAt) / period);
    n = Math.min(max, n + k);
    nextAt = n >= max ? null : nextAt + k * period;
  }
  return { n, max, nextAt, fullAt: n >= max ? null : fullAt, period };
}

/** Moment où le nombre de paquets atteindra `target`. */
export function thresholdAt(state: PackState | null, target: number): number | null {
  if (!state || !state.nextAt || target <= state.n) return null;
  const t = Math.min(target, state.max);
  return state.nextAt + (t - state.n - 1) * state.period;
}

export async function addPull(record: PullRecord): Promise<PullRecord[]> {
  const list = [...(await pullsItem.getValue()), record];
  if (list.length > MAX_PULLS) list.splice(0, list.length - MAX_PULLS);
  await pullsItem.setValue(list);
  return list;
}

/** Paquets ouverts depuis la dernière carte qui vérifie `test` (ouvertures normales). */
export function packsSince(pulls: PullRecord[], test: (c: PullCard) => boolean): string {
  const opens = pulls.filter((p) => p.src === 'open');
  for (let i = opens.length - 1; i >= 0; i--) if (opens[i]!.cards.some(test)) return String(opens.length - 1 - i);
  return opens.length ? `≥ ${opens.length}` : '–';
}

export function rarityCounts(pulls: PullRecord[]) {
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  let total = 0;
  let shiny = 0;
  for (const p of pulls) {
    for (const c of p.cards) {
      total++;
      if (c.s) shiny++;
      if (c.r in counts) counts[c.r as Rarity]++;
    }
  }
  return { counts, total, shiny };
}

export function fmtDuration(ms: number): string {
  if (ms <= 0) return 'maintenant';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function ago(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} j`;
}

export const today = () => new Date().toLocaleDateString('sv');

export function pullsCsv(pulls: PullRecord[]): string {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['date', 'source', 'id', 'nom', 'rarete', 'shiny', 'exemplaires']];
  for (const p of pulls) for (const c of p.cards) rows.push([new Date(p.t).toISOString(), p.src, c.id ?? '', c.name, c.r, c.s ? '1' : '0', c.o == null ? '' : String(c.o)]);
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\n');
}

/** Nom de carte, quel que soit le champ renvoyé par le site. */
export const cardName = (c: any): string => c?.wikipedia_title || c?.name || c?.title || c?.wiki_title || `#${c?.id ?? '?'}`;

/** Une réponse d'ouverture de paquet → enregistrement (et nombre d'exemplaires possédés par carte). */
export function recordFromResponse(endpoint: string, data: any): { record: PullRecord; owned: Record<string, number> | null } | null {
  if (!Array.isArray(data?.cards) || !data.cards.length) return null;
  let owned: Record<string, number> | null = null;
  if (Array.isArray(data.owned_copies)) {
    owned = {};
    for (const u of data.owned_copies) if (u?.card_id != null) owned[String(u.card_id)] = (owned[String(u.card_id)] ?? 0) + Math.max(1, Number(u.count) || 1);
  }
  const record: PullRecord = {
    t: Date.now(),
    src: endpoint.split('/').pop() || 'open',
    cards: data.cards.map((c: any) => ({
      id: c?.id != null ? String(c.id) : null,
      name: cardName(c),
      r: (RARITIES as string[]).includes(c?.rarity) ? c.rarity : '?',
      s: Boolean(c?.is_shiny),
      o: owned && c?.id != null ? (owned[String(c.id)] ?? null) : null,
    })),
  };
  return { record, owned };
}
