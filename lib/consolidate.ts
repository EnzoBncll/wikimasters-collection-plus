import type { OwnedCard, SiteTag } from './types';
import { recommendForAlbum } from './related';
import type { CardFacts } from './wikidata';

/**
 * File « Consolider » : les recommandations fortes de tous les albums à la fois.
 * Chaque album garde ses propres recommandations (lib/related.ts) ; on ne retient que les plus nettes,
 * et une carte qui convient nettement à plusieurs albums est mise à part pour choisir où la ranger.
 */

/** En dessous, l'album n'a pas assez de cartes pour qu'on sache ce qu'il contient. */
const MIN_ALBUM_CARDS = 3;
/** Score minimal d'une recommandation forte… */
const STRONG_SCORE = 2;
/** …et part minimale du meilleur score de l'album (une ressemblance moyenne dans un album flou ne compte pas). */
const STRONG_RATIO = 0.5;

export interface AlbumInput {
  tag: SiteTag;
  cards: OwnedCard[];
  description?: string;
}

export interface Match {
  tag: SiteTag;
  score: number;
  reasons: string[];
}

export interface Consolidation {
  /** Recommandations fortes par album, hors cartes qui conviennent à plusieurs albums. */
  albums: { tag: SiteTag; matches: { card: OwnedCard; score: number; reasons: string[] }[] }[];
  /** Cartes qui conviennent nettement à plusieurs albums, avec chacun d'eux (le plus proche d'abord). */
  multi: { card: OwnedCard; matches: Match[] }[];
}

export function consolidate({
  albums,
  all,
  facts,
  labels,
  dismissed,
}: {
  albums: AlbumInput[];
  all: OwnedCard[];
  facts: Record<string, CardFacts>;
  labels: Record<string, string>;
  /** Cartes écartées à la main, par album. */
  dismissed: Record<string, string[]>;
}): Consolidation {
  const byCard = new Map<string, { card: OwnedCard; matches: Match[] }>();
  for (const album of albums) {
    if (album.cards.length < MIN_ALBUM_CARDS) continue;
    const recos = recommendForAlbum({
      album: { name: album.tag.name, description: album.description, cards: album.cards },
      all,
      facts,
      labels,
      exclude: new Set(dismissed[album.tag.id] ?? []),
      limit: 200,
    });
    const top = recos[0]?.score ?? 0;
    for (const r of recos) {
      if (r.score < STRONG_SCORE || r.score < top * STRONG_RATIO) continue;
      const entry = byCard.get(r.card.cardId) ?? { card: r.card, matches: [] };
      entry.matches.push({ tag: album.tag, score: r.score, reasons: r.reasons });
      byCard.set(r.card.cardId, entry);
    }
  }

  const multi: Consolidation['multi'] = [];
  const perAlbum = new Map<string, Consolidation['albums'][number]>();
  for (const entry of byCard.values()) {
    entry.matches.sort((a, b) => b.score - a.score);
    if (entry.matches.length > 1) {
      multi.push(entry);
      continue;
    }
    const [m] = entry.matches;
    const group = perAlbum.get(m!.tag.id) ?? { tag: m!.tag, matches: [] };
    group.matches.push({ card: entry.card, score: m!.score, reasons: m!.reasons });
    perAlbum.set(m!.tag.id, group);
  }

  multi.sort((a, b) => b.matches[0]!.score - a.matches[0]!.score);
  const grouped = [...perAlbum.values()];
  for (const g of grouped) g.matches.sort((a, b) => b.score - a.score);
  grouped.sort((a, b) => b.matches.length - a.matches.length || a.tag.name.localeCompare(b.tag.name, 'fr'));
  return { albums: grouped, multi };
}
