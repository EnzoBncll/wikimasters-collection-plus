import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCollection } from '@/hooks/use-collection';
import { albumLayoutsItem, pageCount, reconcileSlots, SLOTS_PER_PAGE, swapSlots } from '@/lib/album';
import { RARITY_LABEL, type OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlbumWishes } from './album-wishes';
import { ALBUM_STYLE_IDS, ALBUM_STYLES, type AlbumStyle } from './album-styles';
import { BrandIcon } from './brand-icon';
import { useCardViewer } from './card-viewer';
import { WmCard } from './wm-card';

/** Contenu d'une face : une page de l'album, la couverture, une page blanche ou rien (livre fermé). */
type Face = number | 'cover' | 'none';

interface Leaf {
  /** 1 : la page de droite tourne vers la gauche ; -1 : l'inverse. */
  dir: 1 | -1;
  /** Ouverture de la couverture (premier affichage). */
  opening?: boolean;
}

interface Drag {
  slot: number;
  cardId: string;
  x: number;
  y: number;
}

const FLIP = { duration: 0.75, ease: [0.3, 0.7, 0.2, 1] } as const;
const EDGE = 44;

/** Petite inclinaison stable par carte, comme une vignette collée à la main. */
function tilt(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.7;
}

/** Vignette collée : la carte au style WikiMasters, sans inclinaison (le reflet holo reste au survol). */
function Sticker({ card, lifted }: { card: OwnedCard; lifted?: boolean }) {
  return (
    <WmCard
      card={card}
      tilt={false}
      className={cn('mx-auto h-full w-auto max-w-full', lifted && 'shadow-[0_18px_40px_rgb(0_0_0/0.5)]')}
      fallbackFooter={<span className="text-black/60">{card.rarity ? RARITY_LABEL[card.rarity] : 'Carte'}</span>}
      badges={
        card.count > 1 && (
          <span className="rounded-[2.5cqw] bg-black/60 px-[2.5cqw] py-[1.2cqw] text-[5.5cqw] leading-none font-bold text-white">×{card.count}</span>
        )
      }
    />
  );
}

