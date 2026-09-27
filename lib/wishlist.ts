import { storage } from '#imports';
import type { OwnedCard } from './types';
import { articleTitle, PROPS, type CardFacts, type PropId } from './wikidata';

/**
 * Listes de souhaits et suggestions par album.
 * Le thème d'un album est déduit des faits Wikidata de ses cartes (métier, nationalité, nature…) ;
 * les suggestions sont les articles Wikipédia les plus connus sur ce thème qu'on ne possède pas encore
 * (plus un article est lu, plus la carte est rare sur WikiMasters : le nombre de langues sert d'indicateur).
 */

export interface WishItem {
  qid: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  wikipediaUrl: string;
  /** Nombre d'éditions linguistiques de Wikipédia : indicateur de notoriété. */
  sitelinks: number;
}

export interface ThemeCriterion {
  prop: PropId;
  value: string;
  label: string;
  /** Part des cartes de l'album qui partagent cette valeur. */
  share: number;
}

/** Souhaits enregistrés, par clé d'album (id d'étiquette ou « none »). */
export const wishlistsItem = storage.defineItem<Record<string, WishItem[]>>('local:wishlists', { fallback: {} });

interface SuggestionCache {
  key: string;
  at: number;
  items: WishItem[];
}
const suggestionsCacheItem = storage.defineItem<Record<string, SuggestionCache>>('local:albumSuggestions', { fallback: {} });
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/** Les humains sont trop nombreux pour un thème à eux seuls : Q5 ne sert qu'en complément. */
const TOO_BROAD = new Set(['P31:Q5']);

/**
 * Thème d'un album : jusqu'à deux critères partagés par la majorité des cartes analysées,
 * du plus spécifique (métier, sport, genre) au plus général (nature).
 */
export function detectTheme(cards: OwnedCard[], facts: Record<string, CardFacts>, labels: Record<string, string>): ThemeCriterion[] {
  const known = cards.map((c) => facts[c.cardId]).filter((f): f is CardFacts => Boolean(f?.qid));
  if (!known.length) return [];
  const counts = new Map<string, number>();
  for (const f of known) {
    for (const prop of Object.keys(PROPS) as PropId[]) {
      for (const value of new Set(f.props[prop] ?? [])) counts.set(`${prop}:${value}`, (counts.get(`${prop}:${value}`) ?? 0) + 1);
    }
  }
  const specificity: Record<PropId, number> = { P106: 5, P641: 5, P136: 4, P27: 3, P17: 3, P495: 3, P31: 2 };
  const ranked = [...counts.entries()]
    .map(([key, n]) => {
      const [prop, value] = key.split(':') as [PropId, string];
      return { key, prop, value, label: labels[value] ?? value, share: n / known.length };
    })
    .filter((c) => c.share >= 0.35 && !TOO_BROAD.has(c.key))
    .sort((a, b) => b.share - a.share || specificity[b.prop] - specificity[a.prop]);

  const picked: ThemeCriterion[] = [];
  for (const c of ranked) {
    if (picked.length === 2) break;
    if (picked.some((p) => p.prop === c.prop)) continue;
    // Deuxième critère seulement s'il reste partagé par une bonne partie de l'album.
    if (picked.length === 1 && c.share < 0.5) break;
    picked.push({ prop: c.prop, value: c.value, label: c.label, share: c.share });
  }
  return picked;
}

const themeKey = (theme: ThemeCriterion[]) => theme.map((c) => `${c.prop}:${c.value}`).sort().join('&');

async function getJson(base: string, params: Record<string, string>) {
  const response = await fetch(`${base}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`);
  if (!response.ok) throw new Error(`Wikidata : HTTP ${response.status}`);
  return response.json();
}
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const FRWIKI = 'https://fr.wikipedia.org/w/api.php';
const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/**
 * Meilleures cartes à ajouter pour un thème : articles fr les plus traduits, hors cartes déjà possédées
 * et déjà souhaitées. Résultat mis en cache une semaine par thème.
 *
 * 1. Recherche Wikidata (haswbstatement) des éléments du thème, triés par liens entrants ;
 * 2. nombre d'éditions de Wikipédia de chacun (notoriété) et titre de l'article fr ;
 * 3. vignette et description courte depuis Wikipédia en français.
 */
