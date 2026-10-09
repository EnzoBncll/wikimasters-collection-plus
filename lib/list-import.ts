import type { GoalEntry } from './goal-albums';

/**
 * Album à objectif à partir de sa propre liste : texte collé ou écrit (puces, numéros), copie d'un tableur ou fichier CSV.
 * Chaque élément est ensuite rapproché d'un article de Wikipédia en français, avec un niveau de confiance,
 * et peut être corrigé à la main avant de construire l'album.
 */

export interface ImportLine {
  text: string;
  /** Partie de la liste (ligne « # Titre » ou « Titre : » au-dessus). */
  section: string | null;
}

export interface ParsedList {
  lines: ImportLine[];
  /** Colonnes d'un tableau (CSV, copie de tableur) ; null pour une liste simple. */
  columns: string[] | null;
  column: number;
}

const BULLET = /^\s*(?:(?:[-*•·▪◦–—+>]|\d{1,4}\s*[.)\]:-]|\(?[a-z]\)|\[[ xX]?\])\s*)+/;
const NAME_HEADER = /^(nom|noms|name|titre|title|article|élément|element|carte|personnage|page)s?$/i;
const OTHER_HEADER = /^(n°|no|num(éro)?|rang|rank|date|année|year|pays|country|type|catégorie|category|description|lien|url|wikip[ée]dia)$/i;

/** Découpe une ligne de tableau (guillemets CSV respectés). */
function splitRow(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && !cur.trim()) quoted = true;
    else if (ch === sep) cells.push(cur.trim()), (cur = '');
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/** Séparateur de tableau : tabulation (copie de tableur), point-virgule, ou virgule pour un fichier .csv. */
function detectSeparator(rows: string[], csvFile: boolean): string | null {
  const sample = rows.slice(0, 30);
  for (const sep of csvFile ? ['\t', ';', ','] : ['\t', ';']) {
    const counts = sample.map((r) => splitRow(r, sep).length);
    const multi = counts.filter((c) => c > 1).length;
    if (multi >= Math.max(1, Math.ceil(sample.length * 0.6))) return sep;
  }
  return null;
}

/**
 * Lit la liste. `column` choisit la colonne du nom dans un tableau (par défaut : celle dont l'en-tête ressemble
 * à « Nom », sinon la première).
 */
export function parseList(raw: string, opts: { csvFile?: boolean; column?: number } = {}): ParsedList {
  const rows = raw.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim());
  const sep = detectSeparator(rows, Boolean(opts.csvFile));
  const lines: ImportLine[] = [];
  const seen = new Set<string>();
  const push = (text: string, section: string | null) => {
    const t = text.replace(/\s+/g, ' ').trim();
    const key = t.toLowerCase();
    if (t && !seen.has(key)) seen.add(key), lines.push({ text: t, section });
  };

  if (sep) {
    const table = rows.map((r) => splitRow(r, sep));
    const head = table[0]!;
    // En-tête : une colonne « Nom / Titre… », ou des intitulés courants (date, pays, rang…).
    const hasHeader = head.some((h) => NAME_HEADER.test(h) || OTHER_HEADER.test(h));
    const columns = hasHeader ? head : head.map((_, i) => `Colonne ${i + 1}`);
    const guess = hasHeader ? Math.max(0, head.findIndex((h) => NAME_HEADER.test(h))) : 0;
    const column = opts.column ?? guess;
    for (const row of hasHeader ? table.slice(1) : table) push(row[column] ?? '', null);
    return { lines, columns, column };
  }

  let section: string | null = null;
  for (const row of rows) {
    const heading = row.match(/^\s*#{1,6}\s*(.+)$/) ?? (row.trim().length <= 60 && !BULLET.test(row) ? row.match(/^\s*(.+?)\s*:\s*$/) : null);
    if (heading) {
      section = heading[1]!.trim();
      continue;
    }
    push(row.replace(BULLET, ''), section);
  }
  return { lines, columns: null, column: 0 };
}

/* ---------- Rapprochement avec Wikipédia ---------- */

export type MatchStatus = 'exact' | 'likely' | 'check' | 'none';

export interface LineMatch extends ImportLine {
  status: MatchStatus;
  /** Article retenu (titre) ; null = élément ignoré. */
  choice: string | null;
  candidates: GoalEntry[];
  /** Les autres pages possibles ont déjà été cherchées. */
  searched: boolean;
  /** Le titre exact est une page d'homonymie. */
  ambiguous?: boolean;
}

