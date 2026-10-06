import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ExternalLink, Tags, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { create } from 'zustand';
import { useCollection } from '@/hooks/use-collection';
import { formatAcquiredAt, fullDate, SOURCE_LABEL } from '@/lib/acquisitions';
import { RARITY_LABEL, type OwnedCard } from '@/lib/types';
import { systemTagIds } from '@/lib/trade';
import { condense, wikiIntro } from '@/lib/wiki-intro';
import { cn } from '@/lib/utils';
import { TagPicker } from './tag-picker';
import { TRADE_LABEL, TradeCart, tradeDotClass } from './trade-cart';
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

const nf = new Intl.NumberFormat('fr-FR');

const WIKI_PANEL_KEY = 'collectionPlus.wikiPanel';

function WikiMark({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-4.5 shrink-0 place-items-center rounded-[5px] bg-white font-serif text-xs font-bold text-black', className)} aria-hidden="true">
      W
    </span>
  );
}

/** À gauche de la carte : condensé de l'introduction Wikipédia, dépliable, et lien vers l'article. Repliable en languette. */
function WikiPanel({ url }: { url: string }) {
  const [intro, setIntro] = useState<string | null | undefined>(undefined);
  const [full, setFull] = useState(false);
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(WIKI_PANEL_KEY) === 'closed';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let alive = true;
    setIntro(undefined);
    setFull(false);
    wikiIntro(url)
      .then((text) => alive && setIntro(text))
      .catch(() => alive && setIntro(null));
    return () => {
      alive = false;
    };
  }, [url]);

  const fold = (next: boolean) => {
    setClosed(next);
    try {
      localStorage.setItem(WIKI_PANEL_KEY, next ? 'closed' : 'open');
    } catch {}
  };

  if (closed) {
    return (
      <button
        type="button"
        onClick={() => fold(false)}
        aria-label="Déplier l'encart Wikipédia"
        title="Déplier l'encart Wikipédia"
        className="hidden shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl bg-white/[0.07] px-1.5 py-2.5 text-white/60 transition hover:bg-white/15 hover:text-white lg:flex"
      >
        <WikiMark />
        <span className="rotate-180 text-[10.5px] font-semibold tracking-[0.14em] uppercase [writing-mode:vertical-rl]">Wikipédia</span>
      </button>
    );
  }

  const short = intro ? condense(intro) : '';
  const more = Boolean(intro && intro.length > short.length + 20);
  return (
    <div className="hidden w-49 shrink-0 flex-col text-white lg:flex">
      <div className="mb-2 flex items-center gap-2">
        <WikiMark />
        <span className="text-[10px] font-semibold tracking-[0.14em] text-white/50 uppercase">Wikipédia</span>
        <button
          type="button"
          onClick={() => fold(true)}
          aria-label="Replier l'encart"
          title="Replier"
          className="ml-auto grid size-5.5 cursor-pointer place-items-center rounded-md text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      </div>
      {intro === undefined ? (
        <div className="space-y-1.5 border-l-2 border-white/10 pl-2.5" aria-label="Chargement">
          {[100, 92, 97, 60].map((w) => (
            <div key={w} className="h-2.5 animate-pulse rounded bg-white/10" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        intro && (
          <div className={cn('space-y-1.5 border-l-2 border-white/10 pl-2.5 text-[11.5px] leading-relaxed text-white/80 select-text', full && 'max-h-[min(340px,45vh)] overflow-y-auto pr-1')}>
            {(full ? intro.split('\n') : [short]).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )
      )}
      {more && (
        <button type="button" onClick={() => setFull((f) => !f)} className="mt-2 cursor-pointer self-start pl-3 text-[11px] font-semibold text-primary hover:underline">
          {full ? 'Réduire' : "Toute l'intro"}
        </button>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener"
        className="mt-3 flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-white/90"
      >
        Lire sur Wikipédia <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}

/** Carte affichée en grand, avec ses informations ; ← → pour parcourir, Échap pour fermer. */
export function CardViewer() {
  const { cards, index, close, go } = useCardViewer();
  const { tags, tradeTags, explicitOf, cycleTrade, pending, cards: current } = useCollection();
  // La liste parcourue est figée à l'ouverture : on relit la carte à jour (étiquettes en attente comprises).
  const listed = index !== null ? cards[index] : undefined;
  const card = (listed && current.find((c) => c.cardId === listed.cardId)) ?? listed;
  const [tagsOpen, setTagsOpen] = useState(false);
  const [dir, setDir] = useState(0);
  const [size, setSize] = useState(360);

  useEffect(() => {
    // Place des colonnes : infos (dès md), encart Wikipédia (dès lg).
    const fit = () => {
      const w = window.innerWidth;
      const side = (w >= 768 ? 330 : 0) + (w >= 1024 ? 236 : 0);
      setSize(Math.round(Math.max(220, Math.min(460, ((window.innerHeight - 140) * 5) / 7, w - 140 - side))));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!card) return;
    // En capture : passe avant les raccourcis de la Revue et de l'album.
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        if (document.querySelector('[data-slot="popover-content"]')) return;
        close();
      }
      else if (e.key === 'ArrowRight') (setDir(1), go(1));
      else if (e.key === 'ArrowLeft') (setDir(-1), go(-1));
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [card, close, go]);

  const systemIds = systemTagIds(tradeTags);
  const cardTags = card ? tags.filter((t) => card.tagIds.includes(t.id) && !systemIds.has(t.id)) : [];
  const status = card ? explicitOf(card) : 'unset';
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

          {card.wikipediaUrl && <WikiPanel url={card.wikipediaUrl} />}

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
              {card.count > 0 && (
                <div className="rounded-xl bg-white/10 p-3">
                  <dt className="text-xs text-white/60">Statut</dt>
                  <dd>
                    <button
                      type="button"
                      onClick={() => cycleTrade(card)}
                      title="Cliquer pour changer"
                      className="mt-0.5 flex cursor-pointer items-center gap-2 font-semibold transition hover:opacity-80"
                    >
                      <span className={cn('flex size-6 items-center justify-center rounded-full', tradeDotClass[status])}>
                        <TradeCart status={status} className="size-3" />
                      </span>
                      {TRADE_LABEL[status]}
                      {card.cardId in pending && <span className="size-1.5 rounded-full bg-amber-400" title="Pas encore envoyé" />}
                    </button>
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
            {card.count > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {cardTags.map((t) => (
                  <span key={t.id} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs">
                    <span className="size-2 rounded-full" style={{ backgroundColor: t.color ?? '#a1a1aa' }} /> {t.name}
                  </span>
                ))}
                <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-white/30 px-2.5 py-1 text-xs text-white/80 transition hover:border-white/60 hover:bg-white/10 hover:text-white"
                    >
                      <Tags className="size-3.5" /> {cardTags.length ? 'Modifier' : 'Ajouter des étiquettes'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="start" className="z-[100] w-auto p-0">
                    <TagPicker cards={[card]} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {card.wikipediaUrl && (
              <a
                href={card.wikipediaUrl}
                target="_blank"
                rel="noopener"
                className="flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-white/90 lg:hidden"
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
