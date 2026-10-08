import { RARITIES, RARITY_RANK, type PullCard, type PullRecord } from './packs';
import type { Rarity } from './types';

/**
 * Calculs des statistiques de tirage (page d'ouverture) : période, résumé, records, prévisions, historique par jour.
 * Fonctions pures, sur l'historique enregistré par lib/packs.ts.
 */

export type StatsPeriod = 'today' | 'week' | 'all';

export const PERIOD_LABEL: Record<StatsPeriod, string> = { today: "Aujourd'hui", week: '7 jours', all: 'Tout' };

const DAY = 86_400_000;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function inPeriod(pulls: PullRecord[], period: StatsPeriod, now = Date.now()): PullRecord[] {
  if (period === 'all') return pulls;
  const from = period === 'today' ? startOfDay(now) : startOfDay(now) - 6 * DAY;
  return pulls.filter((p) => p.t >= from);
}

/**
 * Taux annoncés du Pack ++ (15 cartes, Club), d'après les règles publiées (wikimasters.fr/regles).
 * Les paquets standards n'ont pas de taux publics : on compare alors à ta propre moyenne.
 */
export const PACK_PLUS_RATES: Record<Rarity, number> = { C: 0.4, PC: 0.2, R: 0.25, SR: 0.1, UR: 0.045, L: 0.005 };

/** Points d'un tirage, pour désigner le « meilleur » paquet ou jour. */
const WEIGHT: Record<string, number> = { L: 100, UR: 30, SR: 10, R: 3, PC: 1, C: 0 };
export const cardScore = (c: PullCard) => (WEIGHT[c.r] ?? 0) + (c.s ? 20 : 0);
export const packScore = (p: PullRecord) => p.cards.reduce((n, c) => n + cardScore(c), 0);

export const bestCard = <T extends PullCard>(cards: T[]): T | undefined =>
  [...cards].sort((a, b) => (RARITY_RANK[a.r] ?? 9) - (RARITY_RANK[b.r] ?? 9) || Number(b.s) - Number(a.s))[0];

export interface Summary {
  packs: number;
  cards: number;
  fresh: number;
  /** Cartes dont on connaît le nombre d'exemplaires (pour le taux de nouvelles). */
  known: number;
  shiny: number;
  counts: Record<Rarity, number>;
}

export function summarize(pulls: PullRecord[]): Summary {
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  let cards = 0;
  let fresh = 0;
  let known = 0;
  let shiny = 0;
  for (const p of pulls) {
    for (const c of p.cards) {
      cards++;
      if (c.s) shiny++;
      if (c.o != null) {
        known++;
        if (c.o === 1) fresh++;
      }
      if (c.r in counts) counts[c.r as Rarity]++;
    }
  }
  return { packs: pulls.length, cards, fresh, known, shiny, counts };
}

/** Plus longue suite de paquets ouverts sans carte qui vérifie `test`, et la suite en cours. */
export function streaks(pulls: PullRecord[], test: (c: PullCard) => boolean): { longest: number; current: number } {
  let longest = 0;
  let current = 0;
  for (const p of pulls.filter((x) => x.src === 'open')) {
    if (p.cards.some(test)) current = 0;
    else current++;
    longest = Math.max(longest, current);
  }
  return { longest, current };
}

export interface DayStat {
  day: number;
  packs: number;
  cards: number;
  L: number;
  UR: number;
  SR: number;
  shiny: number;
  score: number;
}

/** Une entrée par jour sur les `days` derniers jours (jours vides compris), du plus ancien au plus récent. */
export function byDay(pulls: PullRecord[], days = 30, now = Date.now()): DayStat[] {
  const today = startOfDay(now);
  const out: DayStat[] = Array.from({ length: days }, (_, i) => ({ day: today - (days - 1 - i) * DAY, packs: 0, cards: 0, L: 0, UR: 0, SR: 0, shiny: 0, score: 0 }));
  const first = out[0]!.day;
  for (const p of pulls) {
    if (p.t < first) continue;
    const d = out[Math.min(days - 1, Math.floor((startOfDay(p.t) - first) / DAY + 0.5))];
    if (!d) continue;
    d.packs++;
    for (const c of p.cards) {
      d.cards++;
      if (c.r === 'L') d.L++;
      if (c.r === 'UR') d.UR++;
      if (c.r === 'SR') d.SR++;
      if (c.s) d.shiny++;
      d.score += cardScore(c);
    }
  }
  return out;
}

/** Meilleur jour de tout l'historique (le plus de points). */
export function bestDay(pulls: PullRecord[]): DayStat | null {
  const days = new Map<number, PullRecord[]>();
  for (const p of pulls) {
    const k = startOfDay(p.t);
    days.set(k, [...(days.get(k) ?? []), p]);
  }
  let best: DayStat | null = null;
  for (const [day, list] of days) {
    const d = byDay(list, 1, day)[0]!;
    if (!best || d.score > best.score) best = d;
  }
  return best;
}

/** Moyenne observée : une carte de cette rareté tous les combien de paquets (null si jamais vue). */
export function packsPer(pulls: PullRecord[], test: (c: PullCard) => boolean): number | null {
  const opens = pulls.filter((p) => p.src === 'open');
  const hits = opens.reduce((n, p) => n + p.cards.filter(test).length, 0);
  return hits ? opens.length / hits : null;
}

/** Taux de nouvelles cartes sur deux moitiés des 30 derniers jours : la collection grossit, il baisse. */
export function freshTrend(pulls: PullRecord[], now = Date.now()): { before: number | null; recent: number | null } {
  const mid = now - 15 * DAY;
  const rate = (list: PullRecord[]) => {
    const s = summarize(list);
    return s.known >= 10 ? s.fresh / s.known : null;
  };
  return { before: rate(pulls.filter((p) => p.t >= now - 30 * DAY && p.t < mid)), recent: rate(pulls.filter((p) => p.t >= mid)) };
}
