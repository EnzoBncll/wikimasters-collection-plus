import { geminiJson } from './gemini';
import { resolveTitles, searchArticles, type GoalEntry } from './goal-albums';
import { parseQuery, searchEntities, type WdEntity } from './goal-search';

/**
 * « Demande libre » des albums à objectif : une phrase (« le top 50 des personnalités féminines françaises avant 1900 »)
 * devient des règles lisibles et modifiables, puis une requête Wikidata exacte.
 * Les règles viennent de Gemini quand une clé est réglée, sinon d'un analyseur sans IA.
 * Quand la demande ne se traduit pas en règles (sujet subjectif), Gemini propose des noms, vérifiés un par un sur Wikipédia.
 */

export interface QueryPlan {
  /** Ce qui a été compris, en une phrase. */
  summary: string;
  mode: 'rules' | 'names';
  /** La liste porte sur des personnes. */
  people: boolean;
  /** Fonction, métier ou nature, au singulier (« empereur », « peintre », « cathédrale »). */
  subject: string | null;
  gender: 'female' | 'male' | null;
  /** Nationalités, États historiques compris (« royaume de France »). */
  nationalities: string[];
  /** Pays ou continents, pour les choses. */
  places: string[];
  /** Années : naissance pour les personnes, création ou début pour le reste. */
  from: number | null;
  to: number | null;
  ranking: 'notoriety' | 'chronological' | 'alphabetical';
  limit: number | null;
  /** Mode « names » : titres d'articles proposés. */
  names: string[];
  source: 'gemini' | 'rules';
}

export interface FreeEntry extends GoalEntry {
  rank: number;
  /** 1 : article trouvé par Wikidata ; 0,9 : titre exact ; 0,5 : meilleur résultat de recherche ; 0 : introuvable. */
  confidence: number;
  status: 'ok' | 'guess' | 'missing';
  /** Autres articles possibles quand le nom est ambigu. */
  alternatives?: GoalEntry[];
  year?: number | null;
  /** Nombre d'éditions linguistiques de Wikipédia (notoriété). */
  links?: number;
}

/* ---------- Comprendre ---------- */

const SYSTEM = `Tu traduis une demande de collectionneur de cartes WikiMasters (une carte = un article de Wikipédia en français) en règles pour interroger Wikidata.
Règles :
- people : true si la liste porte sur des personnes.
- subject : la fonction, le métier ou la nature commune, au singulier et en français, tel que Wikidata le nomme (« empereur », « peintre », « pape », « cathédrale », « dessert ») ; null si la demande ne précise que le genre, la nationalité ou l'époque (« personnalités », « figures »).
- gender : female, male ou null.
- nationalities : pour les personnes, les pays de nationalité EN INCLUANT les États historiques correspondants (pour la France : « France », « royaume de France », « Premier Empire », « Second Empire », « royaume des Francs »). Vide si non demandé.
- places : pour les choses, pays ou continents concernés.
- from / to : bornes d'années (naissance pour les personnes, création pour les choses), null sinon.
- ranking : notoriety pour « top », « les plus célèbres », « principaux » ; chronological si l'ordre du temps compte (souverains, papes) ; sinon alphabetical.
- limit : le nombre demandé (« top 50 » → 50), sinon null.
- mode : rules si les champs ci-dessus suffisent à décrire la liste ; names seulement si la demande est subjective ou impossible à décrire par ces critères (« les batailles qui ont changé l'histoire »). En mode names, donne dans names les titres exacts des articles de Wikipédia en français (au plus limit, 30 par défaut), sinon names est vide.
- summary : une phrase courte en français qui reformule la demande.`;

const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    mode: { type: 'STRING', enum: ['rules', 'names'] },
    people: { type: 'BOOLEAN' },
    subject: { type: 'STRING', nullable: true },
    gender: { type: 'STRING', enum: ['female', 'male'], nullable: true },
    nationalities: { type: 'ARRAY', items: { type: 'STRING' } },
    places: { type: 'ARRAY', items: { type: 'STRING' } },
    from: { type: 'INTEGER', nullable: true },
    to: { type: 'INTEGER', nullable: true },
    ranking: { type: 'STRING', enum: ['notoriety', 'chronological', 'alphabetical'] },
    limit: { type: 'INTEGER', nullable: true },
    names: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'mode', 'people', 'subject', 'gender', 'nationalities', 'places', 'from', 'to', 'ranking', 'limit', 'names'],
};

