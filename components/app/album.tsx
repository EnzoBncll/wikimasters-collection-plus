import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ExternalLink, Gem, Hand, GalleryHorizontalEnd, ImageDown, LayoutGrid, Loader2, Paintbrush, Pencil, Plus, RefreshCw, RotateCcw, Share2, Sparkles, Store, Target, Trophy, X } from 'lucide-react';
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCollection } from '@/hooks/use-collection';
import { toast } from '@/hooks/use-toast';
import { kindOf, toggleFinished } from '@/lib/album-kind';
import { useSuggestions } from '@/hooks/use-suggestions';
import { goalAlbumsItem, matchEntries, titleKey, type GoalAlbum, type GoalEntry } from '@/lib/goal-albums';
import { useMarket, type MarketSearch } from '@/hooks/use-market';
import { goalSlots, SECTION_MODES, type SectionMode, type SectionRun } from '@/lib/goal-layout';
import { endsIn, type Listing } from '@/lib/market';
import { SITE_ORIGIN } from '@/lib/transport';
import { albumDepthItem, albumLooksItem, DEFAULT_LOOK, type AlbumLook, albumDescriptionsItem, albumLayoutsItem, albumOrdersItem, albumSectionsItem, albumStylesItem, pageCount, raritySlots, reconcileSlots, swapSlots, type AlbumOrder } from '@/lib/album';
import { RARITY_LABEL, type OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toPng } from 'html-to-image';
import { playPageTurn, playStick } from '@/lib/page-sound';
import { STICK_IMPACT, StickFx, type StickShot } from './stick-fx';
import { encodeAlbumCode } from '@/lib/album-code';
import { TAG_COLORS } from '@/lib/tag-colors';
import { Switch } from '@/components/ui/switch';
import { AlbumAddDialog } from './album-add-dialog';
import { AlbumRecommendations } from './album-recommendations';
import { AlbumRemoved, setRemovedFromAlbum } from './album-removed';
import { AlbumSheetPanel } from './album-sheet-panel';
import { useAiAvailability, useAlbumSheets, useWriteSheet } from './sheets-view';
import { updateSheet } from '@/lib/album-sheet';
import { AlbumWishes } from './album-wishes';
import { ALBUM_STYLE_ICONS, ALBUM_STYLE_IDS, ALBUM_STYLES, DEFAULT_EDGES, type AlbumStyle, type AlbumStyleId, type PageEdges } from './album-styles';
import { BrandIcon } from './brand-icon';
import { randomTagColor } from '@/lib/tag-colors';
import { useCardViewer } from './card-viewer';
import { WmCard } from './wm-card';
import { cardImage } from './card-image';
import { useThumbnails } from './wiki-peek';
import { CardStylePicker } from './export-view';
import { CARD_STYLE_IDS, type CardStyle } from '@/lib/store';

/** Contenu d'une face : une page de l'album, la couverture, une page blanche ou rien (livre fermé). */
type Face = number | 'cover' | 'none';

interface Leaf {
  /** 1 : la page de droite tourne vers la gauche ; -1 : l'inverse. */
  dir: 1 | -1;
  /** Ouverture de la couverture. */
  opening?: boolean;
  /** Fermeture : la couverture revient se rabattre sur les pages. */
  closing?: boolean;
}

interface Drag {
  slot: number;
  cardId: string;
  x: number;
  y: number;
}

const FLIP = { duration: 0.75, ease: [0.3, 0.7, 0.2, 1] } as const;

/** Options d'apparence de l'album ouvert (menu pinceau), lues par les pages, les cases et les vignettes. */
interface LookOptions {
  perPage: number;
  cols: number;
  /** Unité de mesure des pages (px) ; les cases sont mises à l'échelle selon le nombre par page. */
  u: number;
  missing: 'name' | 'silhouette' | 'blur';
  numbers: boolean;
  tilted: boolean;
  cardStyle?: CardStyle;
  emblem?: string;
}
const LookContext = createContext<LookOptions>({ perPage: 9, cols: 3, u: 3.8, missing: 'name', numbers: true, tilted: true });
const EDGE = 44;

/** Petite inclinaison stable par carte, comme une vignette collée à la main. */
function tilt(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.7;
}

/** Vignette collée : la carte au style WikiMasters, sans inclinaison (le reflet holo reste au survol). */
function Sticker({ card, lifted }: { card: OwnedCard; lifted?: boolean }) {
  const { cardStyle } = useContext(LookContext);
  return (
    <WmCard
      card={card}
      tilt={false}
      cardStyle={cardStyle}
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

interface CoverProps {
  description: string;
  /** La description vient de la fiche IA, sans retouche. */
  aiWritten: boolean;
  /** Couverture interactive (livre fermé, rien ne tourne). */
  editable: boolean;
  /** Le nom de l'étiquette peut être changé (pas pour « Sans étiquette » ni Trade / Not Trade). */
  canRename: boolean;
  onSave: (name: string, description: string) => Promise<void>;
  onOpen: () => void;
  /** Fait rédiger la description par l'IA ; absent quand l'IA n'est pas disponible ou que l'album n'est pas une étiquette. */
  onGenerate?: () => void;
  generating?: boolean;
  /** Album à objectif : « 23 / 76 cartes » à la place du nombre de vignettes. */
  progress?: string;
}

/** Petite étoile discrète : rédiger (ou réécrire) la description avec l'IA. */
function GenerateButton({ cover }: { cover: CoverProps }) {
  if (!cover.editable || !cover.onGenerate) return null;
  return (
    <button
      type="button"
      onClick={cover.onGenerate}
      disabled={cover.generating}
      title={cover.description ? "Réécrire la description avec l'IA" : "Rédiger la description avec l'IA"}
      aria-label={cover.description ? "Réécrire la description avec l'IA" : "Rédiger la description avec l'IA"}
      className="inline-grid size-[calc(var(--u)*5)] shrink-0 cursor-pointer place-items-center rounded-full opacity-55 transition hover:bg-white/15 hover:opacity-100 disabled:cursor-progress disabled:opacity-80"
    >
      {cover.generating ? <Loader2 className="size-[calc(var(--u)*2.8)] animate-spin" /> : <Sparkles className="size-[calc(var(--u)*2.8)]" />}
    </button>
  );
}

/** Titre et description de la couverture ; double-clic pour les modifier. */
/** Emblème de couverture (menu pinceau) : un symbole, un emoji, ou une carte de l'album en médaillon. */
function CoverEmblem({ cards }: { cards: Map<string, OwnedCard> }) {
  const { emblem } = useContext(LookContext);
  if (!emblem) return null;
  if (emblem.startsWith('card:')) {
    const card = cards.get(emblem.slice(5));
    if (!card) return null;
    return (
      <span className="block size-[calc(var(--u)*22)] overflow-hidden rounded-full shadow-[0_0_0_calc(var(--u)*1)_#e9c46a,0_calc(var(--u)*1)_calc(var(--u)*4)_rgb(0_0_0/0.5)]">
        <img src={cardImage(card)} alt="" className="size-full object-cover" />
      </span>
    );
  }
  return <span className="text-[calc(var(--u)*14)] leading-none drop-shadow-[0_calc(var(--u)*0.6)_calc(var(--u)*1.5)_rgb(0_0_0/0.5)]">{emblem}</span>;
}

function CoverText({ title, look, cover }: { title: string; look: AlbumStyle; cover: CoverProps }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [desc, setDesc] = useState(cover.description);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setName(title);
      setDesc(cover.description);
    }
  }, [title, cover.description, editing]);
  useEffect(() => {
    if (!cover.editable) setEditing(false);
  }, [cover.editable]);

  const edit = () => cover.editable && setEditing(true);
  const field = 'w-full rounded-[calc(var(--u)*1.5)] bg-black/25 text-center text-white outline-none ring-white/50 placeholder:text-white/50 focus:ring-[calc(var(--u)*0.4)]';

  if (editing) {
    return (
      <form
        className="flex w-full flex-col items-center gap-[calc(var(--u)*2.5)] select-text"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setEditing(false);
          }
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || saving) return;
          setSaving(true);
          try {
            await cover.onSave(name.trim(), desc.trim());
            setEditing(false);
          } catch {
            /* nom refusé (déjà pris…) : on reste en édition */
          } finally {
            setSaving(false);
          }
        }}
      >
        <input
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!cover.canRename}
          title={cover.canRename ? undefined : 'Le nom de cet album ne peut pas être changé'}
          aria-label="Nom de l'album"
          className={cn(field, 'px-[calc(var(--u)*3)] py-[calc(var(--u)*1.5)] text-[calc(var(--u)*6.5)] font-black disabled:opacity-70')}
        />
        <textarea
          autoFocus={!cover.canRename}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="Description (facultatif)"
          aria-label="Description de l'album"
          className={cn(field, 'resize-none px-[calc(var(--u)*3)] py-[calc(var(--u)*2)] text-[calc(var(--u)*3.4)] leading-snug')}
        />
        <div className="flex gap-[calc(var(--u)*2)] text-[calc(var(--u)*3.2)] font-semibold">
          <button type="button" onClick={() => setEditing(false)} className="cursor-pointer rounded-full bg-white/15 px-[calc(var(--u)*4)] py-[calc(var(--u)*1.6)] transition hover:bg-white/25">
            Annuler
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="cursor-pointer rounded-full bg-white px-[calc(var(--u)*4)] py-[calc(var(--u)*1.6)] text-zinc-900 shadow transition hover:bg-white/90 disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <h2
        onDoubleClick={edit}
        title={cover.editable ? 'Double-clic pour modifier' : undefined}
        className={cn('text-[calc(var(--u)*8.5)] leading-none drop-shadow-md', look.coverTitle, cover.editable && 'cursor-text')}
      >
        {title}
      </h2>
      {cover.description ? (
        <div className="flex max-w-full items-end gap-[calc(var(--u)*0.5)]">
          <p
            onDoubleClick={edit}
            title={cover.editable ? 'Double-clic pour modifier' : undefined}
            className={cn('line-clamp-4 min-w-0 text-[calc(var(--u)*3.4)] leading-snug whitespace-pre-line opacity-90', cover.editable && 'cursor-text', cover.generating && 'animate-pulse')}
          >
            {cover.description}
            {cover.aiWritten && (
              <span className="mt-[calc(var(--u)*1)] block text-[calc(var(--u)*2.4)] tracking-wide uppercase opacity-60">✦ Rédigée par l'IA · double-clic pour modifier</span>
            )}
          </p>
          <GenerateButton cover={cover} />
        </div>
      ) : (
        cover.editable && (
          <div className="flex items-center gap-[calc(var(--u)*0.5)]">
            <button
              type="button"
              onClick={edit}
              className="flex cursor-pointer items-center gap-[calc(var(--u)*1.5)] rounded-full px-[calc(var(--u)*3)] py-[calc(var(--u)*1)] text-[calc(var(--u)*3)] opacity-70 transition hover:bg-white/15 hover:opacity-100"
            >
              <Pencil className="size-[calc(var(--u)*3)]" /> {cover.generating ? 'Rédaction…' : 'Ajouter une description'}
            </button>
            <GenerateButton cover={cover} />
          </div>
        )
      )}
    </>
  );
}

interface GoalView {
  entries: GoalEntry[];
  /** Carte possédée pour chaque entrée (collée ou non). */
  match: Map<number, OwnedCard>;
  onStick: (card: OwnedCard) => void;
  /** Mode Marché : annonces en cours par titre de case (titleKey). */
  market?: Map<string, Listing[]>;
  /** Mise en page des parties, et pour chaque case son entrée de la liste (null : tuile titre ou case vide). */
  mode: SectionMode;
  entryAt: (number | null)[];
  runs: SectionRun[];
  runOf: number[];
}

