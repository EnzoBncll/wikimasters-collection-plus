import { titleKey, type GoalEntry } from './goal-albums';
import { rest } from './supabase';
import { RARITY_LABEL, RARITY_ORDER, type Rarity } from './types';

/**
 * Données en plus pour l'aperçu d'un album à objectif :
 *  - la carte WikiMasters de chaque case (table `cards` du site, par titre) : rareté, image, attaque / défense,
 *    et surtout son existence : une case sans carte au catalogue ne pourra jamais être remplie ;
 *  - la date (naissance, création, publication, début) et la notoriété (nombre de Wikipédias) sur Wikidata.
 * Sert au tri de l'album et aux couleurs de l'aperçu.
 */

export interface CatalogInfo {
  rarity: Rarity | null;
  imageUrl: string | null;
  atk: number | null;
  def: number | null;
}

export interface WikidataInfo {
  year: number | null;
  links: number;
}

const BATCH = 40;

/** Titre entre guillemets pour un filtre PostgREST `in.(…)`. */
const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Carte du catalogue WikiMasters de chaque titre (clé titleKey) ; absent = pas de carte dans le jeu. */
export async function catalogInfo(titles: string[]): Promise<Map<string, CatalogInfo>> {
  const out = new Map<string, CatalogInfo>();
  const unique = [...new Set(titles)];
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const rows = await rest<{ wikipedia_title: string; rarity: Rarity | null; image_url: string | null; atk: number | null; def: number | null }[]>(
      `cards?select=wikipedia_title,rarity,image_url,atk,def&wikipedia_title=in.(${encodeURIComponent(batch.map(quote).join(','))})&limit=${batch.length * 3}`,
    );
    for (const r of rows) {
      const key = titleKey(r.wikipedia_title);
      if (!out.has(key)) out.set(key, { rarity: r.rarity ?? null, imageUrl: r.image_url ?? null, atk: r.atk ?? null, def: r.def ?? null });
    }
  }
  return out;
}

/** Année la plus ancienne (naissance, création, publication, début, date) et nombre de Wikipédias, par élément. */
export async function wikidataInfo(qids: string[]): Promise<Map<string, WikidataInfo>> {
  const out = new Map<string, WikidataInfo>();
  const unique = [...new Set(qids.filter((q) => /^Q\d+$/.test(q)))];
  for (let i = 0; i < unique.length; i += 200) {
    const values = unique
      .slice(i, i + 200)
      .map((q) => `wd:${q}`)
      .join(' ');
    const query = `SELECT ?item (MIN(YEAR(?d)) AS ?year) (MAX(?n) AS ?links) WHERE { VALUES ?item { ${values} } OPTIONAL { ?item wdt:P569|wdt:P571|wdt:P577|wdt:P580|wdt:P585 ?d } OPTIONAL { ?item wikibase:sitelinks ?n } } GROUP BY ?item`;
    const res = await fetch(`https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`, { headers: { Accept: 'application/sparql-results+json' } });
    if (!res.ok) throw new Error(`Wikidata : HTTP ${res.status}`);
    const rows = (await res.json()).results.bindings as { item: { value: string }; year?: { value: string }; links?: { value: string } }[];
    for (const r of rows) {
      const qid = r.item.value.split('/').pop()!;
      out.set(qid, { year: r.year ? Number(r.year.value) : null, links: r.links ? Number(r.links.value) : 0 });
    }
  }
  return out;
}

/* ---------- Tri ---------- */

export type GoalSort = 'source' | 'rarity' | 'date' | 'alpha' | 'notoriety' | 'attack' | 'defense';

export const GOAL_SORTS: { id: GoalSort; label: string; hint: string; needs?: 'catalog' | 'wikidata' }[] = [
  { id: 'source', label: 'Ordre de la liste', hint: 'L’ordre de la source, avec ses parties' },
  { id: 'rarity', label: 'Rareté', hint: 'Des Légendaires aux Communes, une partie par rareté', needs: 'catalog' },
  { id: 'date', label: 'Date', hint: 'Naissance, création ou parution, une partie par siècle', needs: 'wikidata' },
  { id: 'alpha', label: 'A → Z', hint: 'Ordre alphabétique, une partie par lettre' },
  { id: 'notoriety', label: 'Notoriété', hint: 'Les plus connus d’abord (nombre de Wikipédias)', needs: 'wikidata' },
  { id: 'attack', label: 'Attaque', hint: 'Les plus fortes en attaque d’abord', needs: 'catalog' },
  { id: 'defense', label: 'Défense', hint: 'Les plus fortes en défense d’abord', needs: 'catalog' },
];

const roman = (n: number) =>
  [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]].reduce<[string, number]>(
    ([s, r], [sym, v]) => {
      while (r >= (v as number)) (s += sym), (r -= v as number);
      return [s, r];
    },
    ['', n],
  )[0];

/** « XVIIe siècle », « Ier siècle av. J.-C. ». */
export function centuryLabel(year: number): string {
  const bc = year <= 0;
  const c = bc ? Math.floor(-year / 100) + 1 : Math.floor((year - 1) / 100) + 1;
  return `${roman(c)}${c === 1 ? 'er' : 'e'} siècle${bc ? ' av. J.-C.' : ''}`;
}

/**
 * Cases dans l'ordre choisi. Hors « ordre de la liste », les parties sont recalculées (rareté, siècle, lettre) ;
 * les cases sans donnée vont à la fin, dans une partie « Sans … ».
 */
export function sortEntries(entries: GoalEntry[], sort: GoalSort, catalog: Map<string, CatalogInfo> | null, wd: Map<string, WikidataInfo> | null): GoalEntry[] {
  if (sort === 'source') return entries;
  const cat = (e: GoalEntry) => catalog?.get(titleKey(e.title));
  const info = (e: GoalEntry) => (e.qid ? wd?.get(e.qid) : undefined);
  const byTitle = (a: GoalEntry, b: GoalEntry) => a.title.localeCompare(b.title, 'fr');
  type Keyed = { e: GoalEntry; k: number | null; section: string | null };
  let keyed: Keyed[];
  switch (sort) {
    case 'rarity':
      keyed = entries.map((e) => {
        const r = cat(e)?.rarity;
        return { e, k: r ? RARITY_ORDER.indexOf(r) : null, section: r ? `${RARITY_LABEL[r]}s` : 'Pas dans WikiMasters' };
      });
      break;
    case 'date':
      keyed = entries.map((e) => {
        const y = info(e)?.year ?? null;
        return { e, k: y, section: y === null ? 'Sans date' : centuryLabel(y) };
      });
      break;
    case 'alpha':
      keyed = entries.map((e) => ({ e, k: 0, section: e.title.charAt(0).toLocaleUpperCase('fr').normalize('NFD').charAt(0) }));
      keyed.sort((a, b) => byTitle(a.e, b.e));
      return keyed.map(({ e, section }) => ({ ...e, section }));
    case 'notoriety':
      keyed = entries.map((e) => ({ e, k: info(e) ? -info(e)!.links : null, section: null }));
      break;
    case 'attack':
    case 'defense':
      keyed = entries.map((e) => {
        const v = sort === 'attack' ? cat(e)?.atk : cat(e)?.def;
        return { e, k: v == null ? null : -v, section: null };
      });
      break;
  }
  keyed.sort((a, b) => (a.k === null ? 1 : 0) - (b.k === null ? 1 : 0) || (a.k ?? 0) - (b.k ?? 0) || byTitle(a.e, b.e));
  return keyed.map(({ e, section }) => ({ ...e, section }));
}
