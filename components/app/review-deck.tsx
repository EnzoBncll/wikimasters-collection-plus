import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronLeft, Layers, Plus, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCollection } from '@/hooks/use-collection';
import { useVisibleCards } from '@/hooks/use-review';
import { toast } from '@/hooks/use-toast';
import { latestAcquisition } from '@/lib/acquisitions';
import { FINISHED_COLOR, kindOf, STORAGE_COLOR, STORAGE_PREFIX } from '@/lib/album-kind';
import { playPop } from '@/lib/page-sound';
import { randomTagColor } from '@/lib/tag-colors';
import { systemTagIds, type StatusTarget } from '@/lib/trade';
import { RARITY_ORDER, type OwnedCard, type SiteTag } from '@/lib/types';
import { cn } from '@/lib/utils';
import { WmCard } from './wm-card';

/**
 * Mode revue de la page Cards : les cartes d'un lot une par une, comme à l'ouverture des paquets.
 * Rangements à gauche (⇧1–9), collections à droite (1–9), statut en arc sous la carte (← Trade, ↓ Not Trade,
 * → Discard) qui fait passer à la suivante ; Espace passe, Retour arrière revient. Tout part dans la boîte d'envoi.
 * Le lot est figé au départ : poser une étiquette ne fait pas sauter de carte.
 */

type LotId = 'selection' | 'untagged' | 'unset' | 'new' | 'dups' | 'filter';
type OrderId = 'rarity' | 'recent' | 'random' | 'alpha';

const LOT_LABEL: Record<LotId, string> = {
  selection: 'Ta sélection',
  untagged: 'Sans étiquette',
  unset: 'Sans statut',
  new: 'Nouvelles cartes',
  dups: 'Doublons',
  filter: 'Filtre en cours',
};
const LOT_HINT: Record<LotId, string> = {
  selection: 'Les cartes sélectionnées dans la page Cards.',
  untagged: 'Aucune étiquette de rangement ni de collection.',
  unset: 'Ni Trade, ni Not Trade, ni Discard.',
  new: 'Obtenues depuis la dernière revue validée.',
  dups: 'Les cartes que tu as en plusieurs exemplaires.',
  filter: 'Les cartes affichées avec les filtres actuels.',
};
const ORDER_LABEL: Record<OrderId, string> = { rarity: 'Plus rares d’abord', recent: 'Plus récentes d’abord', random: 'Au hasard', alpha: 'A → Z' };

const rank = (c: OwnedCard) => (c.rarity ? RARITY_ORDER.indexOf(c.rarity) : 99);

function sortDeck(cards: OwnedCard[], order: OrderId): string[] {
  const list = [...cards];
  if (order === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
  } else if (order === 'recent') list.sort((a, b) => (latestAcquisition(b)?.at ?? 0) - (latestAcquisition(a)?.at ?? 0) || rank(a) - rank(b));
  else if (order === 'alpha') list.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  else list.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'fr'));
  return list.map((c) => c.cardId);
}

const STATUSES: { id: StatusTarget; label: string; key: string; icon: typeof ArrowLeft; dot: string }[] = [
  { id: 'trade', label: 'Trade', key: '←', icon: ArrowLeft, dot: 'bg-trade' },
  { id: 'not_trade', label: 'Not Trade', key: '↓', icon: ArrowDown, dot: 'bg-not-trade' },
  { id: 'discard', label: 'Discard', key: '→', icon: ArrowRight, dot: 'bg-zinc-400' },
];

interface Stats {
  seen: Set<string>;
  tags: number;
  statuses: Record<StatusTarget, number>;
}
const freshStats = (): Stats => ({ seen: new Set(), tags: 0, statuses: { trade: 0, not_trade: 0, discard: 0 } });

