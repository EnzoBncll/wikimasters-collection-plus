import { Archive, ArrowRight, BookOpen, Library, Folder, Share2, LayoutGrid, List, Lock, MoreHorizontal, Pencil, Plus, RotateCcw, Sparkles, Target, Trash2, Trophy, type LucideIcon } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { AnimatedFolder, type Project } from '@/components/ui/3d-folder';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/hooks/use-collection';
import { useReview } from '@/hooks/use-review';
import { RARITY_LABEL, type OwnedCard, type SiteTag } from '@/lib/types';
import { systemTagIds } from '@/lib/trade';
import { byKind, goalName, hasGoalPrefix, isStorage, kindOf, switchKind, toggleFinished } from '@/lib/album-kind';
import { goalAlbumsItem, matchEntries, saveGoalAlbum, type GoalAlbum } from '@/lib/goal-albums';
import { useSuggestions } from '@/hooks/use-suggestions';
import { LIBRARY_ORDERS, LibraryShelf, type ShelfBook } from './library-shelf';
import { albumLooksItem, albumStylesItem, type AlbumLook } from '@/lib/album';
import { decodeAlbumCode, encodeAlbumCode, resolveSharedEntries } from '@/lib/album-code';
import { factsItem } from '@/lib/wikidata';
import { useImproveCounts } from './consolidate-view';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Album } from './album';
import { CreateMenu } from './create-menu';
import { GoalAlbumWizard } from './goal-album-wizard';
import { useCardViewer } from './card-viewer';
import { randomTagColor } from '@/lib/tag-colors';
import { ColorPicker } from './color-picker';
import { cardImage } from './card-image';
import { WmCard } from './wm-card';

/** Nombre max de cartes chargées dans la visionneuse d'un dossier. */
const LIGHTBOX_LIMIT = 60;
const FALLBACK_COLOR = '#71717a';
const UNTAGGED_GRADIENT = 'linear-gradient(135deg, var(--folder-front), var(--folder-tab))';

/** Assombrit une couleur hex (pour le dégradé du dossier). */
function shade(hex: string, amount = 0.35) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const f = (c: number) => Math.round(c * (1 - amount)).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

const folderGradient = (color: string | null) => {
  const c = /^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : FALLBACK_COLOR;
  return `linear-gradient(135deg, ${c}, ${shade(c)})`;
};

function toProjects(cards: OwnedCard[]): Project[] {
  return cards.slice(0, LIGHTBOX_LIMIT).map((card) => ({
    id: card.cardId,
    title: card.title,
    image: cardImage(card),
    subtitle: [card.rarity && `${card.rarity} · ${RARITY_LABEL[card.rarity]}`, `×${card.count}`].filter(Boolean).join(' · '),
    href: card.wikipediaUrl ?? undefined,
    render: () => <WmCard card={card} tilt={false} className="w-full" />,
  }));
}

const openWikipedia = (project: Project) => {
  if (project.href) window.open(project.href, '_blank', 'noopener');
};

