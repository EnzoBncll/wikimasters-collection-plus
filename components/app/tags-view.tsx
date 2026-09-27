import { ArrowRight, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { ColorPicker, randomTagColor } from './color-picker';
import { RARITY_VAR } from './rarity';

/** Nombre max de cartes chargées dans la visionneuse d'un dossier. */
const LIGHTBOX_LIMIT = 60;
const FALLBACK_COLOR = '#71717a';

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

/** Visuel de remplacement (SVG) pour les cartes sans image. */
function placeholder(card: OwnedCard) {
  const color = card.rarity ? getComputedStyle(document.documentElement).getPropertyValue(RARITY_VAR[card.rarity].slice(4, -1)).trim() || '#a1a1aa' : '#a1a1aa';
  const letter = (card.title.charAt(0) || '?').toUpperCase().replace(/[<&>"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#18181b"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="190" font-family="system-ui,sans-serif" font-size="140" font-weight="900" fill="rgba(255,255,255,.85)" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function toProjects(cards: OwnedCard[]): Project[] {
  return cards.slice(0, LIGHTBOX_LIMIT).map((card) => ({
    id: card.cardId,
    title: card.title,
    image: card.imageUrl || placeholder(card),
    subtitle: [card.rarity && `${card.rarity} · ${RARITY_LABEL[card.rarity]}`, `×${card.count}`].filter(Boolean).join(' · '),
    href: card.wikipediaUrl ?? undefined,
  }));
}

const openWikipedia = (project: Project) => {
  if (project.href) window.open(project.href, '_blank', 'noopener');
};

export function TagsView({ onOpenReview }: { onOpenReview: () => void }) {
  const { tags, cards, tradeTags, createTag, updateTag, deleteTag, statusOf, version } = useCollection();
  const [name, setName] = useState('');
  const [color, setColor] = useState(randomTagColor);
  const [toDelete, setToDelete] = useState<SiteTag | null>(null);
  const [toRename, setToRename] = useState<SiteTag | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

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

  const folder = (tag: SiteTag, system = false) => {
    const tagCards = byTag.get(tag.id) ?? [];
    return (
      <AnimatedFolder
        key={tag.id}
        title={tag.name}
        projects={toProjects(tagCards)}
        count={tagCards.length}
        gradient={folderGradient(tag.color)}
        countLabel={['carte', 'cartes']}
        actionLabel="Wikipédia"
        onAction={openWikipedia}
        className="w-full"
        footer={
          <div className="flex items-center gap-1.5">
            <ColorPicker value={tag.color ?? FALLBACK_COLOR} onChange={(c) => updateTag(tag.id, { color: c })} className="size-5" />
            <Button variant="ghost" size="sm" className="h-7 rounded-full px-2.5 text-xs" onClick={() => showInReview(tag)}>
              Voir <ArrowRight className="size-3" />
            </Button>
            {system ? (
              <Lock className="size-3.5 text-muted-foreground" aria-label="Étiquette système" />
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
        }
      />
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Étiquettes</h1>
          <p className="text-sm text-muted-foreground">
            Étiquettes natives de WikiMasters · survole un dossier pour voir ses cartes, clique une carte pour l'agrandir.
          </p>
        </div>
        <form onSubmit={submit} className="flex w-full max-w-md items-center gap-2 rounded-full border bg-card py-1 pr-1 pl-3">
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
      </header>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Mes étiquettes · {own.length}</h2>
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
      </section>

      <section className="space-y-4 pb-10">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Statut d'échange</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
          {tags.filter((t) => systemIds.has(t.id)).map((tag) => folder(tag, true))}
        </div>
      </section>

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
