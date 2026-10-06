import type { GoalEntry } from './goal-albums';

/**
 * Recherche élargie pour les albums à objectif : on comprend la demande (« les empereurs en Europe après 1600 »)
 * comme un sujet Wikidata + des contraintes (dates, lieu), on ramène large, puis on note chaque article
 * de 0 à 1 selon ce qu'on sait de lui. Les contraintes inconnues pèsent moins qu'une contrainte non respectée.
 */

export interface WdEntity {
  qid: string;
  label: string;
  description: string | null;
}

export interface Constraints {
  from: number | null;
  to: number | null;
  place: WdEntity | null;
}

export interface Candidate extends GoalEntry {
  /** Comment l'article est relié au sujet : fonction occupée, métier, nature. */
  via: 'P39' | 'P106' | 'P31';
  start: number | null;
  end: number | null;
  /** Continents et pays rattachés (juridiction de la fonction, nationalité, pays). */
  places: Set<string>;
}

export interface Scored extends Candidate {
  score: number;
  reasons: string[];
}

const WD_API = 'https://www.wikidata.org/w/api.php';
const EUROPE = 'Q46';
const ASIA = 'Q48';
const EURASIA = 'Q5401';

async function sparql<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`, { headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata : HTTP ${res.status}`);
  return (await res.json()).results.bindings;
}

