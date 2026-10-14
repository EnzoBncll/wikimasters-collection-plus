import { Copy, Heart, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCollection } from '@/hooks/use-collection';
import { planCard } from '@/lib/discard';
import { RARITY_ORDER, type OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { cardImage } from './card-image';
import { useCardViewer } from './card-viewer';
import { DiscardDialog } from './discard-dialog';
import { RARITY_BG } from './rarity';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const rank = (c: OwnedCard) => (c.rarity ? RARITY_ORDER.indexOf(c.rarity) : 99);

/**
 * « Mes doublons » : chaque carte en double, ses exemplaires protégés, et la défausse des exemplaires en trop
 * (un exemplaire gardé). Le choix reste local : pas d'étiquette Discard, qui voudrait dire « tout défausser ».
 */
export function DuplicatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cards, version } = useCollection();
  const [recap, setRecap] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pick = (list: OwnedCard[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const c of list) on ? next.add(c.cardId) : next.delete(c.cardId);
      return next;
    });

  const rows = useMemo(
    () =>
      cards
        .filter((c) => c.count > 1)
        .map((card) => ({ card, plan: planCard(card, card.copies, true), marked: picked.has(card.cardId) }))
        .sort((a, b) => b.plan.units.length - a.plan.units.length || rank(b.card) - rank(a.card) || a.card.title.localeCompare(b.card.title, 'fr')),
    [cards, version, picked], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const extra = rows.reduce((n, r) => n + r.plan.units.length, 0);
  const unmarked = rows.filter((r) => !r.marked && r.plan.units.length);
  const marked = rows.filter((r) => r.marked && r.plan.units.length);
  const markedUnits = marked.reduce((n, r) => n + r.plan.units.length, 0);


  return (
    <>
      <Dialog open={open && !recap} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[88vh] gap-4 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="size-5 text-primary" /> Mes doublons
            </DialogTitle>
            <DialogDescription>
              {rows.length
                ? `${plural(rows.length, 'carte')} en double · ${plural(extra, 'exemplaire')} en trop (shiny et favoris jamais comptés).`
                : 'Aucune carte en double pour l’instant.'}
            </DialogDescription>
          </DialogHeader>

          {rows.length > 0 && (
            <ul className="-mx-2 max-h-[52vh] space-y-1 overflow-y-auto px-2">
              {rows.map(({ card, plan, marked: isMarked }, i) => (
                <li key={card.cardId} className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2 transition', isMarked ? 'bg-discard/10' : 'bg-muted/60')}>
                  <button
                    type="button"
                    onClick={() => useCardViewer.getState().open(rows.map((r) => r.card), i)}
                    className="shrink-0 cursor-zoom-in"
                    title="Afficher en grand"
                  >
                    <img src={cardImage(card)} alt="" className="h-12 w-9 rounded-md object-cover shadow" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {card.rarity && <span className={cn('rounded px-1 text-[10px] font-bold text-zinc-900', RARITY_BG[card.rarity])}>{card.rarity}</span>}
                      <span className="truncate">{card.title}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="tabular-nums">×{card.count}</span>
                      {plan.protectedCount > 0 && (
                        <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400" title="Shiny ou favoris : jamais défaussés">
                          <Sparkles className="size-3" />
                          <Heart className="size-3" /> {plan.protectedCount}
                        </span>
                      )}
                      <span>{plan.units.length ? `${plan.units.length} en trop` : 'rien à défausser'}</span>
                    </p>
                  </div>
                  {plan.units.length > 0 &&
                    (isMarked ? (
                      <Button variant="ghost" size="sm" className="h-8 shrink-0 rounded-full text-xs" onClick={() => pick([card], false)}>
                        <Undo2 className="size-3.5" /> Retirer
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-full text-xs" onClick={() => pick([card], true)}>
                        <Trash2 className="size-3.5" /> −{plan.units.length}
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          )}

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <p className="self-center text-xs text-muted-foreground">
              {marked.length ? `${plural(markedUnits, 'exemplaire')} choisi${markedUnits > 1 ? 's' : ''} à défausser.` : 'Choisis des cartes, puis lance la défausse.'}
            </p>
            <div className="flex gap-2">
              {unmarked.length > 0 && (
                <Button variant="outline" onClick={() => pick(unmarked.map((r) => r.card), true)}>
                  <Trash2 className="size-4" /> Tout choisir ({unmarked.reduce((n, r) => n + r.plan.units.length, 0)})
                </Button>
              )}
              <Button variant="destructive" disabled={!marked.length} onClick={() => setRecap(true)}>
                Récapitulatif et défausse
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardDialog
        open={open && recap}
        tagChanges={0}
        cards={marked.map((r) => r.card)}
        keepOne
        onClose={() => {
          setRecap(false);
          setPicked(new Set());
        }}
      />
    </>
  );
}
