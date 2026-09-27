import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { useCollection } from '@/hooks/use-collection';
import { formatAcquiredAt, fullDate, SOURCE_LABEL } from '@/lib/acquisitions';
import { RARITY_LABEL, type OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { WmCard } from './wm-card';

interface ViewerState {
  cards: OwnedCard[];
  index: number | null;
  /** Ouvre la carte `index` de `cards` en grand (les flèches parcourent `cards`). */
  open: (cards: OwnedCard[], index: number) => void;
  close: () => void;
  go: (delta: number) => void;
}

export const useCardViewer = create<ViewerState>((set, get) => ({
  cards: [],
  index: null,
  open: (cards, index) => set({ cards, index }),
  close: () => set({ index: null }),
  go: (delta) => {
    const { index, cards } = get();
    if (index === null) return;
    set({ index: Math.max(0, Math.min(cards.length - 1, index + delta)) });
  },
}));

const STATUS = { trade: ['Trade', 'bg-trade'], not_trade: ['Not Trade', 'bg-not-trade'], unset: ['Sans statut', 'bg-zinc-500'] } as const;
const nf = new Intl.NumberFormat('fr-FR');

/** Carte affichée en grand, avec ses informations ; ← → pour parcourir, Échap pour fermer. */
export function CardViewer() {
  const { cards, index, close, go } = useCardViewer();
  const { tags, tradeTags, statusOf } = useCollection();
  const card = index !== null ? cards[index] : undefined;
  const [dir, setDir] = useState(0);
  const [size, setSize] = useState(360);

  useEffect(() => {
    const fit = () => setSize(Math.round(Math.max(220, Math.min(460, ((window.innerHeight - 140) * 5) / 7, window.innerWidth - 80))));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!card) return;
    // En capture : passe avant les raccourcis de la Revue et de l'album.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') (setDir(1), go(1));
      else if (e.key === 'ArrowLeft') (setDir(-1), go(-1));
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [card, close, go]);

  const systemIds = new Set(tradeTags ? [tradeTags.trade.id, tradeTags.notTrade.id] : []);
  const cardTags = card ? tags.filter((t) => card.tagIds.includes(t.id) && !systemIds.has(t.id)) : [];
  const status = card ? STATUS[statusOf(card)] : null;
  // Exemplaires du plus récent au plus ancien ; les exemplaires sans date sont regroupés en un seul.
  const copies = Object.values(card?.acquired ?? {});
  const dated = copies.filter((a) => a.at || a.source).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const acquisitions = [...dated.slice(0, 5), ...(copies.length > dated.length ? [{ at: null, source: null, estimated: false }] : [])];

  return createPortal(
    <AnimatePresence>
      {card && index !== null && (
        <motion.div
          key="viewer"
          initial={(window as { __collectionPlusStatic?: boolean }).__collectionPlusStatic ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center gap-10 bg-black/80 p-6 backdrop-blur-md"
          onPointerDown={(e) => e.target === e.currentTarget && close()}
        >
          <button
            type="button"
            onClick={() => (setDir(-1), go(-1))}
            disabled={index === 0}
            aria-label="Carte précédente"
            className="absolute left-5 flex size-12 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-20"
          >
            <ChevronLeft className="size-6" />
          </button>

          <AnimatePresence mode="popLayout" custom={dir}>
            <motion.div
              key={card.cardId}
              initial={(window as { __collectionPlusStatic?: boolean }).__collectionPlusStatic ? false : { opacity: 0, x: dir * 60, rotateY: dir * 25, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1 }}
              exit={{ opacity: 0, x: dir * -60, rotateY: dir * -25, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              style={{ width: size, perspective: 1200 }}
              className="shrink-0"
            >
              <WmCard card={card} className="w-full shadow-[0_40px_80px_-20px_rgb(0_0_0/0.8)]" />
            </motion.div>
          </AnimatePresence>

          <div className="hidden w-72 shrink-0 flex-col gap-4 text-white md:flex">
            <div>
              {card.rarity && (
                <p className="text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: `var(--rarity-${card.rarity.toLowerCase()})` }}>
                  {RARITY_LABEL[card.rarity]}
                </p>
              )}
              <h2 className="mt-1 text-2xl leading-tight font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                {card.title}
              </h2>
              {card.description && <p className="mt-1 text-sm text-white/70">{card.description}</p>}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/10 p-3">
                <dt className="text-xs text-white/60">Exemplaires</dt>
                <dd className="text-lg font-semibold tabular-nums">{card.count ? `×${card.count}` : 'Pas encore'}</dd>
              </div>
              {status && card.count > 0 && (
                <div className="rounded-xl bg-white/10 p-3">
                  <dt className="text-xs text-white/60">Statut</dt>
                  <dd className="flex items-center gap-1.5 font-semibold">
                    <span className={cn('size-2 rounded-full', status[1])} /> {status[0]}
                  </dd>
                </div>
              )}
              {card.attack != null && (
                <div className="rounded-xl bg-white/10 p-3">
                  <dt className="text-xs text-white/60">Attaque</dt>
                  <dd className="text-lg font-semibold tabular-nums">{nf.format(card.attack)}</dd>
                </div>
              )}
              {card.defense != null && (
                <div className="rounded-xl bg-white/10 p-3">
                  <dt className="text-xs text-white/60">Défense</dt>
                  <dd className="text-lg font-semibold tabular-nums">{nf.format(card.defense)}</dd>
                </div>
              )}
            </dl>
            {acquisitions.length > 0 && (
              <div className="rounded-xl bg-white/10 p-3 text-sm">
                <p className="text-xs text-white/60">Obtenue</p>
                <ul className="mt-1 space-y-1">
                  {acquisitions.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-2" title={a.estimated ? 'Heure déduite de ton activité sur le site' : undefined}>
                      <span className="font-medium" title={a.at ? fullDate(a.at) : undefined}>
                        {a.at ? formatAcquiredAt(a.at, a.estimated) : 'Avant l’installation'}
                      </span>
                      {a.source && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">{SOURCE_LABEL[a.source]}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {cardTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {cardTags.map((t) => (
                  <span key={t.id} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs">
                    <span className="size-2 rounded-full" style={{ backgroundColor: t.color ?? '#a1a1aa' }} /> {t.name}
                  </span>
                ))}
              </div>
            )}
            {card.wikipediaUrl && (
              <a
                href={card.wikipediaUrl}
                target="_blank"
                rel="noopener"
                className="flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-white/90"
              >
                Lire sur Wikipédia <ExternalLink className="size-4" />
              </a>
            )}
            <p className="text-xs text-white/50 tabular-nums">
              {index + 1} / {cards.length} · ← → pour parcourir
            </p>
          </div>

          <button
            type="button"
            onClick={() => (setDir(1), go(1))}
            disabled={index >= cards.length - 1}
            aria-label="Carte suivante"
            className="absolute right-5 flex size-12 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-20"
          >
            <ChevronRight className="size-6" />
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="absolute top-5 right-5 flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
