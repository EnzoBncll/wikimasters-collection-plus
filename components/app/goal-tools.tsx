import { ArrowDown, ArrowUp, Check, ListPlus, Loader2, Pencil, Plus, Search, Target, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { storage } from '#imports';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { entriesForCards, insertEntries, matchEntries, saveGoalAlbum, searchArticles, titleKey, type GoalAlbum, type GoalEntry, type SearchResult } from '@/lib/goal-albums';
import type { SectionRun } from '@/lib/goal-layout';
import type { OwnedCard } from '@/lib/types';
import type { CardFacts } from '@/lib/wikidata';
import { cn } from '@/lib/utils';
import { useCardViewer } from './card-viewer';
import { WmCard } from './wm-card';

/* ---------- Cartes de l'album hors de la liste ---------- */

/**
 * Cartes collées dans un album à objectif mais absentes de sa liste : visibles sous le livre (même sans annexe),
 * avec « Ajouter à la liste » pour leur donner une case comme aux autres.
 */
export function GoalOffList({ cards, annex, onAdd, onShowAnnex }: { cards: OwnedCard[]; annex: boolean; onAdd: (cards: OwnedCard[]) => Promise<void>; onShowAnnex: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const add = async (list: OwnedCard[], key: string) => {
    setBusy(key);
    try {
      await onAdd(list);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="w-full space-y-3 rounded-3xl bg-white/[0.06] p-6 text-white ring-1 ring-white/10 backdrop-blur" data-goal-offlist>
      <div className="flex flex-wrap items-center gap-2">
        <ListPlus className="size-4 text-amber-300" />
        <h3 className="font-semibold">Dans l'album, hors de la liste</h3>
        <span className="text-sm text-white/50 tabular-nums">{cards.length}</span>
        <button
          type="button"
          onClick={() => void add(cards, '*')}
          disabled={Boolean(busy)}
          className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold transition hover:bg-amber-400 disabled:opacity-60"
        >
          {busy === '*' ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Tout ajouter à la liste
        </button>
      </div>
      <p className="text-xs text-white/60">
        Ces cartes portent l'étiquette de l'album mais n'ont pas de case dans la liste.{' '}
        {annex ? (
          <>
            Elles sont rangées après la dernière page (
            <button type="button" onClick={onShowAnnex} className="cursor-pointer underline underline-offset-2 hover:text-white">
              y aller
            </button>
            ).
          </>
        ) : (
          'Ajoute-les à la liste pour leur donner une case, ou active les pages en plus dans « Modifier la liste ».'
        )}
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
        {cards.map((card, i) => (
          <div key={card.cardId} className="flex flex-col items-center gap-1.5">
            <button type="button" className="w-full cursor-zoom-in" onClick={() => useCardViewer.getState().open(cards, i)} title={card.title}>
              <WmCard card={card} tilt={false} className="w-full" showTags={false} />
            </button>
            <button
              type="button"
              onClick={() => void add([card], card.cardId)}
              disabled={Boolean(busy)}
              className="flex cursor-pointer items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition hover:bg-white/20 disabled:opacity-60"
            >
              {busy === card.cardId ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Ajouter à la liste
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Modifier la liste ---------- */

const END = '\u0000fin';

/**
 * Retouche de la liste après création : ajouter des cases (recherche Wikipédia, comme dans l'assistant, y compris
 * des cartes pas encore possédées), retirer, réordonner, choisir la partie. Enregistré d'un coup (date mise à jour,
 * donc reprise par la synchro des albums).
 */
export function GoalListEditor({
  tagId,
  name,
  goal,
  allCards,
  facts,
  onClose,
}: {
  tagId: string;
  name: string;
  goal: GoalAlbum;
  allCards: OwnedCard[];
  facts: Record<string, CardFacts>;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<GoalEntry[]>(goal.entries);
  const [annex, setAnnex] = useState(goal.annex);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const sections = useMemo(() => [...new Set(entries.map((e) => e.section).filter((s): s is string => Boolean(s)))], [entries]);
  const [target, setTarget] = useState<string>(END);
  const listRef = useRef<HTMLOListElement>(null);
  const owned = useMemo(() => matchEntries(entries, allCards, facts), [entries, allCards, facts]);
  const inList = useMemo(() => new Set(entries.map((e) => titleKey(e.title))), [entries]);
  const dirty = entries !== goal.entries || annex !== goal.annex;

  // Recherche Wikipédia (titres d'articles), lancée après une courte pause de frappe.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setResults(null);
    let alive = true;
    setSearching(true);
    const t = window.setTimeout(() => {
      searchArticles(q)
        .then(({ results }) => alive && setResults(results))
        .catch((e) => alive && toast(`Recherche impossible : ${(e as Error).message}`, 'error'))
        .finally(() => alive && setSearching(false));
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query]);

  const add = (e: GoalEntry) => {
    const section = target === END ? null : target;
    setEntries((list) => insertEntries(list, [{ ...e, section }], section));
    // La case ajoutée en fin de liste : on la montre.
    if (target === END) window.setTimeout(() => listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30);
  };
  const remove = (i: number) => setEntries((list) => list.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) =>
    setEntries((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      // Passer au-dessus d'une case d'une autre partie : on rejoint cette partie (ordre et parties restent cohérents).
      const moved = { ...next[i]!, section: next[j]!.section };
      next[i] = next[j]!;
      next[j] = moved;
      return next;
    });

  const save = async () => {
    if (!entries.length) return toast('Garde au moins une case dans la liste.', 'error');
    setSaving(true);
    try {
      await saveGoalAlbum(tagId, { ...goal, entries, annex, at: Date.now() });
      const delta = entries.length - goal.entries.length;
      toast(`Liste de « ${name} » enregistrée : ${entries.length} cases${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}`, 'success');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm('Abandonner les modifications de la liste ?')) return;
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      role="dialog"
      aria-modal="true"
      aria-label={`Modifier la liste de ${name}`}
    >
      <div className="flex h-full max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-zinc-950/95 text-white shadow-2xl ring-1 ring-white/10">
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <Pencil className="size-4 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">Modifier la liste</p>
            <h2 className="truncate text-lg font-bold">{name}</h2>
          </div>
          <span className="text-sm text-white/50 tabular-nums">
            {owned.size} / {entries.length} possédées
          </span>
          <button type="button" onClick={close} aria-label="Fermer" className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20">
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:grid-rows-1">
          {/* Ajouter : recherche Wikipédia, la case peut être une carte que tu n'as pas encore. */}
          <div className="flex min-h-0 flex-col gap-3 border-b border-white/10 p-4 md:border-r md:border-b-0">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ajouter une case : cherche un article Wikipédia…"
                className="h-10 w-full rounded-full bg-white/10 pr-9 pl-9 text-sm text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-white/30"
              />
              {searching && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-white/50" />}
            </div>
            {sections.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-white/60">
                Ajouter dans
                <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 min-w-0 flex-1 rounded-full bg-white/10 px-3 text-xs text-white outline-none">
                  <option value={END} className="bg-zinc-900">
                    Fin de la liste (sans partie)
                  </option>
                  {sections.map((s) => (
                    <option key={s} value={s} className="bg-zinc-900">
                      Partie « {s} »
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {!results && <p className="px-1 py-6 text-center text-sm text-white/40">Tape un nom (personne, lieu, œuvre…) : la case s'ajoute même si tu n'as pas encore la carte.</p>}
              {results?.length === 0 && <p className="px-1 py-6 text-center text-sm text-white/40">Aucun article trouvé.</p>}
              {results?.map((r) => {
                const already = inList.has(titleKey(r.title));
                return (
                  <button
                    key={r.title}
                    type="button"
                    disabled={already}
                    onClick={() => add(r)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/10 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent',
                      !r.relevant && 'opacity-70',
                    )}
                  >
                    {r.thumbnail ? <img src={r.thumbnail} alt="" className="size-9 shrink-0 rounded-md object-cover" /> : <span className="size-9 shrink-0 rounded-md bg-white/10" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      {r.description && <span className="block truncate text-xs text-white/50">{r.description}</span>}
                    </span>
                    {already ? <Check className="size-4 shrink-0 text-emerald-300" /> : <Plus className="size-4 shrink-0 text-white/70" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* La liste : retirer, monter, descendre. */}
          <div className="flex min-h-0 flex-col">
            <p className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-white/50">
              <Target className="size-3.5 text-emerald-300" /> {entries.length} cases · les flèches déplacent une case, la corbeille la retire
            </p>
            <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {entries.map((e, i) => {
                const newSection = e.section && e.section !== entries[i - 1]?.section;
                return (
                  <li key={`${titleKey(e.title)}-${i}`} className="[content-visibility:auto] [contain-intrinsic-size:auto_44px]">
                    {newSection && <p className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-white/45 uppercase">{e.section}</p>}
                    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                      <span className="w-8 shrink-0 text-right text-xs text-white/40 tabular-nums">{i + 1}</span>
                      <span className={cn('size-2 shrink-0 rounded-full', owned.has(i) ? 'bg-emerald-400' : 'bg-white/15')} title={owned.has(i) ? 'Carte possédée' : 'À trouver'} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{e.title}</span>
                        {e.description && <span className="block truncate text-[11px] text-white/40">{e.description}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                        <IconButton label="Monter" onClick={() => move(i, -1)} disabled={i === 0}>
                          <ArrowUp className="size-3.5" />
                        </IconButton>
                        <IconButton label="Descendre" onClick={() => move(i, 1)} disabled={i === entries.length - 1}>
                          <ArrowDown className="size-3.5" />
                        </IconButton>
                        <IconButton label={`Retirer ${e.title}`} onClick={() => remove(i)} danger>
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 px-5 py-3">
          <label className="flex items-center gap-2 text-sm text-white/75">
            <Switch checked={annex} onCheckedChange={setAnnex} aria-label="Pages en plus pour les cartes hors liste" />
            Pages en plus pour les cartes hors liste
          </label>
          <span className="ml-auto" />
          <button type="button" onClick={close} className="h-9 cursor-pointer rounded-full bg-white/10 px-4 text-sm font-semibold transition hover:bg-white/20">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-emerald-500 px-4 text-sm font-semibold transition hover:bg-emerald-400 disabled:cursor-default disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />} Enregistrer
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn('flex size-7 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/15 disabled:cursor-default disabled:opacity-25', danger && 'hover:bg-rose-500/30 hover:text-rose-200')}
    >
      {children}
    </button>
  );
}

/** Ajoute des cartes de la collection à la liste d'un album à objectif (à la fin). */
export async function addCardsToGoal(tagId: string, goal: GoalAlbum, cards: OwnedCard[], facts: Record<string, CardFacts>) {
  const added = await entriesForCards(cards, facts);
  const entries = insertEntries(goal.entries, added, null);
  const n = entries.length - goal.entries.length;
  if (!n) return toast('Ces cartes sont déjà dans la liste.', 'info');
  await saveGoalAlbum(tagId, { ...goal, entries, at: Date.now() });
  toast(n === 1 ? `« ${added[0]!.title} » a maintenant sa case` : `${n} cases ajoutées à la liste`, 'success');
}

/* ---------- Vue grille à défilement ---------- */

export type AlbumView = 'book' | 'grid';
export const albumViewItem = storage.defineItem<AlbumView>('local:albumView', { fallback: 'book' });

const STEP = 96;

export interface GridGoal {
  entries: GoalEntry[];
  match: Map<number, OwnedCard>;
  entryAt: (number | null)[];
  runs: SectionRun[];
  runOf: number[];
  onStick: (card: OwnedCard) => void;
}

type GridItem =
  | { kind: 'head'; key: string; title: string; detail?: string; color?: string }
  | { kind: 'card'; key: string; card: OwnedCard; n?: number }
  | { kind: 'todo'; key: string; entry: GoalEntry; n: number; own?: OwnedCard };

/**
 * Album en pleine page : une grille de cases qui défile (chargée par morceaux en descendant), parties en intertitres,
 * cases manquantes visibles. Alternative simple au livre réaliste.
 */
export function AlbumGrid({ slots, byId, goal, unsent }: { slots: (string | null)[]; byId: Map<string, OwnedCard>; goal?: GridGoal; unsent: Set<string> }) {
  const items = useMemo(() => {
    const out: GridItem[] = [];
    let annexed = false;
    // Cases remplies par partie (carte collée à la place de « goal:n »).
    const filled = new Map<number, number>();
    if (goal)
      slots.forEach((id, slot) => {
        const e = goal.entryAt[slot];
        if (id && e != null && !id.startsWith('goal:')) filled.set(goal.runOf[e]!, (filled.get(goal.runOf[e]!) ?? 0) + 1);
      });
    slots.forEach((id, slot) => {
      if (!id || id.startsWith('section:')) return;
      const entry = goal ? (goal.entryAt[slot] ?? null) : null;
      if (goal && entry !== null) {
        const run = goal.runs[goal.runOf[entry]!];
        if (run?.name && run.start === entry) {
          out.push({ kind: 'head', key: `run-${run.start}`, title: run.name, detail: `${filled.get(goal.runOf[entry]!) ?? 0} / ${run.size}`, color: run.color });
        }
      }
      if (id.startsWith('goal:')) {
        const n = Number(id.slice(5));
        out.push({ kind: 'todo', key: id, entry: goal!.entries[n]!, n: n + 1, own: goal!.match.get(n) });
        return;
      }
      const card = byId.get(id);
      if (!card) return;
      if (goal && entry === null && !annexed) {
        annexed = true;
        out.push({ kind: 'head', key: 'annex', title: 'Hors de la liste' });
      }
      out.push({ kind: 'card', key: id, card, n: entry !== null ? entry + 1 : undefined });
    });
    return out;
  }, [slots, byId, goal]);
  const ordered = useMemo(() => items.flatMap((it) => (it.kind === 'card' ? [it.card] : [])), [items]);
  const [shown, setShown] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setShown((n) => n + STEP), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, shown]);

  if (!items.length) return <p className="py-16 text-center text-white/60">Album vide pour le moment.</p>;
  return (
    <div className="w-full" data-album-grid>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-4 gap-y-5">
        {items.slice(0, shown).map((it) => {
          if (it.kind === 'head')
            return (
              <h3 key={it.key} data-grid-annex={it.key === 'annex' || undefined} className="col-span-full flex items-center gap-2 border-b border-white/15 pt-4 pb-1.5 text-sm font-semibold text-white first:pt-0">
                {it.color && <i className="size-2.5 rounded-full" style={{ backgroundColor: it.color }} />}
                {it.title}
                {it.detail && <span className="text-xs font-normal text-white/50 tabular-nums">{it.detail}</span>}
              </h3>
            );
          if (it.kind === 'card')
            return (
              <button
                key={it.key}
                type="button"
                title={it.card.title}
                onClick={() => useCardViewer.getState().open(ordered, ordered.indexOf(it.card))}
                className="relative cursor-zoom-in transition-transform hover:z-10 hover:scale-[1.04]"
              >
                <WmCard card={it.card} tilt={false} className="w-full" showTags={false} />
                {it.n && <span className="absolute -top-2 -left-2 z-30 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">{it.n}</span>}
                {unsent.has(it.card.cardId) && <span title="Pas encore envoyé" className="absolute -top-1 -right-1 z-30 size-3 rounded-full bg-amber-400 ring-2 ring-white" />}
              </button>
            );
          return (
            <div
              key={it.key}
              title={it.entry.description ? `${it.entry.title} — ${it.entry.description}` : it.entry.title}
              className={cn(
                'relative flex aspect-[5/7] flex-col items-center justify-end gap-2 overflow-hidden rounded-xl border-2 border-dashed p-2 pb-3 text-center',
                it.own ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/20 bg-white/[0.04]',
              )}
            >
              {it.entry.thumbnail && <img src={it.entry.thumbnail} alt="" loading="lazy" className="pointer-events-none absolute inset-0 size-full object-cover opacity-20 blur-[2px] grayscale" />}
              {!it.entry.thumbnail && <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-heading text-5xl font-black text-white/10">?</span>}
              <span className="absolute top-1.5 left-2 text-xs text-white/45 tabular-nums">{it.n}</span>
              <span className="relative line-clamp-3 text-xs leading-tight font-semibold text-white/85">{it.entry.title}</span>
              {it.own && (
                <button
                  type="button"
                  onClick={() => goal!.onStick(it.own!)}
                  className="relative cursor-pointer rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow transition hover:bg-amber-400"
                >
                  + Coller
                </button>
              )}
            </div>
          );
        })}
      </div>
      {shown < items.length && (
        <div ref={sentinel} className="flex justify-center py-8 text-white/50">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
    </div>
  );
}
