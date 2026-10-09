import { apiJson } from './api';
import { sleep } from './queue';
import { titleKey } from './goal-albums';
import type { Rarity } from './types';

/**
 * Mode Marché des albums à objectif : les cases manquantes actuellement en vente sur le marché de WikiMasters.
 * On ne connaît pas l'identifiant sur le site d'une carte qu'on n'a pas : on cherche par mots du titre
 * (un mot couvre plusieurs cases, « louis » → Louis VI à Louis XVIII), puis on ne garde que les annonces dont le titre
 * est exactement celui d'une case. Lecture seule, lancée par un clic ; l'enchère reste sur le site.
 */

export interface Listing {
  id: string;
  title: string;
  rarity: Rarity | null;
  shiny: boolean;
  /** Prix actuel (enchère en cours, sinon mise à prix), en WikiBidous. */
  price: number | null;
  endAt: string | null;
  imageUrl: string | null;
}

const PAGE_SIZE = 50;
const MAX_PAGES = 3;
const MAX_QUERIES = 30;
/** Pause entre deux requêtes : le marché limite les rafales (HTTP 429). */
const GAP_MS = 700;

const STOPWORDS = new Set(['avec', 'dans', 'pour', 'sans', 'sous', 'chez', 'entre', 'vers', 'plus', 'moins', 'comme', 'dont', 'leur', 'leurs', 'cette', 'celui', 'celle', 'ceux', 'elles', 'saint', 'sainte']);

/** Mots utiles d'un titre (4 lettres ou plus, hors parenthèse d'homonymie). */
function words(title: string): string[] {
  return title
    .replace(/\s*\([^)]*\)\s*$/, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Requêtes à lancer : à chaque tour, le mot qui couvre le plus de cases encore non couvertes ;
 * une case dont aucun mot n'est utile est cherchée par son titre entier.
 */
export function planQueries(titles: string[]): string[] {
  const byWord = new Map<string, Set<number>>();
  titles.forEach((t, i) => {
    for (const w of new Set(words(t))) {
      if (!byWord.has(w)) byWord.set(w, new Set());
      byWord.get(w)!.add(i);
    }
  });
  const covered = new Set<number>();
  const queries: string[] = [];
  while (queries.length < MAX_QUERIES) {
    let best: string | null = null;
    let gain = 0;
    for (const [w, ids] of byWord) {
      let g = 0;
      for (const id of ids) if (!covered.has(id)) g++;
      if (g > gain || (g === gain && best && w.length > best.length)) (best = w), (gain = g);
    }
    if (!best || !gain) break;
    queries.push(best);
    for (const id of byWord.get(best)!) covered.add(id);
  }
  titles.forEach((t, i) => {
    if (!covered.has(i) && queries.length < MAX_QUERIES) queries.push(t.replace(/\s*\([^)]*\)\s*$/, ''));
  });
  return queries;
}

const num = (...values: unknown[]) => {
  for (const v of values) {
    const n = Number(v);
    if (v != null && v !== '' && Number.isFinite(n)) return n;
  }
  return null;
};

/** Annonces actives des titres demandés, par titre (clé titleKey), triées par heure de fin. */
export async function findOnMarket(titles: string[], onProgress?: (done: number, total: number) => void): Promise<Map<string, Listing[]>> {
  const wanted = new Set(titles.map(titleKey));
  const queries = planQueries(titles);
  const found = new Map<string, Map<string, Listing>>();
  for (let q = 0; q < queries.length; q++) {
    onProgress?.(q, queries.length);
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (q || page > 1) await sleep(GAP_MS);
      const json = await apiJson<{ auctions?: any[]; hasMore?: boolean }>(`/api/marketplace?page=${page}&limit=${PAGE_SIZE}&sort=recent&q=${encodeURIComponent(queries[q]!)}`);
      const auctions = Array.isArray(json?.auctions) ? json.auctions : [];
      for (const a of auctions) {
        const title = String(a?.card?.wikipedia_title ?? '');
        const key = titleKey(title);
        if (!a?.id || !wanted.has(key) || (a.status && a.status !== 'active')) continue;
        if (!found.has(key)) found.set(key, new Map());
        found.get(key)!.set(String(a.id), {
          id: String(a.id),
          title,
          rarity: a.snapshot_rarity ?? a.card?.rarity ?? null,
          shiny: Boolean(a.is_shiny),
          price: num(a.effective_bid, a.current_bid, a.listing_base_amount, a.base_amount),
          endAt: a.end_at ?? null,
          imageUrl: a.card?.hide_image ? null : (a.card?.image_url ?? null),
        });
      }
      if (json?.hasMore === false || auctions.length < PAGE_SIZE) break;
    }
  }
  onProgress?.(queries.length, queries.length);
  const out = new Map<string, Listing[]>();
  for (const [key, listings] of found) out.set(key, [...listings.values()].sort((a, b) => Date.parse(a.endAt ?? '') - Date.parse(b.endAt ?? '') || 0));
  return out;
}

/** « dans 3 h », « dans 12 min », « terminée ». */
export function endsIn(endAt: string | null, now = Date.now()): string {
  const t = Date.parse(endAt ?? '');
  if (!Number.isFinite(t)) return '';
  const min = Math.round((t - now) / 60000);
  if (min <= 0) return 'terminée';
  if (min < 60) return `dans ${min} min`;
  if (min < 48 * 60) return `dans ${Math.round(min / 60)} h`;
  return `dans ${Math.round(min / 1440)} j`;
}