function Page({
  face,
  side,
  slots,
  cards,
  title,
  gradient,
  total,
  drag,
  over,
  palette,
  look,
}: {
  face: Face;
  side: 'left' | 'right';
  slots: (string | null)[];
  cards: Map<string, OwnedCard>;
  title: string;
  gradient: string;
  total: number;
  drag: Drag | null;
  over: number | null;
  palette: ReturnType<typeof useCollection.getState>['settings']['palette'];
  look: AlbumStyle;
}) {
  if (face === 'none') return null;

  if (face === 'cover') {
    return (
      <div className="absolute inset-0 overflow-hidden rounded-r-[calc(var(--u)*3)] rounded-l-[calc(var(--u)*1)] text-white shadow-2xl" style={look.cover(gradient)}>
        <div className="absolute inset-y-0 left-0 w-[calc(var(--u)*4)] bg-black/25" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_10%,rgb(255_255_255/0.2),transparent_60%)]" />
        <div className="relative flex h-full flex-col items-center justify-center gap-[calc(var(--u)*4)] px-[calc(var(--u)*10)] text-center">
          <p className="text-[calc(var(--u)*3.2)] font-semibold tracking-[0.3em] uppercase opacity-80">Album</p>
          <h2 className={cn('text-[calc(var(--u)*8.5)] leading-none drop-shadow-md', look.coverTitle)}>{title}</h2>
          <div className="h-[calc(var(--u)*1)] w-1/2 rounded-full bg-holo" />
          <p className="text-[calc(var(--u)*3.4)] font-medium opacity-90">{slots.filter(Boolean).length} vignettes</p>
          <BrandIcon palette={palette} className="mt-[calc(var(--u)*6)] size-[calc(var(--u)*14)] drop-shadow-xl" />
        </div>
      </div>
    );
  }

  const exists = face < total;
  const first = face * SLOTS_PER_PAGE;
  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', look.page, side === 'left' ? 'rounded-l-[calc(var(--u)*2.5)]' : 'rounded-r-[calc(var(--u)*2.5)]')}
      style={look.pageStyle(side)}
    >
      {look.id === 'classeur' && <Punches side={side} />}
      {exists && (
        <div className="flex h-full flex-col">
          <div className={cn('flex items-center justify-between gap-[calc(var(--u)*3)] px-[calc(var(--u)*6)] pt-[calc(var(--u)*4.5)] text-[calc(var(--u)*2.8)]', look.header)}>
            <span className="truncate">{title}</span>
            <span className={cn('h-[calc(var(--u)*0.7)] w-[calc(var(--u)*12)] shrink-0 rounded-full', look.headerAccent)} />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-3 gap-[calc(var(--u)*3.5)] px-[calc(var(--u)*6)] pt-[calc(var(--u)*3.5)] pb-[calc(var(--u)*9)]">
            {Array.from({ length: SLOTS_PER_PAGE }, (_, i) => {
              const slot = first + i;
              const id = slots[slot] ?? null;
              const card = id ? cards.get(id) : undefined;
              const dragged = drag?.slot === slot;
              return (
                <div
                  key={slot}
                  data-album-slot={slot}
                  className={cn('relative flex items-center justify-center transition-colors', look.slotEmpty, over === slot && drag && 'ring-[calc(var(--u)*0.6)] ring-primary')}
                >
                  <span className={cn('text-[calc(var(--u)*7)] tabular-nums', look.slotNumber)}>{slot + 1}</span>
                  {card && !dragged && (
                    <div
                      data-album-sticker={slot}
                      className="group/sticker absolute inset-0 flex cursor-grab touch-none items-center justify-center transition-transform duration-200 hover:z-10 hover:scale-[1.04] active:cursor-grabbing"
                      style={{ rotate: `${tilt(card.cardId) * look.tilt}deg` }}
                    >
                      <div className={cn('relative h-full rounded-[calc(var(--u)*2)]', look.sticker)}>
                        <Sticker card={card} />
                      </div>
                      {card.wikipediaUrl && (
                        <a
                          href={card.wikipediaUrl}
                          target="_blank"
                          rel="noopener"
                          onPointerDown={(e) => e.stopPropagation()}
                          title="Ouvrir sur Wikipédia"
                          className="absolute top-[calc(var(--u)*1.8)] right-[calc(var(--u)*1.8)] z-50 flex size-[calc(var(--u)*6)] items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover/sticker:opacity-100"
                        >
                          <ExternalLink className="size-[calc(var(--u)*3.2)]" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className={cn('absolute inset-x-0 bottom-[calc(var(--u)*3.5)] text-center text-[calc(var(--u)*2.8)] font-medium tabular-nums', look.folio)}>{face + 1}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Bloc de pages sous la page visible, vu en perspective : tranche du bas (lignes droites jusqu'à la reliure)
 * et tranche du côté extérieur, faites de feuilles empilées qui alternent papier et liseré.
 * Plus épais du côté où il reste le plus de pages.
 */
function PageStack({ side, share, u }: { side: 'left' | 'right'; share: number; u: number }) {
  const sheets = Math.round(3 + share * 11);
  const dir = side === 'left' ? -1 : 1;
  const depthX = sheets * 0.2 * u;
  const depthY = sheets * 0.27 * u;
  const sheet = (i: number) => {
    const shade = Math.round(250 - (i / sheets) * 18);
    return i % 2 ? `rgb(${shade - 26} ${shade - 34} ${shade - 50})` : `rgb(${shade} ${shade - 5} ${shade - 17})`;
  };
  const bottom: string[] = [];
  const outer: string[] = [];
  for (let i = 1; i <= sheets; i++) {
    bottom.push(`0 ${(i * 0.27 * u).toFixed(2)}px 0 ${sheet(i)}`);
    outer.push(`${(dir * i * 0.2 * u).toFixed(2)}px 0 0 ${sheet(i)}`);
  }
  // Ombre douce du bloc sur la couverture.
  bottom.push(`0 ${(depthY + 0.5 * u).toFixed(2)}px ${(1.2 * u).toFixed(2)}px rgb(40 25 5 / 0.3)`);
  const radius = `calc(var(--u) * 2.5)`;
  return (
    <>
      {/* Côté extérieur : s'arrête au-dessus de la tranche du bas. */}
      <div
        className="absolute top-0 w-1/2 bg-[#f7f1e3]"
        style={{
          [side]: 0,
          bottom: 0,
          boxShadow: outer.join(', '),
          borderTopLeftRadius: side === 'left' ? radius : 0,
          borderTopRightRadius: side === 'right' ? radius : 0,
        }}
      />
      {/* Bas : du dos jusqu'au coin extérieur, élargi de l'épaisseur du côté pour fermer l'angle. */}
      <div
        className="absolute bottom-0 h-[calc(var(--u)*2.5)] bg-[#f7f1e3]"
        style={{
          [side]: -depthX,
          width: `calc(50% + ${depthX}px)`,
          boxShadow: bottom.join(', '),
          borderBottomLeftRadius: side === 'left' ? radius : 0,
          borderBottomRightRadius: side === 'right' ? radius : 0,
        }}
      />
    </>
  );
}

/** Tranchefiles rayées en haut et en bas du dos. */
function Headbands() {
  const band = 'repeating-linear-gradient(90deg, #7f1d1d 0 2px, #f5f0e6 2px 4px)';
  return (
    <>
      <span className="absolute -top-[calc(var(--u)*0.9)] left-1/2 h-[calc(var(--u)*1)] w-[calc(var(--u)*4)] -translate-x-1/2 rounded-t-full shadow-sm" style={{ background: band }} />
      <span className="absolute -bottom-[calc(var(--u)*0.9)] left-1/2 h-[calc(var(--u)*1)] w-[calc(var(--u)*4)] -translate-x-1/2 rounded-b-full shadow-sm" style={{ background: band }} />
    </>
  );
}

const RING_POSITIONS = ['16%', '50%', '84%'];

/** Perforations de la page du classeur, côté reliure. */
function Punches({ side }: { side: 'left' | 'right' }) {
  return (
    <>
      {RING_POSITIONS.map((top) => (
        <span
          key={top}
          className={cn(
            'pointer-events-none absolute size-[calc(var(--u)*2.6)] -translate-y-1/2 rounded-full bg-black/70 shadow-[inset_0_1px_2px_rgb(0_0_0/0.9),0_1px_0_rgb(255_255_255/0.08)]',
            side === 'left' ? 'right-[calc(var(--u)*3.8)]' : 'left-[calc(var(--u)*3.8)]',
          )}
          style={{ top }}
        />
      ))}
    </>
  );
}

/** Mécanisme du classeur : plaque chromée sur la reliure et anneaux en D qui traversent les perforations. */
function Rings() {
  const chrome = 'linear-gradient(90deg, #52525b, #d4d4d8 22%, #fafafa 38%, #a1a1aa 55%, #e4e4e7 72%, #3f3f46)';
  return (
    <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-[calc(var(--u)*5)] -translate-x-1/2">
      <div className="absolute inset-x-0 inset-y-[6%] rounded-[calc(var(--u)*1.2)] shadow-[0_2px_6px_rgb(0_0_0/0.6)]" style={{ background: chrome }}>
        {['4%', '96%'].map((top) => (
          <span
            key={top}
            className="absolute left-1/2 size-[calc(var(--u)*1.4)] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[inset_0_1px_1px_rgb(0_0_0/0.6)]"
            style={{ top, background: 'radial-gradient(circle at 35% 35%, #fafafa, #71717a)' }}
          />
        ))}
      </div>
      {RING_POSITIONS.map((top) => (
        <span
          key={top}
          className="absolute left-1/2 h-[calc(var(--u)*3.6)] w-[calc(var(--u)*11.5)] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            top,
            border: 'calc(var(--u) * 0.9) solid transparent',
            background: `linear-gradient(#0000, #0000) padding-box, linear-gradient(180deg, #fafafa, #a1a1aa 35%, #52525b 55%, #d4d4d8 80%, #71717a) border-box`,
            boxShadow: '0 3px 5px rgb(0 0 0 / 0.55)',
          }}
        />
      ))}
    </div>
  );
}

export interface AlbumProps {
  title: string;
  /** Dégradé de la couverture (couleur de l'étiquette). */
  gradient: string;
  cards: OwnedCard[];
  /** Clé de rangement : identifiant de l'étiquette, ou « none ». */
  layoutKey: string;
  onClose: () => void;
}

/** Album à feuilleter façon Panini : doubles pages, pages qui se tournent, vignettes à ranger par glisser-déposer. */
export function Album({ title, gradient, cards, layoutKey, onClose }: AlbumProps) {
  const palette = useCollection((s) => s.settings.palette);
  const albumStyle = useCollection((s) => s.settings.albumStyle);
  const updateSettings = useCollection((s) => s.updateSettings);
  const look = ALBUM_STYLES[albumStyle] ?? ALBUM_STYLES.relie;
  const [slots, setSlots] = useState<(string | null)[] | null>(null);
  const [spread, setSpread] = useState(0);
  // L'aperçu de développement (captures du README) saute l'ouverture de la couverture.
  const [leaf, setLeaf] = useState<Leaf | null>(() => ((window as { __collectionPlusStatic?: boolean }).__collectionPlusStatic ? null : { dir: 1, opening: true }));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [pageW, setPageW] = useState(380);

  const progress = useMotionValue(0);
  const dirRef = useRef<1 | -1>(1);
  const rotateY = useTransform(progress, (v) => (dirRef.current === 1 ? -180 : 180) * v);
  const frontShade = useTransform(progress, [0, 0.5], [0, 0.35]);
  const backShade = useTransform(progress, [0.5, 1], [0.35, 0]);
  const bookRef = useRef<HTMLDivElement>(null);
  const wishesRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(cards.map((c) => [c.cardId, c])), [cards]);
  const total = pageCount(slots?.length ?? 0);
  const spreads = total / 2;

  // Refs lues par les gestionnaires de pointeur (évite les valeurs figées).
  const state = useRef({ spread, spreads, leaf, slots });
  state.current = { spread, spreads, leaf, slots };
  dirRef.current = leaf?.dir ?? 1;

  // Chargement et rangement enregistré
  useEffect(() => {
    let alive = true;
    albumLayoutsItem.getValue().then((all) => {
      if (alive) setSlots(reconcileSlots(all[layoutKey], cards));
    });
    return () => {
      alive = false;
    };
  }, [layoutKey, cards]);

  const save = useCallback(
    async (next: (string | null)[]) => {
      setSlots(next);
      const all = await albumLayoutsItem.getValue();
      await albumLayoutsItem.setValue({ ...all, [layoutKey]: next });
    },
    [layoutKey],
  );

  // Taille du livre selon la fenêtre
  useEffect(() => {
    const fit = () => setPageW(Math.floor(Math.max(220, Math.min(520, (window.innerWidth - 140) / 2, (window.innerHeight - 190) * 0.75))));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Ouverture de la couverture
  useEffect(() => {
    if (!slots || !leaf?.opening) return;
    const timer = setTimeout(() => {
      animate(progress, 1, { duration: 1, ease: [0.45, 0.05, 0.2, 1] }).then(() => {
        setLeaf(null);
        progress.set(0);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [slots, leaf?.opening, progress]);

  const canFlip = (dir: 1 | -1) => {
    const { spread, spreads, leaf } = state.current;
    return !leaf && (dir === 1 ? spread < spreads - 1 : spread > 0);
  };

  const endFlip = useCallback(
    (dir: 1 | -1, commit: boolean) =>
      animate(progress, commit ? 1 : 0, FLIP).then(() => {
        if (commit) setSpread((s) => s + dir);
        setLeaf(null);
        progress.set(0);
      }),
    [progress],
  );

  const flip = useCallback(
    (dir: 1 | -1) => {
      if (!canFlip(dir)) return;
      dirRef.current = dir;
      progress.set(0);
      setLeaf({ dir });
      state.current.leaf = { dir };
      endFlip(dir, true);
    },
    [endFlip, progress],
  );

  const jump = (to: number) => {
    if (state.current.leaf) return;
    setSpread(Math.max(0, Math.min(spreads - 1, to)));
  };

  // Clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') flip(1);
      else if (e.key === 'ArrowLeft') flip(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flip, onClose]);

  /**
   * Un seul geste au pointeur :
   * - sur une vignette : déplacement (glisser-déposer vers une autre case, bords du livre pour tourner la page) ;
   * - ailleurs sur une page : la page suit le doigt et se tourne si on la lâche après la moitié du chemin.
   */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || state.current.leaf || !state.current.slots) return;
    const target = e.target as HTMLElement;
    if (target.closest('a,button')) return;
    const sticker = target.closest<HTMLElement>('[data-album-sticker]');
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = bookRef.current!.getBoundingClientRect();

    if (sticker) {
      const slot = Number(sticker.dataset.albumSticker);
      const cardId = state.current.slots[slot]!;
      let started = false;
      let edge: 0 | 1 | -1 = 0;
      let edgeTimer: ReturnType<typeof setTimeout> | undefined;

      const move = (ev: PointerEvent) => {
        if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        started = true;
        setDrag({ slot, cardId, x: ev.clientX, y: ev.clientY });
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-album-slot]');
        setOver(under ? Number(under.dataset.albumSlot) : null);
        // Garder la vignette au bord du livre tourne la page.
        const r = bookRef.current!.getBoundingClientRect();
        const next = ev.clientX < r.left + EDGE ? -1 : ev.clientX > r.right - EDGE ? 1 : 0;
        if (next !== edge) {
          clearTimeout(edgeTimer);
          edge = next;
          if (edge) {
            const dir = edge;
            edgeTimer = setTimeout(() => {
              flip(dir);
              edge = 0;
            }, 550);
          }
        }
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        clearTimeout(edgeTimer);
        if (!started) {
          // Simple clic : la carte en grand, en parcourant l'album dans l'ordre des cases.
          const ordered = (state.current.slots ?? []).map((id) => (id ? byId.get(id) : undefined)).filter((c): c is OwnedCard => Boolean(c));
          useCardViewer.getState().open(ordered, Math.max(0, ordered.findIndex((c) => c.cardId === cardId)));
        }
        if (started) {
          const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-album-slot]');
          const to = under ? Number(under.dataset.albumSlot) : null;
          const current = state.current.slots;
          if (to !== null && to !== slot && current) save(swapSlots(current, slot, to));
        }
        setDrag(null);
        setOver(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }

    const dir: 1 | -1 = startX > rect.left + rect.width / 2 ? 1 : -1;
    if (!canFlip(dir)) return;
    let started = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!started) {
        if (Math.abs(dx) < 6 || Math.sign(dx) !== -dir) return;
        started = true;
        dirRef.current = dir;
        progress.set(0);
        setLeaf({ dir });
      }
      progress.set(Math.max(0, Math.min(1, (-dir * dx) / (pageW * 1.6))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (started) endFlip(dir, progress.get() > 0.3);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Faces visibles : pages fixes dessous + feuille qui tourne
  const L = spread * 2;
  const R = L + 1;
  let under: [Face, Face] = [L, R];
  let leafFaces: [Face, Face] | null = null;
  if (leaf?.opening) {
    under = ['none', 1];
    leafFaces = ['cover', 0];
  } else if (leaf?.dir === 1) {
    under = [L, R + 2 < total ? R + 2 : 'none'];
    leafFaces = [R, R + 1];
  } else if (leaf?.dir === -1) {
    under = [L - 2 >= 0 ? L - 2 : 'none', R];
    leafFaces = [L, L - 1];
  }

  const pageProps = { slots: slots ?? [], cards: byId, title, gradient, total, drag, over, palette, look };
  const draggedCard = drag ? byId.get(drag.cardId) : undefined;
  const u = pageW / 100;
  const pageH = Math.round(pageW / 0.75);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-black/75 backdrop-blur-sm select-none"
      onPointerDown={(e) => (e.target as HTMLElement).dataset.backdrop !== undefined && onClose()}
      data-backdrop
    >
      {/* Premier écran : le livre ; en dessous, liste de souhaits et suggestions. */}
      <div data-backdrop className="flex min-h-full flex-col items-center justify-center gap-5 py-6">
      <div className="flex w-full items-center justify-between gap-4 px-6 text-white" style={{ maxWidth: pageW * 2 + 40 }}>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.2em] text-white/60 uppercase">Album</p>
          <h2 className="truncate text-xl font-bold">{title}</h2>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Style de l'album">
            {ALBUM_STYLE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={id === look.id}
                onClick={() => updateSettings({ albumStyle: id })}
                className={cn(
                  'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition',
                  id === look.id ? 'bg-white text-zinc-900' : 'text-white/70 hover:text-white',
                )}
              >
                {ALBUM_STYLES[id].name}
              </button>
            ))}
          </div>
          <span className="text-white/70 tabular-nums">
            Pages {L + 1}–{R + 1} / {total}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l'album"
            className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => flip(-1)}
          disabled={spread === 0 || Boolean(leaf)}
          aria-label="Page précédente"
          className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-default disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>

        <div style={{ perspective: pageW * 6 }}>
        <motion.div
          ref={bookRef}
          initial={{ scale: 0.85, y: 30, rotateX: 0 }}
          animate={{ scale: 1, y: 0, rotateX: look.depth ? 14 : 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          onPointerDown={onPointerDown}
          className="relative touch-none"
          style={{ width: pageW * 2, height: pageH, perspective: pageW * 5, ['--u' as string]: `${u}px` }}
        >
          {/* Couverture ouverte derrière les pages, tranches de pages (style en relief) */}
          {!leaf?.opening && (
            <>
              <div
                className="absolute rounded-[calc(var(--u)*3.5)]"
                style={{
                  top: `calc(var(--u) * ${-look.frameInset.top})`,
                  bottom: `calc(var(--u) * ${-look.frameInset.bottom})`,
                  left: `calc(var(--u) * ${-look.frameInset.side})`,
                  right: `calc(var(--u) * ${-look.frameInset.side})`,
                  ...look.frame(gradient),
                }}
              />
              {look.depth && (
                <>
                  <PageStack side="left" share={spreads > 1 ? spread / (spreads - 1) : 0} u={u} />
                  <PageStack side="right" share={spreads > 1 ? 1 - spread / (spreads - 1) : 1} u={u} />
                </>
              )}
              {look.depth && <Headbands />}
            </>
          )}
          <div className="absolute inset-y-0 left-0 w-1/2">
            <Page face={under[0]} side="left" {...pageProps} />
          </div>
          <div className="absolute inset-y-0 right-0 w-1/2">
            <Page face={under[1]} side="right" {...pageProps} />
          </div>
          {!leaf && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/20" />}
          {look.id === 'classeur' && !leaf?.opening && <Rings />}

          {leaf && leafFaces && (
            <motion.div
              className={cn('absolute inset-y-0 w-1/2', leaf.dir === 1 ? 'left-1/2 origin-left' : 'left-0 origin-right')}
              style={{ rotateY, transformStyle: 'preserve-3d', zIndex: 20 }}
            >
              <div className="absolute inset-0 [backface-visibility:hidden]">
                <Page face={leafFaces[0]} side={leaf.dir === 1 ? 'right' : 'left'} {...pageProps} />
                <motion.div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: frontShade }} />
              </div>
              <div className="absolute inset-0 [backface-visibility:hidden]" style={{ transform: 'rotateY(180deg)' }}>
                <Page face={leafFaces[1]} side={leaf.dir === 1 ? 'left' : 'right'} {...pageProps} />
                <motion.div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: backShade }} />
              </div>
            </motion.div>
          )}
        </motion.div>
        </div>

        <button
          type="button"
          onClick={() => flip(1)}
          disabled={spread >= spreads - 1 || Boolean(leaf)}
          aria-label="Page suivante"
          className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-default disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="flex w-full flex-col items-center gap-2 text-xs text-white/60" style={{ maxWidth: pageW * 2 }}>
        {spreads > 1 && (
          <input
            type="range"
            min={0}
            max={spreads - 1}
            value={spread}
            onChange={(e) => jump(Number(e.target.value))}
            aria-label="Aller à la double page"
            className="w-full max-w-md cursor-pointer accent-[var(--primary)]"
          />
        )}
        <p>Clique une carte pour l'afficher en grand · fais glisser une page pour la tourner · glisse une vignette vers une autre case pour la ranger</p>
        <button
          type="button"
          onClick={() => wishesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="mt-1 flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-white/80 transition hover:bg-white/20"
        >
          <ChevronDown className="size-3.5" /> Liste de souhaits et suggestions
        </button>
      </div>
      </div>

      <div ref={wishesRef} data-backdrop data-wishes className="mx-auto w-full px-6 pb-12" style={{ maxWidth: pageW * 2 + 40 }}>
        <AlbumWishes albumKey={layoutKey} cards={cards} />
      </div>

      {drag &&
        draggedCard &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[80]"
            style={{
              ['--u' as string]: `${u}px`,
              width: u * 26,
              height: u * 36,
              left: drag.x - u * 13,
              top: drag.y - u * 18,
              rotate: '-4deg',
              scale: '1.08',
            }}
          >
            <Sticker card={draggedCard} lifted />
          </div>,
          document.body,
        )}
    </motion.div>,
    document.body,
  );
}