/** Adjectifs de nationalité courants → pays (avec les États historiques pour la France). */
const DEMONYMS: [RegExp, string[]][] = [
  [/\bfran(ç|c)ai(s|se|ses)\b/i, ['France', 'royaume de France', 'royaume des Francs', 'Première République', 'Premier Empire', 'Second Empire']],
  [/\banglai(s|se|ses)\b|\bbritanniques?\b/i, ['Royaume-Uni', "royaume d'Angleterre", 'royaume de Grande-Bretagne']],
  [/\ballemand(e|s|es)?\b/i, ['Allemagne', 'Empire allemand', 'royaume de Prusse']],
  [/\bitalien(ne|s|nes)?\b/i, ['Italie', "royaume d'Italie"]],
  [/\bespagnol(e|s|es)?\b/i, ['Espagne', "monarchie espagnole"]],
  [/\baméricain(e|s|es)?\b/i, ['États-Unis']],
  [/\brusses?\b/i, ['Russie', 'Empire russe', 'Union des républiques socialistes soviétiques']],
  [/\bbelges?\b/i, ['Belgique']],
  [/\bsuisses?\b/i, ['Suisse']],
  [/\bjaponais(e|es)?\b/i, ['Japon', 'empire du Japon']],
  [/\bchinois(e|es)?\b/i, ['Chine', "république populaire de Chine"]],
  [/\bautrichien(ne|s|nes)?\b/i, ['Autriche', "empire d'Autriche"]],
  [/\bportugais(e|es)?\b/i, ['Portugal']],
  [/\bgrec(que|s|ques)?\b/i, ['Grèce']],
  [/\bcanadien(ne|s|nes)?\b/i, ['Canada']],
];

