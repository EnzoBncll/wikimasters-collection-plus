import { storage } from '#imports';
import type { OwnedCard } from './types';
import { articleTitle } from './wikidata';

/**
 * Description courte des cartes quand l'API du site ne la renvoie pas :
 * c'est la description Wikidata de l'article, exposée par l'API de Wikipédia en français.
 */

const FRWIKI = 'https://fr.wikipedia.org/w/api.php';
const BATCH = 50;

/** Titre d'article → description ('' = aucune, pour ne pas redemander). */
const descriptionsItem = storage.defineItem<Record<string, string>>('local:cardDescriptions', { fallback: {} });

export async function fillDescriptions(cards: OwnedCard[]) {
  const cache = await descriptionsItem.getValue();
  const missing = cards.filter((c) => !c.description);
  const toFetch = [...new Set(missing.map(articleTitle).filter((t) => !(t in cache)))];

  for (let i = 0; i < toFetch.length; i += BATCH) {
    const titles = toFetch.slice(i, i + BATCH);
    try {
      const params = new URLSearchParams({ format: 'json', origin: '*', action: 'query', prop: 'description', redirects: '1', titles: titles.join('|') });
      const response = await fetch(`${FRWIKI}?${params}`);
      if (!response.ok) break;
      const json = await response.json();
      // Les titres demandés peuvent être normalisés puis redirigés avant d'arriver à la page.
      const alias = new Map<string, string>();
      for (const step of [...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])]) alias.set(step.to, step.from);
      const origin = (title: string) => {
        let t = title;
        for (let n = 0; n < 3 && alias.has(t); n++) t = alias.get(t)!;
        return t;
      };
      for (const title of titles) cache[title] = '';
      for (const page of Object.values<any>(json.query?.pages ?? {})) {
        if (page.description) cache[origin(page.title)] = page.description;
      }
    } catch (error) {
      console.warn('[Collection+] descriptions Wikipédia indisponibles', error);
      break;
    }
  }

  if (toFetch.length) await descriptionsItem.setValue(cache);
  for (const card of missing) card.description = cache[articleTitle(card)] || null;
}
