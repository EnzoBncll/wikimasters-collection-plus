import { storage } from '#imports';
import { fieldsOf, words } from './text';
import type { OwnedCard } from './types';
import { PROPS, type CardFacts, type PropId } from './wikidata';

/**
 * Recommandations d'album : cartes déjà possédées, hors de l'album, qui ressemblent à celles qu'il contient.
 * Sans modèle d'IA : chaque carte est décrite par des indices (mots du titre et de la description,
 * champs sémantiques, faits Wikidata), et l'album par la part de ses cartes qui partagent chaque indice.
 * Un indice rare dans la collection pèse plus qu'un indice répandu (« peintre » plutôt que « français »).
 */

export interface Recommendation {
  card: OwnedCard;
  score: number;
  /** Indices partagés avec l'album, les plus parlants d'abord : « Métier : peintre », « avion ». */
  reasons: string[];
}

/** Cartes écartées à la main, par album (id d'étiquette). */
export const recoDismissedItem = storage.defineItem<Record<string, string[]>>('local:albumRecoDismissed', { fallback: {} });

/** Poids par nature d'indice : les faits Wikidata sont les plus fiables, un mot isolé le moins. */
const KIND_WEIGHT = { w: 1.3, f: 1, t: 0.8 } as const;
/** Part minimale des cartes de l'album qui doivent partager un indice pour qu'il compte. */
const MIN_SHARE = 0.2;
/** Le nom et la description de l'album disent ce qu'on y range : leurs indices comptent comme partagés par toutes les cartes. */
const NAME_SHARE = 1;
const MIN_SCORE = 1.2;
/** Les humains sont trop nombreux pour être un indice à eux seuls. */
const TOO_BROAD = new Set(['w:P31:Q5']);

type Feature = string;

function features(card: OwnedCard, facts: Record<string, CardFacts>): Set<Feature> {
  const tokens = [...words(card.title), ...words(card.description)];
  const out = new Set<Feature>();
  for (const t of tokens) out.add(`t:${t}`);
  for (const f of fieldsOf(tokens)) out.add(`f:${f}`);
  const props = facts[card.cardId]?.props ?? {};
  for (const prop of Object.keys(props) as PropId[]) for (const q of props[prop] ?? []) out.add(`w:${prop}:${q}`);
  for (const f of TOO_BROAD) out.delete(f);
  return out;
}

function label(feature: Feature, labels: Record<string, string>): string | null {
  const [kind, a, b] = feature.split(':');
  if (kind === 'f') return `Thème : ${a}`;
  if (kind === 'w') return labels[b!] && !/^Q\d+$/.test(labels[b!]!) ? `${PROPS[a as PropId]} : ${labels[b!]}` : null;
  return `« ${a} »`;
}

interface RecommendInput {
  album: { name: string; description?: string; cards: OwnedCard[] };
  /** Toute la collection : les candidates sont les cartes absentes de l'album. */
  all: OwnedCard[];
  facts: Record<string, CardFacts>;
  labels: Record<string, string>;
  exclude?: Set<string>;
  limit?: number;
}

export function recommendForAlbum({ album, all, facts, labels, exclude, limit = 24 }: RecommendInput): Recommendation[] {
  const inAlbum = new Set(album.cards.map((c) => c.cardId));
  const featuresOf = new Map(all.map((c) => [c.cardId, features(c, facts)]));

  // Rareté de chaque indice dans la collection (idf).
  const df = new Map<Feature, number>();
  for (const set of featuresOf.values()) for (const f of set) df.set(f, (df.get(f) ?? 0) + 1);
  const idf = (f: Feature) => Math.log((all.length + 1) / ((df.get(f) ?? 0) + 1));

  // Profil de l'album : part de ses cartes qui ont chaque indice.
  const share = new Map<Feature, number>();
  for (const card of album.cards) for (const f of featuresOf.get(card.cardId) ?? features(card, facts)) share.set(f, (share.get(f) ?? 0) + 1);
  for (const [f, n] of share) share.set(f, n / Math.max(1, album.cards.length));
  const nameTokens = [...words(album.name), ...words(album.description)];
  for (const f of [...nameTokens.map((t) => `t:${t}`), ...fieldsOf(nameTokens).map((x) => `f:${x}`)]) share.set(f, NAME_SHARE);
  for (const [f, s] of share) if (s < MIN_SHARE) share.delete(f);
  if (!share.size) return [];

  const out: Recommendation[] = [];
  for (const card of all) {
    if (inAlbum.has(card.cardId) || exclude?.has(card.cardId)) continue;
    const hits: { f: Feature; w: number }[] = [];
    for (const f of featuresOf.get(card.cardId)!) {
      const s = share.get(f);
      if (!s) continue;
      hits.push({ f, w: s * idf(f) * KIND_WEIGHT[f[0] as keyof typeof KIND_WEIGHT] });
    }
    if (!hits.length) continue;
    // Rendements décroissants : un mot, son champ sémantique et le métier Wikidata disent souvent la même chose.
    hits.sort((a, b) => b.w - a.w);
    const score = hits.reduce((sum, h, i) => sum + h.w / (1 + i * 0.5), 0);
    if (score < MIN_SCORE) continue;
    const reasons = [...new Set(hits.map((h) => label(h.f, labels)).filter((r): r is string => Boolean(r)))].slice(0, 3);
    out.push({ card, score, reasons });
  }

  out.sort((a, b) => b.score - a.score);
  // Ne garder que ce qui reste proche des meilleures : évite une traîne de ressemblances fortuites.
  const floor = (out[0]?.score ?? 0) * 0.3;
  return out.filter((r) => r.score >= floor).slice(0, limit);
}
