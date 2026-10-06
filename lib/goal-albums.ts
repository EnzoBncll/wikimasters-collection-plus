import { storage } from '#imports';
import type { OwnedCard } from './types';
import { parseQuery } from './goal-search';
import { articleTitle, type CardFacts } from './wikidata';

/**
 * Albums à objectif : une étiquette + une liste fermée et ordonnée d'articles à réunir (rois de France, papes…).
 * La liste vient d'une page « Liste de… » de Wikipédia, d'un critère Wikidata ou d'une recherche libre.
 * Tout reste dans l'extension : le site ne connaît que l'étiquette.
 */

export interface GoalEntry {
  /** Titre de l'article frwiki (après redirection). */
  title: string;
  qid: string | null;
  description: string | null;
  /** Partie de la liste (dynastie, siècle…), quand la source en a. */
  section: string | null;
  /** Page d'homonymie : à préciser ou retirer. */
  disambiguation?: boolean;
  /** Miniature de l'article, quand Wikipédia en a une. */
  thumbnail?: string | null;
}

export type GoalSourceKind = 'list' | 'criteria' | 'search';

export interface GoalAlbum {
  entries: GoalEntry[];
  source: { kind: GoalSourceKind; label: string };
  /** Les cartes de l'étiquette hors liste sont rangées après la dernière page. */
  annex: boolean;
  at: number;
}

export const goalAlbumsItem = storage.defineItem<Record<string, GoalAlbum>>('local:goalAlbums', { fallback: {} });

export async function saveGoalAlbum(tagId: string, goal: GoalAlbum) {
  const all = await goalAlbumsItem.getValue();
  await goalAlbumsItem.setValue({ ...all, [tagId]: goal });
}

/* ---------- Correspondance avec la collection ---------- */

export const titleKey = (title: string) => title.replace(/_/g, ' ').trim().normalize('NFC').toLowerCase();

/** Carte possédée pour chaque entrée (par titre d'article, sinon par élément Wikidata). */
export function matchEntries(entries: GoalEntry[], cards: OwnedCard[], facts: Record<string, CardFacts>): Map<number, OwnedCard> {
  const byTitle = new Map<string, OwnedCard>();
  const byQid = new Map<string, OwnedCard>();
  for (const card of cards) {
    if (!card.count) continue;
    byTitle.set(titleKey(articleTitle(card)), card);
    const qid = facts[card.cardId]?.qid;
    if (qid) byQid.set(qid, card);
  }
  const out = new Map<number, OwnedCard>();
  entries.forEach((e, i) => {
    const card = byTitle.get(titleKey(e.title)) ?? (e.qid ? byQid.get(e.qid) : undefined);
    if (card) out.set(i, card);
  });
  return out;
}

/* ---------- Wikipédia ---------- */

const WP = 'https://fr.wikipedia.org/w/api.php';

async function wp<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(`${WP}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`);
  if (!res.ok) throw new Error(`Wikipédia : HTTP ${res.status}`);
  return res.json();
}

const STOPWORDS = new Set(['les', 'des', 'tous', 'toutes', 'une', 'un', 'le', 'la', 'de', 'du', 'et', 'en', 'au', 'aux', 'avec', 'sur', 'pour', 'dans', 'qui', 'que', 'par', 'après', 'avant', 'depuis', 'à', "l'", "d'"]);

