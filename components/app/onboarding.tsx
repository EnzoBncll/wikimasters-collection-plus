import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { appTourItem, TOUR_VERSION } from '@/lib/tour';
import { cn } from '@/lib/utils';

/** Vues de l'app traversées par la visite. */
export type TourView = 'review' | 'tags' | 'wishes' | 'suggestions' | 'settings';

interface Step {
  view: TourView;
  /** Élément mis en lumière (`data-tour`) ; absent : carte centrée. */
  target?: string;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    view: 'review',
    title: 'Bienvenue dans Collection+',
    text: 'Le tour de l’app en deux minutes : tes cartes, tes albums, tes souhaits et l’ouverture des paquets. Tu peux le passer et le relancer depuis les Paramètres.',
  },
  {
    view: 'review',
    target: 'filters',
    title: 'Filtres',
    text: 'Statut, rareté, étiquettes, doublons, nouvelles cartes. En haut, les filtres actifs, à retirer un par un.',
  },
  {
    view: 'review',
    target: 'cards',
    title: 'Tes cartes',
    text: 'Le caddie passe une carte de Trade à Not Trade. Double-clic : la carte en grand avec son article Wikipédia. Touche R : le mode revue, tes cartes une par une comme à l’ouverture d’un paquet.',
  },
  {
    view: 'review',
    target: 'outbox',
    title: 'Boîte d’envoi',
    text: 'Rien ne part sur WikiMasters tout de suite : statuts, étiquettes et défausse des doublons s’accumulent ici, et ✓ envoie tout d’un coup.',
  },
  {
    view: 'tags',
    target: 'create',
    title: 'Nouveau',
    text: 'Un album à remplir au fil des cartes, une étiquette de rangement, ou un album à objectif : décris un thème (« les rois de France ») et Collection+ construit la liste à compléter.',
  },
  {
    view: 'tags',
    target: 'library',
    title: 'Bibliothèque',
    text: 'Un livre par album à objectif ou collection finie. Il grandit à mesure qu’il se remplit ; survole-le pour voir son avancement, clique pour l’ouvrir.',
  },
  {
    view: 'tags',
    target: 'albums',
    title: 'Albums',
    text: 'Chaque étiquette s’ouvre en livre à feuilleter. Dedans : le pinceau règle le style (relié, classeur, grimoire, herbier), « + Coller » range une carte, et le mode Marché montre les cartes manquantes en vente.',
  },
  {
    view: 'wishes',
    target: 'wishes',
    title: 'Souhaits',
    text: 'Ta liste de souhaits WikiMasters : ajoute des cartes depuis le catalogue, vois lesquels de tes amis les possèdent, retire celles que tu as obtenues.',
  },
  {
    view: 'suggestions',
    target: 'enhance',
    title: 'Enhance',
    text: 'Des idées pour ta collection : les cartes à ranger dans tes albums, les thèmes qui feraient un bon album, et une fiche rédigée pour chacun.',
  },
  {
    view: 'settings',
    title: 'Sur WikiMasters',
    text: 'Collection+ redessine aussi l’ouverture des paquets : révélé mis en scène, rangement de la carte sans l’ouvrir, statistiques de tirage. Une courte visite t’y attend à ton prochain paquet.',
  },
  {
    view: 'settings',
    target: 'settings',
    title: 'Tout se règle, tout se désactive',
    text: 'Apparence, rangement, synchro et export sont ici. Chaque fonction ajoutée sur WikiMasters a son interrupteur, ici et dans le popup : si quelque chose te gêne, coupe-le.',
  },
  {
    view: 'review',
    title: 'C’est parti',
    text: 'Garde un onglet WikiMasters ouvert pendant que tu utilises Collection+ : l’extension passe par lui pour parler au site. L’icône de l’extension donne ton compteur de paquets et les réglages rapides.',
  },
];

interface TourState {
  step: number | null;
  start: (step?: number) => void;
  close: () => void;
}

export const useOnboarding = create<TourState>((set) => ({
  step: null,
  start: (step = 0) => set({ step }),
  close: () => {
    set({ step: null });
    appTourItem.setValue(TOUR_VERSION);
  },
}));

const PAD = 8;
const CARD_W = 340;

function measure(target: string | undefined): DOMRect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  let rect = el.getBoundingClientRect();
  // Enveloppe en `display: contents` : on prend son premier enfant.
  if (!rect.width && el.firstElementChild) rect = el.firstElementChild.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  // Zone énorme (grille de cartes) : on la limite à l'écran.
  const top = Math.max(rect.top, 56);
  const bottom = Math.min(rect.bottom, window.innerHeight - 16);
  return new DOMRect(rect.left, top, rect.width, Math.max(40, bottom - top));
}