export async function fetchThemeSuggestions(
  theme: ThemeCriterion[],
  exclude: { qids: Set<string>; titles: Set<string> },
  { force = false, limit = 18 } = {},
): Promise<WishItem[]> {
  if (!theme.length) return [];
  const key = themeKey(theme);
  const cache = await suggestionsCacheItem.getValue();
  let items = !force && cache[key] && Date.now() - cache[key].at < CACHE_TTL ? cache[key].items : null;

  if (!items) {
    const search = await getJson(WIKIDATA, {
      action: 'query',
      list: 'search',
      srsearch: theme.map((c) => `haswbstatement:${c.prop}=${c.value}`).join(' '),
      srsort: 'incoming_links_desc',
      srlimit: '200',
      srinfo: '',
      srprop: '',
    });
    const qids: string[] = (search.query?.search ?? []).map((r: any) => r.title).filter((t: string) => /^Q\d+$/.test(t));

    const found: Omit<WishItem, 'description' | 'imageUrl'>[] = [];
    for (const ids of chunks(qids, 50)) {
      const json = await getJson(WIKIDATA, { action: 'wbgetentities', ids: ids.join('|'), props: 'sitelinks' });
      for (const entity of Object.values<any>(json.entities ?? {})) {
        const frTitle = entity.sitelinks?.frwiki?.title;
        if (!frTitle) continue;
        const sitelinks = Object.keys(entity.sitelinks ?? {}).filter((k) => k.endsWith('wiki') && k !== 'commonswiki').length;
        found.push({ qid: entity.id, title: frTitle, wikipediaUrl: `https://fr.wikipedia.org/wiki/${encodeURIComponent(frTitle.replace(/ /g, '_'))}`, sitelinks });
      }
    }
    found.sort((a, b) => b.sitelinks - a.sitelinks);
    const top = found.slice(0, 80);

    const extra = new Map<string, { description: string | null; imageUrl: string | null }>();
    for (const titles of chunks(top.map((t) => t.title), 50)) {
      const json = await getJson(FRWIKI, {
        action: 'query',
        titles: titles.join('|'),
        prop: 'pageimages|description',
        piprop: 'thumbnail',
        pithumbsize: '320',
        pilimit: '50',
        redirects: '1',
      });
      for (const page of Object.values<any>(json.query?.pages ?? {})) {
        extra.set(page.title, { description: page.description ?? null, imageUrl: page.thumbnail?.source ?? null });
      }
    }
    items = top.map((t) => ({ ...t, description: extra.get(t.title)?.description ?? null, imageUrl: extra.get(t.title)?.imageUrl ?? null }));
    await suggestionsCacheItem.setValue({ ...cache, [key]: { key, at: Date.now(), items } });
  }

  // Un métier secondaire suffit à Wikidata (Niels Bohr a été footballeur) : quand le thème est un métier,
  // on garde les articles dont la description courte le mentionne.
  const job = theme.find((c) => c.prop === 'P106');
  if (job) {
    const word = job.label.toLowerCase().split(/\s+(?:ou|et)\s+|\s*[,/(]/)[0]!.trim().slice(0, 8);
    const relevant = items.filter((i) => !i.description || i.description.toLowerCase().includes(word));
    if (relevant.length >= 6) items = relevant;
  }

  const norm = (t: string) => t.trim().toLowerCase();
  return items.filter((i) => !exclude.qids.has(i.qid) && !exclude.titles.has(norm(i.title))).slice(0, limit);
}

/** Qids et titres des cartes possédées, pour ne pas les suggérer. */
export function ownedIndex(cards: OwnedCard[], facts: Record<string, CardFacts>) {
  const qids = new Set<string>();
  const titles = new Set<string>();
  for (const card of cards) {
    const qid = facts[card.cardId]?.qid;
    if (qid) qids.add(qid);
    titles.add(articleTitle(card).trim().toLowerCase());
    titles.add(card.title.trim().toLowerCase());
  }
  return { qids, titles };
}

/** Pour l'affichage : une entrée souhaitée sous la forme d'une carte (sans rareté connue). */
export function wishAsCard(item: WishItem): OwnedCard {
  return {
    cardId: `wish:${item.qid}`,
    ownedIds: [],
    count: 0,
    title: item.title,
    rarity: null,
    imageUrl: item.imageUrl,
    wikipediaUrl: item.wikipediaUrl,
    description: item.description,
    tagIds: [],
    ownedTags: {},
  };
}
