import { motion } from 'framer-motion';
import { Check, ChevronDown, ChevronRight, ClipboardList, Database, ListOrdered, Loader2, MessageSquareText, Pencil, Plus, RotateCcw, Search, Sparkles, Target, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { toast } from '@/hooks/use-toast';
import { goalName } from '@/lib/album-kind';
import {
  cleanQuery,
  criterionEntries,
  findCriteria,
  findListPages,
  matchEntries,
  readListPage,
  titleKey,
  saveGoalAlbum,
  searchArticles,
  type Criterion,
  type GoalEntry,
  type ListPage,
  type ListSection,
  type SearchResult,
} from '@/lib/goal-albums';
import { canQuery, resolveNames, resolvePlan, runPlan, understandFree, type FreeEntry, type QueryPlan, type Resolved } from '@/lib/free-query';
import { candidatesFor, relatedCriteria, scoreCandidates, searchEntities, understand, type Candidate, type Constraints, type WdEntity } from '@/lib/goal-search';
import { RARITY_LABEL, RARITY_ORDER, type OwnedCard, type Rarity, type SiteTag } from '@/lib/types';
import { catalogInfo, GOAL_SORTS, sortEntries, wikidataInfo, type CatalogInfo, type GoalSort, type WikidataInfo } from '@/lib/goal-enrich';
import { Switch } from '@/components/ui/switch';
import { matchedEntries, matchLines, parseList, searchCandidates, type LineMatch, type MatchStatus } from '@/lib/list-import';
import { ALBUM_STYLE_ICONS, ALBUM_STYLE_IDS, ALBUM_STYLES, type AlbumStyleId } from './album-styles';
import { albumStylesItem } from '@/lib/album';
import { RARITY_VAR } from './rarity';
import { cn } from '@/lib/utils';
import { randomTagColor, TAG_COLORS } from '@/lib/tag-colors';
import { useThumbnails, WikiPeek } from './wiki-peek';

const PER_PAGE = 9;
/** Cartes affichées à la fois dans la grille de sélection. */
const SHOWN = 120;

type Async<T> = { status: 'loading' } | { status: 'done'; value: T } | { status: 'error' };

type Pickable = GoalEntry & { relevant?: boolean };

type ScoredDraft = {
  kind: 'scored';
  label: string;
  subject: WdEntity;
  constraints: Constraints;
  use: { dates: boolean; place: boolean };
  threshold: number;
  candidates: Candidate[];
  picked: Set<string>;
};

/** Source choisie à l'étape 1 et ce qu'on en garde à l'étape 2. */
type Draft =
  | { kind: 'list'; label: string; sections: (ListSection & { on: boolean })[]; off: Set<string> }
  /** Demande libre, liste construite par Wikidata (ou noms vérifiés) : classée, cases cochées. */
  | { kind: 'free'; label: string; entries: FreeEntry[]; picked: Set<string> }
  /** Demande libre en mode noms : liste proposée par l'IA, à corriger puis verrouiller avant de chercher les articles. */
  | { kind: 'names'; label: string; names: string[] }
  /** « import » : ta propre liste, rapprochée de Wikipédia à l'étape 1.5. */
  | { kind: 'criteria' | 'search' | 'import'; label: string; items: Pickable[]; picked: Set<string>; next?: number | null; query?: string }
  | ScoredDraft;

function activeConstraints(d: ScoredDraft): Constraints {
  return {
    from: d.use.dates ? d.constraints.from : null,
    to: d.use.dates ? d.constraints.to : null,
    place: d.use.place ? d.constraints.place : null,
  };
}

const scoredOf = (d: ScoredDraft) => scoreCandidates(d.candidates, activeConstraints(d), d.subject.label);

/** Recoche d'après le seuil (après un changement de seuil ou de contrainte). */
function repick(d: ScoredDraft): ScoredDraft {
  return { ...d, picked: new Set(scoredOf(d).filter((c) => c.score >= d.threshold).map((c) => c.title)) };
}

/** Entrées retenues, dans l'ordre de l'album. */
function draftEntries(d: Draft | null): GoalEntry[] {
  if (!d) return [];
  if (d.kind === 'list') {
    const seen = new Set<string>();
    return d.sections
      .filter((s) => s.on)
      .flatMap((s) => s.entries)
      .filter((e) => !d.off.has(e.title) && !seen.has(e.title) && (seen.add(e.title), true));
  }
  if (d.kind === 'scored') {
    // Album dans l'ordre chronologique quand les dates sont connues.
    return d.candidates
      .filter((c) => d.picked.has(c.title))
      .sort((a, b) => (a.start ?? 99999) - (b.start ?? 99999) || a.title.localeCompare(b.title, 'fr'))
      .map(({ title, qid, description }) => ({ title, qid, description, section: null }));
  }
  if (d.kind === 'free') return d.entries.filter((e) => e.status !== 'missing' && d.picked.has(e.title));
  if (d.kind === 'names') return [];
  return d.items.filter((e) => d.picked.has(e.title));
}

/** Résultat de la demande libre : règles comprises, puis liste construite. */
interface FreeState {
  plan: QueryPlan;
  resolved: Resolved | null;
  warning?: string;
  entries: Async<FreeEntry[]> | null;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (n: number) => n.toFixed(2).replace('.', ',');

/** Assistant de création d'un album à objectif : sujet → cartes → aperçu. */
export function GoalAlbumWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (tag: SiteTag) => void }) {
  const { cards, tags, createTag, updateTag, stageIntoAlbum } = useCollection();
  const facts = useSuggestions((s) => s.facts);
  // 1,5 : ta propre liste (écrite, collée ou importée) et son rapprochement avec Wikipédia.
  const [step, setStep] = useState<1 | 1.5 | 2 | 3>(1);
  const [importText, setImportText] = useState('');
  const [importCsv, setImportCsv] = useState(false);
  const [importColumn, setImportColumn] = useState<number | undefined>(undefined);
  const [matches, setMatches] = useState<LineMatch[] | null>(null);
  /** Éléments ajoutés à la main à l'étape 2. */
  const [added, setAdded] = useState<GoalEntry[]>([]);
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [lists, setLists] = useState<Async<ListPage[]> | null>(null);
  const [criteria, setCriteria] = useState<Async<Criterion[]> | null>(null);
  const [search, setSearch] = useState<Async<{ results: SearchResult[]; next: number | null }> | null>(null);
  const [broad, setBroad] = useState<Async<{ subject: WdEntity; constraints: Constraints; candidates: Candidate[] } | null> | null>(null);
  const [related, setRelated] = useState<Async<Awaited<ReturnType<typeof relatedCriteria>>> | null>(null);
  const [free, setFree] = useState<Async<FreeState> | null>(null);
  const geminiKey = useCollection((s) => s.settings.geminiApiKey);
  const [opening, setOpening] = useState<string | null>(null);
  /** Premières listes Wikipédia lues d'avance : leur nombre de cases et leurs miniatures s'affichent dans les propositions. */
  const [listReads, setListReads] = useState<Record<string, Async<ListSection[]>>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(randomTagColor);
  const [annex, setAnnex] = useState(true);
  const [sort, setSort] = useState<GoalSort>('source');
  const [albumStyle, setAlbumStyle] = useState<AlbumStyleId>(() => useCollection.getState().settings.albumStyle);
  const [catalog, setCatalog] = useState<Async<Map<string, CatalogInfo>> | null>(null);
  const [wikidata, setWikidata] = useState<Async<Map<string, WikidataInfo>> | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const run = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuery(text);
    setAsked(text);
    setLists({ status: 'loading' });
    setCriteria({ status: 'loading' });
    setSearch({ status: 'loading' });
    setBroad({ status: 'loading' });
    setRelated(null);
    setFree({ status: 'loading' });
    understandFree(text, geminiKey).then(
      ({ plan, warning }) => build(plan, warning),
      () => setFree({ status: 'error' }),
    );
    setListReads({});
    findListPages(text).then(
      (value) => {
        setLists({ status: 'done', value });
        for (const p of value.slice(0, 3)) {
          setListReads((r) => ({ ...r, [p.title]: { status: 'loading' } }));
          readListPage(p.title).then(
            (sections) => setListReads((r) => ({ ...r, [p.title]: { status: 'done', value: sections } })),
            () => setListReads((r) => ({ ...r, [p.title]: { status: 'error' } })),
          );
        }
      },
      () => setLists({ status: 'error' }),
    );
    findCriteria(text).then((value) => setCriteria({ status: 'done', value }), () => setCriteria({ status: 'error' }));
    searchArticles(text).then(
      (value) => {
        setSearch({ status: 'done', value });
        // Critères partagés par les articles trouvés : utiles quand Wikidata ne comprend pas la demande telle quelle.
        setRelated({ status: 'loading' });
        relatedCriteria(value.results.map((r) => r.qid).filter((q): q is string => Boolean(q))).then(
          (v) => setRelated({ status: 'done', value: v }),
          () => setRelated({ status: 'error' }),
        );
      },
      () => setSearch({ status: 'error' }),
    );
    understand(text)
      .then(async ({ subject, constraints }) => (subject ? { subject, constraints, candidates: await candidatesFor(subject) } : null))
      .then((value) => setBroad({ status: 'done', value: value && value.candidates.length ? value : null }), () => setBroad({ status: 'error' }));
  };

  /** Règles (comprises ou corrigées) → libellés retrouvés sur Wikidata → liste. */
  const build = async (plan: QueryPlan, warning?: string) => {
    if (plan.mode === 'names') {
      setFree({ status: 'done', value: { plan, resolved: null, warning, entries: null } });
      return;
    }
    setFree({ status: 'done', value: { plan, resolved: null, warning, entries: { status: 'loading' } } });
    try {
      const resolved = await resolvePlan(plan);
      if (!canQuery(plan, resolved)) {
        setFree({ status: 'done', value: { plan, resolved, warning, entries: { status: 'done', value: [] } } });
        return;
      }
      setFree({ status: 'done', value: { plan, resolved, warning, entries: { status: 'loading' } } });
      const entries = await runPlan(plan, resolved);
      setFree({ status: 'done', value: { plan, resolved, warning, entries: { status: 'done', value: entries } } });
    } catch (error) {
      setFree({ status: 'done', value: { plan, resolved: null, warning: error instanceof Error ? error.message : String(error), entries: { status: 'error' } } });
    }
  };

  const open = async (key: string, load: () => Promise<Draft>, suggestedName: string) => {
    setOpening(key);
    try {
      setDraft(await load());
      setName(capitalize(suggestedName));
      setStep(2);
    } catch (error) {
      toast(`Impossible de lire cette source : ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setOpening(null);
    }
  };

  const scoredDraft = (subject: WdEntity, constraints: Constraints, candidates: Candidate[]): ScoredDraft =>
    repick({ kind: 'scored', label: `Wikidata · ${subject.label}`, subject, constraints, use: { dates: true, place: true }, threshold: 0.6, candidates, picked: new Set() });

  /** Autre sujet choisi à la main ou suggéré : même recherche élargie, mêmes contraintes de dates et de lieu. */
  const openEntity = (entity: WdEntity) =>
    open(
      `entity:${entity.qid}`,
      async () => {
        const constraints = broad?.status === 'done' && broad.value ? broad.value.constraints : (await understand(asked)).constraints;
        const candidates = await candidatesFor(entity);
        if (!candidates.length) throw new Error(`aucun article rattaché à « ${entity.label} »`);
        return scoredDraft(entity, constraints, candidates);
      },
      cleanQuery(asked) || entity.label,
    );

  const picked = useMemo(() => {
    const base = draftEntries(draft);
    const seen = new Set(base.map((e) => e.title));
    return [...base, ...added.filter((e) => !seen.has(e.title))];
  }, [draft, added]);
  /** Texte saisi d'origine des éléments de ta liste dont la page a un autre titre. */
  const origins = useMemo(() => {
    const m = new Map<string, string>();
    if (draft?.kind === 'import' && matches) for (const x of matches) if (x.choice && x.choice.toLowerCase() !== x.text.toLowerCase()) m.set(x.choice, x.text);
    return m;
  }, [draft, matches]);
  const dropTitles = (titles: string[]) => {
    setAdded((a) => a.filter((e) => !titles.includes(e.title)));
    setDraft((d) =>
      !d || d.kind === 'names'
        ? d
        : d.kind === 'list'
          ? { ...d, off: new Set([...d.off, ...titles]) }
          : { ...d, picked: new Set([...d.picked].filter((t) => !titles.includes(t))) },
    );
  };
  // Aperçu : carte WikiMasters (rareté, existence) et données Wikidata (date, notoriété) des cases, lues une fois.
  useEffect(() => {
    if (step !== 3 || !picked.length) return;
    let alive = true;
    const known = catalog?.status === 'done' ? catalog.value : null;
    const titles = picked.map((e) => e.title).filter((t) => !known || !known.has(titleKey(t)));
    if (!known || titles.length) {
      setCatalog((c) => (c?.status === 'done' ? c : { status: 'loading' }));
      catalogInfo(titles).then(
        (found) => alive && setCatalog((c) => ({ status: 'done', value: new Map([...(c?.status === 'done' ? c.value : []), ...found]) })),
        () => alive && setCatalog({ status: 'error' }),
      );
    }
    const qids = picked.map((e) => e.qid).filter((q): q is string => Boolean(q));
    const wdKnown = wikidata?.status === 'done' ? wikidata.value : null;
    const wdMissing = qids.filter((q) => !wdKnown?.has(q));
    if (wdMissing.length) {
      setWikidata((w) => (w?.status === 'done' ? w : { status: 'loading' }));
      wikidataInfo(wdMissing).then(
        (found) => alive && setWikidata((w) => ({ status: 'done', value: new Map([...(w?.status === 'done' ? w.value : []), ...found]) })),
        () => alive && setWikidata({ status: 'error' }),
      );
    } else if (!qids.length && !wikidata) setWikidata({ status: 'error' });
    return () => {
      alive = false;
    };
  }, [step, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const entries = useMemo(() => {
    const cat = catalog?.status === 'done' ? catalog.value : null;
    const wd = wikidata?.status === 'done' ? wikidata.value : null;
    // Tant que les données du tri ne sont pas là, l'ordre de la liste reste affiché.
    const needs = GOAL_SORTS.find((x) => x.id === sort)?.needs;
    const ready = needs === 'catalog' ? cat : needs === 'wikidata' ? wd : true;
    return sortEntries(picked, ready ? sort : 'source', cat, wd);
  }, [picked, sort, catalog, wikidata]);
  const owned = useMemo(() => matchEntries(entries, cards, facts), [entries, cards, facts]);
  const ownedTitles = useMemo(() => {
    if (!draft) return new Set<string>();
    if (draft.kind === 'names') return new Set<string>();
    const all: GoalEntry[] =
      draft.kind === 'list' ? draft.sections.flatMap((s) => s.entries) : draft.kind === 'scored' ? draft.candidates : draft.kind === 'free' ? draft.entries : draft.items;
    const m = matchEntries(all, cards, facts);
    return new Set([...m.keys()].map((i) => all[i]!.title));
  }, [draft, cards, facts]);
  const pages = Math.ceil(entries.length / PER_PAGE);

  const create = async () => {
    if (!draft || !entries.length || !name.trim() || creating) return;
    setCreating(true);
    try {
      // Préfixe commun « ◇ » : les albums à objectif se reconnaissent sur le site comme sur tous tes ordinateurs.
      const full = goalName(name);
      const existing = tags.find((t) => t.name.toLowerCase() === full.toLowerCase() || t.name.toLowerCase() === name.trim().toLowerCase());
      const tag = existing ?? (await createTag(full, color));
      if (!tag) return;
      if (existing && existing.name !== full) await updateTag(existing.id, { name: full });
      await albumStylesItem.setValue({ ...(await albumStylesItem.getValue()), [tag.id]: albumStyle });
      await saveGoalAlbum(tag.id, { entries, source: { kind: draft.kind === 'list' || draft.kind === 'import' ? 'list' : draft.kind === 'search' ? 'search' : 'criteria', label: draft.label }, annex, at: Date.now() });
      const toStick = [...owned.values()].filter((c) => !c.tagIds.includes(tag.id));
      if (toStick.length) stageIntoAlbum(toStick, tag);
      toast(`Album « ${tag.name} » créé : ${entries.length} cases${toStick.length ? `, ${toStick.length} carte(s) à coller dans la boîte d'envoi` : ''}`, 'success');
      onCreated(tag);
    } finally {
      setCreating(false);
    }
  };

  const ownList = step === 1.5 || draft?.kind === 'import';
  const steps: [1 | 1.5 | 2 | 3, string][] = [[1, 'Sujet'], ...(ownList ? ([[1.5, 'Ma liste']] as [1.5, string][]) : []), [2, 'Cartes'], [3, 'Aperçu']];

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[72] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 16 }}
        animate={{ y: 0 }}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl"
      >
        <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Target className="size-4 text-muted-foreground" /> Nouvel album à objectif
          </span>
          <nav className="ml-auto flex items-center gap-1 text-xs" aria-label="Étapes">
            {steps.map(([n, label], i) => (
              <span key={n} className="flex items-center gap-1">
                {i > 0 && <span className={cn('h-px w-5 bg-border', n <= step && 'bg-primary')} />}
                <button
                  type="button"
                  disabled={n > step || (n > 1.5 && !draft)}
                  onClick={() => setStep(n)}
                  aria-current={n === step ? 'step' : undefined}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 font-medium text-muted-foreground transition disabled:cursor-default',
                    n === step && 'bg-primary/10 text-foreground',
                    n < step && 'hover:text-foreground',
                  )}
                >
                  <span className={cn('grid size-5 place-items-center rounded-full border text-[10px] font-bold', n === step && 'border-primary bg-primary text-primary-foreground', n < step && 'border-primary text-primary')}>
                    {n < step ? <Check className="size-3" /> : i + 1}
                  </span>
                  {label}
                </button>
              </span>
            ))}
          </nav>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-[440px] flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {step === 1 && (
            <StepSubject
              query={query}
              setQuery={setQuery}
              asked={asked}
              run={run}
              lists={lists}
              listReads={listReads}
              ownedOf={(list) => matchEntries(list, cards, facts).size}
              criteria={criteria}
              search={search}
              broad={broad}
              related={related}
              free={free}
              hasKey={Boolean(geminiKey)}
              onRebuild={(plan) => build(plan)}
              onFree={(entries, plan) => {
                setDraft({ kind: 'free', label: plan.summary, entries, picked: new Set(entries.map((e) => e.title)) });
                setName(capitalize(cleanQuery(asked)));
                setStep(2);
              }}
              onNames={(plan) => {
                setDraft({ kind: 'names', label: plan.summary, names: plan.names });
                setName(capitalize(cleanQuery(asked)));
                setStep(2);
              }}
              opening={opening}
              onList={(p) =>
                open(
                  `list:${p.title}`,
                  async () => {
                    const read = listReads[p.title];
                    const sections = read?.status === 'done' ? read.value : await readListPage(p.title);
                    return { kind: 'list', label: p.title, sections: sections.map((s) => ({ ...s, on: s.suggested })), off: new Set() };
                  },
                  p.title.replace(/^Liste (des |de la |de l'|du |de |d')/i, ''),
                )
              }
              onCriterion={(c) =>
                open(
                  `crit:${c.prop}:${c.qid}`,
                  async () => {
                    const items = await criterionEntries(c);
                    return { kind: 'criteria', label: `${c.propLabel} : ${c.label}`, items, picked: new Set(items.map((e) => e.title)) };
                  },
                  cleanQuery(asked),
                )
              }
              onBroad={() => {
                if (broad?.status !== 'done' || !broad.value) return;
                setDraft(scoredDraft(broad.value.subject, broad.value.constraints, broad.value.candidates));
                setName(capitalize(cleanQuery(asked) || broad.value.subject.label));
                setStep(2);
              }}
              onEntity={openEntity}
              onOwnList={() => setStep(1.5)}
              onSearch={() => {
                if (search?.status !== 'done') return;
                const { results, next } = search.value;
                setDraft({ kind: 'search', label: `Recherche « ${asked} »`, items: results, picked: new Set(results.filter((r) => r.relevant).map((r) => r.title)), next, query: asked });
                setName(capitalize(cleanQuery(asked)));
                setStep(2);
              }}
            />
          )}
          {step === 1.5 && (
            <StepImport
              text={importText}
              setText={(t) => (setImportText(t), setMatches(null))}
              csvFile={importCsv}
              setCsvFile={setImportCsv}
              column={importColumn}
              setColumn={setImportColumn}
              matches={matches}
              setMatches={setMatches}
              onContinue={(m) => {
                const items = matchedEntries(m);
                setDraft({ kind: 'import', label: 'Ma liste', items, picked: new Set(items.map((e) => e.title)) });
                setAdded([]);
                if (!name.trim()) setName('Ma liste');
                setStep(2);
              }}
            />
          )}
          {step === 2 && draft && (
            <>
              <StepCards draft={draft} setDraft={setDraft} ownedTitles={ownedTitles} />
              {draft.kind !== 'names' && (
                <EntryList entries={picked} ownedTitles={ownedTitles} origins={origins} onRemove={(t) => dropTitles([t])} onAdd={(e) => setAdded((a) => [...a, { ...e, section: null }])} />
              )}
            </>
          )}
          {step === 3 && draft && (
            <StepPreview
              name={name}
              setName={setName}
              color={color}
              setColor={setColor}
              annex={annex}
              setAnnex={setAnnex}
              entries={entries}
              owned={owned}
              sort={sort}
              setSort={setSort}
              catalog={catalog}
              wikidata={wikidata}
              albumStyle={albumStyle}
              setAlbumStyle={setAlbumStyle}
              onDrop={dropTitles}
            />
          )}
        </div>

        {step > 1.5 && draft && (
          <footer className="flex flex-wrap items-center gap-3 border-t px-5 py-3">
            <button type="button" onClick={() => setStep((s) => (s === 2 && draft.kind === 'import' ? 1.5 : s === 3 ? 2 : 1))} className="h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
              Retour
            </button>
            <p className="flex-1 text-sm text-muted-foreground tabular-nums">
              <b className="font-semibold text-foreground">{entries.length}</b> cartes · <b className="font-semibold text-foreground">{pages}</b> pages ·{' '}
              <b className="font-semibold text-foreground">{owned.size}</b> déjà à toi
            </p>
            {step === 2 ? (
              <button
                type="button"
                disabled={!entries.length}
                onClick={() => setStep(3)}
                className="flex h-9 cursor-pointer items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
              >
                Continuer <ChevronRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!entries.length || !name.trim() || creating}
                onClick={create}
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
              >
                {creating && <Loader2 className="size-4 animate-spin" />} Créer l'album
              </button>
            )}
          </footer>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/* ---------- Étape 1 : sujet ---------- */

function Row({ title, detail, busy, onClick }: { title: string; detail: string; busy?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-muted disabled:cursor-progress"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />}
    </button>
  );
}

const Spin = ({ text }: { text: string }) => (
  <>
    <Loader2 className="size-3.5 animate-spin" /> {text}
  </>
);

const RANKING_LABEL: Record<QueryPlan['ranking'], string> = { notoriety: 'classés par notoriété', chronological: 'classés par date', alphabetical: 'classés de A à Z' };
const NEXT_RANKING: Record<QueryPlan['ranking'], QueryPlan['ranking']> = { notoriety: 'chronological', chronological: 'alphabetical', alphabetical: 'notoriety' };

function Chip({ children, onRemove, onClick, title }: { children: React.ReactNode; onRemove?: () => void; onClick?: () => void; title?: string }) {
  return (
    <span title={title} className="flex h-7 items-center gap-1 rounded-md border bg-background pr-1 pl-2.5 text-xs">
      {onClick ? (
        <button type="button" onClick={onClick} className="cursor-pointer hover:underline">
          {children}
        </button>
      ) : (
        children
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Retirer cette règle" className="grid size-5 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-3" />
        </button>
      )}
      {!onRemove && <span className="w-1" />}
    </span>
  );
}

/** Demande libre : règles comprises (modifiables), puis la liste construite à partir d'elles. */
function FreeBlock({
  free,
  hasKey,
  onRebuild,
  onFree,
  onNames,
}: {
  free: Async<FreeState> | null;
  hasKey: boolean;
  onRebuild: (plan: QueryPlan) => void;
  onFree: (entries: FreeEntry[], plan: QueryPlan) => void;
  onNames: (plan: QueryPlan) => void;
}) {
  const value = free?.status === 'done' ? free.value : null;
  const [plan, setPlan] = useState<QueryPlan | null>(null);
  useEffect(() => setPlan(value?.plan ?? null), [value?.plan]);
  if (free?.status === 'loading')
    return (
      <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
        <Spin text={hasKey ? 'Gemini lit la demande…' : 'Analyse de la demande…'} />
      </p>
    );
  if (!value || !plan) return <p className="px-3 py-2.5 text-sm text-muted-foreground">Analyse impossible pour le moment.</p>;
  const set = (patch: Partial<QueryPlan>) => setPlan({ ...plan, ...patch });
  const edited = JSON.stringify(plan) !== JSON.stringify(value.plan);
  const r = value.resolved;
  const entries = value.entries;
  return (
    <div className="space-y-2.5 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">
        {plan.source === 'gemini' ? 'Compris par Gemini' : 'Analyse sans IA'}
        {plan.source === 'gemini' && plan.summary ? ` : ${plan.summary}` : ''}
        {plan.source === 'rules' && !hasKey && ' · pour les demandes complexes, ajoute une clé Gemini gratuite dans Paramètres › Rangement.'}
      </p>
      {value.warning && <p className="text-xs text-amber-700 dark:text-amber-300">{value.warning}</p>}
      {plan.mode === 'rules' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {plan.people && <Chip onRemove={() => set({ people: false })}>personnes</Chip>}
          {plan.subject && (
            <Chip onRemove={() => set({ subject: null })} title={r?.subject?.description ?? undefined}>
              {r?.subject?.label ?? plan.subject}
              {r && !r.subject && ' (introuvable)'}
            </Chip>
          )}
          {plan.gender && <Chip onRemove={() => set({ gender: null })}>{plan.gender === 'female' ? 'femmes' : 'hommes'}</Chip>}
          {plan.nationalities.map((n) => (
            <Chip key={n} onRemove={() => set({ nationalities: plan.nationalities.filter((x) => x !== n) })}>
              nationalité : {n}
            </Chip>
          ))}
          {plan.places.map((n) => (
            <Chip key={n} onRemove={() => set({ places: plan.places.filter((x) => x !== n) })}>
              lieu : {n}
            </Chip>
          ))}
          {plan.from !== null && <Chip onRemove={() => set({ from: null })}>{plan.people ? (plan.gender === 'female' ? 'nées' : 'nés') : 'datant'} à partir de {plan.from}</Chip>}
          {plan.to !== null && <Chip onRemove={() => set({ to: null })}>{plan.people ? (plan.gender === 'female' ? 'nées' : 'nés') : 'datant'} avant {plan.to}</Chip>}
          <Chip onClick={() => set({ ranking: NEXT_RANKING[plan.ranking] })} title="Cliquer pour changer le classement">
            {RANKING_LABEL[plan.ranking]}
          </Chip>
          <label className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs">
            nombre
            <input
              type="number"
              min={1}
              max={1000}
              value={plan.limit ?? ''}
              placeholder="tous"
              onChange={(e) => set({ limit: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
              className="w-12 bg-transparent tabular-nums outline-none"
              aria-label="Nombre de cartes"
            />
          </label>
          {edited && (
            <button type="button" onClick={() => onRebuild(plan)} className="flex h-7 cursor-pointer items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground">
              <RotateCcw className="size-3" /> Relancer avec ces règles
            </button>
          )}
        </div>
      )}
      {plan.mode === 'names' ? (
        <Row
          title={`Vérifier les ${plan.names.length} noms proposés par l'IA`}
          detail={plan.names.slice(0, 6).join(', ')}
          onClick={() => onNames(plan)}
        />
      ) : entries?.status === 'loading' ? (
        <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
          <Spin text="Construction de la liste sur Wikidata (quelques secondes)…" />
        </p>
      ) : entries?.status === 'error' ? (
        <p className="py-1 text-sm text-muted-foreground">La liste n'a pas pu être construite. Retire une règle ou précise la demande.</p>
      ) : entries?.status === 'done' && entries.value.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">Ces règles ne donnent aucun article. Retire une règle ou reformule la demande.</p>
      ) : entries?.status === 'done' ? (
        <Row
          title={`${entries.value.length} articles, ${RANKING_LABEL[value.plan.ranking]}`}
          detail={entries.value
            .slice(0, 8)
            .map((e) => e.title)
            .join(', ')}
          onClick={() => onFree(entries.value, value.plan)}
        />
      ) : null}
    </div>
  );
}

