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
  parts: { name: string; total: number; have: number }[];
}

const STYLE_ORDER: AlbumStyleId[] = ['relie', 'classeur', 'grimoire', 'herbier'];
const MAX_PARTS = 6;
const GAP = 9;
/** Place laissée à droite de chaque étagère : le livre tiré pousse ses voisins. */
const SLACK = 190;

/** Hauteur de la fiche flottante (px), pour laisser la place au-dessus de chaque étagère. */
function skyHeight(b: ShelfBook) {
  const lines = Math.min(b.parts.length, MAX_PARTS) + (b.parts.length > MAX_PARTS ? 1 : 0);
  return 58 + lines * 17 + (b.toStick > 0 ? 24 : 0);
}

const ratio = (b: ShelfBook) => (b.total ? b.have / b.total : 1);
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
      <div className={book.done ? 'p done' : 'p'}>{book.done ? '✓' : `${pct} %`}</div>
      <div className="n">
        {book.have} / {book.total} carte{book.total > 1 ? 's' : ''}
        {book.done ? ' · complet' : ''}
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

function Book({ book, onOpen, menu, sound }: { book: ShelfBook; onOpen: () => void; menu: ReactNode; sound: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pct = Math.round(ratio(book) * 100);
  const k = book.done ? 1 : 0.6 + 0.4 * ratio(book);
  const style = { '--c': book.color, '--t': `${thickness(book)}px`, '--k': k } as CSSProperties;

  // Poussière qui s'envole et froissement des pages quand le livre sort de l'étagère.
  const pullOut = () => {
    if (sound) playRustle();
    const el = slot.current;
    const roomEl = el?.closest('.lib-room');
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

  return (
    <div
      ref={slot}
      className={`lib-slot lib-${book.style}${book.done ? ' lib-done' : ''}`}
      style={style}
      onPointerEnter={pullOut}
      onContextMenu={(e) => {
        e.preventDefault();
        // Sur macOS, le clic droit arrive bouton encore enfoncé : ouvrir au relâchement, sinon il choisirait l'élément sous le pointeur.
        if (e.buttons) window.addEventListener('pointerup', () => setTimeout(() => setMenuOpen(true)), { once: true });
        else setMenuOpen(true);
      }}
    >
      {book.done && (
        <div className="lib-aura">
          {SPARKS.map(([x, y], i) => (
            <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.35}s` }} />
          ))}
        </div>
      )}
      <Sky book={book} />
      <button type="button" className="lib-book" onClick={onOpen} aria-label={`Ouvrir l'album ${book.name} (${book.done ? 'fini' : `${pct} %`})`}>
        <span className="lib-f lib-spine">
          {book.style === 'grimoire' && [14, 22, 86, 93].map((y) => <span key={y} className="lib-band" style={{ top: `${y}%` }} />)}
          {!book.done && <span className="lib-ring" style={{ '--p': `${pct}%` } as CSSProperties} />}
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
          <button type="button" className="lib-more" aria-label={`Actions de ${book.name}`}>
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
  onOpen,
  menu,
  sound,
}: {
  books: ShelfBook[];
  order: LibraryOrder;
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

  return (
    <div
      ref={room}
      className="lib-room"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--sx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--sy', `${e.clientY - r.top}px`);
      }}
    >
      <div className="lib-spot" />
      {rows.map((row, i) => (
        <div
          key={i}
          className="lib-row"
          // Fiche + écart (30) + livre tiré (18) + marge, moins l'espace déjà libre au-dessus des livres plus courts.
          style={{ paddingTop: Math.max(110, ...row.map((b) => skyHeight(b) + 30 + 18 + 24 - 250 * (1 - (b.done ? 1 : 0.6 + 0.4 * ratio(b))))) }}
        >
          <div className="lib-shelf">
            {row.map((book) => (
              <Book key={book.tag.id} book={book} onOpen={() => onOpen(book)} menu={menu(book)} sound={sound} />
            ))}
          </div>
          <div className="lib-plank" />
        </div>
      ))}
    </div>
  );
}
