import { ArrowRight, BookOpen, Folder, LayoutGrid, List, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Album } from './album';
import { useCardViewer } from './card-viewer';
import { ColorPicker, randomTagColor } from './color-picker';
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
}: {
  name: string;
  color: string | null;
  cards: OwnedCard[];
  muted?: boolean;
  onOpen: () => void;
  controls: React.ReactNode;
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
        <Folder className="size-5 drop-shadow" />
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
  const { tags, cards, tradeTags, createTag, updateTag, deleteTag, statusOf, version, settings, updateSettings } = useCollection();
  const layout = settings.tagsLayout;
  const [name, setName] = useState('');
  const [color, setColor] = useState(randomTagColor);
  const [toDelete, setToDelete] = useState<SiteTag | null>(null);
  const [toRename, setToRename] = useState<SiteTag | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [album, setAlbum] = useState<{ key: string; title: string; gradient: string } | null>(null);

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

  const systemIds = new Set(tradeTags ? [tradeTags.trade.id, tradeTags.notTrade.id] : []);
  const own = tags.filter((t) => !systemIds.has(t.id));

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await createTag(name, color)) {
      setName('');
      setColor(randomTagColor());
    }
  };

  const showInReview = (tag: SiteTag | 'none') => {
    const review = useReview.getState();
    review.resetFilters();
    if (tag === 'none') review.set({ tagFilters: new Set(['none']) });
    else if (tradeTags && tag.id === tradeTags.notTrade.id) review.set({ status: 'not_trade' });
    else if (tradeTags && tag.id === tradeTags.trade.id) review.set({ status: 'trade' });
    else review.set({ tagFilters: new Set([tag.id]) });
    onOpenReview();
  };

  const openAlbum = (tag: SiteTag | 'none') =>
    setAlbum(tag === 'none' ? { key: 'none', title: 'Sans étiquette', gradient: UNTAGGED_GRADIENT } : { key: tag.id, title: tag.name, gradient: folderGradient(tag.color) });

  /** Couleur, « Voir » dans la Revue et menu (renommer / supprimer) : communs aux dossiers et à la liste. */
  const tagControls = (tag: SiteTag, system: boolean) => (
    <div className="flex items-center gap-1.5">
      <ColorPicker value={tag.color ?? FALLBACK_COLOR} onChange={(c) => updateTag(tag.id, { color: c })} className="size-5" />
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
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setRenameDraft(tag.name);
                setToRename(tag);
              }}
            >
              <Pencil className="size-4" /> Renommer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(tag)}>
              <Trash2 className="size-4" /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Étiquettes</h1>
          <p className="text-sm text-muted-foreground">
            Étiquettes natives de WikiMasters · clique une étiquette pour l'ouvrir en album.
          </p>
        </div>
        <div className="flex w-full max-w-xl items-center gap-3 sm:w-auto">
        <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2 rounded-full border bg-card py-1 pr-1 pl-3 sm:w-96">
          <ColorPicker value={color} onChange={setColor} className="size-5" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nouvelle étiquette…"
            className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <Button type="submit" size="sm" className="rounded-full" disabled={!name.trim()}>
            <Plus className="size-4" /> Créer
          </Button>
        </form>
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

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Mes étiquettes · {own.length}</h2>
        {layout === 'list' ? (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {own.map((tag) => (
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
          {own.map((tag, i) => (
            <div key={tag.id} className="animate-in fade-in slide-in-from-bottom-6 fill-mode-both duration-700" style={{ animationDelay: `${i * 60}ms` }}>
              {folder(tag)}
            </div>
          ))}
          <div className="animate-in fade-in slide-in-from-bottom-6 fill-mode-both duration-700" style={{ animationDelay: `${own.length * 60}ms` }}>
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

      <section className="space-y-4 pb-10">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Statut d'échange</h2>
        {layout === 'list' ? (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {tags
              .filter((t) => systemIds.has(t.id))
              .map((tag) => (
                <TagRow key={tag.id} name={tag.name} color={tag.color} cards={byTag.get(tag.id) ?? []} onOpen={() => openAlbum(tag)} controls={tagControls(tag, true)} />
              ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
            {tags.filter((t) => systemIds.has(t.id)).map((tag) => folder(tag, true))}
          </div>
        )}
      </section>

      <AnimatePresence>
        {album && (
          <Album
            key={album.key}
            title={album.key === 'none' ? album.title : (tags.find((t) => t.id === album.key)?.name ?? album.title)}
            gradient={album.gradient}
            layoutKey={album.key}
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