/** Trou arrondi autour de la zone présentée (sous-chemin du voile, règle evenodd). */
function hole(r: DOMRect) {
  const x = r.left - PAD;
  const y = r.top - PAD;
  const w = r.width + PAD * 2;
  const h = r.height + PAD * 2;
  const k = 16;
  return `M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}V${y + h - k}A${k} ${k} 0 0 1 ${x + w - k} ${y + h}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z`;
}

/** Où poser la carte d'explication : sous la zone, au-dessus, ou à côté, selon la place. */
function cardPosition(rect: DOMRect | null) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { left: (vw - CARD_W) / 2, top: vh / 2 - 110 };
  const left = Math.min(Math.max(16, rect.left + rect.width / 2 - CARD_W / 2), vw - CARD_W - 16);
  if (vh - rect.bottom > 240) return { left, top: rect.bottom + PAD + 14 };
  if (rect.top > 290) return { left, top: rect.top - PAD - 14 - 240 };
  const side = rect.right + PAD + 16 + CARD_W < vw ? rect.right + PAD + 16 : Math.max(16, rect.left - PAD - 16 - CARD_W);
  return { left: side, top: Math.min(Math.max(16, rect.top), vh - 260) };
}

/**
 * Visite guidée à la première ouverture : passe d'une page à l'autre et met en lumière chaque fonction.
 * Passable à tout moment (Échap) ; relançable depuis les Paramètres.
 */
export function Onboarding({ onView }: { onView: (view: TourView) => void }) {
  const { step, start, close } = useOnboarding();
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Première ouverture (jamais pendant les captures du README).
  useEffect(() => {
    const demo = new URLSearchParams(location.search).get('onboarding');
    if (demo !== null) return start(Number(demo) || 0);
    if ((window as { __collectionPlusStatic?: boolean }).__collectionPlusStatic) return;
    // Jamais vue, ou refaite depuis : une fois par version de la visite.
    appTourItem.getValue().then((seen) => seen < TOUR_VERSION && start(0));
  }, [start]);

  const current = step !== null ? STEPS[step] : undefined;

  // Change de page, puis attend que l'élément apparaisse (vue chargée, liste rendue).
  useLayoutEffect(() => {
    if (!current) return;
    onView(current.view);
    setRect(null);
    let tries = 0;
    const timer = window.setInterval(() => {
      const r = measure(current.target);
      if (r || ++tries > 20) {
        setRect(r);
        window.clearInterval(timer);
      }
    }, 80);
    const onResize = () => setRect(measure(current.target));
    window.addEventListener('resize', onResize);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [current, onView]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft' && step > 0) start(step - 1);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (step === null || !current) return null;
  const last = step === STEPS.length - 1;
  const next = () => (last ? (close(), onView('review')) : start(step + 1));
  const pos = cardPosition(rect);

  return createPortal(
    <div className="fixed inset-0 z-[97]" role="dialog" aria-modal="true" aria-label="Présentation de Collection+">
      {/* Fond assombri, troué autour de l'élément présenté. */}
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        <path fillRule="evenodd" fill="rgb(0 0 0 / 0.62)" d={`M0 0H${window.innerWidth}V${window.innerHeight}H0Z${rect ? hole(rect) : ''}`} />
      </svg>
      {rect && (
        <motion.div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-primary"
          initial={false}
          animate={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          transition={{ type: 'spring', stiffness: 260, damping: 32 }}
        />
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute flex flex-col gap-3 rounded-2xl border bg-popover p-5 text-popover-foreground shadow-2xl"
          style={{ left: pos.left, top: pos.top, width: CARD_W }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {step + 1} / {STEPS.length}
              </p>
              <h2 className="font-heading text-lg leading-tight font-bold">{current.title}</h2>
            </div>
            <button type="button" onClick={close} aria-label="Passer la visite" className="grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{current.text}</p>
          <div className="flex items-center gap-1">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => start(i)}
                aria-label={`Étape ${i + 1}`}
                className={cn('h-1.5 cursor-pointer rounded-full transition-all', i === step ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60')}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!last && (
              <button type="button" onClick={close} className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                Passer la visite
              </button>
            )}
            <span className="ml-auto" />
            {step > 0 && (
              <button type="button" onClick={() => start(step - 1)} className="h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                Retour
              </button>
            )}
            <button type="button" onClick={next} autoFocus className="h-9 cursor-pointer rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
              {step === 0 ? 'Commencer' : last ? 'Terminer' : 'Suivant'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
}
