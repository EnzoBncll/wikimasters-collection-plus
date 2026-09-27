import { storage } from '#imports';
import { sleep } from './queue';
import type { OwnedCard } from './types';

/**
 * Enrichissement des cartes via Wikidata (API publique, sans clé) :
 * titre de l'article fr → entité Wikidata → quelques propriétés utiles pour regrouper.
 */

const API = 'https://www.wikidata.org/w/api.php';
const BATCH = 50;
const FACTS_TTL = 30 * 24 * 60 * 60 * 1000;

export const PROPS = {
  P31: 'Nature',
  P106: 'Métier',
  P27: 'Nationalité',
  P17: 'Pays',
  P641: 'Sport',
  P136: 'Genre',
  P495: "Pays d'origine",
} as const;
export type PropId = keyof typeof PROPS;

export interface CardFacts {
  qid: string | null;
  props: Partial<Record<PropId, string[]>>;
  at: number;
}

export const factsItem = storage.defineItem<Record<string, CardFacts>>('local:wikidataFacts', { fallback: {} });
export const labelsItem = storage.defineItem<Record<string, string>>('local:wikidataLabels', { fallback: {} });

/** Titre de l'article frwiki d'une carte (depuis son URL si possible, plus fiable que le titre affiché). */
export function articleTitle(card: OwnedCard): string {
  const match = card.wikipediaUrl?.match(/fr\.wikipedia\.org\/wiki\/([^?#]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]!).replace(/_/g, ' ');
    } catch {
      /* titre brut ci-dessous */
    }
  }
  return card.title;
}

const norm = (title: string) => title.replace(/_/g, ' ').trim().toLowerCase();

async function wd(params: Record<string, string>) {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    if (attempt >= 3) throw new Error(`Wikidata : HTTP ${response.status}`);
    await sleep(1000 * attempt);
  }
}

export interface EnrichProgress {
  done: number;
  total: number;
}

/**
 * Récupère les faits Wikidata des cartes qui n'en ont pas encore (ou trop anciens),
 * puis les libellés français des valeurs. Renvoie le cache complet.
 */
export async function enrichCards(
  cards: OwnedCard[],
  onProgress?: (p: EnrichProgress) => void,
): Promise<{ facts: Record<string, CardFacts>; labels: Record<string, string> }> {
  const facts = { ...(await factsItem.getValue()) };
  const labels = { ...(await labelsItem.getValue()) };
  const now = Date.now();
  const todo = cards.filter((c) => !facts[c.cardId] || now - facts[c.cardId]!.at > FACTS_TTL);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const byTitle = new Map(batch.map((c) => [norm(articleTitle(c)), c]));
    const json = await wd({
      action: 'wbgetentities',
      sites: 'frwiki',
      titles: [...new Set(batch.map(articleTitle))].join('|'),
      props: 'claims|sitelinks',
      sitefilter: 'frwiki',
      redirects: 'yes',
    });

    // Titres normalisés / redirigés par l'API → titre demandé.
    const alias = new Map<string, string>();
    for (const n of json.normalized ?? []) alias.set(norm(n.to), norm(n.from));
    for (const r of json.redirects ?? []) alias.set(norm(r.to), alias.get(norm(r.from)) ?? norm(r.from));

    const found = new Set<string>();
    for (const entity of Object.values<any>(json.entities ?? {})) {
      if (entity.missing !== undefined || !entity.id?.startsWith('Q')) continue;
      const title = norm(entity.sitelinks?.frwiki?.title ?? '');
      const card = byTitle.get(title) ?? byTitle.get(alias.get(title) ?? '');
      if (!card) continue;
      const props: CardFacts['props'] = {};
      for (const pid of Object.keys(PROPS) as PropId[]) {
        const values = (entity.claims?.[pid] ?? [])
          .filter((claim: any) => claim.rank !== 'deprecated')
          .map((claim: any) => claim.mainsnak?.datavalue?.value?.id)
          .filter((id: unknown): id is string => typeof id === 'string');
        if (values.length) props[pid] = [...new Set<string>(values)].slice(0, 6);
      }
      facts[card.cardId] = { qid: entity.id, props, at: now };
      found.add(card.cardId);
    }
    for (const card of batch) if (!found.has(card.cardId)) facts[card.cardId] = { qid: null, props: {}, at: now };

    onProgress?.({ done: Math.min(i + BATCH, todo.length), total: todo.length });
    await sleep(150);
  }

  // Libellés des valeurs encore inconnues.
  const needed = new Set<string>();
  for (const f of Object.values(facts)) for (const values of Object.values(f.props)) for (const q of values ?? []) if (!labels[q]) needed.add(q);
  const ids = [...needed];
  for (let i = 0; i < ids.length; i += BATCH) {
    const json = await wd({
      action: 'wbgetentities',
      ids: ids.slice(i, i + BATCH).join('|'),
      props: 'labels',
      languages: 'fr|en',
      languagefallback: '1',
    });
    for (const [id, entity] of Object.entries<any>(json.entities ?? {})) {
      labels[id] = entity.labels?.fr?.value ?? entity.labels?.en?.value ?? id;
    }
    await sleep(100);
  }

  await factsItem.setValue(facts);
  await labelsItem.setValue(labels);
  return { facts, labels };
}
