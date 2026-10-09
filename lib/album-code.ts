import { resolveTitles, type GoalAlbum, type GoalEntry, type GoalSourceKind } from './goal-albums';

/**
 * Code de partage d'un album à objectif : « CP1- » suivi du contenu compressé, en caractères sûrs (base64url).
 * Les cases sont désignées par leur élément Wikidata (≈ 3 octets) plutôt que par leur titre ; seules les cases sans
 * élément gardent leur titre. Rien n'est envoyé nulle part : le code contient tout l'album, sans les cartes possédées.
 * Au collage, les titres, descriptions et miniatures sont relus sur Wikidata et Wikipédia.
 */

const PREFIX = 'CP1-';
const KINDS: GoalSourceKind[] = ['list', 'criteria', 'search'];

export interface SharedAlbum {
  name: string;
  color: string | null;
  source: GoalAlbum['source'];
  annex: boolean;
  /** Cases dans l'ordre, avec leur partie ; titre seul quand la case n'a pas d'élément Wikidata. */
  items: { qid: string | null; title: string | null; section: string | null }[];
}

/* ---------- Octets ---------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

class Writer {
  bytes: number[] = [];
  varint(n: number) {
    while (n >= 0x80) {
      this.bytes.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.bytes.push(n);
  }
  str(s: string) {
    const b = enc.encode(s);
    this.varint(b.length);
    this.bytes.push(...b);
  }
}

class Reader {
  i = 0;
  b: Uint8Array;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  byte() {
    if (this.i >= this.b.length) throw new Error('Code incomplet.');
    return this.b[this.i++]!;
  }
  varint() {
    let n = 0;
    for (let mul = 1; ; mul *= 0x80) {
      const x = this.byte();
      n += (x & 0x7f) * mul;
      if (x < 0x80) return n;
      if (mul > 2 ** 42) throw new Error('Code invalide.');
    }
  }
  str(len = this.varint()) {
    if (this.i + len > this.b.length) throw new Error('Code incomplet.');
    return dec.decode(this.b.subarray(this.i, (this.i += len)));
  }
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/* ---------- Format ---------- */

/** flags (annexe, type de source, couleur) · nom · [couleur RVB] · libellé de la source · parties → cases. */
export async function encodeAlbumCode(name: string, color: string | null, goal: GoalAlbum): Promise<string> {
  const w = new Writer();
  const rgb = color && /^#[0-9a-f]{6}$/i.test(color) ? color : null;
  w.bytes.push((goal.annex ? 1 : 0) | (Math.max(0, KINDS.indexOf(goal.source.kind)) << 1) | (rgb ? 8 : 0));
  w.str(name);
  if (rgb) for (let i = 1; i < 7; i += 2) w.bytes.push(parseInt(rgb.slice(i, i + 2), 16));
  w.str(goal.source.label);
  // Parties consécutives : nom puis nombre de cases.
  const runs: { section: string | null; entries: GoalEntry[] }[] = [];
  for (const e of goal.entries) {
    const last = runs.at(-1);
    if (last && last.section === e.section) last.entries.push(e);
    else runs.push({ section: e.section, entries: [e] });
  }
  w.varint(runs.length);
  for (const run of runs) {
    w.str(run.section ?? '');
    w.varint(run.entries.length);
    for (const e of run.entries) {
      const q = e.qid?.match(/^Q(\d+)$/)?.[1];
      // Pair : numéro de l'élément Wikidata ; impair : longueur du titre, suivi du titre.
      if (q) w.varint(Number(q) * 2);
      else {
        const b = enc.encode(e.title);
        w.varint(b.length * 2 + 1);
        w.bytes.push(...b);
      }
    }
  }
  return PREFIX + toB64(await pipe(Uint8Array.from(w.bytes), new CompressionStream('deflate-raw')));
}

export async function decodeAlbumCode(code: string): Promise<SharedAlbum> {
  const clean = code.replace(/\s+/g, '');
  if (!clean.startsWith(PREFIX)) throw new Error('Ce n’est pas un code d’album Collection+ (il commence par « CP1- »).');
  let r: Reader;
  try {
    r = new Reader(await pipe(fromB64(clean.slice(PREFIX.length)), new DecompressionStream('deflate-raw')));
  } catch {
    throw new Error('Code abîmé : vérifie qu’il a été copié en entier.');
  }
  const flags = r.byte();
  const name = r.str();
  const color = flags & 8 ? `#${[r.byte(), r.byte(), r.byte()].map((x) => x.toString(16).padStart(2, '0')).join('')}` : null;
  const label = r.str();
  const items: SharedAlbum['items'] = [];
  for (let runs = r.varint(); runs > 0; runs--) {
    const section = r.str() || null;
    for (let n = r.varint(); n > 0; n--) {
      const v = r.varint();
      if (v % 2 === 0) items.push({ qid: `Q${v / 2}`, title: null, section });
      else items.push({ qid: null, title: r.str((v - 1) / 2), section });
    }
    if (items.length > 5000) throw new Error('Album trop grand.');
  }
  if (!name.trim() || !items.length) throw new Error('Code vide.');
  return { name, color, source: { kind: KINDS[(flags >> 1) & 3] ?? 'list', label }, annex: Boolean(flags & 1), items };
}

/** Titres frwiki des éléments Wikidata, par lots de 50. */
async function frTitles(qids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < qids.length; i += 50) {
    const params = new URLSearchParams({ action: 'wbgetentities', ids: qids.slice(i, i + 50).join('|'), props: 'sitelinks', sitefilter: 'frwiki', format: 'json', origin: '*' });
    const res = await fetch(`https://www.wikidata.org/w/api.php?${params}`);
    if (!res.ok) throw new Error(`Wikidata : ${res.status}`);
    const data = (await res.json()) as { entities?: Record<string, { sitelinks?: { frwiki?: { title: string } } }> };
    for (const [id, e] of Object.entries(data.entities ?? {})) if (e.sitelinks?.frwiki) out.set(id, e.sitelinks.frwiki.title);
  }
  return out;
}

/** Cases complètes (titre, description, miniature) ; les éléments sans article en français sont écartés. */
export async function resolveSharedEntries(shared: SharedAlbum): Promise<{ entries: GoalEntry[]; dropped: number }> {
  const titles = await frTitles([...new Set(shared.items.flatMap((i) => (i.qid ? [i.qid] : [])))]);
  const wanted = shared.items.map((i) => (i.qid ? titles.get(i.qid) : i.title) ?? null);
  const resolved = await resolveTitles([...new Set(wanted.filter((t): t is string => Boolean(t)))]);
  const entries: GoalEntry[] = [];
  shared.items.forEach((item, i) => {
    const t = wanted[i];
    const e = t ? resolved.get(t) : undefined;
    if (e) entries.push({ ...e, qid: e.qid ?? item.qid, section: item.section });
  });
  return { entries, dropped: shared.items.length - entries.length };
}
