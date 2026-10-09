import type { ReactNode } from 'react';
import type { GoalAlbum } from '@/lib/goal-albums';
import type { OwnedCard, SiteTag } from '@/lib/types';
import { cn } from '@/lib/utils';
import { cardImage } from './card-image';

/** Grain du plastique du classeur. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .08 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Parties de la liste, dans l'ordre (une par onglet). */
function sectionsOf(goal: GoalAlbum): string[] {
  const out: string[] = [];
  for (const e of goal.entries) if (e.section && out.at(-1) !== e.section) out.push(e.section);
  return [...new Set(out)];
}

/**
 * Album à objectif en vue Dossiers : un classeur cartonné de la couleur de l'album, avec un onglet par partie
 * de la liste sur la tranche, les cartes déjà collées qui dépassent, et une jauge de progression.
 */
export function GoalBinder({
  tag,
  goal,
  cards,
  collected,
  toStick,
  onOpen,
  footer,
}: {
  tag: SiteTag;
  goal: GoalAlbum | undefined;
  /** Cartes de l'étiquette. */
  cards: OwnedCard[];
  /** Cases remplies (cartes collées dans l'album). */
  collected: number;
  /** Cartes possédées de la liste, pas encore collées. */
  toStick: number;
  onOpen: () => void;
  footer?: ReactNode;
}) {
  const color = /^#[0-9a-f]{6}$/i.test(tag.color ?? '') ? tag.color! : '#8b5cf6';
  const total = goal?.entries.length ?? 0;
  const pct = total ? Math.round((collected / total) * 100) : 0;
  const sections = goal ? sectionsOf(goal) : [];
  const tabs = sections.slice(0, 6);
  const peek = cards.slice(0, 3);
  const name = tag.name.replace(/^◇\s*/, '');

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onOpen} className="group relative block h-64 w-full cursor-pointer pt-8 pr-4 text-left" aria-label={`Ouvrir l'album ${tag.name}`}>
        {/* Cartes déjà collées, qui dépassent du haut du classeur et se soulèvent au survol. */}
        <div className="absolute inset-x-10 top-0 flex justify-center">
          {peek.map((card, i) => (
            <img
              key={card.cardId}
              src={cardImage(card)}
              alt=""
              loading="lazy"
              className="-mx-2 aspect-[5/7] w-16 rounded-md object-cover shadow-lg ring-2 ring-white/70 transition-transform duration-300 group-hover:-translate-y-3"
              style={{ rotate: `${(i - (peek.length - 1) / 2) * 9}deg`, transitionDelay: `${i * 40}ms` }}
            />
          ))}
        </div>

        {/* Onglets des parties, sur la tranche droite. */}
        <div className="absolute top-12 right-0 bottom-6 flex flex-col gap-1.5">
          {tabs.map((s, i) => (
            <span
              key={s}
              title={s}
              className="grid h-7 w-6 place-items-center rounded-r-md text-[10px] font-bold text-white/90 shadow-sm transition-transform group-hover:translate-x-0.5"
              style={{ background: `color-mix(in oklab, ${color} ${85 - i * 9}%, white)`, transitionDelay: `${i * 30}ms` }}
            >
              {i + 1}
            </span>
          ))}
        </div>

        {/* Classeur. */}
        <div
          className="relative flex h-full flex-col overflow-hidden rounded-[10px_16px_16px_10px] p-4 pl-10 text-white shadow-[0_18px_40px_-16px_rgb(0_0_0/0.6)] ring-1 ring-black/10 transition-transform duration-300 group-hover:-translate-y-0.5"
          style={{ background: `${GRAIN}, radial-gradient(120% 80% at 20% 0%, rgb(255 255 255 / 0.18), transparent 60%), linear-gradient(150deg, ${color}, color-mix(in oklab, ${color} 50%, black))` }}
        >
          {/* Dos et anneaux. */}
          <span className="absolute inset-y-0 left-0 w-7 bg-black/25 shadow-[inset_-1px_0_0_rgb(255_255_255/0.15)]" />
          <span className="absolute top-0 bottom-0 left-2 flex flex-col justify-around py-6">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-3 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-400 shadow-[0_1px_2px_rgb(0_0_0/0.5)] ring-1 ring-black/20" />
            ))}
          </span>

          <span className="w-fit rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-semibold tracking-[0.18em] uppercase">◇ À compléter</span>
          {/* Étiquette du classeur. */}
          <div className="mt-3 rounded-md bg-white/95 px-3 py-2 text-zinc-900 shadow-md">
            <p className="line-clamp-2 font-heading text-base leading-tight font-bold">{name}</p>
            {goal && <p className="truncate text-[11px] text-zinc-500">{goal.source.label}</p>}
          </div>

          {/* Jauge. */}
          <div className="mt-auto space-y-1.5">
            <div className="flex items-end justify-between tabular-nums">
              <span>
                <b className="font-heading text-2xl leading-none font-bold">{collected}</b>
                <span className="text-sm text-white/75"> / {total}</span>
              </span>
              <span className="text-sm font-semibold">{pct} %</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/30 shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)]">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#fde68a,#fbbf24)] shadow-[0_0_8px_rgb(251_191_36/0.6)]" style={{ width: `${Math.max(pct, total && collected ? 3 : 0)}%` }} />
            </div>
            <p className={cn('h-4 text-[11px] text-white/80', !toStick && !sections.length && 'invisible')}>
              {toStick > 0 ? `+${toStick} carte${toStick > 1 ? 's' : ''} à coller` : `${sections.length} partie${sections.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
      </button>
      {footer}
    </div>
  );
}
