import { MoreHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { playRustle } from '@/lib/page-sound';
import type { SiteTag } from '@/lib/types';
import type { AlbumStyleId } from './album-styles';
import '@/assets/library.css';

/**
 * Bibliothèque de la page Albums : un livre par album à objectif ou collection finie, sur des étagères.
 * Tranche au style de l'album avec son emblème ; la hauteur et le médaillon disent l'avancement, le halo à étincelles
 * et le sceau disent « fini ». Rien d'écrit au repos ; au survol le livre sort et la fiche des parties flotte au-dessus.
 */

export type LibraryOrder = 'progress' | 'style' | 'recent' | 'color' | 'alpha';

export const LIBRARY_ORDERS: [LibraryOrder, string][] = [
  ['progress', 'Avancement'],
  ['style', 'Style'],
  ['recent', 'Récents'],
  ['color', 'Couleur'],
  ['alpha', 'A → Z'],
];

/** Planche des étagères : bois, verre irisé (couleurs de la palette) ou marbre noir à filet doré. */
export type ShelfStyle = 'wood' | 'glass' | 'marble';

export const SHELF_STYLES: [ShelfStyle, string][] = [
  ['wood', 'Bois'],
  ['glass', 'Verre'],
  ['marble', 'Marbre'],
];

export interface ShelfBook {
  tag: SiteTag;
  name: string;
  color: string;
  style: AlbumStyleId;
  /** Emoji ou symbole ; `image` remplace l'emoji par une carte en médaillon. */
  emblem: string;
  image?: string;
  total: number;
  have: number;
  /** Cartes possédées de la liste, pas encore collées. */
  toStick: number;
  at: number;
  done: boolean;
  /** Liste des cases absente de cet ordinateur (album créé ailleurs, pas encore reçu) : ni fini ni en cours. */
  missing?: boolean;
  parts: { name: string; total: number; have: number }[];
}

const STYLE_ORDER: AlbumStyleId[] = ['relie', 'classeur', 'grimoire', 'herbier'];
const MAX_PARTS = 6;
const GAP = 9;
/** Place laissée à droite de chaque étagère : le livre tiré pousse ses voisins. */
const SLACK = 190;

/** Hauteur estimée de la fiche flottante (px), avant sa mesure réelle. */
function skyHeight(b: ShelfBook) {
  const lines = Math.min(b.parts.length, MAX_PARTS) + (b.parts.length > MAX_PARTS ? 1 : 0);
  return 58 + lines * 17 + (b.toStick > 0 ? 24 : 0);
}

const ratio = (b: ShelfBook) => (b.missing ? 0 : b.total ? b.have / b.total : 1);
const BOOK_H = 250;
const bookHeight = (b: ShelfBook) => BOOK_H * (b.done ? 1 : 0.6 + 0.4 * ratio(b));
/** Écart livre → fiche, et marge gardée entre la fiche et le bord de la bibliothèque. */
const SKY_GAP = 30;
const SKY_MARGIN = 18;
/**
 * Place à laisser au-dessus d'une étagère pour que la fiche la plus haute ne soit pas coupée :
 * la fiche part du haut de son livre, et l'étagère n'est haute que de son plus grand livre.
 */
function rowPad(row: { sky: number; book: number }[]) {
  const tallest = Math.max(...row.map((b) => b.book));
  return Math.ceil(Math.max(110, ...row.map((b) => b.sky + SKY_GAP + SKY_MARGIN - (tallest - b.book))));
}
const thickness = (b: ShelfBook) => Math.round(30 + Math.min(b.total, 90) * 0.38);

function hue(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function sortBooks(books: ShelfBook[], order: LibraryOrder): ShelfBook[] {
  const byProgress = (a: ShelfBook, b: ShelfBook) => ratio(b) - ratio(a) || a.name.localeCompare(b.name, 'fr');
  const list = [...books];
  switch (order) {
    case 'style':
      return list.sort((a, b) => STYLE_ORDER.indexOf(a.style) - STYLE_ORDER.indexOf(b.style) || byProgress(a, b));
    case 'recent':
      return list.sort((a, b) => b.at - a.at || byProgress(a, b));
    case 'color':
      return list.sort((a, b) => hue(a.color) - hue(b.color));
    case 'alpha':
      return list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    default:
      return list.sort(byProgress);
  }
}

/** Répartit les livres en étagères selon la largeur disponible. */
function shelve(books: ShelfBook[], width: number): ShelfBook[][] {
  const room = Math.max(200, width - 100 - SLACK);
  const rows: ShelfBook[][] = [];
  let row: ShelfBook[] = [];
  let used = 0;
  for (const b of books) {
    const w = thickness(b) + GAP;
    if (row.length && used + w > room) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(b);
    used += w;
  }
  if (row.length) rows.push(row);
  return rows;
}

const SPARKS = [
  [8, 18],
  [78, 30],
  [14, 62],
  [84, 70],
  [50, 4],
  [30, 88],
];

function Emblem({ book }: { book: ShelfBook }) {
  return <span className="lib-emblem">{book.image ? <img src={book.image} alt="" /> : book.emblem}</span>;
}

/** Pastilles ●●○○ d'une partie. */
function dots(total: number, have: number) {
  const on = Math.round((have / Math.max(total, 1)) * 4);
  return '●'.repeat(on) + '○'.repeat(4 - on);
}

function Sky({ book }: { book: ShelfBook }) {
  const pct = Math.round(ratio(book) * 100);
  const parts = book.parts.slice(0, MAX_PARTS);
  const more = book.parts.length - parts.length;
  return (
    <div className="lib-sky" aria-hidden>
      <div className={book.done ? 'p done' : 'p'}>{book.done ? '✓' : book.missing ? '?' : `${pct} %`}</div>
      <div className="n">
        {book.missing ? (
          <>Liste pas encore sur cet ordinateur · {book.have} carte{book.have > 1 ? 's' : ''} collée{book.have > 1 ? 's' : ''}</>
        ) : (
          <>
            {book.have} / {book.total} carte{book.total > 1 ? 's' : ''}
            {book.done ? ' · complet' : ''}
          </>
        )}
      </div>
      {parts.map((p) => (
        <div key={p.name} className={p.have >= p.total ? 'pr ok' : 'pr'}>
          {p.name}
          <i>{dots(p.total, p.have)}</i>
        </div>
      ))}
      {more > 0 && (
        <div className="pr">
          + {more} autre{more > 1 ? 's' : ''} partie{more > 1 ? 's' : ''}
        </div>
      )}
      {book.toStick > 0 && (
        <div className="stick">
          +{book.toStick} carte{book.toStick > 1 ? 's' : ''} à coller
        </div>
      )}
    </div>
  );
}

/*
 * Zone de survol stable. Le livre tiré bouge (il monte, pivote et montre sa couverture de part et d'autre de sa
 * tranche) et les livres suivants glissent à droite : avec un simple :hover, la zone sensible se déplace sous le
 * curseur pendant l'animation, d'où des entrées/sorties en rafale et le son rejoué en boucle. Le livre ouvert se
 * calcule donc ici, sur la mise en page au repos (offsetLeft/offsetWidth ignorent les transformations) et l'état
 * visé (pas les positions intermédiaires) ; le livre ouvert garde une zone plus grande que celle qui l'a ouvert,
 * ce qui évite tout aller-retour sur les bords.
 */
/** Glissement des livres suivants quand un livre est tiré (même valeur que `.lib-slot.is-open ~ .lib-slot`). */
const PULL_SHIFT = 150;
/** Demi-largeur de la couverture vue de face, autour du centre de la tranche (mesurée : ≈ 90 px). */
const COVER_HALF = 94;
/** Le livre tiré monte de 18 px ; on garde quelques pixels de plus au-dessus. */
const PULL_LIFT = 26;
/** Sous le livre tiré : la planche et le bouton ⋯. */
const PULL_BELOW = 30;
/** Anti-rebond du froissement : pas deux fois le même livre en moins de… / pas deux sons en moins de… */
const RUSTLE_SAME_MS = 700;
const RUSTLE_ANY_MS = 110;

function pickBook(roomEl: HTMLElement, x: number, y: number, current: string | null): string | null {
  for (const shelf of roomEl.querySelectorAll<HTMLElement>('.lib-shelf')) {
    const sr = shelf.getBoundingClientRect();
    const floor = sr.bottom;
    if (y > floor + PULL_BELOW || y < sr.top - PULL_LIFT) continue;
    const slots = [...shelf.querySelectorAll<HTMLElement>(':scope > .lib-slot')];
    const a = slots.findIndex((s) => s.dataset.id === current);
    const zones = slots.map((s, i) => {
      const left = sr.left + s.offsetLeft + (a >= 0 && i > a ? PULL_SHIFT : 0);
      if (i !== a) return { left, right: left + s.offsetWidth, top: floor - s.offsetHeight, bottom: floor };
      const center = left + s.offsetWidth / 2;
      return { left: center - COVER_HALF, right: center + COVER_HALF, top: floor - s.offsetHeight - PULL_LIFT, bottom: floor + PULL_BELOW };
    });
    // Le livre tiré passe devant ses voisins : sa zone d'abord.
    if (a >= 0) {
      const z = zones[a]!;
      if (x >= z.left && x <= z.right && y >= z.top && y <= z.bottom) return current;
    }
    // Puis zones jointives (l'espace entre deux livres, ou entre la couverture et le voisin poussé, est partagé au milieu) : aucune zone morte.
    for (let i = 0; i < slots.length; i++) {
      const z = zones[i]!;
      const lo = i > 0 ? (zones[i - 1]!.right + z.left) / 2 : z.left - GAP / 2;
      const hi = i < slots.length - 1 ? (z.right + zones[i + 1]!.left) / 2 : z.right + GAP / 2;
      if (x >= lo && x < hi && y >= z.top && y <= z.bottom) return slots[i]!.dataset.id ?? null;
    }
  }
  return null;
}

function Book({
  book,
  open,
  onOpen,
  menu,
  menuOpen,
  setMenuOpen,
}: {
  book: ShelfBook;
  open: boolean;
  onOpen: () => void;
  menu: ReactNode;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const pct = Math.round(ratio(book) * 100);
  const k = bookHeight(book) / BOOK_H;
  const style = { '--c': book.color, '--t': `${thickness(book)}px`, '--k': k } as CSSProperties;

  return (
    <div
      data-id={book.tag.id}
      className={`lib-slot lib-${book.style}${book.done ? ' lib-done' : ''}${open || menuOpen ? ' is-open' : ''}`}
      style={style}
    >
      {book.done && (
        <div className="lib-aura">
          {SPARKS.map(([x, y], i) => (
            <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.35}s` }} />
          ))}
        </div>
      )}
      <Sky book={book} />
      {/* Au pointeur, le clic est pris par la bibliothèque (zone stable) ; ce bouton sert au clavier (Entrée, Espace). */}
      <button
        type="button"
        className="lib-book"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        aria-label={`Ouvrir l'album ${book.name} (${book.done ? 'fini' : book.missing ? 'liste à récupérer' : `${pct} %`})`}>
        <span className="lib-f lib-spine">
          {book.style === 'grimoire' && [14, 22, 86, 93].map((y) => <span key={y} className="lib-band" style={{ top: `${y}%` }} />)}
          {!book.done && !book.missing && <span className="lib-ring" style={{ '--p': `${pct}%` } as CSSProperties} />}
          <Emblem book={book} />
          <span className="lib-label">{book.name}</span>
          {book.done && <span className="lib-seal">◇</span>}
        </span>
        <span className="lib-f lib-cover">
          <Emblem book={book} />
          <b>{book.name}</b>
          {book.done && <span className="lib-seal">◇</span>}
        </span>
        <span className="lib-f lib-back" />
        <span className="lib-f lib-top" />
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="lib-more" aria-label={`Actions de ${book.name}`} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        {/* Pas de retour du focus sur ⋯ : il garderait le livre tiré hors de l'étagère. */}
        <DropdownMenuContent align="center" onCloseAutoFocus={(e) => e.preventDefault()}>
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function LibraryShelf({
  books,
  order,
  shelf = 'wood',
  onOpen,
  menu,
  sound,
}: {
  books: ShelfBook[];
  order: LibraryOrder;
  shelf?: ShelfStyle;
  onOpen: (book: ShelfBook) => void;
  /** Éléments du menu ⋯ (renommer, partager, supprimer…). */
  menu: (book: ShelfBook) => ReactNode;
  sound: boolean;
}) {
  const room = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useLayoutEffect(() => {
    if (room.current) setWidth(room.current.clientWidth);
  }, []);
  useEffect(() => {
    const el = room.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = shelve(sortBooks(books, order), width);

  // Livre tiré (pointeur) et livre dont le menu ⋯ est ouvert (il reste tiré tant que le menu est là).
  const [open, setOpen] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const lastRustle = useRef({ at: 0, byId: new Map<string, number>() });

  // Poussière qui s'envole et froissement des pages quand le livre sort de l'étagère, une fois par vraie entrée.
  const pullOut = (id: string) => {
    const now = performance.now();
    const last = lastRustle.current;
    if (now - (last.byId.get(id) ?? -Infinity) < RUSTLE_SAME_MS || now - last.at < RUSTLE_ANY_MS) return;
    last.at = now;
    last.byId.set(id, now);
    if (sound) playRustle();
    const roomEl = room.current;
    const el = roomEl?.querySelector<HTMLElement>(`.lib-slot[data-id="${CSS.escape(id)}"]`);
    if (!el || !roomEl || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const rr = roomEl.getBoundingClientRect();
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('i');
      d.className = 'lib-dust';
      d.style.left = `${r.left - rr.left + Math.random() * r.width}px`;
      d.style.top = `${r.bottom - rr.top - 180 + Math.random() * 60}px`;
      d.style.setProperty('--dx', `${(Math.random() - 0.5) * 50}px`);
      roomEl.append(d);
      setTimeout(() => d.remove(), 1700);
    }
  };

  // Copie synchrone de `open` : plusieurs pointermove peuvent arriver avant le rendu suivant.
  const openRef = useRef<string | null>(null);
  const track = (x: number, y: number) => {
    if (!room.current) return null;
    const id = pickBook(room.current, x, y, menuFor ?? openRef.current);
    if (id !== openRef.current) {
      openRef.current = id;
      setOpen(id);
      if (id) pullOut(id);
    }
    return id;
  };
  const leave = () => {
    openRef.current = null;
    setOpen(null);
  };
  const byId = new Map(books.map((b) => [b.tag.id, b]));
  // Les événements du menu ⋯ (rendu dans un portail) remontent par l'arbre React : on les ignore.
  const inRoom = (e: { currentTarget: HTMLElement; target: EventTarget }) => e.currentTarget.contains(e.target as Node);

  // Fiches mesurées une fois posées : hauteur réelle (la place au-dessus de l'étagère) et décalage
  // horizontal pour celles qui dépasseraient d'un bord de la bibliothèque.
  const [pads, setPads] = useState<number[]>([]);
  useLayoutEffect(() => {
    const el = room.current;
    if (!el) return;
    const measure = () => {
      const bounds = el.getBoundingClientRect();
      const next: number[] = [];
      el.querySelectorAll<HTMLElement>('.lib-row').forEach((rowEl) => {
        const slots = [...rowEl.querySelectorAll<HTMLElement>('.lib-slot')];
        next.push(rowPad(slots.map((s) => ({ sky: s.querySelector<HTMLElement>('.lib-sky')!.offsetHeight, book: s.offsetHeight }))));
        for (const s of slots) {
          const sky = s.querySelector<HTMLElement>('.lib-sky')!;
          const r = s.getBoundingClientRect();
          const center = r.left + r.width / 2 + 56;
          const half = sky.offsetWidth / 2;
          const shift = Math.max(bounds.left + 12 - (center - half), 0) + Math.min(bounds.right - 12 - (center + half), 0);
          s.style.setProperty('--sky-shift', `${Math.round(shift)}px`);
        }
      });
      setPads((prev) => (prev.length === next.length && prev.every((p, i) => p === next[i]) ? prev : next));
    };
    measure();
    // La police des titres arrive après le premier rendu et change la hauteur des fiches.
    document.fonts?.ready.then(measure);
  }, [books, order, width]);

  return (
    <div
      ref={room}
      className={`lib-room lib-shelf-${shelf}${open ? ' lib-pointing' : ''}`}
      onPointerMove={(e) => {
        if (!inRoom(e)) return;
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--sx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--sy', `${e.clientY - r.top}px`);
        track(e.clientX, e.clientY);
      }}
      onPointerLeave={leave}
      onClick={(e) => {
        if (!inRoom(e)) return;
        // Toute la surface du livre (tranche, couverture, médaillon, sceau, planche sous le livre tiré) l'ouvre.
        const id = track(e.clientX, e.clientY);
        const book = id && byId.get(id);
        if (book) onOpen(book);
      }}
      onContextMenu={(e) => {
        if (!inRoom(e)) return;
        const id = track(e.clientX, e.clientY);
        if (!id) return;
        e.preventDefault();
        // Sur macOS, le clic droit arrive bouton encore enfoncé : ouvrir au relâchement, sinon il choisirait l'élément sous le pointeur.
        if (e.buttons) window.addEventListener('pointerup', () => setTimeout(() => setMenuFor(id)), { once: true });
        else setMenuFor(id);
      }}
    >
      <div className="lib-spot" />
      {rows.map((row, i) => (
        <div
          key={i}
          className="lib-row"
          style={{ paddingTop: pads.length === rows.length ? pads[i] : rowPad(row.map((b) => ({ sky: skyHeight(b), book: bookHeight(b) }))) }}
        >
          <div className="lib-shelf">
            {row.map((book) => (
              <Book
                key={book.tag.id}
                book={book}
                open={open === book.tag.id}
                onOpen={() => onOpen(book)}
                menu={menu(book)}
                menuOpen={menuFor === book.tag.id}
                setMenuOpen={(o) => setMenuFor(o ? book.tag.id : null)}
              />
            ))}
          </div>
          <div className="lib-plank" />
        </div>
      ))}
    </div>
  );
}
