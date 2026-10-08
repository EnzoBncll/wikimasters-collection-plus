import { motion } from 'framer-motion';
import { Check, ChevronDown, ChevronRight, Database, ListOrdered, Loader2, MessageSquareText, Plus, RotateCcw, Search, Target, X } from 'lucide-react';
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
import type { SiteTag } from '@/lib/types';
import { cn } from '@/lib/utils';
import { randomTagColor, TAG_COLORS } from '@/lib/tag-colors';
import { useThumbnails, WikiPeek } from './wiki-peek';

const TRIES = ['les rois de France', 'les empereurs en Europe après 1600', 'les papes', "les recettes à l'orange confite"];
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
  | { kind: 'criteria' | 'search'; label: string; items: Pickable[]; picked: Set<string>; next?: number | null; query?: string }
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(randomTagColor);
  const [annex, setAnnex] = useState(true);
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
    findListPages(text).then((value) => setLists({ status: 'done', value }), () => setLists({ status: 'error' }));
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

  const entries = useMemo(() => draftEntries(draft), [draft]);
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
      // Préfixe commun « 🎯 » : les albums à objectif se reconnaissent sur le site comme sur tous tes ordinateurs.
      const full = goalName(name);
      const existing = tags.find((t) => t.name.toLowerCase() === full.toLowerCase() || t.name.toLowerCase() === name.trim().toLowerCase());
      const tag = existing ?? (await createTag(full, color));
      if (!tag) return;
      if (existing && existing.name !== full) await updateTag(existing.id, { name: full });
      await saveGoalAlbum(tag.id, { entries, source: { kind: draft.kind === 'list' ? 'list' : draft.kind === 'search' ? 'search' : 'criteria', label: draft.label }, annex, at: Date.now() });
      const toStick = [...owned.values()].filter((c) => !c.tagIds.includes(tag.id));
      if (toStick.length) stageIntoAlbum(toStick, tag);
      toast(`Album « ${tag.name} » créé : ${entries.length} cases${toStick.length ? `, ${toStick.length} carte(s) à coller dans la boîte d'envoi` : ''}`, 'success');
      onCreated(tag);
    } finally {
      setCreating(false);
    }
  };

  const steps = [
    [1, 'Sujet'],
    [2, 'Cartes'],
    [3, 'Aperçu'],
  ] as const;

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
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl"
      >
        <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Target className="size-4 text-muted-foreground" /> Nouvel album à objectif
          </span>
          <nav className="ml-auto flex items-center gap-4 text-xs" aria-label="Étapes">
            {steps.map(([n, label]) => (
              <button
                key={n}
                type="button"
                disabled={n > step || (n > 1 && !draft)}
                onClick={() => setStep(n)}
                aria-current={n === step ? 'step' : undefined}
                className={cn('cursor-pointer font-medium text-muted-foreground disabled:cursor-default', n === step && 'text-foreground', n < step && 'hover:text-foreground')}
              >
                {n}. {label}
              </button>
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
                  async () => ({ kind: 'list', label: p.title, sections: (await readListPage(p.title)).map((s) => ({ ...s, on: s.suggested })), off: new Set() }),
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
              onSearch={() => {
                if (search?.status !== 'done') return;
                const { results, next } = search.value;
                setDraft({ kind: 'search', label: `Recherche « ${asked} »`, items: results, picked: new Set(results.filter((r) => r.relevant).map((r) => r.title)), next, query: asked });
                setName(capitalize(cleanQuery(asked)));
                setStep(2);
              }}
            />
          )}
          {step === 2 && draft && <StepCards draft={draft} setDraft={setDraft} ownedTitles={ownedTitles} />}
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
              onDrop={(title) =>
                setDraft((d) =>
                  !d || d.kind === 'names' ? d : d.kind === 'list' ? { ...d, off: new Set([...d.off, title]) } : { ...d, picked: new Set([...d.picked].filter((t) => t !== title)) },
                )
              }
            />
          )}
        </div>

        {step > 1 && draft && (
          <footer className="flex flex-wrap items-center gap-3 border-t px-5 py-3">
            <button type="button" onClick={() => setStep((s) => (s - 1) as 1 | 2)} className="h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
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

function Group({
  icon: Icon,
  title,
  hint,
  summary,
  open,
  onToggle,
  children,
}: {
  icon: typeof Search;
  title: string;
  hint: string;
  /** Résumé affiché dans l'en-tête (« 3 listes », « Recherche… »). */
  summary: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-sm">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-semibold">{title}</span>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{hint}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">{summary}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="border-t p-1">{children}</div>}
    </section>
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

function Pending({ state, empty, children }: { state: Async<unknown> | null; empty: string; children: React.ReactNode }) {
  if (state?.status === 'loading')
    return (
      <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Recherche…
      </p>
    );
  if (state?.status === 'error') return <p className="px-3 py-2.5 text-sm text-muted-foreground">Recherche impossible pour le moment.</p>;
  return <>{children || <p className="px-3 py-2.5 text-sm text-muted-foreground">{empty}</p>}</>;
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

function StepSubject({
  query,
  setQuery,
  asked,
  run,
  lists,
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
}: {
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
  const listValues = lists?.status === 'done' ? lists.value : [];
  const critValues = criteria?.status === 'done' ? criteria.value : [];
  const results = search?.status === 'done' ? search.value.results : [];
  const broadValue = broad?.status === 'done' ? broad.value : null;
  const relatedValues = related?.status === 'done' ? related.value : [];
  const wikidataLoading = criteria?.status === 'loading' || broad?.status === 'loading';
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  useEffect(() => setOpened({}), [asked]);
  const isOpen = (id: string, fallback: boolean) => opened[id] ?? fallback;
  const toggle = (id: string, fallback: boolean) => setOpened((o) => ({ ...o, [id]: !(o[id] ?? fallback) }));
  const freeValue = free?.status === 'done' ? free.value : null;
  const freeSummary =
    free?.status === 'loading' ? (
      <Spin text="analyse" />
    ) : freeValue?.plan.mode === 'names' ? (
      `${freeValue.plan.names.length} noms proposés`
    ) : freeValue?.entries?.status === 'loading' ? (
      <Spin text="construction" />
    ) : freeValue?.entries?.status === 'done' ? (
      `${freeValue.entries.value.length} articles`
    ) : (
      '—'
    );
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-bold">Que veux-tu réunir ?</h2>
        <p className="text-sm text-muted-foreground">Un sujet, avec des dates ou un lieu si besoin. Les sources viennent de Wikipédia et de Wikidata.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="flex h-12 items-center gap-3 rounded-xl border bg-background pr-1.5 pl-3.5 transition focus-within:border-primary"
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ex. les empereurs en Europe après 1600"
          aria-label="Sujet de l'album"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        <button type="submit" disabled={!query.trim()} className="h-9 cursor-pointer rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          Chercher
        </button>
      </form>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        Exemples :
        {TRIES.map((t) => (
          <button key={t} type="button" onClick={() => run(t)} className="cursor-pointer text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
            {t}
          </button>
        ))}
      </p>

      {asked && (
        <div className="space-y-2">
          <Group
            icon={MessageSquareText}
            title="Demande libre"
            hint="ta phrase traduite en règles, puis une liste exacte"
            summary={freeSummary}
            open={isOpen('free', true)}
            onToggle={() => toggle('free', true)}
          >
            <FreeBlock free={free} hasKey={hasKey} onRebuild={onRebuild} onFree={onFree} onNames={onNames} />
          </Group>

          <Group
            icon={ListOrdered}
            title="Listes Wikipédia"
            hint="nombre exact, ordre déjà prêt"
            summary={lists?.status === 'loading' ? <Spin text="recherche" /> : listValues.length ? `${listValues.length} liste${listValues.length > 1 ? 's' : ''}` : 'aucune'}
            open={isOpen('lists', false)}
            onToggle={() => toggle('lists', false)}
          >
            <Pending state={lists} empty="Pas de page « Liste de… » sur ce sujet.">
              {listValues.length > 0 &&
                listValues.map((p) => <Row key={p.title} title={p.title} detail={p.description ?? 'Page de liste'} busy={opening === `list:${p.title}`} onClick={() => onList(p)} />)}
            </Pending>
          </Group>

          <Group
            icon={Database}
            title="Wikidata"
            hint="liste large, chaque carte notée de 0 à 1"
            summary={
              wikidataLoading ? (
                <Spin text="recherche" />
              ) : broadValue ? (
                `${broadValue.candidates.length} candidats`
              ) : critValues.length ? (
                `${critValues.length} critère${critValues.length > 1 ? 's' : ''}`
              ) : (
                'à composer'
              )
            }
            open={isOpen('wikidata', false)}
            onToggle={() => toggle('wikidata', false)}
          >
            {wikidataLoading && (
              <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Recherche…
              </p>
            )}
            {broadValue && (
              <Row
                title={`Tous les articles « ${broadValue.subject.label} »${describe(broadValue.constraints) ? ` · ${describe(broadValue.constraints)}` : ''}`}
                detail={`${broadValue.candidates.length} candidats, notés selon le lien avec « ${broadValue.subject.label} »${describe(broadValue.constraints) ? ', les dates et le lieu' : ''}`}
                onClick={onBroad}
              />
            )}
            {critValues.map((c) => (
              <Row
                key={`${c.prop}:${c.qid}`}
                title={`${c.propLabel} : ${c.label}`}
                detail={`${c.count} articles${c.description ? ` · ${c.description}` : ''}`}
                busy={opening === `crit:${c.prop}:${c.qid}`}
                onClick={() => onCriterion(c)}
              />
            ))}
            {!wikidataLoading && !broadValue && !critValues.length && <p className="px-3 pt-2.5 text-sm text-muted-foreground">Wikidata ne reconnaît pas cette demande telle quelle.</p>}
            {!wikidataLoading && !critValues.length && relatedValues.length > 0 && (
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
            {!wikidataLoading && <EntityPicker onPick={onEntity} opening={opening} />}
          
          </Group>

          <Group
            icon={Search}
            title="Recherche Wikipédia"
            hint="les articles qui en parlent, à cocher"
            summary={search?.status === 'loading' ? <Spin text="recherche" /> : `${results.length} articles`}
            open={isOpen('search', false)}
            onToggle={() => toggle('search', false)}
          >
            <Pending state={search} empty="Aucun article trouvé : essaie d'autres mots.">
              {results.length > 0 && <Row title={`Articles sur « ${cleanQuery(asked)} »`} detail={results.slice(0, 6).map((r) => r.title).join(', ')} onClick={onSearch} />}
            </Pending>
          
          </Group>
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
  onDrop,
}: {
  name: string;
  setName: (n: string) => void;
  color: string;
  setColor: (c: string) => void;
  annex: boolean;
  setAnnex: (a: boolean) => void;
  entries: GoalEntry[];
  owned: Map<number, unknown>;
  onDrop: (title: string) => void;
}) {
  const pages = Math.ceil(entries.length / PER_PAGE);
  const ambiguous = entries.filter((e) => e.disambiguation);
  return (
    <div className="grid gap-7 md:grid-cols-[220px_1fr]">
      <div className="space-y-3">
        <div
          className="relative flex aspect-[3/4] flex-col items-center justify-center gap-2 overflow-hidden rounded-[6px_16px_16px_6px] p-5 text-center text-white shadow-lg"
          style={{ background: `linear-gradient(150deg, ${color}, color-mix(in oklab, ${color} 45%, black))` }}
        >
          <span className="absolute inset-y-0 left-0 w-3 bg-black/25" />
          <span className="text-[10px] font-semibold tracking-[0.25em] uppercase opacity-75">Album</span>
          <textarea
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\n/g, ' '))}
            rows={2}
            aria-label="Nom de l'album"
            className="w-full resize-none overflow-hidden rounded-md bg-transparent px-1 text-center font-heading text-lg leading-tight font-bold outline-none [field-sizing:content] hover:bg-black/15 focus:bg-black/20"
          />
          <span className="text-sm tabular-nums opacity-90">
            {owned.size} / {entries.length}
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Couleur">
          {TAG_COLORS.filter((_, i) => i % 2 === 0).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Couleur ${c}`}
              aria-pressed={c === color}
              className={cn('size-5 cursor-pointer rounded-full ring-offset-2 ring-offset-popover', c === color && 'ring-2 ring-foreground')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <h2 className="font-heading text-xl font-bold">Aperçu</h2>
          <p className="text-sm text-muted-foreground">
            {pages} page{pages > 1 ? 's' : ''} de {PER_PAGE} cases, dans l'ordre. Survole une case pour voir la carte.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
          {Array.from({ length: pages }, (_, p) => (
            <div key={p} className="flex flex-col gap-1 rounded-md border bg-muted/40 p-1.5">
              <div className="grid grid-cols-3 gap-[3px]">
                {Array.from({ length: PER_PAGE }, (_, i) => {
                  const n = p * PER_PAGE + i;
                  const e = entries[n];
                  return (
                    <i
                      key={i}
                      title={e ? `${n + 1}. ${e.title}` : undefined}
                      className={cn('block aspect-[5/7] rounded-[2px]', !e ? 'bg-transparent' : owned.has(n) ? 'bg-emerald-500' : e.disambiguation ? 'bg-rose-500' : 'bg-muted-foreground/25')}
                    />
                  );
                })}
              </div>
              <span className="text-center text-[10px] text-muted-foreground tabular-nums">{p + 1}</span>
            </div>
          ))}
        </div>
        {ambiguous.length > 0 && (
          <div className="divide-y rounded-xl border">
            {ambiguous.map((e) => (
              <div key={e.title} className="flex items-center gap-3 px-3 py-2 text-sm">
                <p className="min-w-0 flex-1">
                  « {e.title} » est une page d'homonymie
                  <span className="block text-xs text-muted-foreground">Aucune carte n'y correspondra.</span>
                </p>
                <button type="button" onClick={() => onDrop(e.title)} className="cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted">
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" checked={annex} onChange={(e) => setAnnex(e.target.checked)} className="mt-1 accent-[var(--primary)]" />
          <span>
            Annexe pour les autres cartes de l'étiquette
            <span className="block text-xs text-muted-foreground">Après la dernière page, sans compter dans l'objectif.</span>
          </span>
        </label>
      </div>
    </div>
  );
}