/** Tuile titre d'une partie (mode « tuile ») : nom, nombre de cartes, couleur de la partie. */
function SectionTile({ run }: { run: SectionRun }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-[calc(var(--u)*1.2)] rounded-[calc(var(--u)*1.4)] p-[calc(var(--u)*2)] text-center text-white shadow-[inset_0_0_0_calc(var(--u)*0.4)_rgb(255_255_255/0.35),0_calc(var(--u)*0.6)_calc(var(--u)*1.6)_rgb(0_0_0/0.25)]"
      style={{ background: `linear-gradient(150deg, ${run.color}, color-mix(in oklab, ${run.color} 60%, black))` }}
    >
      <span className="text-[calc(var(--u)*2)] font-semibold tracking-[0.2em] uppercase opacity-75">Partie</span>
      <span className="line-clamp-4 font-heading text-[calc(var(--u)*3.2)] leading-tight font-bold">{run.name}</span>
      <span className="text-[calc(var(--u)*2.2)] opacity-80">
        {run.size} carte{run.size > 1 ? 's' : ''}
      </span>
    </div>
  );
}

const auctionUrl = (id: string) => `${SITE_ORIGIN}/marketplace/${encodeURIComponent(id)}`;
const nfPrice = new Intl.NumberFormat('fr-FR');