export async function searchEntities(text: string, limit = 5): Promise<WdEntity[]> {
  const res = await fetch(`${WD_API}?${new URLSearchParams({ action: 'wbsearchentities', search: text, language: 'fr', uselang: 'fr', type: 'item', limit: String(limit), format: 'json', origin: '*' })}`);
  if (!res.ok) return [];
  return ((await res.json()).search ?? []).map((e: { id: string; label: string; description?: string }) => ({ qid: e.id, label: e.label, description: e.description ?? null }));
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const roman = (s: string) => [...s.toUpperCase()].reduce((n, c, i, a) => (ROMAN[c]! < (ROMAN[a[i + 1]!] ?? 0) ? n - ROMAN[c]! : n + ROMAN[c]!), 0);

/** Dates, lieu et sujet d'une demande en français. Le lieu et le sujet sont ensuite cherchés sur Wikidata. */
export function parseQuery(query: string): { subject: string; from: number | null; to: number | null; place: string | null } {
  let text = ` ${query.trim()} `;
  let from: number | null = null;
  let to: number | null = null;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      fn(m);
      text = text.replace(m[0], ' ');
    }
  };
  take(/\bentre\s+(\d{3,4})\s+et\s+(\d{3,4})/i, (m) => ((from = Number(m[1])), (to = Number(m[2]))));
  take(/\b(?:après|depuis|à partir de|dès)\s+(?:l'an\s+)?(\d{3,4})/i, (m) => (from = Number(m[1])));
  take(/\b(?:avant|jusqu'(?:à|en))\s+(?:l'an\s+)?(\d{3,4})/i, (m) => (to = Number(m[1])));
  take(/\b(?:au|du)\s+([IVXLC]+)e\s+siècle/i, (m) => ((from = (roman(m[1]!) - 1) * 100 + 1), (to = roman(m[1]!) * 100)));
  take(/\b(?:en|au|aux)\s+(\d{3,4})\b/i, (m) => ((from = Number(m[1])), (to = Number(m[1]))));
  let place: string | null = null;
  take(/\b(?:en|au|aux|d'|de la|du|des|de)\s*((?:[A-ZÉÈÎ][\p{L}'-]+)(?:\s+(?:du|de|des|la)?\s*[A-ZÉÈÎ][\p{L}'-]+)*)/u, (m) => (place = m[1]!.trim()));
  const subject = text
    .replace(/\b(tous|toutes|les|des|la|le|l'|un|une)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { subject, from, to, place };
}

const singular = (s: string) => s.split(' ').map((w, i) => (i === 0 ? w.replace(/(eaux|aux)$/i, 'al').replace(/([^s])s$/i, '$1').replace(/x$/i, '') : w)).join(' ');
const looksLikeConcept = (e: WdEntity) => !/\d|homonymie|personnalité|militaire|homme|femme|écrivain|musique|album|film|groupe/i.test(e.description ?? '');

/** Sujet et lieu de la demande, trouvés sur Wikidata. */
export async function understand(query: string): Promise<{ subject: WdEntity | null; constraints: Constraints }> {
  const parsed = parseQuery(query);
  const [subjects, places] = await Promise.all([
    parsed.subject ? searchEntities(singular(parsed.subject), 7) : Promise.resolve([]),
    parsed.place ? searchEntities(parsed.place, 5) : Promise.resolve([]),
  ]);
  const subject = subjects.find(looksLikeConcept) ?? subjects[0] ?? null;
  const place = places.find((p) => /continent|pays|état|royaume|région|empire/i.test(p.description ?? '')) ?? null;
  return { subject, constraints: { from: parsed.from, to: parsed.to, place } };
}

const year = (v?: { value: string }) => (v?.value ? Number(v.value) : null);
const ids = (v?: { value: string }) => (v?.value ? v.value.split(',').map((x) => x.split('/').pop()!).filter(Boolean) : []);

/**
 * Tous les articles frwiki rattachés au sujet, en deux temps pour rester sous le délai de Wikidata :
 * d'abord l'arbre des sous-classes du sujet, puis les détenteurs de ces fonctions, ceux qui en ont fait leur métier,
 * et les éléments qui en sont des exemples.
 */
export async function candidatesFor(subject: WdEntity): Promise<Candidate[]> {
  const tree = await sparql<{ c: { value: string } }>(
    `SELECT DISTINCT ?c WHERE { { ?c wdt:P279* wd:${subject.qid} } UNION { ?c wdt:P31/wdt:P279* wd:${subject.qid} } } LIMIT 400`,
  );
  const values = tree.map((r) => `wd:${r.c.value.split('/').pop()}`).join(' ');
  if (!values) return [];
  type Row = { item: { value: string }; title: { value: string }; desc?: { value: string }; y?: { value: string }; ye?: { value: string }; jur?: { value: string }; cont?: { value: string } };
  const article = `?a schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?title . OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "fr") }`;
  const select = `SELECT ?item ?title ?desc (MIN(YEAR(?s)) AS ?y) (MAX(YEAR(?e)) AS ?ye) (GROUP_CONCAT(DISTINCT STR(?j); separator=",") AS ?jur) (GROUP_CONCAT(DISTINCT STR(?cont); separator=",") AS ?cont)`;
  const tail = `GROUP BY ?item ?title ?desc LIMIT 4000`;
  const [held, jobs, kinds] = await Promise.all([
    sparql<Row>(`${select} WHERE {
      VALUES ?pos { ${values} } ?item p:P39 ?st . ?st ps:P39 ?pos .
      OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e }
      OPTIONAL { ?pos wdt:P1001|wdt:P17 ?j . OPTIONAL { ?j wdt:P30 ?cont } }
      ${article}
    } ${tail}`).catch(() => []),
    sparql<Row>(`${select} WHERE {
      VALUES ?job { ${values} } ?item wdt:P106 ?job .
      OPTIONAL { ?item wdt:P569 ?s } OPTIONAL { ?item wdt:P570 ?e }
      OPTIONAL { ?item wdt:P27 ?j . OPTIONAL { ?j wdt:P30 ?cont } }
      ${article}
    } ${tail}`).catch(() => []),
    sparql<Row>(`${select} WHERE {
      VALUES ?kind { ${values} } ?item wdt:P31 ?kind .
      OPTIONAL { ?item wdt:P571|wdt:P580|wdt:P569 ?s } OPTIONAL { ?item wdt:P576|wdt:P582|wdt:P570 ?e }
      OPTIONAL { ?item wdt:P17|wdt:P495|wdt:P27 ?j . OPTIONAL { ?j wdt:P30 ?cont } }
      ${article}
    } ${tail}`).catch(() => []),
  ]);
  const out = new Map<string, Candidate>();
  for (const [via, rows] of [
    ['P39', held],
    ['P106', jobs],
    ['P31', kinds],
  ] as const) {
    for (const r of rows) {
      const qid = r.item.value.split('/').pop()!;
      if (out.has(qid)) continue;
      out.set(qid, {
        title: r.title.value,
        qid,
        description: r.desc?.value ?? null,
        section: null,
        via,
        start: year(r.y),
        end: year(r.ye),
        places: new Set([...ids(r.jur), ...ids(r.cont)]),
      });
    }
  }
  return [...out.values()];
}

const VIA_WEIGHT = { P39: 1, P106: 0.92, P31: 0.88 } as const;
const VIA_REASON = { P39: 'a occupé la fonction', P106: 'en a fait son métier', P31: 'en est un exemple' } as const;

/** Note de 0 à 1 : lien avec le sujet × respect des dates × respect du lieu. */
export function scoreCandidates(candidates: Candidate[], c: Constraints, subjectLabel: string): Scored[] {
  return candidates
    .map((cand) => {
      let score = VIA_WEIGHT[cand.via];
      const reasons = [`${VIA_REASON[cand.via]} « ${subjectLabel} »`];
      if (c.from !== null || c.to !== null) {
        const start = cand.start ?? cand.end;
        const end = cand.end ?? cand.start;
        if (start === null || end === null) {
          score *= 0.6;
          reasons.push('dates inconnues');
        } else if ((c.from === null || end >= c.from) && (c.to === null || start <= c.to)) {
          reasons.push(start === end ? `${start}` : `${start}–${end}`);
        } else {
          score *= 0.12;
          reasons.push(`hors période (${start === end ? start : `${start}–${end}`})`);
        }
      }
      if (c.place) {
        if (!cand.places.size) {
          score *= 0.6;
          reasons.push('lieu inconnu');
        } else if (cand.places.has(c.place.qid)) {
          reasons.push(c.place.label);
        } else if (cand.places.has(EURASIA) && (c.place.qid === EUROPE || c.place.qid === ASIA)) {
          score *= 0.8;
          reasons.push('Eurasie');
        } else {
          score *= 0.15;
          reasons.push(`hors ${c.place.label}`);
        }
      }
      return { ...cand, score: Math.round(score * 100) / 100, reasons };
    })
    .sort((a, b) => b.score - a.score || (a.start ?? 9999) - (b.start ?? 9999) || a.title.localeCompare(b.title, 'fr'));
}

/** Critères Wikidata les plus partagés par des articles trouvés : « Nature : dessert » (12 sur 20). */
export async function relatedCriteria(qids: string[]): Promise<{ prop: string; qid: string; label: string; shared: number }[]> {
  if (!qids.length) return [];
  const res = await fetch(`${WD_API}?${new URLSearchParams({ action: 'wbgetentities', ids: qids.slice(0, 50).join('|'), props: 'claims', format: 'json', origin: '*' })}`);
  if (!res.ok) return [];
  const entities = (await res.json()).entities as Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: { id?: string } } } }[]> }>;
  const counts = new Map<string, number>();
  for (const e of Object.values(entities)) {
    for (const prop of ['P31', 'P106', 'P39', 'P279']) {
      for (const id of new Set((e.claims?.[prop] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean))) {
        counts.set(`${prop}:${id}`, (counts.get(`${prop}:${id}`) ?? 0) + 1);
      }
    }
  }
  const top = [...counts.entries()]
    .filter(([k, n]) => n >= 3 && k !== 'P31:Q5' && k !== 'P31:Q4167410')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (!top.length) return [];
  const labelRes = await fetch(
    `${WD_API}?${new URLSearchParams({ action: 'wbgetentities', ids: top.map(([k]) => k.split(':')[1]).join('|'), props: 'labels', languages: 'fr|en', format: 'json', origin: '*' })}`,
  );
  const labels = labelRes.ok ? ((await labelRes.json()).entities as Record<string, { labels?: Record<string, { value: string }> }>) : {};
  return top.map(([k, shared]) => {
    const [prop, qid] = k.split(':') as [string, string];
    return { prop: prop === 'P279' ? 'P31' : prop, qid, label: labels[qid]?.labels?.fr?.value ?? labels[qid]?.labels?.en?.value ?? qid, shared };
  });
}