/** Analyse sans IA : dates, genre, nationalité, « top N », personnes ou choses. */
export function parseWithRules(query: string): QueryPlan {
  const q = query.trim();
  const base = parseQuery(q);
  const gender = /\b(femmes?|féminin(e|s|es)?|reines?|impératrices?)\b/i.test(q) ? 'female' : /\b(hommes|masculin(s)?)\b/i.test(q) ? 'male' : null;
  const nationalities = DEMONYMS.find(([re]) => re.test(q))?.[1] ?? [];
  const limit = Number(q.match(/\btop\s*(\d{1,4})\b|\bles\s+(\d{1,4})\s+(?:plus|premi)/i)?.slice(1).find(Boolean)) || null;
  const people = Boolean(gender) || nationalities.length > 0 || /\b(personnalités?|personnes?|figures?|gens|célébrités?)\b/i.test(q);
  // Sujet : ce qui reste une fois retirés les mots de genre, de nationalité, de classement.
  let subject: string | null = base.subject
    .replace(/\btop\s*\d+\b|\b\d+\b|\bdes?\b|\bdu\b|\bplus\b|\bcélèbres?\b|\bconnu(e|s|es)?\b|\bprincipa(l|ux|les?)\b/gi, ' ')
    .replace(/\b(personnalités?|personnes?|figures?|célébrités?|femmes?|hommes|féminin(e|s|es)?|masculins?)\b/gi, ' ')
    .replace(new RegExp(DEMONYMS.map(([re]) => re.source).join('|'), 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!subject || subject.length < 3) subject = null;
  return {
    summary: q,
    mode: 'rules',
    people,
    subject,
    gender,
    nationalities: base.place && !nationalities.length && people ? [base.place] : nationalities,
    places: people || !base.place ? [] : [base.place],
    from: base.from,
    to: base.to,
    ranking: limit || /célèbres?|connu|principa/i.test(q) ? 'notoriety' : people ? 'chronological' : 'alphabetical',
    limit,
    names: [],
    source: 'rules',
  };
}

/** Règles de la demande : Gemini si une clé est réglée, l'analyseur sans IA sinon (ou si Gemini échoue). */
export async function understandFree(query: string, geminiKey: string | undefined): Promise<{ plan: QueryPlan; warning?: string }> {
  if (!geminiKey) return { plan: parseWithRules(query) };
  try {
    const out = await geminiJson<Omit<QueryPlan, 'source'>>(geminiKey, { system: SYSTEM, prompt: query, schema: PLAN_SCHEMA });
    return {
      plan: {
        ...out,
        subject: out.subject?.trim() || null,
        nationalities: out.nationalities ?? [],
        places: out.places ?? [],
        names: (out.names ?? []).map((n) => n.trim()).filter(Boolean),
        source: 'gemini',
      },
    };
  } catch (error) {
    return { plan: parseWithRules(query), warning: `Gemini indisponible (${error instanceof Error ? error.message : String(error)}) : analyse sans IA.` };
  }
}

/* ---------- Construire la liste ---------- */

async function sparql<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`, { headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(res.status === 500 || res.status === 504 ? 'Wikidata a mis trop de temps à répondre : précise la demande' : `Wikidata : HTTP ${res.status}`);
  return (await res.json()).results.bindings;
}

const singular = (s: string) => s.split(' ').map((w, i) => (i === 0 ? w.replace(/(eaux|aux)$/i, 'al').replace(/([^s])s$/i, '$1') : w)).join(' ');
const conceptual = (e: WdEntity) => !/\d|homonymie|personnalité|homme politique|militaire|album|film|chanson|groupe/i.test(e.description ?? '');
const stateLike = (e: WdEntity) =>
  /\b(pays|états?|royaume|empire|république|monarchie|principauté|duché|continent|territoire|confédération|régime politique)\b/i.test(e.description ?? '') &&
  !/\b(assemblée|parlement|gouvernement|armée|bataille|guerre|film|album)\b/i.test(e.description ?? '');

/** États dont le libellé courant est ambigu sur Wikidata (« Second Empire » d'Haïti, assemblée « Royaume de France »…). */
const KNOWN: Record<string, WdEntity> = Object.fromEntries(
  (
    [
      ['france', 'Q142', 'France'],
      ['royaume de france', 'Q70972', 'royaume de France'],
      ['royaume des francs', 'Q146246', 'royaume des Francs'],
      ['première république', 'Q58296', 'Première République'],
      ['premier empire', 'Q71084', 'Premier Empire'],
      ['second empire', 'Q71092', 'Second Empire'],
    ] as const
  ).map(([k, qid, label]) => [k, { qid, label, description: null }]),
);

async function resolve(label: string, accept: (e: WdEntity) => boolean): Promise<WdEntity | null> {
  const known = KNOWN[label.trim().toLowerCase().replace(/ français(e)?$/, '')];
  if (known) return known;
  const found = (await searchEntities(label, 7)).filter(accept);
  // Libellé identique d'abord, puis l'ordre de Wikidata.
  return found.find((e) => e.label.toLowerCase() === label.trim().toLowerCase()) ?? found[0] ?? null;
}

export interface Resolved {
  subject: WdEntity | null;
  nationalities: WdEntity[];
  places: WdEntity[];
}

/** Les libellés des règles, retrouvés sur Wikidata (affichés à l'utilisateur pour qu'il voie ce qui sera demandé). */
export async function resolvePlan(plan: QueryPlan): Promise<Resolved> {
  const [subject, nationalities, places] = await Promise.all([
    plan.subject ? resolve(singular(plan.subject), conceptual).then((e) => e ?? resolve(plan.subject!, conceptual)) : Promise.resolve(null),
    Promise.all(plan.nationalities.map((n) => resolve(n, stateLike))),
    Promise.all(plan.places.map((p) => resolve(p, stateLike))),
  ]);
  const uniq = (list: (WdEntity | null)[]) => [...new Map(list.filter((e): e is WdEntity => Boolean(e)).map((e) => [e.qid, e])).values()];
  return { subject, nationalities: uniq(nationalities), places: uniq(places) };
}

/** Le plan peut-il devenir une requête ? (sinon : mode noms ou rien). */
export const canQuery = (plan: QueryPlan, r: Resolved) => Boolean(r.subject || (plan.people && (r.nationalities.length || plan.gender)));

/** Liste exacte depuis Wikidata, classée selon le plan. */
export async function runPlan(plan: QueryPlan, r: Resolved): Promise<FreeEntry[]> {
  // Ordre des motifs : les plus sélectifs d'abord, sinon Wikidata dépasse son délai.
  const parts: string[] = [];
  if (r.nationalities.length) parts.push(`VALUES ?nat { ${r.nationalities.map((e) => `wd:${e.qid}`).join(' ')} } ?item wdt:P27 ?nat .`);
  if (plan.gender) parts.push(`?item wdt:P21 wd:${plan.gender === 'female' ? 'Q6581072' : 'Q6581097'} .`);
  if (r.places.length) {
    const vals = r.places.map((e) => `wd:${e.qid}`).join(' ');
    parts.push(`VALUES ?pl { ${vals} } { ?item wdt:P17 ?pl } UNION { ?item wdt:P17/wdt:P30 ?pl } UNION { ?item wdt:P30 ?pl }`);
  }
  if (r.subject) {
    const tree = await sparql<{ c: { value: string } }>(`SELECT DISTINCT ?c WHERE { { ?c wdt:P279* wd:${r.subject.qid} } UNION { ?c wdt:P31/wdt:P279* wd:${r.subject.qid} } } LIMIT 400`);
    const vals = tree.map((t) => `wd:${t.c.value.split('/').pop()}`).join(' ') || `wd:${r.subject.qid}`;
    parts.push(
      plan.people
        ? `VALUES ?s { ${vals} } { ?item wdt:P39 ?s } UNION { ?item wdt:P106 ?s } UNION { ?item wdt:P31 ?s }`
        : `VALUES ?s { ${vals} } ?item wdt:P31 ?s .`,
    );
  }
  if (plan.people) parts.push('?item wdt:P31 wd:Q5 .');
  const dateProp = plan.people ? 'wdt:P569' : 'wdt:P571|wdt:P580|wdt:P569';
  const dated = plan.from !== null || plan.to !== null;
  if (dated) {
    parts.push(`?item ${dateProp} ?d .`);
    if (plan.from !== null) parts.push(`FILTER(YEAR(?d) >= ${plan.from})`);
    if (plan.to !== null) parts.push(`FILTER(YEAR(?d) < ${plan.to})`);
  } else parts.push(`OPTIONAL { ?item ${dateProp} ?d }`);
  const limit = Math.min(1000, Math.max(1, plan.limit ?? 400));
  const order = plan.ranking === 'notoriety' ? 'DESC(?links)' : plan.ranking === 'chronological' ? '?year ?title' : '?title';
  type Row = { item: { value: string }; title: { value: string }; desc?: { value: string }; year?: { value: string }; links?: { value: string } };
  const query = (minLinks: number) =>
    sparql<Row>(`SELECT ?item ?title ?desc (MIN(YEAR(?d)) AS ?year) (MAX(?n) AS ?links) WHERE {
      ${parts.join('\n      ')}
      ?item wikibase:sitelinks ?n .${minLinks ? ` FILTER(?n >= ${minLinks})` : ''}
      ?a schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?title .
      OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "fr") }
    } GROUP BY ?item ?title ?desc ORDER BY ${order} LIMIT ${limit}`);
  // « Top N » sur un large ensemble (toutes les Françaises nées avant 1900) : on ne garde d'abord que les articles
  // traduits dans au moins 20 langues, beaucoup plus rapide ; on élargit s'il n'y en a pas assez.
  const broad = !r.subject && plan.people;
  let rows = plan.ranking === 'notoriety' && limit <= 200 && broad ? await query(20) : [];
  if (rows.length < limit) rows = await query(broad ? 3 : 0);
  return rows.map((row, i) => ({
    title: row.title.value,
    qid: row.item.value.split('/').pop()!,
    description: row.desc?.value ?? null,
    section: null,
    rank: i + 1,
    confidence: 1,
    status: 'ok',
    year: row.year ? Number(row.year.value) : null,
    links: row.links ? Number(row.links.value) : undefined,
  }));
}

/** Mode noms : chaque nom de la liste verrouillée est cherché sur Wikipédia (titre exact, puis recherche). */
export async function resolveNames(names: string[]): Promise<FreeEntry[]> {
  const exact = await resolveTitles(names);
  return Promise.all(
    names.map(async (name, i): Promise<FreeEntry> => {
      const hit = exact.get(name);
      if (hit?.qid && !hit.disambiguation) return { ...hit, rank: i + 1, confidence: 0.9, status: 'ok' };
      const { results } = await searchArticles(name).catch(() => ({ results: [] }));
      const [best, ...rest] = results;
      if (!best) return { title: name, qid: null, description: null, section: null, rank: i + 1, confidence: 0, status: 'missing' };
      return { ...best, rank: i + 1, confidence: 0.5, status: 'guess', alternatives: rest.slice(0, 3) };
    }),
  );
}
