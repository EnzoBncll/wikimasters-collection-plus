import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Loader2, RefreshCw, Sparkles, Trash2, Wand2, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { PROPS } from '@/lib/wikidata';
import { computeSuggestions, pendingForRule, type Rule, type RuleMode, type Suggestion } from '@/lib/suggest';
import type { OwnedCard } from '@/lib/types';
import { systemTagIds } from '@/lib/trade';
import { cn } from '@/lib/utils';
import { ColorPicker, randomTagColor } from './color-picker';
import { EmptyState } from './review-view';

/** Petites vignettes empilées des cartes d'un groupe. */
function Thumbs({ cards, max = 6 }: { cards: OwnedCard[]; max?: number }) {
  return (
    <div className="flex items-center">
      <div className="flex -space-x-3">
        {cards.slice(0, max).map((c) => (
          <div key={c.cardId} className="size-9 overflow-hidden rounded-lg bg-muted ring-2 ring-card" title={c.title}>
            {c.imageUrl ? (
              <img src={c.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-xs font-bold text-muted-foreground">{c.title.charAt(0)}</div>
            )}
          </div>
        ))}
      </div>
      {cards.length > max && <span className="ml-2 text-xs text-muted-foreground">+{cards.length - max}</span>}
    </div>
  );
}

/** Choix du mode d'une règle. */
function ModeToggle({ value, onChange }: { value: RuleMode; onChange: (mode: RuleMode) => void }) {
  return (
    <div className="flex rounded-full border p-0.5 text-xs">
      {(['review', 'auto'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            'flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 transition',
            value === mode ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {mode === 'review' ? <Check className="size-3" /> : <Zap className="size-3" />}
          {mode === 'review' ? 'À valider' : 'Automatique'}
        </button>
      ))}
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { accept, dismiss } = useSuggestions();
  const job = useCollection((s) => s.job);
  const [name, setName] = useState(suggestion.name);
  const [color, setColor] = useState(randomTagColor);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [withRule, setWithRule] = useState(false);
  const [mode, setMode] = useState<RuleMode>('review');
  const [busy, setBusy] = useState(false);

  const selected = suggestion.cards.filter((c) => !excluded.has(c.cardId));
  const target = suggestion.existingTag;

  const submit = async () => {
    setBusy(true);
    try {
      await accept(suggestion, { name, color, cards: selected, rule: withRule ? mode : null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
    >
      <div className="flex items-start gap-2.5">
        {target ? (
          <span className="mt-1.5 size-5 shrink-0 rounded-full" style={{ backgroundColor: target.color ?? 'var(--muted-foreground)' }} />
        ) : (
          <ColorPicker value={color} onChange={setColor} className="mt-1.5 size-5" />
        )}
        <div className="min-w-0 flex-1">
          {target ? (
            <p className="py-1 text-base font-semibold">
              Ajouter à « {target.name} »
            </p>
          ) : (
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 border-transparent px-1.5 text-base font-semibold shadow-none hover:border-input focus-visible:border-input" />
          )}
          <p className="px-1.5 text-xs text-muted-foreground">{suggestion.reason}</p>
        </div>
        <button
          type="button"
          onClick={() => dismiss(suggestion.key)}
          title="Ignorer cette suggestion"
          className="cursor-pointer rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-1 text-left">
        <Thumbs cards={selected} />
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {selected.length} carte{selected.length > 1 ? 's' : ''}
          <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
        </span>
      </button>

      {expanded && (
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {suggestion.cards.map((card) => {
            const off = excluded.has(card.cardId);
            return (
              <button
                key={card.cardId}
                type="button"
                onClick={() => {
                  const next = new Set(excluded);
                  if (off) next.delete(card.cardId);
                  else next.add(card.cardId);
                  setExcluded(next);
                }}
                className={cn(
                  'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition',
                  off ? 'text-muted-foreground line-through opacity-60' : 'border-primary/40 bg-accent text-accent-foreground',
                )}
              >
                {card.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={withRule} onCheckedChange={(v) => setWithRule(v === true)} />
          Aussi pour les futures cartes
        </label>
        {withRule && <ModeToggle value={mode} onChange={setMode} />}
      </div>

      <Button onClick={submit} disabled={busy || Boolean(job) || !selected.length || (!target && !name.trim())}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        {target ? `Ajouter ${selected.length} carte${selected.length > 1 ? 's' : ''}` : `Créer et étiqueter ${selected.length} carte${selected.length > 1 ? 's' : ''}`}
      </Button>
    </motion.div>
  );
}

function PendingRule({ rule, cards }: { rule: Rule; cards: OwnedCard[] }) {
  const { applyRule, ignoreForRule, labels } = useSuggestions();
  const tag = useCollection((s) => s.tags.find((t) => t.id === rule.tagId));
  if (!tag) return null;
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/30 bg-accent/40 p-4">
      <span className="size-3 rounded-full" style={{ backgroundColor: tag.color ?? 'var(--muted-foreground)' }} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {cards.length} nouvelle{cards.length > 1 ? 's' : ''} carte{cards.length > 1 ? 's' : ''} pour « {tag.name} »
        </p>
        <p className="text-xs text-muted-foreground">
          {PROPS[rule.criterion.prop]} : {rule.criterion.values.filter((q) => labels[q]).map((q) => labels[q]).slice(0, 3).join(', ') || 'renseigné'}
        </p>
      </div>
      <Thumbs cards={cards} max={5} />
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => ignoreForRule(rule, cards)}>
          Ignorer
        </Button>
        <Button size="sm" onClick={() => applyRule(rule, cards)}>
          <Check className="size-4" /> Étiqueter
        </Button>
      </div>
    </motion.div>
  );
}

export function SuggestionsView() {
  const { cards, tags, tradeTags, version } = useCollection();
  const { loaded, facts, labels, rules, dismissed, enriching, analyze, load, setRuleMode, deleteRule } = useSuggestions();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const systemIds = useMemo(() => systemTagIds(tradeTags), [tradeTags]);
  const suggestions = useMemo(
    () => computeSuggestions({ cards, facts, labels, tags, systemTagIds: systemIds, dismissed, rules }),
    [cards, facts, labels, tags, systemIds, dismissed, rules, version],
  );
  const pending = useMemo(() => {
    const tagIds = new Set(tags.map((t) => t.id));
    return rules
      .filter((r) => r.mode === 'review' && tagIds.has(r.tagId))
      .map((rule) => ({ rule, cards: pendingForRule(rule, cards, facts) }))
      .filter((p) => p.cards.length);
  }, [rules, tags, cards, facts, version]);

  const analyzed = cards.filter((c) => facts[c.cardId]).length;
  const recognized = cards.filter((c) => facts[c.cardId]?.qid).length;
  const notAnalyzed = cards.length - analyzed;
  const catalogue = suggestions.filter((s) => s.source === 'catalogue');
  const discovery = suggestions.filter((s) => s.source === 'discovery');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Suggestions</h1>
          <p className="text-sm text-muted-foreground">
            Groupes détectés grâce à Wikidata · {recognized}/{cards.length} cartes reconnues
            {notAnalyzed > 0 && ` · ${notAnalyzed} à analyser`}
          </p>
        </div>
        <Button variant={notAnalyzed ? 'default' : 'outline'} onClick={analyze} disabled={Boolean(enriching) || !cards.length} className="rounded-full">
          {enriching ? <Loader2 className="size-4 animate-spin" /> : notAnalyzed ? <Sparkles className="size-4" /> : <RefreshCw className="size-4" />}
          {enriching
            ? enriching.total
              ? `Analyse… ${enriching.done}/${enriching.total}`
              : 'Analyse…'
            : notAnalyzed
              ? `Analyser ${notAnalyzed} carte${notAnalyzed > 1 ? 's' : ''}`
              : 'Relancer les règles'}
        </Button>
      </header>

      {analyzed === 0 && !enriching ? (
        <div className="h-80">
          <EmptyState
            icon={<Sparkles className="size-6" />}
            title="Analyse ta collection"
            text="Collection+ interroge Wikidata pour savoir ce que représente chaque carte (personne, film, ville, espèce…) et te propose des étiquettes en un clic. Les données restent en cache local."
            action={
              <Button onClick={analyze} disabled={!cards.length}>
                <Sparkles className="size-4" /> Lancer l'analyse
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">À valider · règles</h2>
              <AnimatePresence initial={false}>
                {pending.map((p) => (
                  <PendingRule key={p.rule.id} rule={p.rule} cards={p.cards} />
                ))}
              </AnimatePresence>
            </section>
          )}

          {[
            { title: 'Catalogue', items: catalogue },
            { title: 'Découvertes', items: discovery },
          ].map(
            (group) =>
              group.items.length > 0 && (
                <section key={group.title} className="space-y-3">
                  <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {group.title} · {group.items.length}
                  </h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                    <AnimatePresence initial={false} mode="popLayout">
                      {group.items.map((s) => (
                        <SuggestionCard key={s.key} suggestion={s} />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              ),
          )}

          {!suggestions.length && !pending.length && !enriching && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucune nouvelle suggestion : ta collection est bien rangée.
            </p>
          )}

          {rules.length > 0 && (
            <section className="space-y-3 pb-10">
              <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Règles · {rules.length}</h2>
              <div className="divide-y overflow-hidden rounded-2xl border bg-card">
                {rules.map((rule) => {
                  const tag = tags.find((t) => t.id === rule.tagId);
                  return (
                    <div key={rule.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: tag?.color ?? 'var(--muted-foreground)' }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tag?.name ?? 'Étiquette supprimée'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          Si {PROPS[rule.criterion.prop].toLowerCase()} = {rule.criterion.values.filter((q) => labels[q]).map((q) => labels[q]).slice(0, 3).join(', ') || 'renseigné'}
                          {rule.ignored.length > 0 && ` · ${rule.ignored.length} exclue(s)`}
                        </p>
                      </div>
                      <ModeToggle value={rule.mode} onChange={(mode) => setRuleMode(rule.id, mode)} />
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => deleteRule(rule.id)} title="Supprimer la règle">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
