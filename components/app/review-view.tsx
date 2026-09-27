import { CheckCircle2, Loader2, PanelLeft, Search, SearchX, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/hooks/use-collection';
import { useCardViewer } from './card-viewer';
import { hasActiveFilters, useReview, useVisibleCards, type SortKey } from '@/hooks/use-review';
import { cn } from '@/lib/utils';
import { CardGrid, type CardGridHandle } from './card-grid';
import { FilterSidebar } from './filter-sidebar';
import { PendingPanel } from './pending-panel';
import { SelectionBar } from './selection-bar';

const SORT_LABEL: Record<SortKey, string> = { rarity: 'Rareté', date: 'Date d’obtention', title: 'Titre', count: 'Exemplaires' };

export function ReviewView() {
  const { ready, cards, newIds, error, setTrade, validateReview, syncing } = useCollection();
  const review = useReview();
  const visible = useVisibleCards();
  const gridRef = useRef<CardGridHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // La sélection ne garde que les cartes encore visibles.
  useEffect(() => {
    const ids = new Set(visible.map((c) => c.cardId));
    const { selected, focus } = useReview.getState();
    const kept = new Set([...selected].filter((id) => ids.has(id)));
    if (kept.size !== selected.size) review.set({ selected: kept });
    if (focus >= visible.length) review.set({ focus: Math.max(0, visible.length - 1) });
  }, [visible]);

  const targets = useMemo(() => {
    if (review.selected.size) return visible.filter((c) => review.selected.has(c.cardId));
    const focused = visible[review.focus];
    return focused ? [focused] : [];
  }, [visible, review.selected, review.focus]);

  // Raccourcis clavier.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
      const state = useReview.getState();
      if (e.key === 'Escape') {
        if (typing) el.blur();
        else if (state.tagPickerOpen) return;
        else state.set({ selected: new Set() });
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || state.tagPickerOpen) return;

      const cols = gridRef.current?.columns ?? 1;
      const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      const key = e.key.toLowerCase();

      if (e.key in moves) {
        const next = Math.max(0, Math.min(visible.length - 1, state.focus + moves[e.key]!));
        if (e.shiftKey) {
          const sel = new Set(state.selected);
          [state.focus, next].forEach((i) => visible[i] && sel.add(visible[i]!.cardId));
          state.set({ selected: sel });
        }
        state.set({ focus: next });
        gridRef.current?.scrollToIndex(next);
      } else if (e.key === ' ') {
        const card = visible[state.focus];
        if (!card) return;
        const sel = new Set(state.selected);
        if (sel.has(card.cardId)) sel.delete(card.cardId);
        else sel.add(card.cardId);
        state.set({ selected: sel, anchor: state.focus });
      } else if (e.key === 'Enter') {
        if (visible[state.focus]) useCardViewer.getState().open(visible, state.focus);
      } else if (key === 't') setTrade(targets, 'trade');
      else if (key === 'n') setTrade(targets, 'not_trade');
      else if (key === 'e' && targets.length) {
        if (!state.selected.size && targets[0]) state.set({ selected: new Set([targets[0].cardId]) });
        state.set({ tagPickerOpen: true });
      } else if (key === 'a') state.set({ selected: new Set(visible.map((c) => c.cardId)) });
      else if (e.key === '/') searchRef.current?.focus();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, targets, setTrade]);

  return (
    <div className="flex h-full w-full">
      <FilterSidebar className={cn('hidden lg:flex', !sidebarOpen && 'lg:hidden')} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-9 lg:inline-flex"
            onClick={() => setSidebarOpen((o) => !o)}
            title="Afficher / masquer les filtres"
          >
            <PanelLeft className="size-4" />
          </Button>
          <div className="relative w-full max-w-sm min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={review.query}
              onChange={(e) => review.set({ query: e.target.value })}
              placeholder="Rechercher une carte…"
              className="h-9 rounded-full pr-9 pl-9"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground">/</kbd>
          </div>

          <Button
            variant={review.onlyNew ? 'default' : 'outline'}
            size="sm"
            className="h-9 rounded-full"
            onClick={() => review.set({ onlyNew: !review.onlyNew })}
          >
            <Sparkles className="size-3.5" />
            Nouvelles
            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', review.onlyNew ? 'bg-primary-foreground/20' : 'bg-muted')}>
              {newIds.size}
            </span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 rounded-full">
                Tri : {SORT_LABEL[review.sort]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup value={review.sort} onValueChange={(v) => review.set({ sort: v as SortKey })}>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <DropdownMenuRadioItem key={k} value={k}>
                    {SORT_LABEL[k]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-3">
            <PendingPanel compact className={cn(sidebarOpen && 'lg:hidden')} />
            <span className="text-sm text-muted-foreground tabular-nums">
              {visible.length === cards.length ? `${cards.length} cartes` : `${visible.length} / ${cards.length}`}
            </span>
            {newIds.size > 0 && (
              <Button size="sm" className="h-9 rounded-full" onClick={validateReview} title="Toutes les cartes actuelles ne seront plus « nouvelles »">
                <CheckCircle2 className="size-4" /> Valider la revue
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {!ready || (syncing && !cards.length) ? (
            <EmptyState icon={<Loader2 className="size-6 animate-spin" />} title="Chargement de ta collection…" text="Le premier chargement lit toutes les pages ; les suivants sont instantanés." />
          ) : error && !cards.length ? (
            <EmptyState icon={<SearchX className="size-6" />} title="Impossible de charger la collection" text={`${error} — ouvre un onglet WikiMasters connecté puis ↻.`} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-6" />}
              title="Aucune carte ne correspond"
              text="Essaie d'élargir les filtres."
              action={hasActiveFilters(review) && <Button variant="outline" size="sm" onClick={review.resetFilters}>Réinitialiser les filtres</Button>}
            />
          ) : (
            <CardGrid ref={gridRef} cards={visible} />
          )}
        </div>

        <SelectionBar targets={targets} visible={visible} />
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action}
    </div>
  );
}
