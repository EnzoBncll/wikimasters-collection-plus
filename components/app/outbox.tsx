import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, Undo2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCollection } from '@/hooks/use-collection';
import { getPalette } from '@/lib/palettes';
import { systemTagIds } from '@/lib/trade';
import type { TradeStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { TRADE_LABEL } from './trade-cart';

const SEND_LABEL = 'Envoi sur WikiMasters';
const DOT: Record<TradeStatus, string> = { trade: 'bg-trade', not_trade: 'bg-not-trade', discard: 'bg-discard', unset: 'border border-dashed border-muted-foreground' };

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Ce qui attend dans la boîte d'envoi, regroupé pour le volet. */
function useOutboxSummary() {
  const { pending, tagEdits, remoteTags, tags, tradeTags } = useCollection();
  return useMemo(() => {
    const system = systemTagIds(tradeTags);
    const statusOf: Record<string, TradeStatus> = {};
    if (tradeTags) {
      statusOf[tradeTags.trade.id] = 'trade';
      statusOf[tradeTags.notTrade.id] = 'not_trade';
      if (tradeTags.discard) statusOf[tradeTags.discard.id] = 'discard';
    }
    const statuses = new Map<TradeStatus, number>();
    const albums = new Map<string, { add: number; remove: number }>();
    for (const entry of Object.values(pending)) {
      const changes = Object.entries(entry);
      const added = changes.find(([id, on]) => on && system.has(id));
      if (added) statuses.set(statusOf[added[0]]!, (statuses.get(statusOf[added[0]]!) ?? 0) + 1);
      else if (changes.some(([id]) => system.has(id))) statuses.set('unset', (statuses.get('unset') ?? 0) + 1);
      for (const [id, on] of changes) {
        if (system.has(id)) continue;
        const a = albums.get(id) ?? { add: 0, remove: 0 };
        if (on) a.add++;
        else a.remove++;
        albums.set(id, a);
      }
    }
    const tagById = new Map(tags.map((t) => [t.id, t]));
    const edits = Object.entries(tagEdits).map(([id, e]) => ({ id, edit: e, before: remoteTags.find((t) => t.id === id) }));
    return {
      cards: Object.keys(pending).length,
      statuses: [...statuses.entries()],
      albums: [...albums.entries()].map(([id, n]) => ({ tag: tagById.get(id), ...n })).filter((a) => a.tag),
      edits,
      total: Object.keys(pending).length + edits.length,
    };
  }, [pending, tagEdits, remoteTags, tags, tradeTags]);
}

/**
 * Boîte d'envoi : poignée fixée au bord droit (nombre de modifications + envoi direct),
 * volet avec le détail, et pendant l'envoi un trait qui fait le tour du cadre.
 */
export function Outbox() {
  const { job, pushPending, discardPending } = useCollection();
  const summary = useOutboxSummary();
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const empty = summary.total === 0;

  useEffect(() => {
    if (!confirmDiscard) return;
    const t = setTimeout(() => setConfirmDiscard(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDiscard]);

  // Échap ferme le volet sans fermer ce qui est dessous (album…).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const send = () => {
    setOpen(false);
    pushPending();
  };

  return createPortal(
    <>
      <AnimatePresence>
        {(
          <motion.div
            key="handle"
            data-tour="outbox"
            initial={{ x: 60 }}
            animate={{ x: open ? -300 : 0 }}
            exit={{ x: 60 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="fixed top-1/2 right-0 z-[76] flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-2xl border border-r-0 bg-popover px-1.5 py-2 text-popover-foreground shadow-[-8px_0_24px_-14px_rgb(0_0_0/0.5)] md:right-2"
          >
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? 'Fermer la boîte d’envoi' : 'Ouvrir la boîte d’envoi'}
              title="Boîte d'envoi"
              className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg px-0.5 py-1 transition hover:bg-muted"
            >
              <span className="h-5 w-1 rounded-full bg-[repeating-linear-gradient(var(--muted-foreground)_0_2px,transparent_2px_5px)] opacity-60" />
              <span
                className={cn(
                  'grid h-5.5 min-w-6.5 place-items-center rounded-full px-1.5 text-xs font-bold tabular-nums',
                  empty ? 'bg-muted text-muted-foreground' : 'bg-amber-400 text-zinc-900',
                )}
              >
                {summary.total}
              </span>
            </button>
            <button
              type="button"
              onClick={send}
              disabled={Boolean(job) || empty}
              aria-label="Envoyer maintenant sur WikiMasters"
              title={empty ? 'Rien à envoyer' : 'Envoyer maintenant sur WikiMasters'}
              className="grid size-7.5 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground transition hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
            >
              <Check className="size-4" strokeWidth={3} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            key="drawer"
            aria-label="Boîte d'envoi"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="fixed top-14 right-0 bottom-0 z-[76] flex w-[300px] flex-col rounded-l-2xl border border-r-0 bg-popover text-popover-foreground shadow-[-20px_0_40px_-30px_rgb(0_0_0/0.8)] select-text md:right-2 md:bottom-2"
          >
            <header className="flex items-start justify-between gap-2 px-4 pt-4 pb-2.5">
              <div>
                <h3 className="font-heading font-bold">Boîte d'envoi</h3>
                <p className="text-xs text-muted-foreground">{empty ? 'Tout est à jour sur WikiMasters' : `${plural(summary.total, 'modification')} · pas encore sur WikiMasters`}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le volet"
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3 text-sm">
              {summary.statuses.length > 0 && (
                <Group title="Statuts" count={summary.statuses.reduce((n, [, c]) => n + c, 0)}>
                  {summary.statuses.map(([status, n]) => (
                    <li key={status} className="flex items-center gap-2">
                      <span className={cn('size-2 shrink-0 rounded-full', DOT[status])} />
                      {TRADE_LABEL[status]}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{n}</span>
                    </li>
                  ))}
                </Group>
              )}
              {summary.albums.length > 0 && (
                <Group title="Albums" count={summary.albums.reduce((n, a) => n + a.add + a.remove, 0)}>
                  {summary.albums.flatMap(({ tag, add, remove }) =>
                    [add && { sign: '+', n: add }, remove && { sign: '−', n: remove }].filter(Boolean).map((row) => {
                      const { sign, n } = row as { sign: string; n: number };
                      return (
                        <li key={`${tag!.id}${sign}`} className="flex min-w-0 items-center gap-2">
                          <span className={cn('w-3 shrink-0 font-bold', sign === '+' ? 'text-trade' : 'text-not-trade')}>{sign}</span>
                          <span className="truncate">{tag!.name}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{plural(n, 'carte')}</span>
                        </li>
                      );
                    }),
                  )}
                </Group>
              )}
              {summary.edits.length > 0 && (
                <Group title="Étiquettes" count={summary.edits.length}>
                  {summary.edits.map(({ id, edit, before }) => (
                    <li key={id} className="flex min-w-0 items-center gap-1.5">
                      {edit.color !== undefined && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: edit.color }} />}
                      {edit.name !== undefined ? (
                        <>
                          <span className="truncate text-muted-foreground line-through">{before?.name ?? '?'}</span>→<span className="truncate font-medium">{edit.name}</span>
                        </>
                      ) : (
                        <span className="truncate">{before?.name ?? '?'} · couleur</span>
                      )}
                    </li>
                  ))}
                </Group>
              )}
              {empty ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  Rien à envoyer. Les changements de statut, d'étiquettes et d'albums s'accumulent ici avant d'être envoyés d'un coup.
                </p>
              ) : (
                <p className="px-1 text-xs text-muted-foreground">Envoi calme, une requête à la fois.</p>
              )}
            </div>
            <footer className="flex gap-2 border-t p-3">
              <button
                type="button"
                disabled={empty}
                onClick={() => (confirmDiscard ? (discardPending(), setConfirmDiscard(false)) : setConfirmDiscard(true))}
                title="Annuler toutes les modifications en attente"
                className={cn(
                  'flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition disabled:cursor-default disabled:opacity-40',
                  confirmDiscard ? 'bg-destructive text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Undo2 className="size-4" /> {confirmDiscard ? 'Sûr ?' : 'Tout annuler'}
              </button>
              <button
                type="button"
                onClick={send}
                disabled={Boolean(job) || empty}
                className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                <Check className="size-4" strokeWidth={3} /> Envoyer
              </button>
            </footer>
          </motion.aside>
        )}
      </AnimatePresence>

      <SendOverlay />
    </>,
    document.body,
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <h4 className="mb-1.5 flex justify-between text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title} <span className="tabular-nums">{count}</span>
      </h4>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

/** Débord du tracé d'envoi à l'intérieur du contenu, en pixels. */
const INWARD = 3;

const box = (el: Element | null) => {
  if (!el || !el.getClientRects().length) return null;
  return el.getBoundingClientRect();
};

/**
 * Contour de la zone de contenu, encoches comprises, dans le sens horaire à partir du milieu du bas de l'encoche centrale.
 * Coordonnées de la fenêtre. Null si le cadre n'est pas affiché.
 */
function notchOutline(): string | null {
  const content = box(document.querySelector('[data-notch-content]'));
  const centerEl = [...document.querySelectorAll('[data-notch="center"]')].find((el) => el.getClientRects().length);
  const center = box(centerEl ?? null);
  if (!content || !center) return null;
  const left = box(document.querySelector('[data-notch="left"]'));
  const right = box(document.querySelector('[data-notch="right"]'));
  const { left: L, top: T, right: R, bottom: B } = content;
  const rc = parseFloat(getComputedStyle(document.querySelector('[data-notch-content]')!).borderTopLeftRadius) || 0;
  const w = centerEl?.querySelector('svg')?.getBoundingClientRect().width || 16;
  const rn = 24;
  const cx = (center.left + center.right) / 2;
  const arc = (r: number, x: number, y: number, sweep: 0 | 1) => `A ${r} ${r} 0 0 ${sweep} ${x} ${y}`;
  const d: string[] = [`M ${cx} ${center.bottom}`];

  // Moitié droite de l'encoche centrale, puis le haut jusqu'au bord droit.
  d.push(`H ${center.right - rn}`, arc(rn, center.right, center.bottom - rn, 0), `V ${T + w}`, arc(w, center.right + w, T, 1));
  if (right) {
    d.push(`H ${right.left - w}`, arc(w, right.left, T + w, 1), `V ${right.bottom - rn}`, arc(rn, right.left + rn, right.bottom, 0));
    d.push(`H ${R - w}`, arc(w, R, right.bottom + w, 1));
  } else {
    d.push(`H ${R - rc}`, rc ? arc(rc, R, T + rc, 1) : '');
  }
  // Côté droit, bas, côté gauche.
  d.push(`V ${B - rc}`, rc ? arc(rc, R - rc, B, 1) : '', `H ${L + rc}`, rc ? arc(rc, L, B - rc, 1) : '');
  if (left) {
    d.push(`V ${left.bottom + w}`, arc(w, L + w, left.bottom, 1), `H ${left.right - rn}`, arc(rn, left.right, left.bottom - rn, 0));
    d.push(`V ${T + w}`, arc(w, left.right + w, T, 1));
  } else {
    d.push(`V ${T + rc}`, rc ? arc(rc, L + rc, T, 1) : '');
  }
  // Retour par la moitié gauche de l'encoche centrale.
  d.push(`H ${center.left - w}`, arc(w, center.left, T + w, 1), `V ${center.bottom - rn}`, arc(rn, center.left + rn, center.bottom, 0), 'Z');
  return d.filter(Boolean).join(' ');
}

/** Pendant l'envoi : voile sur le contenu et trait irisé qui fait le tour du cadre au rythme des lots envoyés. */
function SendOverlay() {
  const job = useCollection((s) => s.job);
  const palette = useCollection((s) => s.settings.palette);
  const sending = job?.label === SEND_LABEL;
  const [phase, setPhase] = useState<'idle' | 'sending' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [path, setPath] = useState<string | null>(null);
  /** Épaisseur du cadre noir autour du contenu (0 sur petit écran). */
  const [frame, setFrame] = useState(8);

  useEffect(() => {
    if (sending) {
      setPhase('sending');
      setProgress(job!.total ? job!.done / job!.total : 0);
      return;
    }
    if (phase !== 'sending') return;
    setProgress(1);
    setPhase('done');
    const t = setTimeout(() => setPhase('idle'), 1100);
    return () => clearTimeout(t);
  }, [sending, job?.done, job?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (phase === 'idle') return;
    const measure = () => {
      setSize({ w: window.innerWidth, h: window.innerHeight });
      setPath(notchOutline());
      setFrame(document.querySelector('[data-notch-content]')?.getBoundingClientRect().left ?? 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [phase === 'idle']); // eslint-disable-line react-hooks/exhaustive-deps

  const iri = getPalette(palette).icon.iri;
  // Assez large pour couvrir tout le noir : le cadre jusqu'au bord de la fenêtre et les encoches sur toute leur hauteur.
  // Le masque coupe ce qui déborde à l'intérieur du contenu.
  const band = 2 * Math.max(frame + 12, 56);
  const fallback = `M ${size.w / 2} 0 H ${size.w} V ${size.h} H 0 V 0 Z`;
  const d = path ?? fallback;

  return (
    <AnimatePresence>
      {phase !== 'idle' && (
        <motion.div
          key="send-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[95] cursor-progress select-none"
          aria-live="polite"
        >
          <div className="absolute inset-0 bg-[rgb(5_4_12/0.82)] backdrop-blur-[3px]" style={{ clipPath: `path('${d}')` }} />
          <svg className="absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
            <defs>
              <linearGradient id="outbox-holo" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size.w} y2={size.h}>
                {iri.map((c, i) => (
                  <stop key={i} offset={i / (iri.length - 1)} stopColor={c} />
                ))}
              </linearGradient>
            </defs>
            {/* Le tracé recouvre tout le cadre noir (encoches comprises) et déborde de quelques pixels vers l'intérieur. */}
            <mask id="outbox-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={size.w} height={size.h}>
              <rect width={size.w} height={size.h} fill="white" />
              <path d={d} fill="black" />
              <path d={d} fill="none" stroke="white" strokeWidth={INWARD * 2} />
            </mask>
            <g mask="url(#outbox-mask)">
              <path d={d} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth={band} />
              {progress > 0 && (
                <motion.path
                  d={d}
                  fill="none"
                  stroke="url(#outbox-holo)"
                  pathLength={1}
                  // Tracé complet : sans pointillés, pour ne pas laisser de jointure au point de départ.
                  strokeDasharray={progress >= 1 ? undefined : '1 1'}
                  strokeWidth={band}
                  initial={{ strokeDashoffset: 1, opacity: 1 }}
                  animate={{ strokeDashoffset: progress >= 1 ? 0 : 1 - progress, opacity: phase === 'done' ? [1, 0.55, 1] : 1 }}
                  transition={{ strokeDashoffset: { duration: 0.35, ease: [0.4, 0.1, 0.2, 1] }, opacity: { duration: 0.7 } }}
                />
              )}
            </g>
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center text-white">
            <div>
              <p className="font-heading text-3xl font-bold tabular-nums">{phase === 'done' ? '✓' : `${Math.round(progress * 100)} %`}</p>
              <p className="mt-1 text-sm text-white/60 tabular-nums">
                {phase === 'done' ? 'Envoyé sur WikiMasters' : job ? `Envoi sur WikiMasters · lot ${job.done}/${job.total}` : 'Envoi sur WikiMasters…'}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
