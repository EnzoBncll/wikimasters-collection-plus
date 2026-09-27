import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck, Tags, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCollection } from '@/hooks/use-collection';
import { useReview } from '@/hooks/use-review';
import type { OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { TagPicker } from './tag-picker';

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="hidden rounded border border-zinc-700 px-1 font-sans text-[10px] text-zinc-400 lg:inline dark:border-zinc-400 dark:text-zinc-600">{children}</kbd>;
}

const barButton =
  'flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors hover:bg-zinc-800 disabled:cursor-default disabled:opacity-40 dark:hover:bg-zinc-300';

/** Barre d'actions flottante, visible dès qu'une carte est sélectionnée ou qu'un étiquetage tourne. */
export function SelectionBar({ targets, visible }: { targets: OwnedCard[]; visible: OwnedCard[] }) {
  const { setTrade, job } = useCollection();
  const { selected, set, tagPickerOpen } = useReview();
  const setTagsOpen = (tagPickerOpen: boolean) => set({ tagPickerOpen });
  const show = selected.size > 0 || Boolean(job);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2"
        >
          <div className="relative flex items-center gap-1 overflow-hidden rounded-full bg-zinc-950 p-1.5 text-zinc-50 shadow-2xl ring-1 ring-white/10 dark:bg-zinc-200 dark:text-zinc-950 dark:ring-black/10">
            {job ? (
              <div className="flex h-9 min-w-72 items-center gap-3 px-4 text-sm">
                <span className="font-medium">{job.label}…</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800 dark:bg-zinc-300">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-zinc-400 dark:text-zinc-600">
                  {job.done}/{job.total}
                </span>
              </div>
            ) : (
              <>
                <button type="button" className={cn(barButton, 'pr-2')} onClick={() => set({ selected: new Set() })} title="Désélectionner (Échap)">
                  <X className="size-4" />
                  <span className="tabular-nums">{selected.size}</span>
                  <span className="hidden sm:inline">sélectionnée{selected.size > 1 ? 's' : ''}</span>
                </button>
                <span className="mx-1 h-5 w-px bg-zinc-800 dark:bg-zinc-300" />
                <button type="button" className={barButton} onClick={() => setTrade(targets, 'trade')}>
                  <span className="size-2 rounded-full bg-trade" /> Trade <Kbd>T</Kbd>
                </button>
                <button type="button" className={barButton} onClick={() => setTrade(targets, 'not_trade')}>
                  <span className="size-2 rounded-full bg-not-trade" /> Not Trade <Kbd>N</Kbd>
                </button>
                <Popover open={tagPickerOpen} onOpenChange={setTagsOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" className={barButton}>
                      <Tags className="size-4" /> Étiqueter <Kbd>E</Kbd>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="center" sideOffset={12} className="w-auto p-0">
                    <TagPicker cards={targets} onDone={() => setTagsOpen(false)} />
                  </PopoverContent>
                </Popover>
                <span className="mx-1 h-5 w-px bg-zinc-800 dark:bg-zinc-300" />
                <button
                  type="button"
                  className={barButton}
                  onClick={() => set({ selected: new Set(visible.map((c) => c.cardId)) })}
                  disabled={selected.size === visible.length}
                  title="Tout sélectionner (A)"
                >
                  <CheckCheck className="size-4" /> <span className="hidden md:inline">Tout</span> <Kbd>A</Kbd>
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