/** Case d'un album à objectif : carte à trouver (son nom), ou carte possédée à coller d'un clic. */
function GoalSlot({ entry, own, look, onStick, listings }: { entry: GoalEntry; own?: OwnedCard; look: AlbumStyle; onStick: (card: OwnedCard) => void; listings?: Listing[] }) {
  const next = listings?.[0];
  const { missing } = useContext(LookContext);
  const thumbOf = useThumbnails(!own && missing === 'blur' && !entry.thumbnail ? [entry.title] : []);
  const blurred = !own && missing === 'blur' ? (entry.thumbnail ?? thumbOf(entry.title)) : null;
  return (
    <div
      title={entry.description ? `${entry.title} — ${entry.description}` : entry.title}
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-end gap-[calc(var(--u)*1.2)] p-[calc(var(--u)*1.5)] pb-[calc(var(--u)*2.5)] text-center',
        own && 'rounded-[calc(var(--u)*2)] border-[calc(var(--u)*0.5)] border-dashed border-amber-500',
      )}
    >
      {own && (
        <div className="pointer-events-none absolute inset-[calc(var(--u)*1)] flex items-center justify-center opacity-35 grayscale-[50%]">
          <Sticker card={own} />
        </div>
      )}
      {/* Case à trouver : silhouette de carte, ou image de l'article floutée (menu pinceau). */}
      {!own && missing === 'silhouette' && (
        <div className="pointer-events-none absolute inset-[calc(var(--u)*1.2)] flex items-center justify-center rounded-[calc(var(--u)*1.6)] bg-[linear-gradient(160deg,rgb(0_0_0/0.18),rgb(0_0_0/0.32))] shadow-[inset_0_0_0_calc(var(--u)*0.3)_rgb(255_255_255/0.15)]">
          <span className="font-heading text-[calc(var(--u)*9)] font-black text-white/35">?</span>
        </div>
      )}
      {blurred && (
        <div className="pointer-events-none absolute inset-[calc(var(--u)*1.2)] overflow-hidden rounded-[calc(var(--u)*1.6)]">
          <img src={blurred} alt="" className="size-full scale-110 object-cover opacity-55 blur-[calc(var(--u)*1.2)] grayscale-[30%]" />
        </div>
      )}
      {!own && next && (
        <a
          href={auctionUrl(next.id)}
          target="_blank"
          rel="noopener"
          onPointerDown={(e) => e.stopPropagation()}
          title={`En vente : ${listings!.length} annonce(s) — la plus proche de la fin ${endsIn(next.endAt)}`}
          className="absolute top-[calc(var(--u)*1)] right-[calc(var(--u)*1)] flex items-center gap-[calc(var(--u)*0.6)] rounded-full bg-sky-500 px-[calc(var(--u)*1.4)] py-[calc(var(--u)*0.5)] text-[calc(var(--u)*2)] font-bold text-white shadow transition hover:scale-105 hover:bg-sky-600"
        >
          <Store className="size-[calc(var(--u)*2.4)]" />
          {next.price != null ? `${nfPrice.format(next.price)} WB` : 'En vente'}
          {listings!.length > 1 && <span className="opacity-80">×{listings!.length}</span>}
        </a>
      )}
      {/* Le nom est déjà écrit sur l'étiquette de la case quand le style en a une. */}
      {!look.slotTag && (
        <span className={cn('relative line-clamp-3 text-[calc(var(--u)*2.5)] leading-tight font-semibold', own ? 'text-amber-900' : look.slotLabel)}>{entry.title}</span>
      )}
      {own && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onStick(own)}
          title="Coller la carte dans l'album (en attente d'envoi)"
          className="relative cursor-pointer rounded-full bg-amber-500 px-[calc(var(--u)*2.2)] py-[calc(var(--u)*0.7)] text-[calc(var(--u)*2.3)] font-bold text-white shadow transition hover:scale-105 hover:bg-amber-600"
        >
          + Coller
        </button>
      )}
    </div>
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
  cover,
  unsent,
  onRemove,
  locked,
  goal,
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
  cover: CoverProps;
  /** Cartes de l'album dont l'ajout n'est pas encore envoyé. */
  unsent: Set<string>;
  /** Retire la carte de l'album (en attente d'envoi) ; absent quand l'album n'est pas une étiquette modifiable. */
  onRemove?: (card: OwnedCard) => void;
  /** Vue triée par rareté : les vignettes ne se déplacent pas. */
  locked?: boolean;
  /** Album à objectif : cases « goal:<n> » pour les cartes pas encore collées. */
  goal?: GoalView;
}) {
  if (face === 'none') return null;

  if (face === 'cover') {
    return (
      <div className="absolute inset-0 overflow-hidden rounded-r-[calc(var(--u)*3)] rounded-l-[calc(var(--u)*1)] text-white shadow-2xl" style={look.cover(gradient)}>
        <div className="absolute inset-y-0 left-0 w-[calc(var(--u)*4)] bg-black/25" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_10%,rgb(255_255_255/0.2),transparent_60%)]" />
        <div className="relative flex h-full flex-col items-center justify-center gap-[calc(var(--u)*4)] px-[calc(var(--u)*10)] text-center">
          <p className="text-[calc(var(--u)*3.2)] font-semibold tracking-[0.3em] uppercase opacity-80">Album</p>
          <CoverEmblem cards={cards} />
          <CoverText title={title} look={look} cover={cover} />
          <div className="h-[calc(var(--u)*1)] w-1/2 rounded-full bg-holo" />
          <p className="text-[calc(var(--u)*3.4)] font-medium opacity-90">{cover.progress ?? `${slots.filter(Boolean).length} vignettes`}</p>
          <BrandIcon palette={palette} className="mt-[calc(var(--u)*4)] size-[calc(var(--u)*12)] drop-shadow-xl" />
          {cover.editable && (
            <button
              type="button"
              onClick={cover.onOpen}
              className="absolute right-[calc(var(--u)*5)] bottom-[calc(var(--u)*5)] flex cursor-pointer items-center gap-[calc(var(--u)*1.5)] rounded-full bg-white/90 px-[calc(var(--u)*4)] py-[calc(var(--u)*2)] text-[calc(var(--u)*3.2)] font-semibold text-zinc-900 shadow-lg transition hover:scale-105 hover:bg-white"
            >
              Ouvrir <ChevronRight className="size-[calc(var(--u)*3.5)]" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const exists = face < total;
  const { perPage, cols, u: unit, numbers, tilted } = useContext(LookContext);
  const first = face * perPage;
  // Parties présentes sur la page (bandeau du mode « page », légende du mode « couleur »).
  const pageRuns = goal
    ? [...new Set(goal.entryAt.slice(first, first + perPage).filter((n): n is number => n !== null).map((n) => goal.runOf[n]!))].map((k) => goal.runs[k]!)
    : [];
  const namedOnPage = pageRuns.filter((r) => r.name);
  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden',
        look.page,
        // En 3D, coins presque vifs : la page doit coïncider avec la tranche du bloc en dessous.
        look.depth ? (side === 'left' ? 'rounded-l-[calc(var(--u)*1.4)]' : 'rounded-r-[calc(var(--u)*1.4)]') : side === 'left' ? 'rounded-l-[calc(var(--u)*2.5)]' : 'rounded-r-[calc(var(--u)*2.5)]',
      )}
      style={{ ...look.pageStyle(side), ...(look.pageMask ? { maskImage: look.pageMask(side), WebkitMaskImage: look.pageMask(side), maskSize: '100% 100%', WebkitMaskSize: '100% 100%' } : {}) }}
    >
      {look.id === 'classeur' && <Punches side={side} />}
      {exists && (
        <div className="flex h-full flex-col">
          <div className={cn('flex items-center justify-between gap-[calc(var(--u)*3)] px-[calc(var(--u)*6)] pt-[calc(var(--u)*4.5)] text-[calc(var(--u)*2.8)]', look.header)}>
            {/* Mode « page » : la partie de la page en bandeau (plusieurs petites parties : un titre par ligne). */}
            <span className="truncate">
              {goal?.mode === 'page' && namedOnPage.length === 1
                ? namedOnPage[0]!.name
                : (goal?.mode === 'header' || goal?.mode === 'tint') && namedOnPage.length
                  ? namedOnPage.map((r, i) => (
                      <Fragment key={r.start}>
                        {i > 0 && ' · '}
                        {goal.mode === 'tint' && <i className="mr-[calc(var(--u)*1)] inline-block size-[calc(var(--u)*1.6)] rounded-full align-middle opacity-70" style={{ backgroundColor: r.color }} />}
                        {r.name}
                      </Fragment>
                    ))
                  : title}
            </span>
            <span className={cn('h-[calc(var(--u)*0.7)] w-[calc(var(--u)*12)] shrink-0 rounded-full', look.headerAccent)} />
          </div>
          {goal?.mode === 'color' && pageRuns.some((r) => r.name) && (
            <div className="flex flex-wrap gap-x-[calc(var(--u)*3)] gap-y-[calc(var(--u)*0.5)] px-[calc(var(--u)*6)] pt-[calc(var(--u)*1.2)] text-[calc(var(--u)*2.2)]">
              {pageRuns
                .filter((r) => r.name)
                .map((r) => (
                  <span key={r.start} className={cn('flex min-w-0 items-center gap-[calc(var(--u)*1)]', look.slotLabel)}>
                    <span className="size-[calc(var(--u)*1.8)] shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="truncate">{r.name}</span>
                  </span>
                ))}
            </div>
          )}
          {/* Grille : 2 × 2, 3 × 3 ou 4 × 4 ; l'unité est mise à l'échelle pour garder les proportions des cases. */}
          <div
            className="grid min-h-0 flex-1 gap-[calc(var(--u)*3.5)] px-[calc(var(--u)*6)] pt-[calc(var(--u)*3.5)] pb-[calc(var(--u)*9)]"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${cols}, minmax(0, 1fr))`, ['--u' as string]: `${(unit * 3) / cols}px` }}
          >
            {Array.from({ length: perPage }, (_, i) => {
              const slot = first + i;
              const id = slots[slot] ?? null;
              const goalIndex = id?.startsWith('goal:') ? Number(id.slice(5)) : null;
              const card = id && goalIndex === null ? cards.get(id) : undefined;
              const dragged = drag?.slot === slot;
              const entryIndex = goal ? (goal.entryAt[slot] ?? null) : null;
              const run = goal && entryIndex !== null ? goal.runs[goal.runOf[entryIndex]!] : undefined;
              const tile = goal && id?.startsWith('section:') ? goal.runs[Number(id.slice(8))] : undefined;
              // Titre au-dessus de la ligne (mode « ligne ») : seulement en début de partie, toujours en début de ligne.
              const sectionStart =
                run?.name && entryIndex === run.start && (goal?.mode === 'row' || (goal?.mode === 'page' && pageRuns.filter((r) => r.name).length > 1)) ? run.name : null;
              return (
                <div
                  key={slot}
                  data-album-slot={slot}
                  className={cn('relative flex items-center justify-center transition-colors', look.slotEmpty, over === slot && drag && 'ring-[calc(var(--u)*0.6)] ring-primary')}
                >
                  {/* Album à objectif : numéro de la case dans la liste (pas de numéro sur les tuiles et cases vides). */}
                  {numbers && (!goal || entryIndex !== null) && (
                    <span className={cn('text-[calc(var(--u)*7)] tabular-nums', look.slotNumber, goalIndex !== null && 'absolute top-[calc(var(--u)*1)] left-[calc(var(--u)*2)] text-[calc(var(--u)*4)]')}>
                      {goal && entryIndex !== null ? entryIndex + 1 : slot + 1}
                    </span>
                  )}
                  {sectionStart && (
                    <span className={cn('absolute -top-[calc(var(--u)*2.9)] left-0 z-20 w-[calc(300%+var(--u)*7)] truncate text-[calc(var(--u)*2.2)] font-semibold whitespace-nowrap', look.slotLabel)}>
                      {sectionStart}
                    </span>
                  )}
                  {goal?.mode === 'color' && run?.name && (
                    <span className="absolute inset-x-[calc(var(--u)*1)] top-0 z-30 h-[calc(var(--u)*0.9)] rounded-b-full" style={{ backgroundColor: run.color }} />
                  )}
                  {/* Séparateurs discrets : petit titre ou trait sur la première case de la partie, teinte sur toutes ses cases. */}
                  {goal?.mode === 'caption' && run?.name && entryIndex === run.start && (
                    <span className={cn('absolute -top-[calc(var(--u)*2.7)] left-0 z-20 max-w-full truncate text-[calc(var(--u)*2.1)] font-medium whitespace-nowrap opacity-90', look.slotLabel)}>{run.name}</span>
                  )}
                  {goal?.mode === 'tick' && run?.name && entryIndex === run.start && (
                    <span title={run.name} className="absolute inset-y-[calc(var(--u)*1.5)] -left-[calc(var(--u)*2)] z-20 w-[calc(var(--u)*0.6)] rounded-full opacity-75" style={{ backgroundColor: run.color }} />
                  )}
                  {goal?.mode === 'tint' && run?.name && (
                    <span className="pointer-events-none absolute -inset-[calc(var(--u)*0.9)] rounded-[calc(var(--u)*2)]" style={{ backgroundColor: `color-mix(in oklab, ${run.color} 16%, transparent)` }} />
                  )}
                  {tile && <SectionTile run={tile} />}
                  {look.slotTag && !tile && (
                    <span className={cn('pointer-events-none absolute z-40 truncate', look.slotTag)}>
                      {card?.title ?? (goalIndex !== null && goal ? goal.entries[goalIndex]!.title : '')}
                    </span>
                  )}
                  {goalIndex !== null && goal && (
                    <GoalSlot entry={goal.entries[goalIndex]!} own={goal.match.get(goalIndex)} look={look} onStick={goal.onStick} listings={goal.market?.get(titleKey(goal.entries[goalIndex]!.title))} />
                  )}
                  {card && !dragged && (
                    <div
                      data-album-sticker={slot}
                      className={cn(
                        'group/sticker absolute inset-0 flex touch-none items-center justify-center transition-transform duration-200 hover:z-10 hover:scale-[1.04]',
                        locked ? 'cursor-zoom-in' : 'cursor-grab active:cursor-grabbing',
                      )}
                      style={{ rotate: `${tilt(card.cardId) * look.tilt * (tilted ? 1 : 0)}deg` }}
                    >
                      <div className={cn('relative h-full rounded-[calc(var(--u)*2)]', look.sticker)}>
                        <Sticker card={card} />
                        {unsent.has(card.cardId) && (
                          <span
                            title="Pas encore envoyé"
                            className="absolute -top-[calc(var(--u)*0.8)] -left-[calc(var(--u)*0.8)] z-50 size-[calc(var(--u)*3)] rounded-full bg-amber-400 ring-[calc(var(--u)*0.6)] ring-white"
                          />
                        )}
                      </div>
                      {onRemove && (
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onRemove(card)}
                          title="Retirer de l'album (en attente d'envoi)"
                          aria-label={`Retirer ${card.title} de l'album`}
                          className="absolute -top-[calc(var(--u)*1.2)] -right-[calc(var(--u)*1.2)] z-50 flex size-[calc(var(--u)*5.5)] cursor-pointer items-center justify-center rounded-full bg-zinc-900 text-white opacity-0 shadow-lg ring-[calc(var(--u)*0.4)] ring-white/80 transition group-hover/sticker:opacity-100 hover:scale-110 hover:bg-rose-500 focus-visible:opacity-100"
                        >
                          <X className="size-[calc(var(--u)*3)]" strokeWidth={3} />
                        </button>
                      )}
                      {card.wikipediaUrl && (
                        <a
                          href={card.wikipediaUrl}
                          target="_blank"
                          rel="noopener"
                          onPointerDown={(e) => e.stopPropagation()}
                          title="Ouvrir sur Wikipédia"
                          className="absolute right-[calc(var(--u)*1.8)] bottom-[calc(var(--u)*1.8)] z-50 flex size-[calc(var(--u)*6)] items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover/sticker:opacity-100"
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
 * Tranche avant du bloc de pages, en vraie 3D : une face rabattue à 90° sous le bord bas de la page, qui descend
 * jusqu'à la couverture (posée plus bas, à -épaisseur). L'inclinaison du livre la rend visible, en perspective.
 * Elle s'amincit vers la reliure (les feuilles plongent dans le pli) ; lignes de feuilles irrégulières,
 * lumière en haut, ombre en bas.
 */
function PageEdge({ side, thick, u, edges, corner }: { side: 'left' | 'right'; thick: number; u: number; edges: PageEdges; corner: number }) {
  const toSpine = side === 'left' ? 'to right' : 'to left';
  // Côté reliure : 30 % de l'épaisseur, en courbe douce jusqu'au bord extérieur.
  const taper =
    side === 'right'
      ? 'polygon(0 0, 100% 0, 100% 100%, 22% 100%, 10% 70%, 4% 45%, 0 30%)'
      : 'polygon(0 0, 100% 0, 100% 30%, 96% 45%, 90% 70%, 78% 100%, 0 100%)';
  return (
    <div
      className="pointer-events-none absolute [backface-visibility:hidden]"
      style={{
        top: '100%',
        [side]: corner,
        // S'arrête où commence l'arrondi du coin de la page : pas d'angle vif qui dépasse sous le coin.
        width: `calc(50% - ${corner}px)`,
        height: thick,
        transformOrigin: 'top',
        transform: 'rotateX(-90deg)',
        clipPath: taper,
        background: [
          `linear-gradient(${toSpine}, transparent 70%, rgb(40 25 5 / 0.45))`,
          'linear-gradient(rgb(255 255 255 / 0.35), transparent 30%, transparent 70%, rgb(30 18 4 / 0.35))',
          `repeating-linear-gradient(0deg, ${edges.line} 0 0.5px, transparent 0.5px ${(0.42 * u).toFixed(2)}px)`,
          `repeating-linear-gradient(0deg, transparent 0 ${(1.1 * u).toFixed(2)}px, ${edges.line} ${(1.1 * u).toFixed(2)}px ${(1.1 * u + 0.6).toFixed(2)}px)`,
          `linear-gradient(${edges.light}, ${edges.dark})`,
        ].join(', '),
      }}
    />
  );
}

/**
 * Livre en 3D fermé, ou couverture qui s'ouvre / se ferme : un bloc rigide (plat de couverture + feuilles de gauche)
 * qui pivote autour du dos. Fermé, il repose sur le bloc de droite (de 0 à +épaisseur) ; ouvert, il arrive
 * exactement à la place du bloc de gauche (de 0 à -épaisseur), sans saut.
 * Orientation de référence : livre fermé, à droite du dos.
 */
function CoverBoard({
  rotateY,
  thick,
  u,
  look,
  gradient,
  inset,
  front,
  back,
}: {
  rotateY: MotionValue<number> | number;
  thick: number;
  u: number;
  look: AlbumStyle;
  gradient: string;
  inset: { top: number; side: number; bottom: number };
  /** Plat de la couverture (dessus quand le livre est fermé). */
  front: ReactNode;
  /** Première page (dessous quand le livre est fermé). */
  back: ReactNode;
}) {
  const board = Math.max(2, u * 0.9);
  const edges = look.edges ?? DEFAULT_EDGES;
  const lines = (deg: number) => `repeating-linear-gradient(${deg}deg, ${edges.line} 0 0.5px, transparent 0.5px ${(0.42 * u).toFixed(2)}px)`;
  const leather = `linear-gradient(rgb(0 0 0 / 0.45), rgb(0 0 0 / 0.45)), ${gradient}`;
  const over = { top: -inset.top * u, bottom: -inset.bottom * u, right: -inset.side * u, left: 0 };
  return (
    <motion.div className="absolute inset-y-0 left-1/2 w-1/2 origin-left" style={{ rotateY, transformStyle: 'preserve-3d', zIndex: 30 }}>
      {/* Plat extérieur (dessus quand fermé). */}
      <div className="absolute [backface-visibility:hidden]" style={{ ...over, transform: `translateZ(${thick + board}px)` }}>
        <div className="absolute inset-0 rounded-l-[calc(var(--u)*1)] rounded-r-[calc(var(--u)*3)]">{front}</div>
      </div>
      {/* Intérieur de la couverture (visible en débord autour de la première page, une fois ouverte). */}
      <div className="absolute rounded-l-[calc(var(--u)*1)] rounded-r-[calc(var(--u)*3)] [backface-visibility:hidden]" style={{ ...over, transform: `translateZ(${thick}px) rotateY(180deg)`, ...look.frame(gradient) }} />
      {/* Tranche du plat : bas et côté extérieur. */}
      <div className="absolute" style={{ left: 0, right: over.right, top: `calc(100% + ${-over.bottom}px)`, height: board, transformOrigin: 'top', transform: `translateZ(${thick + board}px) rotateX(-90deg)`, background: leather }} />
      <div className="absolute" style={{ top: over.top, bottom: over.bottom, left: `calc(100% + ${-over.right}px)`, width: board, transformOrigin: 'left', transform: `translateZ(${thick + board}px) rotateY(90deg)`, background: leather }} />
      {/* Bloc de feuilles : tranche du bas et tranche extérieure (de 0 à +épaisseur). */}
      <div className="absolute inset-x-0" style={{ top: '100%', height: thick, transformOrigin: 'top', transform: 'rotateX(90deg)', background: `linear-gradient(rgb(30 18 4 / 0.3), transparent 40%, rgb(255 255 255 / 0.3)), ${lines(0)}, linear-gradient(${edges.dark}, ${edges.light})` }} />
      <div className="absolute inset-y-0" style={{ left: '100%', width: thick, transformOrigin: 'left', transform: 'rotateY(-90deg)', background: `linear-gradient(to left, rgb(30 18 4 / 0.25), transparent 40%), ${lines(90)}, linear-gradient(to left, ${edges.dark}, ${edges.light})` }} />
      {/* Première page (dessous quand fermé, dessus une fois ouvert). */}
      <div className="absolute inset-0 [backface-visibility:hidden]" style={{ transform: 'rotateY(180deg)' }}>
        {back}
      </div>
    </motion.div>
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
  /** Étiquette de l'album quand on peut y ajouter des cartes (absent pour « Sans étiquette » et les statuts) : active les recommandations. */
  tagId?: string;
  /** Ouvre l'album directement sur les cartes à ajouter (badge « +N » de la page Albums). */
  focusImprove?: boolean;
  /** Album de rangement : on y range sans chercher à le compléter, donc pas de souhaits. */
  storage?: boolean;
  /** Renomme l'étiquette ; absent quand le nom ne peut pas changer. */
  onRename?: (name: string) => Promise<void>;
  onClose: () => void;
}

/** Album à feuilleter façon Panini : doubles pages, pages qui se tournent, vignettes à ranger par glisser-déposer. */
export function Album({ title, gradient: openedGradient, cards, layoutKey, tagId, focusImprove, storage, onRename, onClose }: AlbumProps) {
  const sheets = useAlbumSheets();
  const sheet = tagId ? sheets[tagId] : undefined;
  const palette = useCollection((s) => s.settings.palette);
  const defaultStyle = useCollection((s) => s.settings.albumStyle);
  // Style propre à cet album, sinon le style par défaut des réglages.
  const [ownStyle, setOwnStyle] = useState<AlbumStyleId | null>(null);
  const [sectionMode, setSectionMode] = useState<SectionMode>('tile');
  const albumStyle = ownStyle ?? defaultStyle;
  /** 2D / 3D choisi pour cet album (menu pinceau) ; absent = selon le style. */
  const [ownDepth, setOwnDepth] = useState<boolean | null>(null);
  const pending = useCollection((s) => s.pending);
  const stageOutOfAlbum = useCollection((s) => s.stageOutOfAlbum);
  /** Apparence de l'album (menu pinceau) : emblème, couverture, cases, cartes, ambiance. */
  const [albumLook, setAlbumLook] = useState<AlbumLook>({});
  const opt = { ...DEFAULT_LOOK, ...albumLook };
  const baseLook = ALBUM_STYLES[albumStyle] ?? ALBUM_STYLES.relie;
  const look = useMemo<AlbumStyle>(
    () => ({
      ...baseLook,
      depth: ownDepth ?? baseLook.depth,
      cover: baseLook.coverVariants?.[albumLook.grimoireCover ?? 'b']?.cover ?? baseLook.cover,
      pageStyle: (side) => baseLook.pageStyle(side, albumLook.pattern ?? true),
    }),
    [baseLook, ownDepth, albumLook.grimoireCover, albumLook.pattern],
  );
  const perPage = opt.perPage;
  const cols = Math.round(Math.sqrt(perPage));
  /** Durée des animations selon le réglage « vitesse ». */
  const speed = opt.speed === 'none' ? 0.01 : opt.speed === 'fast' ? 0.5 : 1;
  const [slots, setSlots] = useState<(string | null)[] | null>(null);
  const [spread, setSpread] = useState(0);
  // L'album s'ouvre sur sa couverture ; l'aperçu de développement (captures du README) l'affiche déjà ouvert.
  const [closed, setClosed] = useState(() => !(window as { __collectionPlusStatic?: boolean }).__collectionPlusStatic);
  const [leaf, setLeaf] = useState<Leaf | null>(null);
  const [description, setDescription] = useState('');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [pageW, setPageW] = useState(380);
  const [picking, setPicking] = useState(false);
  /** Mode « Style d'album » : livre à gauche, réglages à droite ; le livre suit le volet ouvert. */
  const [studio, setStudio] = useState(false);
  const [panel, setPanel] = useState<StudioPart | null>('cover');
  const studioRef = useRef(studio);
  studioRef.current = studio;
  const [order, setOrder] = useState<AlbumOrder>('manual');
  const albumTag = useCollection((s) => (tagId ? s.tags.find((t) => t.id === tagId) : undefined));
  // Couleur suivie en direct : la changer dans le menu pinceau recolore le livre tout de suite.
  const gradient = albumTag?.color && /^#[0-9a-f]{6}$/i.test(albumTag.color) ? `linear-gradient(135deg, ${albumTag.color}, color-mix(in oklab, ${albumTag.color} 62%, black))` : openedGradient;
  const allCards = useCollection((s) => s.cards);
  const stageIntoAlbum = useCollection((s) => s.stageIntoAlbum);
  const facts = useSuggestions((s) => s.facts);
  const [goal, setGoal] = useState<GoalAlbum | null>(null);
  useEffect(() => {
    if (!tagId) return;
    goalAlbumsItem.getValue().then((all) => setGoal(all[tagId] ?? null));
    return goalAlbumsItem.watch((all) => setGoal(all?.[tagId] ?? null));
  }, [tagId]);
  const availability = useAiAvailability();
  const { write, busy } = useWriteSheet();

  const progress = useMotionValue(0);
  // Lus par les animations (callbacks mémorisés) : vitesse et son à jour sans les recréer.
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const optRef = useRef(opt);
  optRef.current = opt;
  const dirRef = useRef<1 | -1>(1);
  const rotateY = useTransform(progress, (v) => (dirRef.current === 1 ? -180 : 180) * v);
  /** Couverture en 3D : -180° = ouverte (à gauche), 0° = fermée ; à l'ouverture 0 → -180, à la fermeture -180 → 0. */
  const boardRotate = useTransform(progress, (v) => (dirRef.current === 1 ? -180 * v : -180 * (1 - v)));
  const frontShade = useTransform(progress, [0, 0.5], [0, 0.35]);
  const backShade = useTransform(progress, [0.5, 1], [0.35, 0]);
  const bookRef = useRef<HTMLDivElement>(null);
  const wishesRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(cards.map((c) => [c.cardId, c])), [cards]);
  // Album à objectif : une case par entrée de la liste, dans son ordre ; l'annexe commence sur une nouvelle page.
  const goalLayout = useMemo(() => {
    if (!goal) return null;
    const match = matchEntries(goal.entries, allCards, facts);
    const inAlbum = new Set(cards.map((c) => c.cardId));
    const built = goalSlots(
      goal.entries,
      (i) => {
        const card = match.get(i);
        return card && inAlbum.has(card.cardId) ? card.cardId : `goal:${i}`;
      },
      sectionMode,
      perPage,
      cols,
    );
    const layout = built.slots;
    const collected = layout.filter((id) => id && !id.startsWith('goal:') && !id.startsWith('section:')).length;
    const matched = new Set([...match.values()].map((c) => c.cardId));
    const extra = cards.filter((c) => !matched.has(c.cardId));
    if (goal.annex && extra.length) {
      while (layout.length % perPage) layout.push(null);
      layout.push(...raritySlots(extra));
    }
    const toStick = [...match.values()].filter((c) => !inAlbum.has(c.cardId));
    const missing = goal.entries.filter((_, i) => !match.has(i));
    return { layout, match, collected, toStick, missing, entryAt: built.entryAt, runs: built.runs, runOf: built.runOf };
  }, [goal, allCards, facts, cards, sectionMode, perPage, cols]);
  // Mode Marché : cases manquantes en vente (recherche lancée au clic, résultat partagé avec le panneau du dessous).
  const market = useMarket((s) => (tagId ? s.byAlbum[tagId] : undefined));
  const searchMarket = (force = false) => {
    if (!tagId || !goalLayout?.missing.length) return;
    void useMarket.getState().search(tagId, goalLayout.missing.map((e) => e.title), force);
  };
  const onSale = market?.status === 'done' ? goalLayout?.missing.filter((e) => market.listings.has(titleKey(e.title))).length ?? 0 : 0;
  // Vue par rareté : calculée à l'affichage, le rangement manuel enregistré n'est pas modifié.
  const shown = useMemo(
    () => (goalLayout ? goalLayout.layout : order === 'rarity' && slots ? raritySlots(cards) : slots),
    [goalLayout, order, slots, cards],
  );
  const stick = useCallback((list: OwnedCard[]) => tagId && list.length && stageIntoAlbum(list, { id: tagId, name: title }), [tagId, title, stageIntoAlbum]);
  /** Collage spectaculaire : les cartes dont la case est à l'écran tombent dedans (StickFx), les autres sont collées tout de suite. */
  const [shots, setShots] = useState<StickShot[]>([]);
  const stickWithFx = (list: OwnedCard[]) => {
    if (!goalLayout || !list.length) return stick(list);
    const now: OwnedCard[] = [];
    const fx: StickShot[] = [];
    for (const card of list) {
      const entry = [...goalLayout.match.entries()].find(([, c]) => c.cardId === card.cardId)?.[0];
      const slot = entry === undefined ? -1 : goalLayout.entryAt.indexOf(entry);
      const el = slot >= 0 ? document.querySelector<HTMLElement>(`[data-album-slot="${slot}"]`) : null;
      const r = el?.getBoundingClientRect();
      if (!r || fx.length >= 12 || r.bottom < 0 || r.top > window.innerHeight) {
        now.push(card);
        continue;
      }
      fx.push({ key: `${card.cardId}-${Date.now()}`, card, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, delay: fx.length * 0.14 });
    }
    if (now.length) stick(now);
    if (!fx.length) return;
    setShots((s) => [...s, ...fx]);
    fx.forEach((shot, i) =>
      window.setTimeout(() => {
        stick([shot.card]);
        if (i < 6) playStick();
      }, (shot.delay + STICK_IMPACT) * 1000),
    );
    const keys = new Set(fx.map((f) => f.key));
    window.setTimeout(() => setShots((s) => s.filter((f) => !keys.has(f.key))), (fx.at(-1)!.delay + 1.6) * 1000);
  };
  const total = pageCount(shown?.length ?? 0, perPage);
  const spreads = total / 2;

  // Refs lues par les gestionnaires de pointeur (évite les valeurs figées).
  const state = useRef({ spread, spreads, leaf, slots: shown, closed, order });
  state.current = { spread, spreads, leaf, slots: shown, closed, order: goalLayout ? 'rarity' : order };
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
    // Mode Style : le livre n'a que la moitié gauche de l'écran.
    const fit = () =>
      setPageW(
        Math.floor(
          Math.max(160, Math.min(520, studio ? (window.innerWidth / 2 - 220) / 2 : (window.innerWidth - 140) / 2, (window.innerHeight - (studio ? 140 : 190)) * 0.75)),
        ),
      );
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [studio]);

  useEffect(() => {
    albumDescriptionsItem.getValue().then((all) => setDescription(all[layoutKey] ?? ''));
    albumOrdersItem.getValue().then((all) => setOrder(all[layoutKey] ?? 'manual'));
    albumStylesItem.getValue().then((all) => setOwnStyle(all[layoutKey] ?? null));
    albumSectionsItem.getValue().then((all) => setSectionMode(all[layoutKey] ?? 'tile'));
    albumDepthItem.getValue().then((all) => setOwnDepth(all[layoutKey] ?? null));
    albumLooksItem.getValue().then((all) => setAlbumLook(all[layoutKey] ?? {}));
  }, [layoutKey]);

  // Réf. à jour : plusieurs réglages changés d'affilée s'additionnent au lieu de s'écraser.
  const lookRef = useRef(albumLook);
  lookRef.current = albumLook;
  const changeLook = async (patch: AlbumLook) => {
    const next = { ...lookRef.current, ...patch };
    lookRef.current = next;
    setAlbumLook(next);
    const all = await albumLooksItem.getValue();
    await albumLooksItem.setValue({ ...all, [layoutKey]: next });
  };

  /** Tout revenir aux valeurs par défaut pour cet album (style, relief, parties, ordre et apparence). */
  const resetLook = async () => {
    setAlbumLook({});
    setOwnStyle(null);
    setOwnDepth(null);
    setSectionMode('tile');
    setOrder('manual');
    for (const item of [albumLooksItem, albumStylesItem, albumDepthItem, albumSectionsItem, albumOrdersItem] as const) {
      const all = (await item.getValue()) as Record<string, unknown>;
      if (layoutKey in all) {
        const { [layoutKey]: _, ...rest } = all;
        await (item as typeof albumLooksItem).setValue(rest as never);
      }
    }
    toast('Apparence de l’album remise par défaut', 'success');
  };

  const shareCode = async () => {
    if (!goal || !albumTag) return;
    try {
      const code = await encodeAlbumCode(albumTag.name, albumTag.color, goal);
      await navigator.clipboard.writeText(code);
      toast(`Code de « ${albumTag.name} » copié (${code.length} caractères)`, 'success');
    } catch (e) {
      toast(`Copie impossible : ${(e as Error).message}`, 'error');
    }
  };

  /** Image de la double page affichée (PNG). */
  const exportImage = async () => {
    const node = bookRef.current;
    if (!node) return;
    // html-to-image rend en noir les textures SVG à filtres (grain, fibres, bords déchirés) : on les retire le temps
    // de l'export (couches remplacées par « none »), couleurs et dégradés gardés.
    // Liste des couches lue sur le style calculé (le style en ligne contient des « initial » mal relus),
    // et attribut style remis tel quel après coup.
    const noisy = /feTurbulence|feDisplacementMap/;
    const restore: (() => void)[] = [];
    for (const el of [node, ...node.querySelectorAll<HTMLElement>('*')]) {
      const style = el.getAttribute('style') ?? '';
      if (!noisy.test(style)) continue;
      restore.push(() => el.setAttribute('style', style));
      const computed = getComputedStyle(el);
      if (noisy.test(computed.backgroundImage))
        el.style.backgroundImage = splitLayers(computed.backgroundImage)
          .map((l) => (noisy.test(l) ? 'none' : l))
          .join(', ');
      if (noisy.test(computed.maskImage)) {
        el.style.maskImage = 'none';
        el.style.webkitMaskImage = 'none';
      }
    }
    try {
      const url = await toPng(node, { pixelRatio: 2, cacheBust: true, style: { transform: 'none' } });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^\p{L}\p{N} -]+/gu, '').trim() || 'album'}.png`;
      a.click();
    } catch (e) {
      toast(`Export impossible : ${(e as Error).message}`, 'error');
    } finally {
      restore.forEach((r) => r());
    }
  };

  const changeDepth = async (next: boolean) => {
    setOwnDepth(next);
    const all = await albumDepthItem.getValue();
    await albumDepthItem.setValue({ ...all, [layoutKey]: next });
  };

  const changeSections = async (next: SectionMode) => {
    setSectionMode(next);
    const all = await albumSectionsItem.getValue();
    await albumSectionsItem.setValue({ ...all, [layoutKey]: next });
  };

  const changeStyle = async (next: AlbumStyleId) => {
    setOwnStyle(next);
    const all = await albumStylesItem.getValue();
    await albumStylesItem.setValue({ ...all, [layoutKey]: next });
  };

  const changeOrder = async (next: AlbumOrder) => {
    setOrder(next);
    const all = await albumOrdersItem.getValue();
    await albumOrdersItem.setValue({ ...all, [layoutKey]: next });
  };

  // Moins de pages dans l'autre vue : on reste dans l'album.
  useEffect(() => {
    if (spread > spreads - 1) setSpread(Math.max(0, spreads - 1));
  }, [spread, spreads]);

  /** Description rédigée par l'IA (fiche de l'album) ; elle remplace la note écrite à la main. */
  const generate = async () => {
    if (!albumTag) return;
    const sheet = await write(albumTag, cards);
    if (!sheet) return;
    const all = await albumDescriptionsItem.getValue();
    if (all[layoutKey] !== undefined) {
      const { [layoutKey]: _, ...rest } = all;
      await albumDescriptionsItem.setValue(rest);
    }
    setDescription('');
  };

  const saveCover = async (name: string, desc: string) => {
    if (onRename && name !== title) await onRename(name);
    // Une seule description : celle de la fiche IA quand l'album en a une (retouchée à la main), sinon une note libre.
    if (tagId && sheet && desc !== sheet.summary) await updateSheet(tagId, { summary: desc });
    const all = await albumDescriptionsItem.getValue();
    const next = { ...all };
    if (desc && !(tagId && sheet)) next[layoutKey] = desc;
    else delete next[layoutKey];
    await albumDescriptionsItem.setValue(next);
    setDescription(next[layoutKey] ?? '');
  };

  useEffect(() => {
    if (!focusImprove) return;
    const timer = window.setTimeout(() => wishesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
    return () => window.clearTimeout(timer);
  }, [focusImprove]);

  /** Couverture ↔ première double page. */
  const toggleCover = useCallback(
    (open: boolean) => {
      const { leaf, closed, slots } = state.current;
      if (leaf || !slots || closed !== open) return;
      const next: Leaf = open ? { dir: 1, opening: true } : { dir: -1, closing: true };
      setSpread(0);
      if (open) setClosed(false);
      dirRef.current = next.dir;
      progress.set(0);
      setLeaf(next);
      state.current.leaf = next;
      if (optRef.current.sound) playPageTurn(true);
      animate(progress, 1, { duration: 0.9 * speedRef.current, ease: [0.45, 0.05, 0.2, 1] }).then(() => {
        if (!open) setClosed(true);
        setLeaf(null);
        progress.set(0);
      });
    },
    [progress],
  );

  const canFlip = (dir: 1 | -1) => {
    const { spread, spreads, leaf, closed } = state.current;
    return !leaf && !closed && (dir === 1 ? spread < spreads - 1 : spread > 0);
  };

  const endFlip = useCallback(
    (dir: 1 | -1, commit: boolean) => {
      if (commit && optRef.current.sound) playPageTurn();
      return animate(progress, commit ? 1 : 0, { ...FLIP, duration: FLIP.duration * speedRef.current }).then(() => {
        if (commit) setSpread((s) => s + dir);
        setLeaf(null);
        progress.set(0);
      });
    },
    [progress],
  );

  const flip = useCallback(
    (dir: 1 | -1) => {
      // Tourner avant la première page revient sur la couverture, et inversement.
      if (state.current.closed) return dir === 1 && toggleCover(true);
      if (dir === -1 && state.current.spread === 0) return toggleCover(false);
      if (!canFlip(dir)) return;
      dirRef.current = dir;
      progress.set(0);
      setLeaf({ dir });
      state.current.leaf = { dir };
      endFlip(dir, true);
    },
    [endFlip, progress, toggleCover],
  );

  const jump = (to: number) => {
    if (state.current.leaf || state.current.closed) return;
    setSpread(Math.max(0, Math.min(spreads - 1, to)));
  };

  // Clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || picking) return;
      // Mode Style : Échap en sort (sans fermer l'album).
      if (e.key === 'Escape') (studioRef.current ? setStudio(false) : onClose());
      else if (e.key === 'ArrowRight') flip(1);
      else if (e.key === 'ArrowLeft') flip(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flip, onClose, picking]);

  /**
   * Un seul geste au pointeur :
   * - sur une vignette : déplacement (glisser-déposer vers une autre case, bords du livre pour tourner la page) ;
   * - ailleurs sur une page : la page suit le doigt et se tourne si on la lâche après la moitié du chemin.
   */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || state.current.leaf || state.current.closed || !state.current.slots) return;
    const target = e.target as HTMLElement;
    if (target.closest('a,button,input,textarea')) return;
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
        // Vue par rareté : pas de rangement, un clic ouvre la carte.
      if (state.current.order === 'rarity' || (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5)) return;
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
  } else if (leaf?.closing) {
    under = ['none', 1];
    leafFaces = [0, 'cover'];
  } else if (closed) {
    // La couverture fermée est le bloc qui pivote (CoverBoard), posé sur la page 1.
    under = ['none', 1];
  } else if (leaf?.dir === 1) {
    under = [L, R + 2 < total ? R + 2 : 'none'];
    leafFaces = [R, R + 1];
  } else if (leaf?.dir === -1) {
    under = [L - 2 >= 0 ? L - 2 : 'none', R];
    leafFaces = [L, L - 1];
  }

  const bookShut = closed || leaf?.opening || leaf?.closing;
  const cover: CoverProps = {
    description: description || sheet?.summary || '',
    aiWritten: !description && Boolean(sheet?.summary) && !sheet?.edited,
    editable: closed && !leaf,
    canRename: Boolean(onRename),
    onSave: saveCover,
    onOpen: () => toggleCover(true),
    onGenerate: albumTag && availability && availability !== 'unavailable' && cards.length ? generate : undefined,
    generating: Boolean(tagId && busy.has(tagId)),
    progress: goal && goalLayout ? `${goalLayout.collected} / ${goal.entries.length} cartes` : undefined,
  };
  const unsent = useMemo(() => new Set(tagId ? Object.keys(pending).filter((id) => pending[id]![tagId] === true) : []), [pending, tagId]);
  const onRemove = useCallback(
    (card: OwnedCard) => {
      if (!tagId) return;
      stageOutOfAlbum([card], tagId);
      setRemovedFromAlbum(tagId, (ids) => [...ids, card.cardId]);
    },
    [tagId, stageOutOfAlbum],
  );
  const pageProps = { slots: shown ?? [], cards: byId, title, gradient, total, drag, over, palette, look, cover, unsent, onRemove: tagId ? onRemove : undefined, locked: Boolean(goalLayout) || order === 'rarity',
    goal: goal && goalLayout ? { entries: goal.entries, match: goalLayout.match, onStick: (card: OwnedCard) => stickWithFx([card]), market: market?.listings, mode: sectionMode, entryAt: goalLayout.entryAt, runs: goalLayout.runs, runOf: goalLayout.runOf } : undefined };
  const draggedCard = drag ? byId.get(drag.cardId) : undefined;
  const u = pageW / 100;
  /** Épaisseur du bloc de pages (styles en 3D), selon le nombre de doubles pages. */
  const thick = look.depth ? Math.round((6 + Math.min(spreads, 14) * 1.1) * u) : 0;
  /** Arrondi des coins extérieurs des pages (la tranche s'arrête là où il commence). */
  const pageCorner = u * 1.4;
  const pageH = Math.round(pageW / 0.75);

  /* ---------- Mode Style d'album ---------- */
  const zoomCards = studio && panel === 'cards' && !closed && !leaf;
  /** État à l'entrée dans le mode, pour « Annuler les changements ». */
  const snapshot = useRef<{ look: AlbumLook; style: AlbumStyleId | null; depth: boolean | null; sections: SectionMode; order: AlbumOrder; color: string | null } | null>(null);
  const enterStudio = () => {
    snapshot.current = { look: albumLook, style: ownStyle, depth: ownDepth, sections: sectionMode, order, color: albumTag?.color ?? null };
    setPanel('cover');
    setStudio(true);
  };
  const leaveStudio = () => {
    setStudio(false);
    if (state.current.closed) window.setTimeout(() => toggleCover(true), 350);
  };
  const studioDirty =
    studio &&
    snapshot.current !== null &&
    (JSON.stringify(snapshot.current.look) !== JSON.stringify(albumLook) ||
      snapshot.current.style !== ownStyle ||
      snapshot.current.depth !== ownDepth ||
      snapshot.current.sections !== sectionMode ||
      snapshot.current.order !== order ||
      snapshot.current.color !== (albumTag?.color ?? null));
  const cancelStudio = async () => {
    const snap = snapshot.current;
    if (!snap) return;
    setAlbumLook(snap.look);
    lookRef.current = snap.look;
    setOwnStyle(snap.style);
    setOwnDepth(snap.depth);
    setSectionMode(snap.sections);
    setOrder(snap.order);
    const put = async (item: typeof albumLooksItem, value: unknown) => {
      const all = (await item.getValue()) as Record<string, unknown>;
      const { [layoutKey]: _, ...rest } = all;
      await item.setValue((value === null || value === undefined ? rest : { ...rest, [layoutKey]: value }) as never);
    };
    await put(albumLooksItem, Object.keys(snap.look).length ? snap.look : null);
    await put(albumStylesItem as unknown as typeof albumLooksItem, snap.style);
    await put(albumDepthItem as unknown as typeof albumLooksItem, snap.depth);
    await put(albumSectionsItem as unknown as typeof albumLooksItem, snap.sections === 'tile' ? null : snap.sections);
    await put(albumOrdersItem as unknown as typeof albumLooksItem, snap.order === 'manual' ? null : snap.order);
    if (albumTag && snap.color && snap.color !== albumTag.color) void useCollection.getState().updateTag(albumTag.id, { color: snap.color });
    toast('Changements annulés', 'info');
  };
  // Le livre suit le volet : fermé pour la couverture, ouvert pour les pages, les cartes et l'ambiance.
  useEffect(() => {
    if (!studio || !panel || leaf) return;
    if (panel === 'cover' && !closed) toggleCover(false);
    if (panel !== 'cover' && closed) toggleCover(true);
  }, [studio, panel, closed, leaf, toggleCover]);
  /** Volet Ambiance : une page tourne pour voir et entendre le réglage. */
  const demoTurn = () =>
    window.setTimeout(() => {
      const { spread, spreads, closed: shut } = state.current;
      if (shut) return;
      flip(spread < spreads - 1 ? 1 : -1);
    }, 60);

  const bookRow = (
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => flip(-1)}
          disabled={closed || Boolean(leaf)}
          aria-label={spread === 0 ? 'Revenir à la couverture' : 'Page précédente'}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-default disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>

        {/* Zoom du mode Style (volet Cartes) : la page de gauche du livre ouvert, en grand. */}
        <motion.div
          style={{ perspective: pageW * 6 }}
          // Mode Style, livre fermé : recentré (la couverture n'occupe que la moitié droite du livre).
          animate={{ scale: zoomCards ? 1.85 : 1, x: zoomCards ? pageW * 0.92 : studio && closed && !leaf ? -pageW / 2 : 0, y: zoomCards ? pageH * 0.05 : 0 }}
          transition={{ type: 'spring', stiffness: 150, damping: 24 }}
        >
        <motion.div
          ref={bookRef}
          initial={{ scale: 0.85, y: 30, rotateX: 0 }}
          animate={{ scale: 1, y: 0, rotateX: look.depth ? 22 : 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          onPointerDown={onPointerDown}
          className={cn(
            'relative touch-none',
            // Reflets des cartes rares coupés (menu pinceau).
            !opt.shine && '[&_.wm-foil]:hidden [&_.wm-glare]:hidden [&_.wm-glitter]:hidden [&_.wm-holo]:hidden [&_.wm-rim]:hidden [&_.wm-shine]:hidden',
          )}
          style={{ width: pageW * 2, height: pageH, transformStyle: 'preserve-3d', ['--u' as string]: `${u}px` }}
        >
          {/* Couverture ouverte derrière les pages et, en 3D, tranches du bloc de pages. Livre fermé ou couverture
              en mouvement : seul le dos de couverture (moitié droite) est là, le plat est le bloc qui pivote. */}
          {!bookShut ? (
            <>
              <div
                className="absolute rounded-[calc(var(--u)*3.5)]"
                style={{
                  top: `calc(var(--u) * ${-look.frameInset.top})`,
                  bottom: `calc(var(--u) * ${-look.frameInset.bottom})`,
                  left: `calc(var(--u) * ${-look.frameInset.side})`,
                  right: `calc(var(--u) * ${-look.frameInset.side})`,
                  transform: `translateZ(${-thick - 0.5}px)`,
                  ...look.frame(gradient),
                }}
              />
              {look.depth && (
                <>
                  {/* Ombre du bloc de pages sur la couverture. */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[calc(var(--u)*2.5)]"
                    style={{ transform: `translateZ(${-thick + 0.5}px)`, boxShadow: `0 ${u * 1.2}px ${u * 3}px rgb(20 10 0 / 0.55), 0 0 ${u * 1}px rgb(20 10 0 / 0.35)` }}
                  />
                  <PageEdge side="left" thick={thick} u={u} edges={look.edges ?? DEFAULT_EDGES} corner={pageCorner} />
                  <PageEdge side="right" thick={thick} u={u} edges={look.edges ?? DEFAULT_EDGES} corner={pageCorner} />
                  <Headbands />
                </>
              )}
            </>
          ) : (
            <>
              <div
                className="absolute rounded-r-[calc(var(--u)*3.5)]"
                style={{
                  top: `calc(var(--u) * ${-look.frameInset.top})`,
                  bottom: `calc(var(--u) * ${-look.frameInset.bottom})`,
                  left: '50%',
                  right: `calc(var(--u) * ${-look.frameInset.side})`,
                  transform: `translateZ(${-thick - 0.5}px)`,
                  ...look.frame(gradient),
                }}
              />
              {look.depth && (
                <>
                  <div
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-1/2"
                    style={{ transform: `translateZ(${-thick + 0.5}px)`, boxShadow: `0 ${u * 1.2}px ${u * 3}px rgb(20 10 0 / 0.5)` }}
                  />
                  <PageEdge side="right" thick={thick} u={u} edges={look.edges ?? DEFAULT_EDGES} corner={pageCorner} />
                </>
              )}
            </>
          )}
          {/* isolate : les étiquettes et boutons des cases (z-40, z-50) restent sous la feuille qui tourne. */}
          <div className="absolute inset-y-0 left-0 isolate w-1/2">
            <Page face={under[0]} side="left" {...pageProps} />
          </div>
          <div className="absolute inset-y-0 right-0 isolate w-1/2">
            <Page face={under[1]} side="right" {...pageProps} />
          </div>
          {!leaf && !closed && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/20" />}
          {look.id === 'classeur' && !bookShut && <Rings />}

          {(closed || leaf?.opening || leaf?.closing) && (
            <CoverBoard
              rotateY={leaf ? boardRotate : 0}
              thick={thick}
              u={u}
              look={look}
              gradient={gradient}
              inset={look.frameInset}
              front={<Page face="cover" side="right" {...pageProps} />}
              back={<Page face={0} side="left" {...pageProps} />}
            />
          )}
          {leaf && leafFaces && !leaf.opening && !leaf.closing && (
            <motion.div
              className={cn('absolute inset-y-0 w-1/2', leaf.dir === 1 ? 'left-1/2 origin-left' : 'left-0 origin-right')}
              style={{ rotateY, z: 1, transformStyle: 'preserve-3d', zIndex: 20 }}
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
        </motion.div>

        <button
          type="button"
          onClick={() => flip(1)}
          disabled={(!closed && spread >= spreads - 1) || Boolean(leaf)}
          aria-label="Page suivante"
          className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-default disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
  );
  const lookOptions: LookOptions = { perPage, cols, u, missing: opt.missing, numbers: opt.numbers, tilted: opt.tilted, cardStyle: albumLook.cardStyle as CardStyle | undefined, emblem: albumLook.emblem };
  return createPortal(
    <LookContext.Provider value={lookOptions}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-black/75 backdrop-blur-sm select-none"
      onPointerDown={(e) => (e.target as HTMLElement).dataset.backdrop !== undefined && onClose()}
      data-backdrop
    >
      {studio && (
        <div className="flex h-full min-h-screen">
          {/* Livre, qui suit le volet ouvert. */}
          <div className="relative flex w-1/2 items-center justify-center overflow-hidden">{bookRow}</div>
          {/* Réglages : quatre volets, un seul ouvert à la fois. */}
          <aside className="flex h-screen w-1/2 flex-col border-l border-white/10 bg-popover text-popover-foreground shadow-2xl">
            <header className="flex items-center gap-3 border-b px-5 py-3">
              <Paintbrush className="size-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-heading text-base font-bold">Style d’album</p>
                <p className="truncate text-xs text-muted-foreground">{title}</p>
              </div>
              <button
                type="button"
                onClick={cancelStudio}
                disabled={!studioDirty}
                className="h-8 cursor-pointer rounded-lg px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
              >
                Annuler les changements
              </button>
              <button type="button" onClick={leaveStudio} className="h-8 cursor-pointer rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-110">
                Terminé
              </button>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {STUDIO_PARTS.map((part) => {
                const open = panel === part.id;
                const Icon = part.icon;
                return (
                  <section key={part.id} className={cn('rounded-2xl border transition', open && 'border-primary/40 bg-muted/30')}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setPanel(open ? null : part.id)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', open ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{part.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{part.hint}</span>
                      </span>
                      <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <div className="overflow-hidden border-t px-4 py-4">
                        <LookMenu
                        part={part.id}
                        onDemo={demoTurn}
                look={look}
                styleId={albumStyle}
                gradient={gradient}
                opt={opt}
                albumLook={albumLook}
                cards={cards}
                color={albumTag?.color ?? null}
                onColor={albumTag ? (c) => void useCollection.getState().updateTag(albumTag.id, { color: c }) : undefined}
                onStyle={changeStyle}
                onDepth={changeDepth}
                onLook={changeLook}
                order={goal ? null : order}
                onOrder={changeOrder}
                sections={goal && goalLayout && goalLayout.runs.some((r) => r.name) ? sectionMode : null}
                onSections={changeSections}
                isGoal={Boolean(goal)}
                onShare={goal && albumTag ? shareCode : undefined}
                onExport={exportImage}
                onReset={resetLook}
              />
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </aside>
        </div>
      )}
      {!studio && (
      <>
      {/* Premier écran : le livre ; en dessous, liste de souhaits et suggestions. */}
      <div data-backdrop className="flex min-h-full flex-col items-center justify-center gap-5 py-6">
      <div className="flex w-full items-center justify-between gap-4 px-6 text-white" style={{ maxWidth: pageW * 2 + 40 }}>
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <h2 className="min-w-[5rem] truncate text-xl font-bold">{title}</h2>
          {goal && goalLayout && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold tabular-nums" title={`Objectif : ${goal.source.label}`}>
              <Target className="size-3.5 text-emerald-300" /> {goalLayout.collected} / {goal.entries.length}
            </span>
          )}
          {!closed && <span className="hidden shrink-0 text-xs text-white/60 tabular-nums xl:inline">{`p. ${L + 1}–${R + 1} / ${total}`}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm">
          {albumTag && goal && goalLayout && goalLayout.collected >= goal.entries.length && kindOf(albumTag) !== 'finished' && (
            <button
              type="button"
              onClick={async () => {
                const next = await toggleFinished(albumTag, randomTagColor);
                if (await useCollection.getState().updateTag(albumTag.id, next)) toast(`« ${next.name} » est terminée, bravo ! (à envoyer depuis la boîte d'envoi)`, 'success');
              }}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-amber-300"
            >
              <Trophy className="size-3.5" /> Marquer comme finie
            </button>
          )}
          {tagId && goalLayout && goalLayout.missing.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (market?.status === 'done') wishesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                else searchMarket();
              }}
              disabled={market?.status === 'running'}
              title={market?.status === 'done' ? 'Voir les annonces des cartes manquantes' : 'Chercher les cartes manquantes en vente sur le marché'}
              className={cn(
                'flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold whitespace-nowrap transition',
                onSale ? 'bg-sky-500 hover:bg-sky-400' : 'bg-white/10 hover:bg-white/20',
              )}
            >
              {market?.status === 'running' ? <Loader2 className="size-3.5 animate-spin" /> : <Store className="size-3.5" />}
              {market?.status === 'running'
                ? `${market.done}/${market.total || '…'}`
                : market?.status === 'done'
                  ? `${onSale} en vente`
                  : market?.status === 'error'
                    ? 'Réessayer'
                    : 'En vente ?'}
            </button>
          )}
          {goalLayout && goalLayout.toStick.length > 0 && (
            <button
              type="button"
              onClick={() => stickWithFx(goalLayout.toStick)}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition hover:bg-amber-400"
            >
              <Plus className="size-3.5" /> Tout coller ({goalLayout.toStick.length})
            </button>
          )}
          {/* Style d'album : ouvre le mode Style (livre à gauche, réglages à droite). */}
          <button
            type="button"
            onClick={enterStudio}
            aria-label="Style d'album"
            title="Style d'album"
            className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            <Paintbrush className="size-4" />
          </button>
          {tagId && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              aria-label="Ajouter des cartes"
              title="Ajouter des cartes"
              className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-emerald-500 transition hover:bg-emerald-400"
            >
              <Plus className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => (closed ? toggleCover(true) : toggleCover(false))}
            disabled={Boolean(leaf)}
            aria-label={closed ? 'Ouvrir l’album' : 'Revenir à la couverture'}
            title={closed ? 'Ouvrir l’album' : 'Revenir à la couverture'}
            className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            {closed ? <BookOpen className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
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

      {bookRow}

      <div className="flex w-full flex-col items-center gap-2 text-xs text-white/60" style={{ maxWidth: pageW * 2 }}>
        {spreads > 1 && !closed && (
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
        <p>
          Clique une carte pour l'afficher en grand · fais glisser une page pour la tourner ·{' '}
          {goal
            ? 'album à objectif : chaque case a sa place, « + Coller » range une carte que tu possèdes déjà'
            : order === 'rarity'
              ? 'vue triée par rareté, ton rangement est conservé (« Mon ordre » pour ranger)'
              : 'glisse une vignette vers une autre case pour la ranger'}
        </p>
        <button
          type="button"
          onClick={() => wishesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="mt-1 flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-white/80 transition hover:bg-white/20"
        >
          <ChevronDown className="size-3.5" /> {storage ? 'Cartes à ajouter' : tagId ? 'Fiche, cartes à ajouter et souhaits' : 'Liste de souhaits et suggestions'}
        </button>
      </div>
      </div>

      <div ref={wishesRef} data-backdrop data-wishes className="mx-auto w-full space-y-6 px-6 pb-12" style={{ maxWidth: pageW * 2 + 40 }}>
        {tagId && !storage && <AlbumSheetPanel tagId={tagId} cards={cards} />}
        {goalLayout && goalLayout.missing.length > 0 && (
          <GoalMissing entries={goalLayout.missing} allEntries={goal!.entries} market={market} onSearch={searchMarket} />
        )}
        {tagId && !goal && <AlbumRecommendations tagId={tagId} name={title} description={description} cards={cards} onBrowse={() => setPicking(true)} />}
        {tagId && <AlbumRemoved tagId={tagId} name={title} cards={cards} />}
        {tagId && picking && <AlbumAddDialog tagId={tagId} name={title} onClose={() => setPicking(false)} />}
        {!storage && !goal && <AlbumWishes albumKey={layoutKey} cards={cards} tagId={tagId} albumName={title} />}
      </div>
      </>
      )}

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
    <StickFx shots={shots} />
    </motion.div>
    </LookContext.Provider>,
    document.body,
  );
}