/** Demande débarrassée de ses articles de tête : « tous les rois de France » → « rois de France ». */
export function cleanQuery(query: string): string {
  return query.trim().replace(/^(tous|toutes)\s+/i, '').replace(/^(les|des|la|le|l')\s*/i, '').trim();
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Racines des mots utiles (5 premières lettres sans accents), pour juger si un résultat parle du sujet. */
function stems(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .map((w) => w.slice(0, 5));
}

export interface ListPage {
  title: string;
  description: string | null;
}

/** Pages « Liste de… » sur le sujet. */
export async function findListPages(query: string): Promise<ListPage[]> {
  const data = await wp<{ query?: { pages?: { title: string; index: number; description?: string; length?: number }[] } }>({
    action: 'query',
    generator: 'search',
    // Sans les dates : « les empereurs en Europe après 1600 » → « empereurs Europe ».
    gsrsearch: `intitle:Liste ${[parseQuery(query).subject, parseQuery(query).place].filter(Boolean).join(' ') || cleanQuery(query)}`,
    gsrnamespace: '0',
    gsrlimit: '6',
    prop: 'description|info',
  });
  // Parmi les premiers résultats, la page la plus longue est en général la liste la plus complète.
  return (data.query?.pages ?? [])
    .filter((p) => /^liste/i.test(p.title))
    .sort((a, b) => a.index - b.index)
    .slice(0, 4)
    .sort((a, b) => (b.length ?? 0) - (a.length ?? 0))
    .slice(0, 3)
    .map((p) => ({ title: p.title, description: p.description ?? null }));
}

const SKIP_SECTIONS = /^(notes|références|notes et références|voir aussi|articles connexes|bibliographie|liens externes|sources|annexes|sommaire)$/i;
const NOISE_TITLE = /^(liste |\d{1,4}$|\d{1,2}(er)? (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)|(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)( \d{1,4})?$|[ivxlc]+e siècle|\d+e siècle)/i;
const NOISE_ZONES = '.navbox, .reflist, .references, .infobox, .bandeau, .bandeau-container, .toc, .metadata, .hatnote, .noprint, .mw-editsection, figure, .thumb, .gallery';

export interface ListSection {
  name: string;
  entries: GoalEntry[];
  /** Partie cochée d'office : elle contient un tableau (les parties en texte libre sont souvent du contexte). */
  suggested: boolean;
}

/**
 * Articles d'une page de liste, par section, dans l'ordre de la page.
 * Dans un tableau, le premier lien de chaque ligne ; dans une liste à puces, le premier lien de chaque puce.
 */
export async function readListPage(title: string): Promise<ListSection[]> {
  const data = await wp<{ parse?: { text: string } }>({ action: 'parse', page: title, prop: 'text', redirects: '1' });
  if (!data.parse) throw new Error('Page introuvable');
  const doc = new DOMParser().parseFromString(data.parse.text, 'text/html');
  type Draft = { name: string; titles: string[]; fromTable: Set<string> };
  const sections: Draft[] = [];
  let current: Draft = { name: 'Liste', titles: [], fromTable: new Set() };
  let skipping = false;
  // Doublons écartés par partie : un roi cité en introduction garde sa place dans sa propre partie.
  let seen = new Set<string>();
  for (const el of doc.querySelectorAll('h2, h3, table.wikitable tr, ul > li, ol > li')) {
    if (el.closest(NOISE_ZONES)) continue;
    if (el.tagName === 'H2' || el.tagName === 'H3') {
      const name = el.textContent?.replace(/\[.*?\]/g, '').trim() ?? '';
      if (el.tagName === 'H2') skipping = SKIP_SECTIONS.test(name);
      if (skipping) continue;
      if (current.titles.length) sections.push(current);
      current = { name, titles: [], fromTable: new Set() };
      seen = new Set();
      continue;
    }
    if (skipping) continue;
    if (el.tagName === 'LI' && el.closest('table')) continue;
    const link = [...el.querySelectorAll<HTMLAnchorElement>('a[href^="/wiki/"]')].find((a) => {
      const t = a.getAttribute('title');
      return (
        t &&
        !t.includes(':') &&
        a.textContent?.trim() &&
        !a.classList.contains('new') &&
        !a.classList.contains('mw-file-description') &&
        !a.querySelector('img') &&
        !NOISE_TITLE.test(t) &&
        !a.closest('sup, .reference, .mw-file-element, [typeof~="mw:File"]')
      );
    });
    const t = link?.getAttribute('title');
    if (!t || seen.has(titleKey(t))) continue;
    seen.add(titleKey(t));
    current.titles.push(t);
    if (el.tagName === 'TR') current.fromTable.add(t);
  }
  if (current.titles.length) sections.push(current);
  // Une partie avec un tableau : seules ses lignes comptent (les puces autour sont du contexte).
  const pageHasTables = sections.some((s) => s.fromTable.size);
  const kept = sections.map((s) => ({ ...s, titles: s.fromTable.size ? s.titles.filter((t) => s.fromTable.has(t)) : s.titles }));
  const all = await resolveTitles(kept.flatMap((s) => s.titles));
  return kept.map((s) => ({
    name: s.name,
    entries: s.titles.map((t) => ({ ...all.get(t)!, section: s.name })),
    suggested: !pageHasTables || s.fromTable.size > 0,
  }));
}

/** Titre définitif (redirections suivies), élément Wikidata, description et homonymie, par lots de 50. */
export async function resolveTitles(titles: string[]): Promise<Map<string, GoalEntry>> {
  const out = new Map<string, GoalEntry>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await wp<{
      query?: {
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
        pages?: { title: string; missing?: boolean; description?: string; thumbnail?: { source: string }; pageprops?: { wikibase_item?: string; disambiguation?: string } }[];
      };
    }>({ action: 'query', titles: batch.join('|'), redirects: '1', prop: 'pageprops|description|pageimages', ppprop: 'wikibase_item|disambiguation', piprop: 'thumbnail', pithumbsize: '120', pilimit: '50' });
    const q = data.query ?? {};
    const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of batch) {
      let final = q.normalized?.find((n) => n.from === t)?.to ?? t;
      final = q.redirects?.find((r) => r.from === final)?.to ?? final;
      const page = pages.get(final);
      out.set(t, {
        title: final,
        qid: page?.pageprops?.wikibase_item ?? null,
        description: page?.description ?? null,
        section: null,
        thumbnail: page?.thumbnail?.source ?? null,
        ...(page?.pageprops?.disambiguation !== undefined ? { disambiguation: true } : {}),
      });
    }
  }
  return out;
}

export interface SearchResult extends GoalEntry {
  /** Le titre ou la description reprend un mot de la recherche. */
  relevant: boolean;
}

/** Articles qui parlent du sujet (recherche plein texte de Wikipédia), 20 par 20. */
export async function searchArticles(query: string, offset = 0): Promise<{ results: SearchResult[]; next: number | null }> {
  const data = await wp<{
    continue?: { gsroffset: number };
    query?: { pages?: { title: string; index: number; description?: string; thumbnail?: { source: string }; pageprops?: { wikibase_item?: string; disambiguation?: string } }[] };
  }>({
    action: 'query',
    generator: 'search',
    gsrsearch: cleanQuery(query),
    gsrnamespace: '0',
    gsrlimit: '20',
    gsroffset: String(offset),
    prop: 'pageprops|description|pageimages',
    ppprop: 'wikibase_item|disambiguation',
    piprop: 'thumbnail',
    pithumbsize: '120',
    pilimit: '20',
  });
  const keys = stems(query);
  const results = (data.query?.pages ?? [])
    .sort((a, b) => a.index - b.index)
    .filter((p) => p.pageprops?.disambiguation === undefined && !/^liste /i.test(p.title))
    .map((p) => {
      const text = fold(`${p.title} ${p.description ?? ''}`);
      return {
        title: p.title,
        qid: p.pageprops?.wikibase_item ?? null,
        description: p.description ?? null,
        section: null,
        thumbnail: p.thumbnail?.source ?? null,
        relevant: !keys.length || keys.some((k) => text.includes(k)),
      };
    });
  return { results, next: data.continue?.gsroffset ?? null };
}

/* ---------- Wikidata ---------- */

const PROP_LABEL: Record<string, string> = {
  P39: 'Fonction occupée',
  P106: 'Métier',
  P31: 'Nature',
  P186: 'Ingrédient / matériau',
  P527: 'Composé de',
  P361: 'Fait partie de',
};

export interface Criterion {
  prop: string;
  propLabel: string;
  qid: string;
  label: string;
  description: string | null;
  count: number;
}

async function sparql<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`, { headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata : HTTP ${res.status}`);
  return (await res.json()).results.bindings;
}

