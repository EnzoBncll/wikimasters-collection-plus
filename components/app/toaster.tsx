import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { useToasts } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const ICONS = { info: Info, success: CircleCheck, error: CircleAlert };

export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed top-16 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              onClick={() => dismiss(t.id)}
              className="pointer-events-auto flex cursor-pointer items-start gap-2.5 rounded-xl border bg-popover px-3.5 py-3 text-left text-sm text-popover-foreground shadow-lg"
            >
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  t.kind === 'success' && 'text-trade',
                  t.kind === 'error' && 'text-destructive',
                  t.kind === 'info' && 'text-primary',
                )}
              />
              <span>{t.text}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