/** Sous un album à objectif : les cartes qui manquent, avec leur article Wikipédia, et celles en vente (mode Marché). */
function GoalMissing({
  entries,
  allEntries,
  market,
  onSearch,
}: {
  entries: GoalEntry[];
  allEntries: GoalEntry[];
  market?: MarketSearch;
  onSearch: (force?: boolean) => void;
}) {
  const caseOf = useMemo(() => new Map(allEntries.map((e, i) => [titleKey(e.title), i + 1])), [allEntries]);
  const sales = useMemo(
    () =>
      market?.status === 'done'
        ? entries
            .flatMap((e) => market.listings.get(titleKey(e.title)) ?? [])
            .sort((a, b) => Date.parse(a.endAt ?? '') - Date.parse(b.endAt ?? '') || 0)
        : [],
    [entries, market],
  );
  return (
    <section className="w-full space-y-3 rounded-3xl bg-white/[0.06] p-6 text-white ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-emerald-300" />
        <h3 className="font-semibold">À trouver</h3>
        <span className="text-sm text-white/50 tabular-nums">{entries.length}</span>
        <button
          type="button"
          onClick={() => onSearch(market?.status === 'done')}
          disabled={market?.status === 'running'}
          className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/20 disabled:cursor-progress"
        >
          {market?.status === 'running' ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Recherche {market.done}/{market.total || '…'}
            </>
          ) : market?.status === 'done' ? (
            <>
              <RefreshCw className="size-3.5" /> Relancer
            </>
          ) : (
            <>
              <Store className="size-3.5" /> Chercher en vente
            </>
          )}
        </button>
      </div>
      {market?.status === 'error' && <p className="text-sm text-rose-300">Recherche interrompue : {market.error}</p>}
      {market?.status === 'done' && (
        <div className="space-y-1.5">
          <p className="text-xs text-white/60">
            {sales.length
              ? `${sales.length} annonce(s) pour ${new Set(sales.map((l) => titleKey(l.title))).size} case(s), de la plus proche de la fin à la plus lointaine.`
              : 'Aucune carte manquante en vente pour le moment.'}
          </p>
          {sales.map((l) => (
            <a
              key={l.id}
              href={auctionUrl(l.id)}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
            >
              <span className="w-10 shrink-0 text-xs text-white/50 tabular-nums">n° {caseOf.get(titleKey(l.title))}</span>
              {l.imageUrl ? <img src={l.imageUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" /> : <span className="size-8 shrink-0 rounded-md bg-white/10" />}
              <span className="min-w-0 flex-1 truncate font-medium">{l.title}</span>
              {l.rarity && (
                <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-[#0d1117]" style={{ backgroundColor: `var(--rarity-${l.rarity.toLowerCase()})` }}>
                  {l.rarity}
                  {l.shiny && ' ✦'}
                </span>
              )}
              <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{l.price != null ? `${nfPrice.format(l.price)} WB` : '—'}</span>
              <span className="w-20 shrink-0 text-right text-xs text-white/60">{endsIn(l.endAt)}</span>
              <ExternalLink className="size-3.5 shrink-0 opacity-60" />
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {entries.map((e) => (
          <a
            key={e.title}
            href={`https://fr.wikipedia.org/wiki/${encodeURIComponent(e.title.replace(/ /g, '_'))}`}
            target="_blank"
            rel="noopener"
            title={e.description ?? undefined}
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition',
              market?.listings.has(titleKey(e.title)) ? 'bg-sky-500/25 text-sky-100 hover:bg-sky-500/40' : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white',
            )}
          >
            {e.title} <ExternalLink className="size-3 opacity-60" />
          </a>
        ))}
      </div>
    </section>
  );
}

/** Couches d'un fond CSS (virgules hors parenthèses et guillemets). */
function splitLayers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ---------- Mode Style d'album : volets ---------- */

type StudioPart = 'cover' | 'pages' | 'cards' | 'ambiance';

const STUDIO_PARTS: { id: StudioPart; title: string; hint: string; icon: typeof BookOpen }[] = [
  { id: 'cover', title: 'Couverture et livre', hint: 'Style, relief, couverture, couleur, emblème', icon: BookOpen },
  { id: 'pages', title: 'Pages', hint: 'Cases, parties, cases à trouver, ordre', icon: LayoutGrid },
  { id: 'cards', title: 'Cartes', hint: 'Habillage, pose et reflets', icon: GalleryHorizontalEnd },
  { id: 'ambiance', title: 'Ambiance et partage', hint: 'Son, vitesse, image, code de partage', icon: Sparkles },
];

const EMBLEMS = ['◇', '★', '⚜', '♛', '✦', '❦'];

function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="px-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  );
}

/** Pastille de choix (texte ou aperçu), cerclée quand elle est choisie. */
function Choice({ on, onClick, title, className, children }: { on: boolean; onClick: () => void; title?: string; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      title={title}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-lg border text-xs font-medium transition',
        on ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-xs">
      {label}
      <Switch size="sm" checked={on} onCheckedChange={onChange} />
    </label>
  );
}

/** Mini grille de cases (2 × 2, 3 × 3, 4 × 4). */
const GridIcon = ({ n }: { n: number }) => (
  <span className="mx-auto grid size-7 gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
    {Array.from({ length: n * n }, (_, i) => (
      <i key={i} className="rounded-[1px] bg-current opacity-60" />
    ))}
  </span>
);

/** Pictogramme de chaque mise en page des parties. */
const SECTION_ICON: Record<SectionMode, ReactNode> = {
  tile: (
    <span className="mx-auto grid size-7 grid-cols-3 gap-[2px]">
      <i className="rounded-[1px] bg-primary" />
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} className="rounded-[1px] bg-current opacity-50" />
      ))}
    </span>
  ),
  row: (
    <span className="mx-auto flex size-7 flex-col justify-between">
      {[0, 1, 2].map((r) => (
        <span key={r} className="flex items-center gap-[2px]">
          <i className="h-[2px] w-2 bg-primary" />
          <i className="h-1.5 flex-1 rounded-[1px] bg-current opacity-50" />
        </span>
      ))}
    </span>
  ),
  page: (
    <span className="mx-auto flex size-7 flex-col gap-[2px]">
      <i className="h-1.5 rounded-[1px] bg-primary" />
      <i className="flex-1 rounded-[1px] bg-current opacity-50" />
    </span>
  ),
  color: (
    <span className="mx-auto grid size-7 grid-cols-3 gap-[2px]">
      {['#7F77DD', '#7F77DD', '#1D9E75', '#1D9E75', '#D85A30', '#D85A30', '#D85A30', '#D4537E', '#D4537E'].map((c, i) => (
        <i key={i} className="rounded-[1px] border-t-2 bg-current/40" style={{ borderColor: c }} />
      ))}
    </span>
  ),
  caption: (
    <span className="mx-auto grid size-7 grid-cols-3 gap-x-[2px] gap-y-[4px] pt-[3px]">
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} className="relative rounded-[1px] bg-current opacity-50">
          {(i === 0 || i === 4) && <b className="absolute -top-[3px] left-0 h-px w-[5px] bg-primary" />}
        </i>
      ))}
    </span>
  ),
  tick: (
    <span className="mx-auto grid size-7 grid-cols-3 gap-[3px]">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className="relative rounded-[1px] bg-current opacity-50">
          {(i === 0 || i === 4) && <b className="absolute inset-y-0 -left-[2.5px] w-[1.5px] rounded-full bg-primary" />}
        </i>
      ))}
    </span>
  ),
  tint: (
    <span className="mx-auto grid size-7 grid-cols-3 gap-[2px]">
      {['#7F77DD', '#7F77DD', '#7F77DD', '#7F77DD', '#1D9E75', '#1D9E75', '#1D9E75', '#1D9E75', '#1D9E75'].map((c, i) => (
        <i key={i} className="rounded-[1px]" style={{ backgroundColor: c, opacity: 0.45 }} />
      ))}
    </span>
  ),
  header: (
    <span className="mx-auto flex size-7 flex-col gap-[3px]">
      <i className="h-[2px] w-3 rounded-full bg-primary" />
      <span className="grid flex-1 grid-cols-3 gap-[2px]">
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} className="rounded-[1px] bg-current opacity-50" />
        ))}
      </span>
    </span>
  ),
};