function describe(c: Constraints) {
  return [c.place?.label, c.from && c.to ? (c.from === c.to ? `en ${c.from}` : `${c.from}–${c.to}`) : c.from ? `après ${c.from}` : c.to ? `avant ${c.to}` : null]
    .filter(Boolean)
    .join(' · ');
}

function EntityPicker({ onPick, opening }: { onPick: (e: WdEntity) => void; opening: string | null }) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<WdEntity[] | null>(null);
  return (
    <div className="px-3 py-2">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (text.trim()) setFound(await searchEntities(text.trim(), 6));
        }}
        className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm"
      >
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Partir d'un autre sujet Wikidata (ex. tsar, dessert, cathédrale)…"
          aria-label="Sujet Wikidata"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </form>
      {found && (
        <div className="mt-1">
          {found.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">Aucun élément trouvé.</p>}
          {found.map((e) => (
            <Row key={e.qid} title={e.label} detail={e.description ?? e.qid} busy={opening === `entity:${e.qid}`} onClick={() => onPick(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Une façon de construire l'album, telle qu'on la propose à l'étape 1. */
interface Proposal {
  key: string;
  source: keyof typeof SOURCES;
  title: string;
  detail: string;
  /** Nombre de cases ; null quand on ne le connaît pas encore. */
  count: number | null;
  owned: number | null;
  sample: string[];
  loading?: boolean;
  onPick: () => void;
}

/** Les sources en clair : d'où vient la liste et ce qu'on peut en attendre. */
const SOURCES = {
  list: { icon: ListOrdered, label: 'Liste Wikipédia', tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', why: 'liste toute faite, nombre et ordre exacts' },
  free: { icon: MessageSquareText, label: 'D’après ta phrase', tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-300', why: 'ta demande traduite en règles' },
  names: { icon: Sparkles, label: 'Proposée par l’IA', tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-300', why: 'noms à vérifier un par un' },
  criteria: { icon: Database, label: 'Wikidata', tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', why: 'tous les articles qui ont ce point commun' },
  broad: { icon: Database, label: 'Wikidata, large', tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', why: 'beaucoup de candidats, triés par pertinence' },
  search: { icon: Search, label: 'Recherche', tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-300', why: 'articles qui en parlent, à trier à la main' },
} as const;

const EXAMPLES: [string, string][] = [
  ['👑', 'les rois de France'],
  ['🏛️', 'les empereurs en Europe après 1600'],
  ['⛪', 'les papes'],
  ['🎮', 'les jeux Nintendo sortis sur GameCube'],
  ['🍊', "les recettes à l'orange confite"],
  ['🗼', 'les monuments de Paris'],
];

function ProposalCard({ p, best, busy }: { p: Proposal; best: boolean; busy: boolean }) {
  const meta = SOURCES[p.source];
  const Icon = meta.icon;
  const thumbOf = useThumbnails(p.sample);
  return (
    <button
      type="button"
      onClick={p.onPick}
      disabled={busy}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg disabled:cursor-progress',
        best && 'border-primary/50 ring-1 ring-primary/30',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', meta.tone)}>
          <Icon className="size-3" /> {meta.label}
        </span>
        {best && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Conseillée</span>}
        <span className="ml-auto text-muted-foreground">{busy || p.loading ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{p.title}</p>
        <p className="truncate text-xs text-muted-foreground">{p.detail || meta.why}</p>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex -space-x-2">
          {p.sample.slice(0, 5).map((t) => {
            const src = thumbOf(t);
            return (
              <span key={t} title={t} className="relative aspect-[5/7] w-8 overflow-hidden rounded-md bg-muted ring-2 ring-card">
                {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[10px] font-bold text-muted-foreground">{t.charAt(0)}</span>}
              </span>
            );
          })}
          {!p.sample.length && <span className="h-11" />}
        </div>
        <p className="ml-auto text-right text-xs text-muted-foreground tabular-nums">
          {p.count !== null ? (
            <>
              <b className="block font-heading text-xl leading-none font-bold text-foreground">{p.count}</b>
              cases{p.owned ? ` · ${p.owned} à toi` : ''}
            </>
          ) : (
            p.loading && 'lecture…'
          )}
        </p>
      </div>
    </button>
  );
}

function StepSubject({
  query,
  setQuery,
  asked,
  run,
  lists,
  listReads,
  ownedOf,
  criteria,
  search,
  broad,
  related,
  free,
  hasKey,
  onRebuild,
  onFree,
  onNames,
  opening,
  onList,
  onCriterion,
  onBroad,
  onEntity,
  onSearch,
  onOwnList,
}: {
  onOwnList: () => void;
  free: Async<FreeState> | null;
  hasKey: boolean;
  onRebuild: (plan: QueryPlan) => void;
  onFree: (entries: FreeEntry[], plan: QueryPlan) => void;
  onNames: (plan: QueryPlan) => void;
  query: string;
  setQuery: (q: string) => void;
  asked: string;
  run: (q: string) => void;
  lists: Async<ListPage[]> | null;
  listReads: Record<string, Async<ListSection[]>>;
  ownedOf: (entries: GoalEntry[]) => number;
  criteria: Async<Criterion[]> | null;
  search: Async<{ results: SearchResult[]; next: number | null }> | null;
  broad: Async<{ subject: WdEntity; constraints: Constraints; candidates: Candidate[] } | null> | null;
  related: Async<Awaited<ReturnType<typeof relatedCriteria>>> | null;
  opening: string | null;
  onList: (p: ListPage) => void;
  onCriterion: (c: Criterion) => void;
  onBroad: () => void;
  onEntity: (e: WdEntity) => void;
  onSearch: () => void;
}) {
  const [refine, setRefine] = useState(false);
  const [other, setOther] = useState(false);
  useEffect(() => (setRefine(false), setOther(false)), [asked]);
  const freeValue = free?.status === 'done' ? free.value : null;
  const relatedValues = related?.status === 'done' ? related.value : [];
  const pending = [lists, free, criteria, search, broad].filter((x) => x?.status === 'loading').length;

  // Propositions, de la plus sûre à la plus large ; les sources vides ne sont pas montrées.
  const proposals: Proposal[] = [];
  for (const p of lists?.status === 'done' ? lists.value : []) {
    const read = listReads[p.title];
    const all = read?.status === 'done' ? read.value.filter((x) => x.suggested).flatMap((x) => x.entries) : [];
    if (read?.status === 'done' && !all.length) continue;
    proposals.push({
      key: `list:${p.title}`,
      source: 'list',
      title: p.title,
      detail: read?.status === 'done' ? `${read.value.filter((x) => x.suggested).length} partie(s) · ${SOURCES.list.why}` : (p.description ?? ''),
      count: read?.status === 'done' ? all.length : null,
      owned: read?.status === 'done' ? ownedOf(all) : null,
      sample: all.slice(0, 5).map((e) => e.title),
      loading: read?.status === 'loading',
      onPick: () => onList(p),
    });
  }
  if (freeValue?.plan.mode === 'names' && freeValue.plan.names.length)
    proposals.push({ key: 'names', source: 'names', title: freeValue.plan.summary || asked, detail: '', count: freeValue.plan.names.length, owned: null, sample: [], onPick: () => onNames(freeValue.plan) });
  const freeEntries = freeValue?.entries?.status === 'done' ? freeValue.entries.value : null;
  if (freeEntries?.length)
    proposals.push({
      key: 'free',
      source: 'free',
      title: freeValue!.plan.summary || capitalize(cleanQuery(asked)),
      detail: `${RANKING_LABEL[freeValue!.plan.ranking]} · ${freeValue!.plan.source === 'gemini' ? 'comprise par Gemini' : 'analyse sans IA'}`,
      count: freeEntries.filter((e) => e.status !== 'missing').length,
      owned: ownedOf(freeEntries),
      sample: freeEntries.slice(0, 5).map((e) => e.title),
      onPick: () => onFree(freeEntries, freeValue!.plan),
    });
  for (const c of (criteria?.status === 'done' ? criteria.value : []).slice(0, 3))
    proposals.push({
      key: `crit:${c.prop}:${c.qid}`,
      source: 'criteria',
      title: `${capitalize(c.propLabel)} : ${c.label}`,
      detail: c.description ?? '',
      count: c.count,
      owned: null,
      sample: [],
      onPick: () => onCriterion(c),
    });
  const broadValue = broad?.status === 'done' ? broad.value : null;
  if (broadValue)
    proposals.push({
      key: 'broad',
      source: 'broad',
      title: `Tout « ${broadValue.subject.label} »${describe(broadValue.constraints) ? ` · ${describe(broadValue.constraints)}` : ''}`,
      detail: '',
      count: broadValue.candidates.length,
      owned: ownedOf(broadValue.candidates),
      sample: broadValue.candidates.slice(0, 5).map((c) => c.title),
      onPick: onBroad,
    });
  const results = search?.status === 'done' ? search.value.results : [];
  if (results.length)
    proposals.push({
      key: 'search',
      source: 'search',
      title: `Articles sur « ${cleanQuery(asked)} »`,
      detail: '',
      count: results.length,
      owned: ownedOf(results),
      sample: results.slice(0, 5).map((r) => r.title),
      onPick: onSearch,
    });

  return (
    <div className="space-y-6">
      <div className={cn('space-y-4 text-center', asked ? 'pt-0' : 'pt-6')}>
        {!asked && (
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Target className="size-6" />
          </span>
        )}
        <div>
          <h2 className="font-heading text-2xl font-bold">Quel album veux-tu compléter ?</h2>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">Décris-le comme tu le dirais à quelqu’un : un thème, une époque, un lieu. On cherche les listes et les articles sur Wikipédia et Wikidata.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
          className="mx-auto flex h-14 max-w-2xl items-center gap-3 rounded-2xl border-2 bg-background pr-2 pl-4 shadow-sm transition focus-within:border-primary"
        >
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ex. les empereurs en Europe après 1600"
            aria-label="Sujet de l'album"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          <button type="submit" disabled={!query.trim()} className="h-10 cursor-pointer rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40">
            Chercher
          </button>
        </form>
        <button
          type="button"
          onClick={onOwnList}
          className="mx-auto flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/10"
        >
          <ClipboardList className="size-4" /> J’ai déjà ma liste : l’écrire, la coller ou importer un CSV
          <ChevronRight className="size-4" />
        </button>
        {!asked && (
          <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2 pt-1">
            {EXAMPLES.map(([emoji, t]) => (
              <button key={t} type="button" onClick={() => run(t)} className="flex cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm transition hover:border-primary/50 hover:bg-muted">
                <span aria-hidden="true">{emoji}</span> {t}
              </button>
            ))}
          </div>
        )}
        {!asked && !hasKey && (
          <p className="text-xs text-muted-foreground">Astuce : pour les demandes complexes (« le top 50 des… »), ajoute une clé Gemini gratuite dans Paramètres › Rangement.</p>
        )}
      </div>

      {asked && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <h3 className="font-semibold">Propositions</h3>
            {pending > 0 ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> encore {pending} source{pending > 1 ? 's' : ''} à interroger…
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{proposals.length} trouvée{proposals.length > 1 ? 's' : ''}</span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {proposals.map((p, i) => (
              <ProposalCard key={p.key} p={p} best={i === 0 && pending === 0} busy={opening === p.key} />
            ))}
            {pending > 0 &&
              Array.from({ length: Math.max(0, 2 - proposals.length) }, (_, i) => <div key={i} className="h-[150px] animate-pulse rounded-2xl border bg-muted/40" />)}
          </div>
          {!pending && !proposals.length && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Rien de solide pour cette demande. Reformule-la, ou essaie un sujet plus large.</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            {freeValue?.plan.mode === 'rules' && (
              <button type="button" onClick={() => setRefine((v) => !v)} aria-expanded={refine} className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
                <MessageSquareText className="size-3.5" /> Affiner les règles de ta phrase
                <ChevronDown className={cn('size-3.5 transition-transform', refine && 'rotate-180')} />
              </button>
            )}
            <button type="button" onClick={() => setOther((v) => !v)} aria-expanded={other} className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
              <Database className="size-3.5" /> Partir d’un autre sujet
              <ChevronDown className={cn('size-3.5 transition-transform', other && 'rotate-180')} />
            </button>
          </div>
          {refine && (
            <div className="rounded-2xl border">
              <FreeBlock free={free} hasKey={hasKey} onRebuild={onRebuild} onFree={onFree} onNames={onNames} />
            </div>
          )}
          {other && (
            <div className="space-y-1 rounded-2xl border p-1">
              {relatedValues.length > 0 && (
                <>
                  <p className="px-3 pt-2 text-xs text-muted-foreground">Sujets communs aux articles trouvés :</p>
                  {relatedValues.map((r) => (
                    <Row
                      key={`${r.prop}:${r.qid}`}
                      title={r.label}
                      detail={`partagé par ${r.shared} des articles trouvés`}
                      busy={opening === `entity:${r.qid}`}
                      onClick={() => onEntity({ qid: r.qid, label: r.label, description: null })}
                    />
                  ))}
                </>
              )}
              <EntityPicker onPick={onEntity} opening={opening} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Étape 2 : cartes ---------- */

function Thumb({ src, owned }: { src: string | null; owned: boolean }) {
  return (
    <span className={cn('relative aspect-[5/7] w-9 shrink-0 overflow-hidden rounded-md bg-muted', owned && 'ring-2 ring-emerald-500')}>
      {src && <img src={src} alt="" loading="lazy" className="size-full object-cover" />}
    </span>
  );
}

function PickCard({
  entry,
  on,
  owned,
  thumb,
  score,
  reasons,
  note,
  rank,
  onToggle,
}: {
  rank?: number;
  entry: GoalEntry;
  on: boolean;
  owned: boolean;
  thumb: string | null;
  score?: number;
  reasons?: string[];
  note?: string;
  onToggle: () => void;
}) {
  return (
    <WikiPeek title={entry.title} className="block">
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={cn('flex w-full cursor-pointer items-start gap-2.5 rounded-xl border p-2 text-left transition', on ? 'border-primary/50 bg-primary/5' : 'opacity-55 hover:opacity-90')}
      >
        <Thumb src={thumb} owned={owned} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-tight font-medium">
            {rank !== undefined && <span className="mr-1.5 text-xs font-normal text-muted-foreground tabular-nums">{rank}.</span>}
            {entry.title}
          </span>
          {entry.description && <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{entry.description}</span>}
          {reasons && reasons.length > 1 && <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{reasons.slice(1).join(' · ')}</span>}
          {note && <span className="mt-0.5 block text-[11px] text-muted-foreground">{note}</span>}
          {score !== undefined && (
            <span className="mt-1 flex items-center gap-1.5">
              <span className="h-1 w-14 overflow-hidden rounded-full bg-muted">
                <span className={cn('block h-full rounded-full', score >= 0.6 ? 'bg-emerald-500' : score >= 0.3 ? 'bg-amber-500' : 'bg-muted-foreground/40')} style={{ width: `${score * 100}%` }} />
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{pct(score)}</span>
            </span>
          )}
        </span>
        <span className={cn('grid size-4.5 shrink-0 place-items-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50')}>
          {on && <Check className="size-3" strokeWidth={3} />}
        </span>
      </button>
    </WikiPeek>
  );
}

function ConstraintToggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={on ? 'Ne plus tenir compte de cette contrainte' : 'Tenir compte de cette contrainte'}
      className={cn('flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs', on ? 'border-primary/50 bg-primary/5 font-medium' : 'text-muted-foreground line-through')}
    >
      {label}
      {on && <X className="size-3 opacity-60" />}
    </button>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <i className="block size-2.5 rounded-sm bg-emerald-500" /> déjà à toi, sera collée à la création
      </span>
      <span className="flex items-center gap-1.5">
        <i className="block size-2.5 rounded-sm bg-muted-foreground/30" /> à trouver
      </span>
    </p>
  );
}

function StepCards({ draft, setDraft, ownedTitles }: { draft: Draft; setDraft: (d: Draft) => void; ownedTitles: Set<string> }) {
  const [loadingMore, setLoadingMore] = useState(false);
  const [adding, setAdding] = useState('');
  const [limit, setLimit] = useState(SHOWN);
  const scored = useMemo(() => (draft.kind === 'scored' ? scoredOf(draft) : []), [draft]);
  const visibleTitles = useMemo(
    () =>
      draft.kind === 'list' || draft.kind === 'search' || draft.kind === 'names'
        ? []
        : draft.kind === 'scored'
          ? scored.slice(0, limit).map((c) => c.title)
          : draft.kind === 'free'
            ? draft.entries.slice(0, limit).map((e) => e.title)
            : draft.items.slice(0, limit).map((e) => e.title),
    [draft, scored, limit],
  );
  const thumbOf = useThumbnails(visibleTitles);
  const [locking, setLocking] = useState(false);

  if (draft.kind === 'names') {
    const lock = async () => {
      setLocking(true);
      try {
        const entries = await resolveNames(draft.names);
        setDraft({ kind: 'free', label: draft.label, entries, picked: new Set(entries.filter((e) => e.status !== 'missing').map((e) => e.title)) });
      } finally {
        setLocking(false);
      }
    };
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading text-xl font-bold">Vérifie la liste avant de la verrouiller</h2>
          <p className="text-sm text-muted-foreground">
            {draft.label}. Noms proposés par l'IA : retire ceux qui n'ont rien à faire là, ajoute ceux qui manquent. Une fois la liste verrouillée, chaque nom est cherché sur Wikipédia.
          </p>
        </div>
        <ol className="divide-y rounded-xl border">
          {draft.names.map((n, i) => (
            <li key={`${n}-${i}`} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <WikiPeek title={n} className="min-w-0 flex-1 truncate">
                {n}
              </WikiPeek>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, names: draft.names.filter((_, j) => j !== i) })}
                aria-label={`Retirer ${n}`}
                className="grid size-6 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = adding.trim();
            if (!n) return;
            setDraft({ ...draft, names: [...draft.names, n] });
            setAdding('');
          }}
          className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm"
        >
          <Plus className="size-3.5 text-muted-foreground" />
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Ajouter un nom…" aria-label="Ajouter un nom" className="min-w-0 flex-1 bg-transparent outline-none" />
        </form>
        <button
          type="button"
          onClick={lock}
          disabled={locking || !draft.names.length}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {locking && <Loader2 className="size-4 animate-spin" />} Verrouiller la liste et chercher les articles
        </button>
      </div>
    );
  }

  if (draft.kind === 'free') {
    const toggle = (title: string) => {
      const picked = new Set(draft.picked);
      if (picked.has(title)) picked.delete(title);
      else picked.add(title);
      setDraft({ ...draft, picked });
    };
    /** Nom ambigu : remplace l'article trouvé par une autre proposition. */
    const replace = (entry: FreeEntry, alt: GoalEntry) =>
      setDraft({
        ...draft,
        entries: draft.entries.map((e) => (e === entry ? { ...e, ...alt, rank: e.rank, confidence: 0.8, status: 'ok' as const, alternatives: undefined } : e)),
        picked: new Set([...[...draft.picked].filter((t) => t !== entry.title), alt.title]),
      });
    const guesses = draft.entries.filter((e) => e.status === 'guess').length;
    const missing = draft.entries.filter((e) => e.status === 'missing').length;
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading text-xl font-bold">Quelles cartes comptent ?</h2>
          <p className="text-sm text-muted-foreground">
            {draft.label}. {draft.entries.length} articles dans l'ordre du classement
            {guesses ? `, dont ${guesses} trouvés par recherche (à vérifier)` : ''}
            {missing ? `, ${missing} introuvables` : ''}. Survole une carte pour voir l'article.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
          {draft.entries.slice(0, limit).map((e) =>
            e.status === 'missing' ? (
              <div key={`missing-${e.rank}`} className="flex items-center gap-2.5 rounded-xl border border-dashed p-2 text-sm text-muted-foreground">
                <span className="w-6 text-right text-xs tabular-nums">{e.rank}</span>
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <span className="text-xs">introuvable</span>
              </div>
            ) : (
              <div key={e.title} className="space-y-1">
                <PickCard
                  entry={{ ...e, title: e.title }}
                  rank={e.rank}
                  on={draft.picked.has(e.title)}
                  owned={ownedTitles.has(e.title)}
                  thumb={e.thumbnail !== undefined ? (e.thumbnail ?? null) : thumbOf(e.title)}
                  score={e.status === 'guess' ? e.confidence : undefined}
                  note={[e.year ? `${e.year}` : null, e.status === 'guess' ? 'trouvé par recherche' : null].filter(Boolean).join(' · ') || undefined}
                  onToggle={() => toggle(e.title)}
                />
                {e.alternatives && e.alternatives.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1 px-1 text-[11px] text-muted-foreground">
                    Plutôt :
                    {e.alternatives.map((a) => (
                      <button key={a.title} type="button" onClick={() => replace(e, a)} className="cursor-pointer rounded border px-1.5 hover:bg-muted hover:text-foreground">
                        {a.title}
                      </button>
                    ))}
                  </p>
                )}
              </div>
            ),
          )}
        </div>
        {draft.entries.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + SHOWN)} className="h-9 w-full cursor-pointer rounded-lg border text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            Afficher {Math.min(SHOWN, draft.entries.length - limit)} de plus
          </button>
        )}
        <Legend />
      </div>
    );
  }

  if (draft.kind === 'list') {
    const toggleSection = (si: number) => setDraft({ ...draft, sections: draft.sections.map((x, i) => (i === si ? { ...x, on: !x.on } : x)) });
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading text-xl font-bold">Quelles parties comptent ?</h2>
          <p className="text-sm text-muted-foreground">{draft.label}. Coche les parties à garder ; une case écarte une carte seule. Survole une case pour voir l'article.</p>
        </div>
        <div className="divide-y rounded-xl border">
          {draft.sections.map((s, si) => {
            const have = s.entries.filter((e) => ownedTitles.has(e.title)).length;
            return (
              <div key={`${s.name}-${si}`} className={cn('grid grid-cols-[18px_minmax(110px,170px)_1fr_auto] items-center gap-3 px-3 py-2.5', !s.on && 'opacity-50')}>
                <button
                  type="button"
                  onClick={() => toggleSection(si)}
                  aria-pressed={s.on}
                  aria-label={`${s.on ? 'Retirer' : 'Garder'} « ${s.name} »`}
                  className={cn('grid size-4.5 cursor-pointer place-items-center rounded border', s.on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/60')}
                >
                  {s.on && <Check className="size-3" strokeWidth={3} />}
                </button>
                <button type="button" onClick={() => toggleSection(si)} className="min-w-0 cursor-pointer truncate text-left text-sm font-medium">
                  {s.name}
                </button>
                <span className="flex flex-wrap gap-[3px]">
                  {s.entries.map((e) => {
                    const off = draft.off.has(e.title);
                    return (
                      <WikiPeek key={e.title} title={e.title}>
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(draft.off);
                            if (off) next.delete(e.title);
                            else next.add(e.title);
                            setDraft({ ...draft, off: next });
                          }}
                          aria-label={`${off ? 'Remettre' : 'Écarter'} ${e.title}`}
                          className={cn('block h-[15px] w-[11px] cursor-pointer rounded-[3px]', ownedTitles.has(e.title) ? 'bg-emerald-500' : 'bg-muted-foreground/30', off && 'opacity-20')}
                        />
                      </WikiPeek>
                    );
                  })}
                </span>
                <span className="text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {s.entries.length} · {have} à toi
                </span>
              </div>
            );
          })}
        </div>
        <Legend />
      </div>
    );
  }

  if (draft.kind === 'scored') {
    const above = scored.filter((c) => c.score >= draft.threshold).length;
    const c = draft.constraints;
    const toggle = (title: string) => {
      const picked = new Set(draft.picked);
      if (picked.has(title)) picked.delete(title);
      else picked.add(title);
      setDraft({ ...draft, picked });
    };
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading text-xl font-bold">Quelles cartes comptent ?</h2>
          <p className="text-sm text-muted-foreground">
            {scored.length} articles rattachés à « {draft.subject.label} » sur Wikidata, notés de 0 à 1. Une date ou un lieu inconnu baisse la note sans l'annuler. Survole une carte pour voir
            l'article.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(c.from !== null || c.to !== null) && (
            <ConstraintToggle on={draft.use.dates} label={describe({ ...c, place: null })} onClick={() => setDraft(repick({ ...draft, use: { ...draft.use, dates: !draft.use.dates } }))} />
          )}
          {c.place && <ConstraintToggle on={draft.use.place} label={c.place.label} onClick={() => setDraft(repick({ ...draft, use: { ...draft.use, place: !draft.use.place } }))} />}
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Cocher à partir de
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.threshold}
              onChange={(e) => setDraft(repick({ ...draft, threshold: Number(e.target.value) }))}
              className="w-28 accent-[var(--primary)]"
              aria-label="Note minimale"
            />
            <span className="w-8 font-semibold text-foreground tabular-nums">{pct(draft.threshold)}</span>
            <span className="tabular-nums">({above})</span>
          </label>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
          {scored.slice(0, limit).map((s) => (
            <PickCard key={s.title} entry={s} on={draft.picked.has(s.title)} owned={ownedTitles.has(s.title)} thumb={thumbOf(s.title)} score={s.score} reasons={s.reasons} onToggle={() => toggle(s.title)} />
          ))}
        </div>
        {scored.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + SHOWN)} className="h-9 w-full cursor-pointer rounded-lg border text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            Afficher {Math.min(SHOWN, scored.length - limit)} de plus ({scored.length - limit} restants)
          </button>
        )}
        <Legend />
      </div>
    );
  }

  const toggle = (title: string) => {
    const picked = new Set(draft.picked);
    if (picked.has(title)) picked.delete(title);
    else picked.add(title);
    setDraft({ ...draft, picked });
  };
  const more = async () => {
    if (draft.kind !== 'search' || draft.next == null || !draft.query) return;
    setLoadingMore(true);
    try {
      const { results, next } = await searchArticles(draft.query, draft.next);
      const known = new Set(draft.items.map((e) => e.title));
      const fresh = results.filter((r) => !known.has(r.title));
      setDraft({ ...draft, items: [...draft.items, ...fresh], picked: new Set([...draft.picked, ...fresh.filter((r) => r.relevant).map((r) => r.title)]), next });
    } finally {
      setLoadingMore(false);
    }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = adding.trim();
    if (!q) return;
    const { results } = await searchArticles(q);
    const hit = results[0];
    if (!hit) return toast(`Aucun article « ${q} »`, 'error');
    setAdding('');
    if (draft.items.some((i) => i.title === hit.title)) return toggle(hit.title);
    setDraft({ ...draft, items: [...draft.items, { ...hit, relevant: true }], picked: new Set([...draft.picked, hit.title]) });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-bold">Quelles cartes comptent ?</h2>
        <p className="text-sm text-muted-foreground">
          {draft.label}. {draft.kind === 'search' ? 'Les articles qui ne reprennent aucun mot de la recherche sont décochés.' : 'Clique une carte pour la retirer.'} Survole une carte pour voir l'article.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={add} className="flex h-8 min-w-56 flex-1 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm">
          <Plus className="size-3.5 text-muted-foreground" />
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Ajouter un article à la main…" aria-label="Ajouter un article" className="min-w-0 flex-1 bg-transparent outline-none" />
        </form>
        <button type="button" onClick={() => setDraft({ ...draft, picked: new Set(draft.items.map((i) => i.title)) })} className="h-8 cursor-pointer rounded-lg border px-3 text-xs font-medium hover:bg-muted">
          Tout cocher
        </button>
        <button type="button" onClick={() => setDraft({ ...draft, picked: new Set() })} className="h-8 cursor-pointer rounded-lg border px-3 text-xs font-medium hover:bg-muted">
          Tout décocher
        </button>
        {draft.kind === 'search' && draft.next != null && (
          <button type="button" onClick={more} disabled={loadingMore} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-muted">
            {loadingMore && <Loader2 className="size-3.5 animate-spin" />}20 résultats de plus
          </button>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
        {draft.items.slice(0, limit).map((e) => (
          <PickCard
            key={e.title}
            entry={e}
            on={draft.picked.has(e.title)}
            owned={ownedTitles.has(e.title)}
            thumb={e.thumbnail !== undefined ? (e.thumbnail ?? null) : thumbOf(e.title)}
            note={e.relevant === false ? 'Ne reprend aucun mot de la recherche' : undefined}
            onToggle={() => toggle(e.title)}
          />
        ))}
      </div>
      {draft.items.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + SHOWN)} className="h-9 w-full cursor-pointer rounded-lg border text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          Afficher {Math.min(SHOWN, draft.items.length - limit)} de plus
        </button>
      )}
      <Legend />
    </div>
  );
}

/* ---------- Étape 3 : aperçu ---------- */

function StepPreview({
  name,
  setName,
  color,
  setColor,
  annex,
  setAnnex,
  entries,
  owned,
  sort,
  setSort,
  catalog,
  wikidata,
  albumStyle,
  setAlbumStyle,
  onDrop,
}: {
  name: string;
  setName: (n: string) => void;
  color: string;
  setColor: (c: string) => void;
  annex: boolean;
  setAnnex: (a: boolean) => void;
  /** Cases dans l'ordre choisi. */
  entries: GoalEntry[];
  owned: Map<number, OwnedCard>;
  sort: GoalSort;
  setSort: (s: GoalSort) => void;
  catalog: Async<Map<string, CatalogInfo>> | null;
  wikidata: Async<Map<string, WikidataInfo>> | null;
  albumStyle: AlbumStyleId;
  setAlbumStyle: (s: AlbumStyleId) => void;
  onDrop: (titles: string[]) => void;
}) {
  const look = ALBUM_STYLES[albumStyle];
  const gradient = `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 55%, black))`;
  const custom = !TAG_COLORS.some((c) => c.toLowerCase() === color.toLowerCase());
  const pages = Math.ceil(entries.length / PER_PAGE);
  const ambiguous = entries.filter((e) => e.disambiguation);
  const cat = catalog?.status === 'done' ? catalog.value : null;
  const rarityOf = (e: GoalEntry, i: number): Rarity | null => owned.get(i)?.rarity ?? cat?.get(titleKey(e.title))?.rarity ?? null;
  const absent = cat ? entries.filter((e, i) => !owned.has(i) && !cat.has(titleKey(e.title)) && !e.disambiguation) : [];
  const [showAbsent, setShowAbsent] = useState(false);
  const counts = useMemo(() => {
    const by = new Map<Rarity, { all: number; mine: number }>();
    entries.forEach((e, i) => {
      const r = rarityOf(e, i);
      if (!r) return;
      const c = by.get(r) ?? { all: 0, mine: 0 };
      c.all++;
      if (owned.has(i)) c.mine++;
      by.set(r, c);
    });
    return RARITY_ORDER.filter((r) => by.has(r)).map((r) => ({ r, ...by.get(r)! }));
  }, [entries, owned, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadingFor = (needs?: 'catalog' | 'wikidata') => (needs === 'catalog' ? catalog?.status === 'loading' : needs === 'wikidata' ? wikidata?.status === 'loading' : false);
  const failedFor = (needs?: 'catalog' | 'wikidata') => (needs === 'catalog' ? catalog?.status === 'error' : needs === 'wikidata' ? wikidata?.status === 'error' : false);
  // Début de chaque partie, pour l'écrire au-dessus de la page où elle commence.
  const sectionsByPage = useMemo(() => {
    const m = new Map<number, string[]>();
    entries.forEach((e, i) => {
      if (e.section && (i === 0 || entries[i - 1]!.section !== e.section)) {
        const p = Math.floor(i / PER_PAGE);
        m.set(p, [...(m.get(p) ?? []), e.section]);
      }
    });
    return m;
  }, [entries]);

  return (
    <div className="grid gap-8 md:grid-cols-[230px_1fr]">
      <div className="mx-auto w-full max-w-[300px] space-y-4">
        {/* Couverture au rendu du style choisi (--u : unité de mesure des styles d'album). */}
        <div
          className="relative mx-auto flex aspect-[3/4] w-full max-w-[230px] flex-col items-center justify-center gap-2 overflow-hidden rounded-[6px_16px_16px_6px] p-5 text-center text-white shadow-xl"
          style={{ ['--u' as string]: '2.4px', ...look.cover(gradient) }}
        >
          <span className="absolute inset-y-0 left-0 w-3 bg-black/25" />
          <span className="text-[10px] font-semibold tracking-[0.25em] uppercase opacity-75">◇ Album à compléter</span>
          <textarea
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\n/g, ' '))}
            rows={2}
            aria-label="Nom de l'album"
            title="Clique pour renommer"
            className={cn(
              'w-full resize-none overflow-hidden rounded-md bg-transparent px-1 text-center text-lg leading-tight outline-none [field-sizing:content] hover:bg-black/15 focus:bg-black/20',
              look.coverTitle,
            )}
          />
          <span className="text-sm tabular-nums opacity-90">
            {owned.size} / {entries.length}
          </span>
          {/* Répartition des raretés, en bas de la couverture. */}
          {counts.length > 0 && (
            <span className="absolute inset-x-5 bottom-5 flex h-1.5 overflow-hidden rounded-full bg-black/25">
              {counts.map(({ r, all }) => (
                <span key={r} style={{ width: `${(all / entries.length) * 100}%`, backgroundColor: RARITY_VAR[r] }} />
              ))}
            </span>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Couleur</p>
          <div className="grid grid-cols-10 justify-items-center gap-1.5" role="group" aria-label="Couleur">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Couleur ${c}`}
                aria-pressed={c === color}
                className={cn('size-5 cursor-pointer rounded-full ring-offset-2 ring-offset-popover transition hover:scale-110', c === color && 'ring-2 ring-foreground')}
                style={{ backgroundColor: c }}
              />
            ))}
            {/* Couleur libre : la pastille arc-en-ciel ouvre le sélecteur du système. */}
            <label
              title="Choisir ma couleur"
              className={cn(
                'relative size-5 cursor-pointer overflow-hidden rounded-full ring-offset-2 ring-offset-popover transition hover:scale-110',
                custom && 'ring-2 ring-foreground',
              )}
              style={{ background: custom ? color : 'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)' }}
            >
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Couleur personnalisée" className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Style de l’album</p>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Style de l'album">
            {ALBUM_STYLE_IDS.map((id) => {
              const Icon = ALBUM_STYLE_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={id === albumStyle}
                  onClick={() => setAlbumStyle(id)}
                  className={cn(
                    'flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition',
                    id === albumStyle ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" /> {ALBUM_STYLES[id].name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-5">
        <div>
          <h2 className="font-heading text-xl font-bold">Aperçu</h2>
          <p className="text-sm text-muted-foreground">
            {pages} page{pages > 1 ? 's' : ''} de {PER_PAGE} cases. Survole une case pour voir la carte.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Ranger par</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ordre des cases">
            {GOAL_SORTS.map(({ id, label, hint, needs }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={sort === id}
                title={failedFor(needs) ? 'Données indisponibles pour le moment' : hint}
                disabled={failedFor(needs)}
                onClick={() => setSort(id)}
                className={cn(
                  'flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                  sort === id ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/50 hover:bg-muted',
                )}
              >
                {sort === id && loadingFor(needs) && <Loader2 className="size-3 animate-spin" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {counts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {counts.map(({ r, all, mine }) => (
              <span key={r} className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: RARITY_VAR[r] }} />
                <b className="font-semibold">{r}</b> {mine > 0 ? `${mine} / ${all}` : all}
              </span>
            ))}
            {absent.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums">
                <span className="size-2.5 rounded-full bg-[repeating-linear-gradient(45deg,var(--muted-foreground)_0_2px,transparent_2px_4px)]" /> hors jeu {absent.length}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
          {Array.from({ length: pages }, (_, p) => (
            <div key={p} className="flex min-w-0 flex-col gap-1">
              <span className="h-3.5 truncate text-[10px] font-semibold text-muted-foreground" title={sectionsByPage.get(p)?.join(' · ')}>
                {sectionsByPage.get(p)?.join(' · ')}
              </span>
              <div className="grid grid-cols-3 gap-[3px] rounded-md border bg-muted/40 p-1.5">
                {Array.from({ length: PER_PAGE }, (_, i) => {
                  const n = p * PER_PAGE + i;
                  const e = entries[n];
                  if (!e) return <i key={i} className="block aspect-[5/7]" />;
                  const r = rarityOf(e, n);
                  const mine = owned.has(n);
                  const out = cat && !mine && !cat.has(titleKey(e.title));
                  return (
                    <i
                      key={i}
                      title={`${n + 1}. ${e.title}${r ? ` · ${RARITY_LABEL[r]}` : ''}${mine ? ' · à toi' : out ? ' · pas de carte dans le jeu' : ''}`}
                      className={cn(
                        'block aspect-[5/7] rounded-[2px]',
                        e.disambiguation
                          ? 'bg-rose-500'
                          : out
                            ? 'bg-[repeating-linear-gradient(45deg,color-mix(in_oklab,var(--muted-foreground)_45%,transparent)_0_2px,transparent_2px_4px)]'
                            : !r && !mine && 'bg-muted-foreground/25',
                        mine && 'ring-1 ring-foreground/70',
                        mine && !r && 'bg-emerald-500',
                      )}
                      style={r && !e.disambiguation ? { backgroundColor: RARITY_VAR[r], opacity: mine ? 1 : 0.45 } : undefined}
                    />
                  );
                })}
              </div>
              <span className="text-center text-[10px] text-muted-foreground tabular-nums">{p + 1}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Couleur = rareté de la carte dans WikiMasters · plein et cerclé : déjà à toi · pâle : à trouver
          {catalog?.status === 'loading' && ' · lecture du catalogue…'}
        </p>

        {absent.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1">
                <b>{absent.length}</b> case{absent.length > 1 ? 's n’ont' : ' n’a'} pas de carte dans WikiMasters
                <span className="block text-xs text-muted-foreground">Elles resteraient vides, sauf si le jeu les ajoute un jour.</span>
              </p>
              <button type="button" onClick={() => setShowAbsent((v) => !v)} className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                {showAbsent ? 'Masquer' : 'Voir'}
              </button>
              <button type="button" onClick={() => onDrop(absent.map((e) => e.title))} className="cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted">
                Retirer ces cases
              </button>
            </div>
            {showAbsent && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{absent.map((e) => e.title).join(' · ')}</p>}
          </div>
        )}

        {ambiguous.length > 0 && (
          <div className="divide-y rounded-xl border">
            {ambiguous.map((e) => (
              <div key={e.title} className="flex items-center gap-3 px-3 py-2 text-sm">
                <p className="min-w-0 flex-1">
                  « {e.title} » est une page d'homonymie
                  <span className="block text-xs text-muted-foreground">Aucune carte n'y correspondra.</span>
                </p>
                <button type="button" onClick={() => onDrop([e.title])} className="cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted">
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-3 py-2.5 text-sm">
          <span>
            Ranger les autres cartes de l'étiquette à la fin
            <span className="block text-xs text-muted-foreground">Sur des pages en plus, sans compter dans l'objectif.</span>
          </span>
          <Switch checked={annex} onCheckedChange={setAnnex} aria-label="Pages en plus pour les autres cartes" />
        </label>
      </div>
    </div>
  );
}

/* ---------- Étape 1.5 : ma propre liste ---------- */

const MATCH_LOOK: Record<MatchStatus, { label: string; dot: string; text: string }> = {
  exact: { label: 'Exact', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-300' },
  likely: { label: 'Probable', dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-300' },
  check: { label: 'À vérifier', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-300' },
  none: { label: 'Introuvable', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-300' },
};

const SAMPLE = `# Mérovingiens
- Clovis Ier
- Dagobert Ier
# Carolingiens
- Pépin le Bref
- Charlemagne`;

/** Une ligne du rapprochement : texte saisi → article choisi, confiance, autres pages possibles. */
function MatchRow({ m, n, onChange }: { m: LineMatch; n: number; onChange: (m: LineMatch) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.text);
  const [busy, setBusy] = useState(false);
  const look = MATCH_LOOK[m.status];
  const chosen = m.candidates.find((c) => c.title === m.choice);
  const rematch = async (value: string) => {
    setBusy(true);
    try {
      const [again] = await matchLines([{ text: value, section: m.section }]);
      onChange(again!);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };
  const more = async () => {
    setBusy(true);
    try {
      const found = (await searchCandidates(m.text)).map((c) => ({ ...c, section: m.section }));
      const seen = new Set(m.candidates.map((c) => c.title));
      onChange({ ...m, searched: true, candidates: [...m.candidates, ...found.filter((c) => !seen.has(c.title))] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn('grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.3fr)_6.5rem] items-center gap-3 px-3 py-2 text-sm', !m.choice && 'opacity-60')}>
      <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void rematch(text.trim());
          }}
          className="flex items-center gap-1"
        >
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:border-primary" aria-label="Élément" />
          <button type="submit" className="h-8 cursor-pointer rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground">OK</button>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} title="Corriger le texte et chercher à nouveau" className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left hover:text-primary">
          <span className="truncate">{m.text}</span>
          <Pencil className="size-3 shrink-0 opacity-40" />
        </button>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative aspect-[5/7] w-7 shrink-0 overflow-hidden rounded bg-muted">
          {chosen?.thumbnail && <img src={chosen.thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
        </span>
        <select
          value={m.choice ?? ''}
          disabled={busy}
          onChange={(e) => {
            if (e.target.value === '__more') void more();
            else onChange({ ...m, choice: e.target.value || null });
          }}
          aria-label={`Article Wikipédia pour « ${m.text} »`}
          className="h-8 min-w-0 flex-1 cursor-pointer rounded-md border bg-background px-2 text-sm outline-none focus:border-primary"
        >
          {m.candidates.map((c) => (
            <option key={c.title} value={c.title}>
              {c.title}
              {c.description ? ` — ${c.description}` : ''}
            </option>
          ))}
          <option value="">— Ignorer cet élément —</option>
          {!m.searched && <option value="__more">Chercher d’autres pages…</option>}
        </select>
      </div>
      <span className={cn('flex items-center gap-1.5 text-xs font-medium', look.text)}>
        {busy ? <Loader2 className="size-3 animate-spin" /> : <span className={cn('size-2 rounded-full', look.dot)} />}
        {m.choice ? look.label : 'Ignoré'}
      </span>
    </div>
  );
}

function StepImport({
  text,
  setText,
  csvFile,
  setCsvFile,
  column,
  setColumn,
  matches,
  setMatches,
  onContinue,
}: {
  text: string;
  setText: (t: string) => void;
  csvFile: boolean;
  setCsvFile: (b: boolean) => void;
  column: number | undefined;
  setColumn: (c: number | undefined) => void;
  matches: LineMatch[] | null;
  setMatches: (m: LineMatch[] | null) => void;
  onContinue: (matches: LineMatch[]) => void;
}) {
  const parsed = useMemo(() => parseList(text, { csvFile, column }), [text, csvFile, column]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState<MatchStatus | 'all'>('all');
  const sections = new Set(parsed.lines.map((l) => l.section).filter(Boolean)).size;

  const start = async () => {
    setProgress({ done: 0, total: parsed.lines.length });
    try {
      setMatches(await matchLines(parsed.lines, (done, total) => setProgress({ done, total })));
      setFilter('all');
    } catch (error) {
      toast(`Rapprochement impossible : ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  if (progress)
    return (
      <div className="flex min-h-[380px] flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="size-7 animate-spin text-primary" />
        <div>
          <p className="font-heading text-lg font-bold">Recherche des pages Wikipédia…</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {progress.done} / {progress.total} éléments
          </p>
        </div>
        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
        </div>
      </div>
    );

  if (matches) {
    const counts = Object.fromEntries((Object.keys(MATCH_LOOK) as MatchStatus[]).map((k) => [k, matches.filter((m) => m.status === k).length])) as Record<MatchStatus, number>;
    const kept = matches.filter((m) => m.choice).length;
    let lastSection: string | null = null;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-xl font-bold">Chaque élément et sa page Wikipédia</h2>
            <p className="text-sm text-muted-foreground">Vérifie les éléments « à vérifier » et « introuvables » : choisis une autre page dans la liste, corrige le texte (crayon) ou ignore l’élément.</p>
          </div>
          <button type="button" onClick={() => setMatches(null)} className="h-8 cursor-pointer rounded-lg border px-3 text-xs font-medium hover:bg-muted">
            Modifier la liste
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setFilter('all')} className={cn('h-8 cursor-pointer rounded-full border px-3 text-xs font-medium', filter === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
            Tout · {matches.length}
          </button>
          {(Object.keys(MATCH_LOOK) as MatchStatus[]).map(
            (k) =>
              counts[k] > 0 && (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={cn('flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium', filter === k ? 'border-primary bg-primary/10' : 'hover:bg-muted')}
                >
                  <span className={cn('size-2 rounded-full', MATCH_LOOK[k].dot)} /> {MATCH_LOOK[k].label} · {counts[k]}
                </button>
              ),
          )}
        </div>
        <div className="divide-y rounded-xl border">
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.3fr)_6.5rem] gap-3 px-3 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            <span>#</span>
            <span>Ta liste</span>
            <span>Page Wikipédia</span>
            <span>Confiance</span>
          </div>
          {matches.map((m, i) => {
            if (filter !== 'all' && m.status !== filter) return null;
            const head = m.section && m.section !== lastSection ? m.section : null;
            lastSection = m.section;
            return (
              <div key={`${i}:${m.text}`}>
                {head && <p className="bg-muted/50 px-3 py-1.5 text-xs font-semibold">{head}</p>}
                <MatchRow m={m} n={i + 1} onChange={(next) => setMatches(matches.map((x, j) => (j === i ? next : x)))} />
              </div>
            );
          })}
        </div>
        <div className="sticky bottom-0 flex items-center gap-3 border-t bg-popover pt-3">
          <p className="flex-1 text-sm text-muted-foreground tabular-nums">
            <b className="font-semibold text-foreground">{kept}</b> élément{kept > 1 ? 's' : ''} retenu{kept > 1 ? 's' : ''} sur {matches.length}
          </p>
          <button
            type="button"
            disabled={!kept}
            onClick={() => onContinue(matches)}
            className="flex h-9 cursor-pointer items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
          >
            Continuer <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-bold">Ta propre liste</h2>
        <p className="text-sm text-muted-foreground">
          Écris ou colle ta liste, un élément par ligne (puces et numéros acceptés). Une ligne « # Titre » ou « Titre : » commence une partie. Tu peux aussi coller des colonnes depuis un tableur ou importer un fichier CSV.
        </p>
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={SAMPLE}
        rows={12}
        spellCheck={false}
        aria-label="Ta liste"
        className="w-full resize-y rounded-xl border bg-background px-4 py-3 font-mono text-sm leading-relaxed outline-none focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition hover:bg-muted">
          <Upload className="size-4" /> Importer un fichier
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setCsvFile(/\.(csv|tsv)$/i.test(file.name));
              setColumn(undefined);
              setText(await file.text());
              e.target.value = '';
            }}
          />
        </label>
        {parsed.columns && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Colonne du nom
            <select value={parsed.column} onChange={(e) => setColumn(Number(e.target.value))} className="h-9 cursor-pointer rounded-lg border bg-background px-2 text-sm text-foreground">
              {parsed.columns.map((c, i) => (
                <option key={i} value={i}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="flex-1 text-right text-sm text-muted-foreground tabular-nums">
          {parsed.lines.length} élément{parsed.lines.length > 1 ? 's' : ''}
          {sections > 0 && ` · ${sections} partie${sections > 1 ? 's' : ''}`}
        </p>
        <button
          type="button"
          disabled={!parsed.lines.length}
          onClick={start}
          className="flex h-9 cursor-pointer items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
        >
          Trouver les pages Wikipédia <ChevronRight className="size-4" />
        </button>
      </div>
      {parsed.lines.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Aperçu : {parsed.lines.slice(0, 8).map((l) => l.text).join(' · ')}
          {parsed.lines.length > 8 && ' …'}
        </p>
      )}
    </div>
  );
}

/* ---------- Étape 2 : liste complète, dépliable ---------- */

function EntryList({
  entries,
  ownedTitles,
  origins,
  onRemove,
  onAdd,
}: {
  entries: GoalEntry[];
  ownedTitles: Set<string>;
  /** Texte saisi d'origine, quand l'élément vient de ta liste et que la page a un autre titre. */
  origins: Map<string, string>;
  onRemove: (title: string) => void;
  onAdd: (entry: GoalEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState('');
  const [found, setFound] = useState<GoalEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = filter.trim() ? entries.filter((e) => e.title.toLowerCase().includes(filter.trim().toLowerCase())) : entries;
  const thumbOf = useThumbnails(open ? shown.slice(0, 200).filter((e) => !e.thumbnail).map((e) => e.title) : []);
  const has = new Set(entries.map((e) => e.title));
  let lastSection: string | null = null;

  return (
    <section className="mt-6 rounded-2xl border">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left">
        <ListOrdered className="size-4 text-muted-foreground" />
        <span className="font-semibold">Tous les éléments</span>
        <span className="text-sm text-muted-foreground tabular-nums">{entries.length}</span>
        <span className="ml-auto text-xs text-muted-foreground">vérifier, retirer, ajouter</span>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t p-3">
          <div className="flex flex-wrap gap-2">
            <div className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm">
              <Search className="size-3.5 text-muted-foreground" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer…" aria-label="Filtrer les éléments" className="min-w-0 flex-1 bg-transparent outline-none" />
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!adding.trim()) return;
                setBusy(true);
                try {
                  setFound(await searchCandidates(adding.trim()));
                } finally {
                  setBusy(false);
                }
              }}
              className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border bg-background pr-1 pl-2.5 text-sm"
            >
              <Plus className="size-3.5 text-muted-foreground" />
              <input value={adding} onChange={(e) => (setAdding(e.target.value), setFound(null))} placeholder="Ajouter un élément…" aria-label="Ajouter un élément" className="min-w-0 flex-1 bg-transparent outline-none" />
              <button type="submit" disabled={!adding.trim() || busy} className="h-7 cursor-pointer rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Chercher'}
              </button>
            </form>
          </div>
          {found && (
            <div className="rounded-xl border bg-muted/30 p-1">
              {found.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Aucune page trouvée.</p>}
              {found.map((c) => (
                <button
                  key={c.title}
                  type="button"
                  disabled={has.has(c.title)}
                  onClick={() => {
                    onAdd(c);
                    setFound(null);
                    setAdding('');
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-default disabled:opacity-50"
                >
                  <span className="relative aspect-[5/7] w-7 shrink-0 overflow-hidden rounded bg-muted">{c.thumbnail && <img src={c.thumbnail} alt="" className="size-full object-cover" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.description ?? ''}</span>
                  </span>
                  {has.has(c.title) ? <span className="text-xs text-muted-foreground">déjà dans la liste</span> : <Plus className="size-4 text-primary" />}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-[420px] divide-y overflow-y-auto rounded-xl border">
            {shown.map((e) => {
              const head = !filter && e.section && e.section !== lastSection ? e.section : null;
              lastSection = e.section;
              const src = e.thumbnail ?? thumbOf(e.title);
              const origin = origins.get(e.title);
              return (
                <div key={e.title}>
                  {head && <p className="bg-muted/50 px-3 py-1.5 text-xs font-semibold">{head}</p>}
                  <div className="group flex items-center gap-3 px-3 py-1.5 text-sm">
                    <span className="w-7 shrink-0 text-xs text-muted-foreground tabular-nums">{entries.indexOf(e) + 1}</span>
                    <span className="relative aspect-[5/7] w-7 shrink-0 overflow-hidden rounded bg-muted">{src && <img src={src} alt="" loading="lazy" className="size-full object-cover" />}</span>
                    <span className="min-w-0 flex-1">
                      <a href={`https://fr.wikipedia.org/wiki/${encodeURIComponent(e.title.replace(/ /g, '_'))}`} target="_blank" rel="noopener" className="block truncate font-medium hover:underline">
                        {e.title}
                      </a>
                      <span className="block truncate text-xs text-muted-foreground">
                        {origin && <span className="mr-1">« {origin} » →</span>}
                        {e.description ?? ''}
                      </span>
                    </span>
                    {ownedTitles.has(e.title) && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">à toi</span>}
                    <button
                      type="button"
                      onClick={() => onRemove(e.title)}
                      aria-label={`Retirer ${e.title}`}
                      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground opacity-50 transition group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-600"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