/** Ligne de la vue liste : icône de dossier, nom, aperçu des cartes, bouton Album et contrôles. */
function TagRow({
  name,
  color,
  cards,
  muted,
  onOpen,
  controls,
  icon: Icon = Folder,
}: {
  name: string;
  color: string | null;
  cards: OwnedCard[];
  muted?: boolean;
  onOpen: () => void;
  controls: React.ReactNode;
  /** Icône du dossier (poubelle pour Discard). */
  icon?: LucideIcon;
}) {
  const preview = cards.slice(0, 5);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className={cn('group flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/60', muted && 'opacity-85')}
    >
      <span
        className="relative flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
        style={{ background: color ? folderGradient(color) : UNTAGGED_GRADIENT }}
      >
        <Icon className="size-5 drop-shadow" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">
          {cards.length} {cards.length === 1 ? 'carte' : 'cartes'}
        </p>
      </div>
      <div className="hidden items-center -space-x-3 sm:flex">
        {preview.map((card, i) => (
          <img
            key={card.cardId}
            onClick={(e) => {
              e.stopPropagation();
              useCardViewer.getState().open(cards, i);
            }}
            title={card.title}
            src={cardImage(card)}
            alt=""
            loading="lazy"
            className="h-10 w-7 cursor-zoom-in rounded-md object-cover shadow ring-2 ring-card transition-transform group-hover:-translate-y-0.5 hover:!-translate-y-1.5 hover:scale-110"
            style={{ rotate: `${(i - (preview.length - 1) / 2) * 4}deg` }}
          />
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 rounded-full"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        <BookOpen className="size-4" /> Album
      </Button>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {controls}
      </div>
    </div>
  );
}

export function TagsView({ onOpenReview }: { onOpenReview: () => void }) {
  const { tags, cards, tradeTags, createTag, updateTag, deleteTag, statusOf, version, settings, updateSettings, stageIntoAlbum } = useCollection();
  const layout = settings.tagsLayout;
  const [toDelete, setToDelete] = useState<SiteTag | null>(null);
  const [toRename, setToRename] = useState<SiteTag | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [album, setAlbum] = useState<{ key: string; title: string; gradient: string; focus?: boolean } | null>(null);
  const [goalWizard, setGoalWizard] = useState(false);
  const [goalAlbums, setGoalAlbums] = useState<Record<string, GoalAlbum>>({});
  useEffect(() => {
    void goalAlbumsItem.getValue().then((all) => setGoalAlbums(all ?? {}));
    return goalAlbumsItem.watch((all) => setGoalAlbums(all ?? {}));
  }, []);
  const [albumLooks, setAlbumLooks] = useState<Record<string, AlbumLook>>({});
  const [albumStyles, setAlbumStyles] = useState<Record<string, 'relie' | 'classeur' | 'grimoire' | 'herbier'>>({});
  useEffect(() => {
    void albumLooksItem.getValue().then(setAlbumLooks);
    void albumStylesItem.getValue().then(setAlbumStyles);
    const offLooks = albumLooksItem.watch((v) => setAlbumLooks(v ?? {}));
    const offStyles = albumStylesItem.watch((v) => setAlbumStyles(v ?? {}));
    return () => {
      offLooks();
      offStyles();
    };
  }, []);
  const goalIds = useMemo(() => new Set(Object.keys(goalAlbums)), [goalAlbums]);
  const facts = useSuggestions((s) => s.facts);

  // Cartes à ranger, par album (pastille « +N » à côté de chaque album).
  const improve = useImproveCounts();

  // Lien direct : review.html#album=<id> ouvre l'album dès que les étiquettes sont chargées.
  const [albumLink, setAlbumLink] = useState(() => (location.hash.startsWith('#album=') ? decodeURIComponent(location.hash.slice(7)) : null));
  useEffect(() => {
    if (!albumLink) return;
    if (albumLink === 'none') setAlbum({ key: 'none', title: 'Sans étiquette', gradient: UNTAGGED_GRADIENT });
    else {
      const tag = tags.find((t) => t.id === albumLink);
      if (!tag) return;
      setAlbum({ key: tag.id, title: tag.name, gradient: folderGradient(tag.color) });
    }
    setAlbumLink(null);
  }, [albumLink, tags]);

  const systemIds = systemTagIds(tradeTags);
  const own = tags.filter((t) => !systemIds.has(t.id)).sort(byKind);
  const kinds = settings.albumKinds;
  // Les collections finies passent en tête de page, quel que soit le réglage collection / rangement.
  const finished = own.filter((t) => kindOf(t) === 'finished');
  // Albums à objectif : préfixe « ◇ » (reconnu partout), ou liste fermée enregistrée dans l'extension.
  const isGoal = (t: SiteTag) => kindOf(t) === 'goal' || (goalIds.has(t.id) && kindOf(t) === 'collection');
  const goals = own.filter(isGoal);
  const unprefixedGoals = goals.filter((t) => !hasGoalPrefix(t.name));
  // Rangements (« · Nom ») : toujours leur propre groupe, juste avant le statut d'échange.
  const collections = own.filter((t) => kindOf(t) !== 'finished' && !isGoal(t) && !isStorage(t));
  const storages = own.filter((t) => isStorage(t));

  const prefixGoals = async () => {
    for (const tag of unprefixedGoals) await updateTag(tag.id, { name: goalName(tag.name) });
    toast(`${unprefixedGoals.length} album(s) renommé(s) avec « ◇ » : à envoyer depuis la boîte d'envoi`, 'success');
  };

  const markFinished = async (tag: SiteTag) => {
    const next = await toggleFinished(tag, randomTagColor);
    if (await updateTag(tag.id, next)) {
      toast(kindOf(tag) === 'finished' ? `« ${next.name} » est rouverte` : `« ${next.name} » est terminée, bravo !`, 'success');
    }
  };

  const toggleKind = async (tag: SiteTag) => {
    const next = await switchKind(tag, randomTagColor);
    if (await updateTag(tag.id, next)) {
      toast(!isStorage(tag) ? `« ${next.name} » passe en rangement` : `« ${next.name} » passe en collection`, 'success');
    }
  };

  /** Copie le code de partage d'un album à objectif. */
  const shareGoal = async (tag: SiteTag) => {
    const goal = (await goalAlbumsItem.getValue())[tag.id];
    if (!goal) return;
    try {
      const code = await encodeAlbumCode(tag.name, tag.color, goal);
      await navigator.clipboard.writeText(code);
      toast(`Code de « ${tag.name} » copié (${goal.entries.length} cases, ${code.length} caractères)`, 'success');
    } catch (e) {
      toast(`Copie impossible : ${(e as Error).message}`, 'error');
    }
  };

  /** Crée l'album à objectif d'un code partagé, et met les cartes déjà possédées dans la boîte d'envoi. */
  const importGoal = async (code: string): Promise<string | null> => {
    try {
      const shared = await decodeAlbumCode(code);
      const { entries, dropped } = await resolveSharedEntries(shared);
      if (!entries.length) return 'Aucune case n’a pu être retrouvée sur Wikipédia.';
      const full = goalName(shared.name);
      if (tags.some((t) => t.name.toLowerCase() === full.toLowerCase())) return `Tu as déjà un album « ${full} ».`;
      const tag = await createTag(full, shared.color ?? randomTagColor());
      if (!tag) return 'Création de l’étiquette impossible.';
      await saveGoalAlbum(tag.id, { entries, source: shared.source, annex: shared.annex, at: Date.now() });
      const owned = matchEntries(entries, cards, await factsItem.getValue());
      const toStick = [...owned.values()].filter((c) => !c.tagIds.includes(tag.id));
      if (toStick.length) stageIntoAlbum(toStick, tag);
      toast(
        `Album « ${tag.name} » importé : ${entries.length} cases${dropped ? ` (${dropped} introuvable(s))` : ''}${toStick.length ? `, ${toStick.length} carte(s) à coller dans la boîte d'envoi` : ''}`,
        'success',
      );
      setAlbum({ key: tag.id, title: tag.name, gradient: folderGradient(tag.color) });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  // Cartes par étiquette ; Trade inclut les cartes « Trade par défaut ».
  const byTag = useMemo(() => {
    const map = new Map<string, OwnedCard[]>();
    for (const tag of tags) map.set(tag.id, []);
    for (const card of cards) {
      for (const id of card.tagIds) map.get(id)?.push(card);
      if (tradeTags && statusOf(card) === 'trade' && !card.tagIds.includes(tradeTags.trade.id)) map.get(tradeTags.trade.id)?.push(card);
    }
    return map;
  }, [tags, cards, tradeTags, statusOf, version]);

  const untagged = useMemo(() => cards.filter((c) => !c.tagIds.some((t) => !systemIds.has(t))), [cards, version, tradeTags]);


  const showInReview = (tag: SiteTag | 'none') => {
    const review = useReview.getState();
    review.resetFilters();
    if (tag === 'none') review.set({ tagFilters: new Set(['none']) });
    else if (tradeTags && tag.id === tradeTags.notTrade.id) review.set({ status: 'not_trade' });
    else if (tradeTags?.discard && tag.id === tradeTags.discard.id) review.set({ status: 'discard' });
    else if (tradeTags && tag.id === tradeTags.trade.id) review.set({ status: 'trade' });
    else review.set({ tagFilters: new Set([tag.id]) });
    onOpenReview();
  };

  const openAlbum = (tag: SiteTag | 'none', focus = false) =>
    setAlbum(tag === 'none' ? { key: 'none', title: 'Sans étiquette', gradient: UNTAGGED_GRADIENT } : { key: tag.id, title: tag.name, gradient: folderGradient(tag.color), focus });

  /** Renommer, finir, partager, passer en rangement, supprimer : menu ⋯ des dossiers, de la liste et de la bibliothèque. */
  const tagMenuItems = (tag: SiteTag) => (
    <>
      <DropdownMenuItem
        onSelect={() => {
          setRenameDraft(tag.name);
          setToRename(tag);
        }}
      >
        <Pencil className="size-4" /> Renommer
      </DropdownMenuItem>
      {!isStorage(tag) && (
        <DropdownMenuItem onSelect={() => markFinished(tag)}>
          {kindOf(tag) === 'finished' ? (
            <>
              <RotateCcw className="size-4" /> Rouvrir la collection
            </>
          ) : (
            <>
              <Trophy className="size-4" /> Marquer comme finie
            </>
          )}
        </DropdownMenuItem>
      )}
      {goalIds.has(tag.id) && (
        <DropdownMenuItem onSelect={() => void shareGoal(tag)}>
          <Share2 className="size-4" /> Copier le code de partage
        </DropdownMenuItem>
      )}
      {/* Toujours proposé : la page Albums sépare les rangements même sans le réglage collection / rangement. */}
      <DropdownMenuItem onSelect={() => toggleKind(tag)}>
        {!isStorage(tag) ? (
          <>
            <Archive className="size-4" /> Passer en rangement
          </>
        ) : (
          <>
            <Sparkles className="size-4" /> Passer en collection
          </>
        )}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(tag)}>
        <Trash2 className="size-4" /> Supprimer
      </DropdownMenuItem>
    </>
  );

  /** Couleur, « Voir » dans la Revue et menu (renommer / supprimer) : communs aux dossiers et à la liste. */
  const tagControls = (tag: SiteTag, system: boolean) => (
    <div className="flex items-center gap-1.5">
      <ColorPicker value={tag.color ?? FALLBACK_COLOR} onChange={(c) => updateTag(tag.id, { color: c })} className="size-5" />
      {!system && (improve?.byTag.get(tag.id) ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => openAlbum(tag, true)}
          title={`${improve!.byTag.get(tag.id)} carte(s) que tu possèdes iraient bien dans cet album`}
          className="flex h-6 cursor-pointer items-center rounded-full bg-emerald-500/15 px-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/25 dark:text-emerald-300"
        >
          +{improve!.byTag.get(tag.id)}
        </button>
      )}
      <Button variant="ghost" size="sm" className="h-7 rounded-full px-2.5 text-xs" onClick={() => showInReview(tag)}>
        Voir <ArrowRight className="size-3" />
      </Button>
      {system ? (
        <span className="flex size-7 items-center justify-center">
          <Lock className="size-3.5 text-muted-foreground" aria-label="Étiquette système" />
        </span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 rounded-full" aria-label="Plus d'actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{tagMenuItems(tag)}</DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  const folder = (tag: SiteTag, system = false) => {
    const tagCards = byTag.get(tag.id) ?? [];
    return (
      <AnimatedFolder
        key={tag.id}
        title={tag.name}
        projects={toProjects(tagCards)}
        count={tagCards.length}
        gradient={folderGradient(tag.color)}
        onOpen={() => openAlbum(tag)}
        onProjectClick={(i) => useCardViewer.getState().open(tagCards, i)}
        countLabel={['carte', 'cartes']}
        actionLabel="Wikipédia"
        onAction={openWikipedia}
        className="w-full"
        footer={tagControls(tag, system)}
      />
    );
  };

  /** Livres de la bibliothèque : albums à objectif et collections finies. */
  const books = useMemo((): ShelfBook[] => {
    const list = [...goals, ...finished.filter((t) => !goals.includes(t))];
    return list.map((tag) => {
      const goal = goalAlbums[tag.id];
      const tagCards = byTag.get(tag.id) ?? [];
      const look = albumLooks[tag.id] ?? {};
      const emblemCard = look.emblem?.startsWith('card:') ? cards.find((c) => c.cardId === look.emblem!.slice(5)) : undefined;
      const lead = /^\p{Extended_Pictographic}\uFE0F?/u.exec(tag.name.replace(/^◇\s*/, ''))?.[0];
      const name = tag.name.replace(/^◇\s*/, '').replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '').replace(/\s*✓$/, '') || tag.name;
      const base = {
        tag,
        name,
        color: /^#[0-9a-f]{6}$/i.test(tag.color ?? '') ? tag.color! : '#8b5cf6',
        style: albumStyles[tag.id] ?? settings.albumStyle,
        emblem: look.emblem && !emblemCard ? look.emblem : lead ?? '◇',
        image: emblemCard ? cardImage(emblemCard) : undefined,
      };
      if (!goal) {
        return { ...base, total: tagCards.length, have: tagCards.length, toStick: 0, at: 0, done: true, parts: [] };
      }
      const match = matchEntries(goal.entries, cards, facts);
      const stuck = (i: number) => match.get(i)?.tagIds.includes(tag.id) ?? false;
      const parts: ShelfBook['parts'] = [];
      goal.entries.forEach((e, i) => {
        if (!e.section) return;
        let part = parts.find((p) => p.name === e.section);
        if (!part) parts.push((part = { name: e.section, total: 0, have: 0 }));
        part.total++;
        if (stuck(i)) part.have++;
      });
      const have = goal.entries.filter((_, i) => stuck(i)).length;
      const total = goal.entries.length;
      return { ...base, total, have, toStick: match.size - have, at: goal.at, done: kindOf(tag) === 'finished' || (total > 0 && have >= total), parts };
    });
  }, [goals, finished, goalAlbums, albumLooks, albumStyles, byTag, cards, facts, settings.albumStyle]);

  const prefixButton = unprefixedGoals.length > 0 && (
    <Button variant="outline" size="sm" className="h-7 rounded-full px-2.5 text-xs" onClick={prefixGoals}>
      Ajouter « ◇ » à {unprefixedGoals.length} album{unprefixedGoals.length > 1 ? 's' : ''}
    </Button>
  );

  /** Vue Dossiers : albums à objectif et collections finies en livres sur l'étagère. */
  const librarySection = books.length > 0 && (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase">
          <Library className="size-3.5" /> Bibliothèque · {books.length}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {prefixButton}
          <div className="flex rounded-full border bg-card p-1" role="radiogroup" aria-label="Ranger la bibliothèque">
            {LIBRARY_ORDERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={settings.libraryOrder === value}
                onClick={() => updateSettings({ libraryOrder: value })}
                className={cn(
                  'cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition',
                  settings.libraryOrder === value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <LibraryShelf
        books={books}
        order={settings.libraryOrder}
        onOpen={(book) => openAlbum(book.tag)}
        menu={(book) => (
          <>
            <DropdownMenuItem onSelect={() => showInReview(book.tag)}>
              <ArrowRight className="size-4" /> Voir dans Cartes
            </DropdownMenuItem>
            {tagMenuItems(book.tag)}
          </>
        )}
        sound={settings.sound}
      />
    </section>
  );

  /** Vue Liste : albums à objectif puis collections finies. */
  const goalSection = goals.length > 0 && (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase">
          <Target className="size-3.5" /> Albums à objectif · {goals.length}
        </h2>
        {prefixButton}
      </div>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        {goals.map((tag) => (
          <TagRow key={tag.id} name={tag.name} color={tag.color} cards={byTag.get(tag.id) ?? []} onOpen={() => openAlbum(tag)} controls={tagControls(tag, false)} icon={Target} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Étiquettes</h1>
          <p className="text-sm text-muted-foreground">
            Étiquettes natives de WikiMasters · clique une étiquette pour l'ouvrir en album.
          </p>
        </div>
        <div className="flex w-full max-w-3xl flex-wrap items-center gap-3 sm:w-auto">
          <CreateMenu onCreate={async (n, c) => Boolean(await createTag(n, c))} onGoal={() => setGoalWizard(true)} onImport={importGoal} albumKinds={kinds} />
          <div className="flex shrink-0 rounded-full border bg-card p-1" role="radiogroup" aria-label="Affichage">
            {(
              [
                ['folders', LayoutGrid, 'Dossiers'],
                ['list', List, 'Liste'],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={layout === value}
                title={label}
                onClick={() => updateSettings({ tagsLayout: value })}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition',
                  layout === value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" /> <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {layout === 'list' ? goalSection : librarySection}

      {layout === 'list' && finished.length > 0 && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-amber-600 uppercase dark:text-amber-400">
            <Trophy className="size-3.5" /> Collections finies · {finished.length}
          </h2>
          <div className="divide-y overflow-hidden rounded-2xl border border-amber-400/40 bg-card shadow-[0_0_0_1px_rgb(234_179_8/0.08),0_10px_30px_-18px_rgb(234_179_8/0.6)]">
            {finished.map((tag) => (
              <TagRow key={tag.id} name={tag.name} color={tag.color} cards={byTag.get(tag.id) ?? []} onOpen={() => openAlbum(tag)} controls={tagControls(tag, false)} icon={Trophy} />
            ))}
          </div>
        </section>
      )}

      <section data-tour="albums" className="space-y-4">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {kinds ? 'Collections' : 'Mes étiquettes'} · {collections.length}
        </h2>
        {layout === 'list' ? (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {collections.map((tag) => (
              <TagRow key={tag.id} name={tag.name} color={tag.color} cards={byTag.get(tag.id) ?? []} onOpen={() => openAlbum(tag)} controls={tagControls(tag, false)} />
            ))}
            <TagRow
              name="Sans étiquette"
              color={null}
              muted
              cards={untagged}
              onOpen={() => openAlbum('none')}
              controls={
                <Button variant="ghost" size="sm" className="h-7 rounded-full px-2.5 text-xs" onClick={() => showInReview('none')}>
                  Trier ces cartes <ArrowRight className="size-3" />
                </Button>
              }
            />
          </div>
        ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
          {collections.map((tag, i) => (
            <div key={tag.id} className="animate-in fade-in slide-in-from-bottom-6 fill-mode-both duration-700" style={{ animationDelay: `${i * 60}ms` }}>
              {folder(tag)}
            </div>
          ))}
          <div className="animate-in fade-in slide-in-from-bottom-6 fill-mode-both duration-700" style={{ animationDelay: `${collections.length * 60}ms` }}>
            <AnimatedFolder
              title="Sans étiquette"
              projects={toProjects(untagged)}
              count={untagged.length}
              onOpen={() => openAlbum('none')}
              onProjectClick={(i) => useCardViewer.getState().open(untagged, i)}
              countLabel={['carte', 'cartes']}
              actionLabel="Wikipédia"
              onAction={openWikipedia}
              className="w-full opacity-80"
              footer={
                <Button variant="ghost" size="sm" className="h-7 rounded-full px-2.5 text-xs" onClick={() => showInReview('none')}>
                  Trier ces cartes <ArrowRight className="size-3" />
                </Button>
              }
            />
          </div>
        </div>
        )}
      </section>

      {storages.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Rangement · {storages.length}</h2>
          {layout === 'list' ? (
            <div className="divide-y overflow-hidden rounded-2xl border bg-card">
              {storages.map((tag) => (
                <TagRow
                  key={tag.id}
                  name={tag.name}
                  color={tag.color}
                  muted
                  cards={byTag.get(tag.id) ?? []}
                  onOpen={() => openAlbum(tag)}
                  controls={tagControls(tag, false)}
                  icon={Archive}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
              {storages.map((tag) => (
                <div key={tag.id} className="opacity-85">
                  {folder(tag)}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-4 pb-10">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Statut d'échange</h2>
        {layout === 'list' ? (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {tags
              .filter((t) => systemIds.has(t.id))
              .map((tag) => (
                <TagRow
                  key={tag.id}
                  name={tag.name}
                  color={tag.color}
                  cards={byTag.get(tag.id) ?? []}
                  onOpen={() => openAlbum(tag)}
                  controls={tagControls(tag, true)}
                  icon={tag.id === tradeTags?.discard?.id ? Trash2 : Folder}
                />
              ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
            {tags.filter((t) => systemIds.has(t.id)).map((tag) => folder(tag, true))}
          </div>
        )}
      </section>

      {goalWizard && (
        <GoalAlbumWizard
          onClose={() => setGoalWizard(false)}
          onCreated={(tag) => {
            setGoalWizard(false);
            setAlbum({ key: tag.id, title: tag.name, gradient: folderGradient(tag.color) });
          }}
        />
      )}

      <AnimatePresence>
        {album && (
          <Album
            key={album.key}
            title={album.key === 'none' ? album.title : (tags.find((t) => t.id === album.key)?.name ?? album.title)}
            gradient={album.gradient}
            layoutKey={album.key}
            tagId={album.key !== 'none' && !systemIds.has(album.key) ? album.key : undefined}
            focusImprove={album.focus}
            storage={storages.some((t) => t.id === album.key)}
            cards={album.key === 'none' ? untagged : (byTag.get(album.key) ?? [])}
            onRename={
              album.key !== 'none' && !systemIds.has(album.key)
                ? async (name) => {
                    if (tags.some((t) => t.id !== album.key && t.name.toLowerCase() === name.toLowerCase())) {
                      toast(`L'étiquette « ${name} » existe déjà`, 'error');
                      throw new Error('duplicate');
                    }
                    await updateTag(album.key, { name });
                  }
                : undefined
            }
            onClose={() => setAlbum(null)}
          />
        )}
      </AnimatePresence>

      <Dialog open={Boolean(toRename)} onOpenChange={(open) => !open && setToRename(null)}>
        <DialogContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const tag = toRename;
              setToRename(null);
              if (tag && renameDraft.trim() && renameDraft.trim() !== tag.name) await updateTag(tag.id, { name: renameDraft.trim() });
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Renommer « {toRename?.name} »</DialogTitle>
            </DialogHeader>
            <Input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Annuler</Button>
              </DialogClose>
              <Button type="submit" disabled={!renameDraft.trim()}>Renommer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer « {toDelete?.name} » ?</DialogTitle>
            <DialogDescription>
              L'étiquette sera retirée de {byTag.get(toDelete?.id ?? '')?.length ?? 0} carte(s) et supprimée de WikiMasters. Les cartes ne sont pas touchées.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                const tag = toDelete;
                setToDelete(null);
                if (tag) await deleteTag(tag.id);
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