/** Variantes de la demande à chercher sur Wikidata : telle quelle, raccourcie, au singulier. */
function entityQueries(query: string): string[] {
  const base = cleanQuery(query).replace(/\s+(après|avant|depuis|en|de \d|du \d).*$/i, '');
  const words = base.split(/\s+/);
  const singular = [words[0]!.replace(/(x|s)$/i, ''), ...words.slice(1)].join(' ');
  return [...new Set([base, singular, words.slice(0, 3).join(' '), singular.split(' ').slice(0, 3).join(' ')])].filter(Boolean);
}

/** Critères Wikidata possibles : éléments proches de la demande × propriétés utiles, avec le nombre d'articles frwiki. */
export async function findCriteria(query: string): Promise<Criterion[]> {
  const entities = new Map<string, { label: string; description: string | null }>();
  for (const q of entityQueries(query)) {
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbsearchentities', search: q, language: 'fr', uselang: 'fr', type: 'item', limit: '3', format: 'json', origin: '*' })}`,
    );
    if (!res.ok) continue;
    for (const e of (await res.json()).search ?? []) if (!entities.has(e.id)) entities.set(e.id, { label: e.label, description: e.description ?? null });
    if (entities.size >= 4) break;
  }
  const criteria: Criterion[] = [];
  await Promise.all(
    [...entities].slice(0, 4).map(async ([qid, { label, description }]) => {
      const rows = await sparql<{ p: { value: string }; n: { value: string } }>(
        `SELECT ?p (COUNT(DISTINCT ?item) AS ?n) WHERE {
          VALUES ?p { ${Object.keys(PROP_LABEL).map((p) => `wdt:${p}`).join(' ')} }
          ?item ?p wd:${qid} .
          ?article schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> .
        } GROUP BY ?p`,
      ).catch(() => []);
      for (const r of rows) {
        const prop = r.p.value.split('/').pop()!;
        const count = Number(r.n.value);
        if (count >= 2 && count <= 1500 && !/page de liste/i.test(description ?? '')) criteria.push({ prop, propLabel: PROP_LABEL[prop] ?? prop, qid, label, description, count });
      }
    }),
  );
  return criteria.sort((a, b) => (a.prop === 'P39' ? -1 : 0) - (b.prop === 'P39' ? -1 : 0) || b.count - a.count).slice(0, 3);
}

/** Articles frwiki qui répondent au critère, triés par date de début (fonctions) puis par titre. */
export async function criterionEntries(c: Criterion): Promise<GoalEntry[]> {
  const rows = await sparql<{ item: { value: string }; title: { value: string }; desc?: { value: string }; start?: { value: string } }>(
    `SELECT ?item ?title ?desc (MIN(?s) AS ?start) WHERE {
      ?item wdt:${c.prop} wd:${c.qid} .
      ?article schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?title .
      OPTIONAL { ?item p:${c.prop} ?st . ?st ps:${c.prop} wd:${c.qid} . ?st pq:P580 ?s . }
      OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "fr") }
    } GROUP BY ?item ?title ?desc LIMIT 1500`,
  );
  return rows
    .map((r) => ({ title: r.title.value, qid: r.item.value.split('/').pop()!, description: r.desc?.value ?? null, section: null, start: r.start?.value ?? '' }))
    .sort((a, b) => (a.start && b.start ? a.start.localeCompare(b.start) : a.start ? -1 : b.start ? 1 : 0) || a.title.localeCompare(b.title, 'fr'))
    .map(({ start: _, ...e }) => e);
}