export function ReviewDeck({ selection, onClose }: { selection: OwnedCard[]; onClose: () => void }) {
  const { cards, tags, tradeTags, newIds, explicitOf, setTrade, stageTags, createTag } = useCollection();
  const fullStage = useCollection((s) => s.settings.reviewFullStage ?? false);
  const updateSettings = useCollection((s) => s.updateSettings);
  const visible = useVisibleCards();
  const system = useMemo(() => systemTagIds(tradeTags), [tradeTags]);

  /** Cartes de chaque lot (calculées à la demande, à partir de l'état actuel). */
  const lotCards = (lot: LotId): OwnedCard[] => {
    switch (lot) {
      case 'selection':
        return selection;
      case 'untagged':
        return cards.filter((c) => !c.tagIds.some((t) => !system.has(t)));
      case 'unset':
        return cards.filter((c) => explicitOf(c) === 'unset');
      case 'new':
        return cards.filter((c) => newIds.has(c.cardId));
      case 'dups':
        return cards.filter((c) => c.count > 1);
      default:
        return visible;
    }
  };
  const lots: LotId[] = selection.length ? ['selection', 'untagged', 'unset', 'new', 'dups', 'filter'] : ['untagged', 'unset', 'new', 'dups', 'filter'];
  const counts = useMemo(() => Object.fromEntries(lots.map((l) => [l, lotCards(l).length])) as Record<LotId, number>, [cards, selection, visible, newIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const [phase, setPhase] = useState<'setup' | 'run' | 'done'>('setup');
  const [lot, setLot] = useState<LotId>(selection.length ? 'selection' : 'untagged');
  const [order, setOrder] = useState<OrderId>('rarity');
  const [deck, setDeck] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [stats, setStats] = useState<Stats>(freshStats);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(cards.map((c) => [c.cardId, c])), [cards]);
  const card = phase === 'run' ? byId.get(deck[index] ?? '') : undefined;

  const start = (which: LotId, how: OrderId = order) => {
    const ids = sortDeck(lotCards(which), how);
    if (!ids.length) return toast('Ce lot est vide.', 'info');
    setLot(which);
    setDeck(ids);
    setIndex(0);
    setDir(1);
    setStats(freshStats());
    setPhase('run');
  };

  const go = (step: 1 | -1) => {
    if (step === -1 && index === 0) return;
    if (step === 1 && index >= deck.length - 1) {
      if (card) setStats((s) => ({ ...s, seen: new Set(s.seen).add(card.cardId) }));
      setPhase('done');
      return;
    }
    if (card) setStats((s) => ({ ...s, seen: new Set(s.seen).add(card.cardId) }));
    setDir(step);
    setIndex((i) => i + step);
  };

  // Volets : rangements à gauche, collections à droite (finies en tête), filtrés par la recherche.
  const own = tags.filter((t) => !system.has(t.id));
  const byName = (a: SiteTag, b: SiteTag) => a.name.localeCompare(b.name, 'fr');
  const left = own.filter((t) => kindOf(t) === 'storage').sort(byName);
  const right = [
    ...own.filter((t) => kindOf(t) === 'finished').sort(byName),
    ...own.filter((t) => kindOf(t) === 'goal').sort(byName),
    ...own.filter((t) => kindOf(t) === 'collection').sort(byName),
  ];
  const q = query.trim().toLowerCase();
  const match = (t: SiteTag) => !q || t.name.toLowerCase().includes(q);

  const toggleTag = (tag: SiteTag) => {
    if (!card) return;
    const on = !card.tagIds.includes(tag.id);
    stageTags([card], [{ tagId: tag.id, on }]);
    if (on) {
      setStats((s) => ({ ...s, tags: s.tags + 1 }));
      playPop();
    }
  };
  const setStatus = (target: StatusTarget) => {
    if (!card) return;
    setTrade([card], target);
    setStats((s) => ({ ...s, statuses: { ...s.statuses, [target]: s.statuses[target] + 1 } }));
    go(1);
  };
  const createFromQuery = async () => {
    const name = query.trim();
    if (!name || !card) return;
    const storage = name.startsWith('·');
    const tag = await createTag(storage ? `${STORAGE_PREFIX}${name.replace(/^·\s*/, '')}` : name, storage ? STORAGE_COLOR : randomTagColor());
    if (tag) {
      stageTags([card], [{ tagId: tag.id, on: true }]);
      setStats((s) => ({ ...s, tags: s.tags + 1 }));
      setQuery('');
    }
  };

  // Clavier : 1–9 collections, ⇧1–9 rangements, ← ↓ → statut, Espace suivante, Retour arrière précédente, / recherche.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // La revue a la main sur le clavier : les raccourcis de la page Cards dessous ne réagissent pas.
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        if (el.tagName === 'INPUT') return (el as HTMLInputElement).blur();
        onClose();
        return;
      }
      if (phase !== 'run' || el.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
      const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
      if (digit) {
        const list = (e.shiftKey ? left : right).filter(match);
        const tag = list[Number(digit) - 1];
        if (tag) toggleTag(tag);
      } else if (e.key === 'ArrowLeft') setStatus('trade');
      else if (e.key === 'ArrowDown') setStatus('not_trade');
      else if (e.key === 'ArrowRight') setStatus('discard');
      else if (e.key === ' ') go(1);
      else if (e.key === 'Backspace') go(-1);
      else if (e.key === '/') searchRef.current?.focus();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const status = card ? explicitOf(card) : 'unset';
  const nextLots = lots.filter((l) => l !== lot && l !== 'selection' && counts[l] > 0);

  const panel = (title: string, list: SiteTag[], shift: boolean) => (
    <div className="w-60 shrink-0 rounded-2xl bg-white/[0.06] p-2.5 ring-1 ring-white/10 backdrop-blur">
      <p className="px-2 pb-2 text-[10.5px] font-semibold tracking-[0.14em] text-white/50 uppercase">{title}</p>
      <div className="max-h-[min(420px,calc(100vh-260px))] space-y-0.5 overflow-y-auto">
        {list.filter(match).map((t, i) => {
          const on = Boolean(card?.tagIds.includes(t.id));
          const color = kindOf(t) === 'finished' ? FINISHED_COLOR : (t.color ?? '#71717a');
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t)}
              className={cn('flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-left text-sm text-white/85 transition hover:bg-white/10', on && 'bg-white/10')}
              style={on ? { background: `color-mix(in srgb, ${color} 18%, transparent)` } : undefined}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full transition', on && 'scale-125')} style={{ backgroundColor: color, boxShadow: on ? `0 0 10px ${color}` : undefined }} />
              <span className="min-w-0 flex-1 truncate">{kindOf(t) === 'storage' ? t.name.replace(/^·\s*/, '') : t.name}</span>
              {on && <Check className="size-3.5" style={{ color }} />}
              {i < 9 && <kbd className="rounded border border-white/15 px-1 font-sans text-[10px] text-white/40">{shift ? `⇧${i + 1}` : i + 1}</kbd>}
            </button>
          );
        })}
        {!list.filter(match).length && <p className="px-2.5 py-2 text-xs text-white/40">Aucune étiquette.</p>}
      </div>
    </div>
  );

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden text-white select-none"
      style={{
        background:
          'radial-gradient(70% 60% at 50% 35%, color-mix(in oklch, var(--primary) 28%, transparent), transparent 70%), #0c0b12',
      }}
    >
      <header className="flex items-center gap-3 px-6 py-4">
        <Layers className="size-4 text-white/60" />
        <p className="font-heading font-bold">Revue</p>
        {phase !== 'setup' && (
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/75">
            {LOT_LABEL[lot]} · {ORDER_LABEL[order]}
          </span>
        )}
        {phase === 'run' && (
          <>
            <span className="text-sm text-white/60 tabular-nums">
              {index + 1} / {deck.length}
            </span>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-holo transition-[width]" style={{ width: `${((index + 1) / deck.length) * 100}%` }} />
            </div>
          </>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-white/60" title="Mise en scène par rareté, comme à l'ouverture des paquets">
          <Sparkles className="size-3.5" /> Mise en scène complète
          <input type="checkbox" checked={fullStage} onChange={(e) => void updateSettings({ reviewFullStage: e.target.checked })} className="accent-[var(--primary)]" />
        </label>
        <button type="button" onClick={onClose} aria-label="Quitter la revue" className="grid size-9 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="size-4" />
        </button>
      </header>

      {phase === 'setup' && (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 pb-16">
          <div>
            <h2 className="font-heading text-2xl font-bold">Quelles cartes revoir ?</h2>
            <p className="text-sm text-white/60">Une carte à la fois, avec les mêmes raccourcis qu’à l’ouverture des paquets. Tout part dans la boîte d’envoi.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {lots.map((l) => (
              <button
                key={l}
                type="button"
                disabled={!counts[l]}
                onClick={() => setLot(l)}
                className={cn(
                  'flex cursor-pointer flex-col items-start rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-35',
                  lot === l && 'border-primary bg-primary/15',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2 font-semibold">
                  {LOT_LABEL[l]} <span className="text-sm font-normal text-white/60 tabular-nums">{counts[l]}</span>
                </span>
                <span className="text-xs text-white/55">{LOT_HINT[l]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ORDER_LABEL) as OrderId[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrder(o)}
                className={cn('h-8 cursor-pointer rounded-full border border-white/10 px-3 text-xs transition hover:bg-white/10', order === o && 'border-primary bg-primary/20')}
              >
                {ORDER_LABEL[o]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!counts[lot]}
            onClick={() => start(lot)}
            className="h-11 cursor-pointer rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
          >
            Commencer · {counts[lot]} carte{counts[lot] > 1 ? 's' : ''}
          </button>
        </div>
      )}

      {phase === 'run' && card && (
        <div className="flex flex-1 items-center justify-center gap-6 pr-16 pl-6 pb-6">
          {panel('Rangement', left, true)}
          <div className="flex flex-col items-center gap-5">
            <div className="relative h-[min(420px,calc(100vh-280px))] [perspective:1200px]" style={{ aspectRatio: '5 / 7' }}>
              <AnimatePresence initial={false} custom={dir} mode="popLayout">
                <motion.div
                  key={card.cardId}
                  custom={dir}
                  initial={fullStage ? { opacity: 0, rotateY: 180 * dir, scale: 0.7 } : { opacity: 0, x: 60 * dir, rotateY: 18 * dir, scale: 0.94 }}
                  animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -60 * dir, rotateY: -18 * dir, scale: 0.94 }}
                  transition={fullStage ? { type: 'spring', stiffness: 120, damping: 16 } : { type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0"
                >
                  {fullStage && (card.rarity === 'UR' || card.rarity === 'L' || card.rarity === 'SR') && (
                    <motion.span
                      initial={{ opacity: 0.9, scale: 0.6 }}
                      animate={{ opacity: 0, scale: 1.8 }}
                      transition={{ duration: 0.9 }}
                      className="pointer-events-none absolute inset-0 -z-10 rounded-full"
                      style={{ background: `radial-gradient(closest-side, var(--rarity-${card.rarity.toLowerCase()}), transparent)` }}
                    />
                  )}
                  <WmCard card={card} className="h-full w-full shadow-2xl" />
                </motion.div>
              </AnimatePresence>
            </div>
            {/* Statut en arc sous la carte : le choisir passe à la suivante. */}
            <div className="flex items-end gap-2">
              {STATUSES.map((s, i) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStatus(s.id)}
                    className={cn(
                      'flex h-10 cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium transition hover:bg-white/20',
                      i === 1 && 'translate-y-2',
                      status === s.id && 'bg-white text-zinc-900',
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span className={cn('size-2 rounded-full', s.dot)} />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => go(-1)} disabled={index === 0} className="grid size-9 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30" aria-label="Carte précédente (Retour arrière)">
                <ChevronLeft className="size-4" />
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const first = [...right, ...left].find(match);
                  if (first && query.trim()) {
                    toggleTag(first);
                    setQuery('');
                  } else void createFromQuery();
                }}
                className="flex h-9 w-72 items-center gap-2 rounded-full bg-white/10 pr-1 pl-3 text-sm"
              >
                <Search className="size-3.5 text-white/50" />
                <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ranger dans… (/)" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/40" />
                {query.trim() && !own.some(match) && (
                  <button type="submit" className="flex h-7 cursor-pointer items-center gap-1 rounded-full bg-primary px-2.5 text-xs font-semibold text-primary-foreground">
                    <Plus className="size-3" /> Créer
                  </button>
                )}
              </form>
              <button type="button" onClick={() => go(1)} className="h-9 cursor-pointer rounded-full bg-white/10 px-4 text-sm hover:bg-white/20">
                Passer <kbd className="ml-1 rounded border border-white/20 px-1 text-[10px]">Espace</kbd>
              </button>
            </div>
          </div>
          {panel('Collections', right, false)}
        </div>
      )}

      {phase === 'done' && (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 pb-16 text-center">
          <div>
            <h2 className="font-heading text-2xl font-bold">Lot terminé</h2>
            <p className="text-sm text-white/60">{LOT_LABEL[lot]} · tout attend dans la boîte d’envoi.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Cartes vues', stats.seen.size],
              ['Étiquettes posées', stats.tags],
              ['Statuts', stats.statuses.trade + stats.statuses.not_trade + stats.statuses.discard],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                <p className="font-heading text-3xl font-bold tabular-nums">{n}</p>
                <p className="text-xs text-white/55">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/50">
            Trade {stats.statuses.trade} · Not Trade {stats.statuses.not_trade} · Discard {stats.statuses.discard}
          </p>
          {nextLots.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Enchaîner sur</p>
              <div className="flex flex-wrap justify-center gap-2">
                {nextLots.map((l) => (
                  <button key={l} type="button" onClick={() => start(l)} className="h-9 cursor-pointer rounded-full bg-white/10 px-4 text-sm hover:bg-white/20">
                    {LOT_LABEL[l]} <span className="text-white/50 tabular-nums">{counts[l]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={onClose} className="mx-auto h-10 cursor-pointer rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:brightness-110">
            Terminer
          </button>
        </div>
      )}
    </motion.div>,
    document.body,
  );
}