function LookMenu({
  part,
  onDemo,
  look,
  styleId,
  gradient,
  opt,
  albumLook,
  cards,
  color,
  onColor,
  onStyle,
  onDepth,
  onLook,
  order,
  onOrder,
  sections,
  onSections,
  isGoal,
  onShare,
  onExport,
  onReset,
}: {
  /** Volet du mode Style à afficher. */
  part: StudioPart;
  /** Rejoue une page qui tourne (volet Ambiance). */
  onDemo: () => void;
  look: AlbumStyle;
  styleId: AlbumStyleId;
  gradient: string;
  opt: typeof DEFAULT_LOOK;
  albumLook: AlbumLook;
  cards: OwnedCard[];
  color: string | null;
  onColor?: (c: string) => void;
  onStyle: (id: AlbumStyleId) => void;
  onDepth: (v: boolean) => void;
  onLook: (patch: AlbumLook) => void;
  order: AlbumOrder | null;
  onOrder: (o: AlbumOrder) => void;
  sections: SectionMode | null;
  onSections: (m: SectionMode) => void;
  isGoal: boolean;
  onShare?: () => void;
  onExport: () => void;
  onReset: () => void;
}) {
  const variants = ALBUM_STYLES[styleId].coverVariants;
  const defaultCardStyle = useCollection((st) => st.settings.cardStyle);
  const custom = color ? !TAG_COLORS.some((c) => c.toLowerCase() === color.toLowerCase()) : false;
  const emblem = albumLook.emblem ?? '';
  const medallions = cards.slice(0, 7);
  return (
    <div className="space-y-5">
      {part === 'cover' && (
        <>
      <MenuSection title="Livre">
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Style du livre">
          {ALBUM_STYLE_IDS.map((id) => (
            <Choice key={id} on={id === styleId} onClick={() => onStyle(id)} title={ALBUM_STYLES[id].name} className="overflow-hidden p-1">
              <span className="block aspect-[3/4] rounded-[3px_6px_6px_3px] shadow-sm" style={{ ['--u' as string]: '0.6px', ...ALBUM_STYLES[id].cover(gradient) }} />
              <span className="mt-1 block truncate text-[10px]">{ALBUM_STYLES[id].name}</span>
            </Choice>
          ))}
        </div>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Relief">
          <Choice on={!look.depth} onClick={() => onDepth(false)} className="flex-1 py-1.5">
            2D · à plat
          </Choice>
          <Choice on={Boolean(look.depth)} onClick={() => onDepth(true)} className="flex-1 py-1.5">
            3D · incliné
          </Choice>
        </div>
      </MenuSection>

      {variants && (
        <MenuSection title="Couverture">
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Couverture">
            {Object.entries(variants).map(([id, v]) => (
              <Choice key={id} on={(albumLook.grimoireCover ?? 'b') === id} onClick={() => onLook({ grimoireCover: id as 'a' | 'b' | 'c' })} className="p-1">
                <span className="block aspect-[3/4] rounded-[3px_6px_6px_3px]" style={{ ['--u' as string]: '0.8px', ...v.cover(gradient) }} />
                <span className="mt-1 block text-[10px]">{v.name}</span>
              </Choice>
            ))}
          </div>
        </MenuSection>
      )}

      {onColor && (
        <MenuSection title="Couleur">
          <div className="grid grid-cols-10 gap-1.5" role="radiogroup" aria-label="Couleur">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color?.toLowerCase() === c}
                aria-label={c}
                onClick={() => onColor(c)}
                className={cn('size-5 cursor-pointer rounded-full transition hover:scale-110', color?.toLowerCase() === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-popover')}
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              title="Choisir ma couleur"
              className={cn('relative size-5 cursor-pointer overflow-hidden rounded-full transition hover:scale-110', custom && 'ring-2 ring-foreground ring-offset-2 ring-offset-popover')}
              style={{ background: custom ? color! : 'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)' }}
            >
              <input type="color" value={color ?? '#8b5cf6'} onChange={(e) => onColor(e.target.value)} aria-label="Couleur personnalisée" className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
          <p className="px-0.5 text-[11px] text-muted-foreground">Couleur de l’étiquette : elle part sur le site avec la boîte d’envoi.</p>
        </MenuSection>
      )}

      <MenuSection title="Emblème de couverture">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Emblème">
          <Choice on={!emblem} onClick={() => onLook({ emblem: '' })} className="h-8 px-2.5">
            Aucun
          </Choice>
          {EMBLEMS.map((e) => (
            <Choice key={e} on={emblem === e} onClick={() => onLook({ emblem: e })} className="size-8 text-base">
              {e}
            </Choice>
          ))}
          <input
            value={emblem.startsWith('card:') || EMBLEMS.includes(emblem) ? '' : emblem}
            onChange={(e) => onLook({ emblem: [...e.target.value].slice(-2).join('') })}
            placeholder="😀"
            aria-label="Emoji d'emblème"
            className="h-8 w-12 rounded-lg border bg-background text-center text-base outline-none focus:border-primary"
          />
        </div>
        {medallions.length > 0 && (
          <div className="flex gap-1.5" role="radiogroup" aria-label="Carte en médaillon">
            {medallions.map((c) => (
              <button
                key={c.cardId}
                type="button"
                role="radio"
                aria-checked={emblem === `card:${c.cardId}`}
                title={`${c.title} en médaillon`}
                onClick={() => onLook({ emblem: `card:${c.cardId}` })}
                className={cn('size-9 shrink-0 cursor-pointer overflow-hidden rounded-full border transition hover:scale-105', emblem === `card:${c.cardId}` && 'ring-2 ring-primary ring-offset-2 ring-offset-popover')}
              >
                <img src={cardImage(c)} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </MenuSection>

        </>
      )}

      {part === 'pages' && (
        <>
      <MenuSection title="Cases">
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Cases par page">
          {([4, 9, 16] as const).map((n) => (
            <Choice key={n} on={opt.perPage === n} onClick={() => onLook({ perPage: n })} className="py-1.5">
              <GridIcon n={Math.round(Math.sqrt(n))} />
              <span className="mt-1 block text-[10px]">{n === 4 ? '4 grandes' : n === 9 ? '9 cases' : '16 petites'}</span>
            </Choice>
          ))}
        </div>
      </MenuSection>
      {sections && (
        <MenuSection title="Parties">
          {[false, true].map((discreet) => (
            <Fragment key={String(discreet)}>
              {discreet && <p className="px-0.5 pt-0.5 text-[10px] text-muted-foreground">Plus discrets, sans case perdue</p>}
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={discreet ? 'Parties, séparateurs discrets' : 'Parties'}>
                {SECTION_MODES.filter((m) => Boolean(m.discreet) === discreet).map((m) => (
                  <Choice key={m.id} on={sections === m.id} onClick={() => onSections(m.id)} title={m.hint} className="py-1.5">
                    {SECTION_ICON[m.id]}
                    <span className="mt-1 block text-[10px] leading-tight">{m.label}</span>
                  </Choice>
                ))}
              </div>
            </Fragment>
          ))}
        </MenuSection>
      )}
      <MenuSection title={isGoal ? 'Cases à trouver et repères' : 'Repères'}>
        {isGoal && (
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Cases à trouver">
            {(
              [
                ['name', 'Nom'],
                ['silhouette', 'Silhouette'],
                ['blur', 'Image floue'],
              ] as const
            ).map(([id, label]) => (
              <Choice key={id} on={opt.missing === id} onClick={() => onLook({ missing: id })} title="Cases à trouver" className="py-1.5">
                {label}
              </Choice>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Toggle label="Numéros des cases" on={opt.numbers} onChange={(numbers) => onLook({ numbers })} />
          {look.hasPattern && <Toggle label="Motif de fond" on={opt.pattern} onChange={(pattern) => onLook({ pattern })} />}
        </div>
      </MenuSection>
      {order && (
        <MenuSection title="Ordre des cartes">
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Ordre des cartes">
            <Choice on={order === 'manual'} onClick={() => onOrder('manual')} className="flex items-center justify-center gap-1.5 py-1.5">
              <Hand className="size-3.5" /> Mon ordre
            </Choice>
            <Choice on={order === 'rarity'} onClick={() => onOrder('rarity')} className="flex items-center justify-center gap-1.5 py-1.5">
              <Gem className="size-3.5" /> Par rareté
            </Choice>
          </div>
        </MenuSection>
      )}
        </>
      )}

      {part === 'cards' && (
        <>
          <MenuSection title="Habillage des cartes">
            <CardStylePicker value={(albumLook.cardStyle as CardStyle | undefined) ?? defaultCardStyle} onChange={(cardStyle) => onLook({ cardStyle })} />
            {albumLook.cardStyle && (
              <button type="button" onClick={() => onLook({ cardStyle: undefined })} className="cursor-pointer px-0.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Reprendre l’habillage des réglages
              </button>
            )}
          </MenuSection>
          <MenuSection title="Pose et reflets">
            <div className="grid grid-cols-2 gap-1.5">
              <Toggle label="Collées de travers" on={opt.tilted} onChange={(tilted) => onLook({ tilted })} />
              <Toggle label="Reflets des rares" on={opt.shine} onChange={(shine) => onLook({ shine })} />
            </div>
          </MenuSection>
        </>
      )}

      {part === 'ambiance' && (
        <>
      <MenuSection title="Ambiance">
        <Toggle label="Son des pages" on={opt.sound} onChange={(sound) => (onLook({ sound }), sound && onDemo())} />
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Vitesse des animations">
          {(
            [
              ['normal', 'Normale'],
              ['fast', 'Rapide'],
              ['none', 'Sans animation'],
            ] as const
          ).map(([id, label]) => (
            <Choice key={id} on={opt.speed === id} onClick={() => (onLook({ speed: id }), onDemo())} className="py-1.5 text-[11px]">
              {label}
            </Choice>
          ))}
        </div>
      </MenuSection>

      <MenuSection title="Images et partage">
      <div className="flex flex-wrap gap-1.5">
        {onShare && (
          <button type="button" onClick={onShare} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted">
            <Share2 className="size-3.5" /> Copier le code
          </button>
        )}
        <button type="button" onClick={onExport} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted">
          <ImageDown className="size-3.5" /> Image de la double page
        </button>
        <button type="button" onClick={onReset} className="ml-auto flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          <RotateCcw className="size-3.5" /> Tout remettre par défaut
        </button>
      </div>
      </MenuSection>
        </>
      )}
    </div>
  );
}