const API = 'https://fr.wikipedia.org/w/api.php';
const PAGE_PROPS = { prop: 'pageprops|description|pageimages', ppprop: 'wikibase_item|disambiguation', piprop: 'thumbnail', pithumbsize: '120', pilimit: '50' };

type Page = { title: string; index?: number; missing?: boolean; description?: string; thumbnail?: { source: string }; pageprops?: { wikibase_item?: string; disambiguation?: string } };

async function wp(params: Record<string, string>) {
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`);
  if (!res.ok) throw new Error(`Wikipédia : HTTP ${res.status}`);
  return (await res.json()) as { query?: { pages?: Page[]; normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[] } };
}

const toEntry = (p: Page, section: string | null = null): GoalEntry => ({
  title: p.title,
  qid: p.pageprops?.wikibase_item ?? null,
  description: p.description ?? null,
  section,
  thumbnail: p.thumbnail?.source ?? null,
});

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Article du même titre (redirections suivies), par lots de 50 ; homonymies signalées. */
async function exactPages(texts: string[]): Promise<Map<string, Page>> {
  const out = new Map<string, Page>();
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    const data = await wp({ action: 'query', titles: batch.join('|'), redirects: '1', ...PAGE_PROPS });
    const q = data.query ?? {};
    const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of batch) {
      let final = q.normalized?.find((n) => n.from === t)?.to ?? t;
      final = q.redirects?.find((r) => r.from === final)?.to ?? final;
      const page = pages.get(final);
      if (page && !page.missing) out.set(t, page);
    }
  }
  return out;
}

/** Pages possibles pour un élément (recherche Wikipédia, 6 premiers résultats, hors homonymies). */
export async function searchCandidates(text: string): Promise<GoalEntry[]> {
  const data = await wp({ action: 'query', generator: 'search', gsrsearch: text, gsrlimit: '6', gsrnamespace: '0', ...PAGE_PROPS });
  return (data.query?.pages ?? [])
    .filter((p) => p.pageprops?.disambiguation === undefined)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => toEntry(p));
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  }));
}

/**
 * Rapproche chaque élément d'un article : titre exact (sûr), sinon le meilleur résultat de recherche,
 * « probable » quand son titre reprend l'élément, « à vérifier » sinon ; « introuvable » sans résultat.
 */
export async function matchLines(lines: ImportLine[], onProgress?: (done: number, total: number) => void): Promise<LineMatch[]> {
  const exact = await exactPages(lines.map((l) => l.text));
  const out: LineMatch[] = lines.map((l) => {
    const page = exact.get(l.text);
    if (page && page.pageprops?.disambiguation === undefined)
      return { ...l, status: 'exact', choice: page.title, candidates: [toEntry(page, l.section)], searched: false };
    return { ...l, status: 'none', choice: null, candidates: [], searched: false, ambiguous: Boolean(page) };
  });
  const todo = out.filter((m) => m.status === 'none');
  let done = lines.length - todo.length;
  onProgress?.(done, lines.length);
  await pool(todo, 4, async (m) => {
    try {
      m.candidates = (await searchCandidates(m.text)).map((c) => ({ ...c, section: m.section }));
      m.searched = true;
      const best = m.candidates[0];
      if (best) {
        m.choice = best.title;
        const a = fold(best.title);
        const b = fold(m.text);
        // Le titre exact est une page d'homonymie : le premier résultat n'est qu'une possibilité parmi d'autres.
        m.status = !m.ambiguous && (a === b || a.startsWith(b) || b.startsWith(a)) ? 'likely' : 'check';
      }
    } catch {
      // Réseau : l'élément reste introuvable, on peut relancer la recherche à la main.
    }
    onProgress?.(++done, lines.length);
  });
  return out;
}

/** Cases de l'album : un article par élément retenu, sans doublon, dans l'ordre de la liste. */
export function matchedEntries(matches: LineMatch[]): GoalEntry[] {
  const seen = new Set<string>();
  const entries: GoalEntry[] = [];
  for (const m of matches) {
    if (!m.choice || seen.has(m.choice)) continue;
    seen.add(m.choice);
    const c = m.candidates.find((x) => x.title === m.choice);
    entries.push(c ? { ...c, section: m.section } : { title: m.choice, qid: null, description: null, section: m.section });
  }
  return entries;
}
