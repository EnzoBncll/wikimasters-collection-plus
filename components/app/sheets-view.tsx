import { Bot, Check, ChevronDown, Loader2, Pencil, RefreshCw, Smile, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { toast } from '@/hooks/use-toast';
import { ai, AVAILABILITY_TEXT, type AiAvailability } from '@/lib/ai';
import { albumDescriptionsItem } from '@/lib/album';
import { bareName, kindOf } from '@/lib/album-kind';
import { albumSheetsItem, deleteSheet, sheetOutdated, updateSheet, writeSheet, type AlbumSheet } from '@/lib/album-sheet';
import { systemTagIds } from '@/lib/trade';
import type { OwnedCard, SiteTag } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Disponibilité de l'IA, vérifiée une seule fois pour toute la page (chaque carte de suggestion la demande). */
let availabilityCheck: Promise<AiAvailability> | null = null;
export function useAiAvailability() {
  const [availability, setAvailability] = useState<AiAvailability | null>(null);
  useEffect(() => {
    availabilityCheck ??= ai.availability().catch(() => 'unavailable' as const);
    availabilityCheck.then(setAvailability);
  }, []);
  return availability;
}

/** Fiches de tous les albums, tenues à jour quand une autre vue (couverture, onglet Fiches) les change. */
export function useAlbumSheets() {
  const [sheets, setSheets] = useState<Record<string, AlbumSheet>>({});
  useEffect(() => {
    albumSheetsItem.getValue().then(setSheets);
    return albumSheetsItem.watch((next) => setSheets(next ?? {}));
  }, []);
  return sheets;
}

/** Albums de collection (hors statuts d'échange et, si l'option est active, hors rangement), avec leurs cartes. */
export function useCollectionAlbums() {
  const { cards, tags, tradeTags, settings } = useCollection();
  return useMemo(() => {
    const systemIds = systemTagIds(tradeTags);
    const own = tags.filter((t) => !systemIds.has(t.id) && !(settings.albumKinds && kindOf(t) === 'storage'));
    const byTag = new Map(own.map((t) => [t.id, [] as OwnedCard[]]));
    for (const card of cards) for (const id of card.tagIds) byTag.get(id)?.push(card);
    return own.map((tag) => ({ tag, cards: byTag.get(tag.id)! })).filter((a) => a.cards.length);
  }, [cards, tags, tradeTags, settings.albumKinds]);
}

/**
 * Rédaction d'une fiche par l'IA, avec le contexte de la collection.
 * La description actuelle de l'album (écrite à la main ou déjà validée) est transmise pour être respectée.
 */
export function useWriteSheet() {
  const tags = useCollection((s) => s.tags);
  const facts = useSuggestions((s) => s.facts);
  const labels = useSuggestions((s) => s.labels);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [download, setDownload] = useState<number | null>(null);

  const write = async (tag: SiteTag, albumCards: OwnedCard[]): Promise<AlbumSheet | null> => {
    setBusy((b) => new Set(b).add(tag.id));
    try {
      const [notes, sheets] = await Promise.all([albumDescriptionsItem.getValue(), albumSheetsItem.getValue()]);
      return await writeSheet({
        tag,
        name: bareName(tag.name),
        cards: albumCards,
        description: notes[tag.id] || (sheets[tag.id]?.edited ? sheets[tag.id]!.summary : undefined),
        otherAlbums: tags.filter((t) => t.id !== tag.id).map((t) => bareName(t.name)),
        facts,
        labels,
        onDownload: (p) => setDownload(p < 1 ? p : null),
      });
    } catch (error) {
      toast(`Fiche « ${tag.name} » : ${error instanceof Error ? error.message : String(error)}`, 'error');
      return null;
    } finally {
      setDownload(null);
      setBusy((b) => {
        const next = new Set(b);
        next.delete(tag.id);
        return next;
      });
    }
  };
  return { write, busy, download };
}

export function AiStatus({ availability, download, className }: { availability: AiAvailability | null; download: number | null; className?: string }) {
  if (!availability || (availability === 'available' && download === null)) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm',
        availability === 'unavailable' ? 'border-destructive/40 bg-destructive/5' : 'bg-card',
        className,
      )}
    >
      <Bot className="size-4 shrink-0 text-muted-foreground" />
      <span>
        {ai.name} : <strong>{download !== null ? `téléchargement ${Math.round(download * 100)} %` : AVAILABILITY_TEXT[availability]}</strong>
        {availability === 'unavailable' &&
          " · il faut un Chrome récent (138+) sur un ordinateur compatible (environ 22 Go libres, 4 Go de mémoire vidéo ou 16 Go de RAM). Tu peux quand même écrire les fiches à la main."}
        {availability === 'downloadable' && ' · le modèle (quelques Go) se télécharge au premier clic sur « Rédiger ».'}
      </span>
    </div>
  );
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((s) => s.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean);

/**
 * Fiche d'album lisible et modifiable à la main.
 * `tone` : « card » sur les pages claires/sombres de l'app, « dark » sous l'album (fond sombre).
 */
export function SheetEditor({ tagId, sheet, tone = 'card' }: { tagId: string; sheet: AlbumSheet; tone?: 'card' | 'dark' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ summary: '', include: '', exclude: '', keywords: '' });
  const dark = tone === 'dark';
  const muted = dark ? 'text-white/60' : 'text-muted-foreground';
  const field = cn(
    'w-full resize-y rounded-xl px-3 py-2 text-sm outline-none focus:ring-2',
    dark ? 'bg-black/25 text-white ring-white/40 placeholder:text-white/40' : 'border bg-background ring-ring/40',
  );

  const start = () => {
    setDraft({ summary: sheet.summary, include: sheet.include.join('\n'), exclude: sheet.exclude.join('\n'), keywords: sheet.keywords.join(', ') });
    setEditing(true);
  };
  const save = async () => {
    await updateSheet(tagId, {
      summary: draft.summary.trim(),
      include: lines(draft.include),
      exclude: lines(draft.exclude),
      keywords: [...new Set(draft.keywords.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean))],
    });
    setEditing(false);
  };

  if (editing) {
    const label = cn('mb-1 block text-xs font-semibold tracking-wider uppercase', muted);
    return (
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className={label}>Description (affichée sur la couverture)</span>
          <textarea autoFocus rows={3} maxLength={400} className={field} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>On y range · une règle par ligne</span>
            <textarea rows={4} className={field} value={draft.include} onChange={(e) => setDraft({ ...draft, include: e.target.value })} />
          </label>
          <label className="block">
            <span className={label}>On n'y range pas · une règle par ligne</span>
            <textarea rows={4} className={field} value={draft.exclude} onChange={(e) => setDraft({ ...draft, exclude: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className={label}>Mots-clés · séparés par des virgules</span>
          <input className={field} value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} />
        </label>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" className={cn('rounded-full', dark && 'text-white hover:bg-white/10 hover:text-white')} onClick={() => setEditing(false)}>
            Annuler
          </Button>
          <Button size="sm" className="rounded-full" onClick={save} disabled={!draft.summary.trim()}>
            <Check className="size-4" /> Enregistrer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-2">
        <p className="flex-1">{sheet.summary}</p>
        <button
          type="button"
          onClick={start}
          title="Modifier la fiche à la main"
          className={cn('flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs transition', dark ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
        >
          <Pencil className="size-3.5" /> Modifier
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['On y range', sheet.include, dark ? 'text-emerald-300' : 'text-emerald-600 dark:text-emerald-400'],
            ["On n'y range pas", sheet.exclude, dark ? 'text-rose-300' : 'text-rose-600 dark:text-rose-400'],
          ] as const
        ).map(([title, items, color]) => (
          <div key={title}>
            <p className={cn('mb-1 text-xs font-semibold tracking-wider uppercase', color)}>{title}</p>
            <ul className={cn('list-disc space-y-0.5 pl-4', muted)}>
              {items.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {sheet.keywords.map((k) => (
          <span key={k} className={cn('rounded-full px-2 py-0.5 text-[11px]', dark ? 'bg-white/10 text-white/70' : 'bg-muted text-muted-foreground')}>
            {k}
          </span>
        ))}
        <span className={cn('ml-auto text-[11px]', dark ? 'text-white/40' : 'text-muted-foreground/70')}>
          {sheet.edited ? 'Rédigée par l’IA, retouchée à la main' : 'Rédigée par l’IA'}
        </span>
      </div>
    </div>
  );
}

/** Met l'emoji de la fiche en tête du nom de l'étiquette. */
export function useApplyEmoji() {
  const updateTag = useCollection((s) => s.updateTag);
  return async (tag: SiteTag, emoji: string) => {
    const name = `${emoji} ${bareName(tag.name)}`;
    if (name !== tag.name && (await updateTag(tag.id, { name }))) toast(`Renommée en « ${name} » (en attente d'envoi)`, 'success');
  };
}

export const hasLeadingEmoji = (name: string) => bareName(name) !== name.trim();

/**
 * Fiches d'album : l'IA décrit chaque album (thème, ce qu'on y range ou pas, mots-clés), retouchable à la main.
 * Les mots-clés aident les recommandations ; l'emoji proposé peut être appliqué au nom de l'étiquette.
 */
export function SheetsView() {
  const availability = useAiAvailability();
  const albums = useCollectionAlbums();
  const sheets = useAlbumSheets();
  const { write, busy, download } = useWriteSheet();
  const applyEmoji = useApplyEmoji();
  const [batch, setBatch] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const missing = albums.filter((a) => !sheets[a.tag.id] || sheetOutdated(sheets[a.tag.id]!, a.cards.length));
  const toggle = (id: string) => setOpen((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set(o).add(id)));

  const writeOne = async (tag: SiteTag, albumCards: OwnedCard[]) => {
    if (await write(tag, albumCards)) setOpen((o) => new Set(o).add(tag.id));
  };

  const writeAll = async () => {
    setBatch(true);
    let done = 0;
    for (const a of missing) {
      if (!(await write(a.tag, a.cards))) break;
      done++;
    }
    setBatch(false);
    if (done) toast(`${done} fiche${done > 1 ? 's' : ''} rédigée${done > 1 ? 's' : ''}`, 'success');
  };

  return (
    <div className="space-y-6">
      <AiStatus availability={availability} download={download} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {albums.filter((a) => sheets[a.tag.id]).length} fiche(s) sur {albums.length} album(s)
          {missing.length > 0 && ` · ${missing.length} à rédiger ou à mettre à jour`}
        </p>
        <Button className="rounded-full" disabled={!missing.length || batch || availability === 'unavailable'} onClick={writeAll}>
          {batch ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          Rédiger {missing.length} fiche{missing.length > 1 ? 's' : ''}
        </Button>
      </div>

      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        {albums.map(({ tag, cards: albumCards }) => {
          const sheet = sheets[tag.id];
          const isOpen = open.has(tag.id) && sheet;
          const outdated = sheet && sheetOutdated(sheet, albumCards.length);
          const working = busy.has(tag.id);
          return (
            <div key={tag.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color ?? '#71717a' }} />
                <button
                  type="button"
                  disabled={!sheet}
                  onClick={() => toggle(tag.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left disabled:cursor-default"
                >
                  <span className="truncate font-medium">{tag.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {albumCards.length} carte{albumCards.length > 1 ? 's' : ''}
                    {sheet ? (outdated ? ' · fiche à mettre à jour' : ' · fiche prête') : ' · pas de fiche'}
                  </span>
                  {sheet && <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />}
                </button>
                {sheet && !hasLeadingEmoji(tag.name) && (
                  <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={() => applyEmoji(tag, sheet.emoji)} title="Mettre cet emoji devant le nom de l'étiquette">
                    <Smile className="size-3.5" /> Ajouter {sheet.emoji}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={sheet && !outdated ? 'ghost' : 'outline'}
                  className="h-7 rounded-full text-xs"
                  disabled={working || batch || availability === 'unavailable'}
                  onClick={() => writeOne(tag, albumCards)}
                >
                  {working ? <Loader2 className="size-3.5 animate-spin" /> : sheet ? <RefreshCw className="size-3.5" /> : <Wand2 className="size-3.5" />}
                  {sheet ? 'Réécrire' : 'Rédiger'}
                </Button>
                {sheet && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 rounded-full text-muted-foreground hover:text-destructive"
                    title="Supprimer la fiche"
                    onClick={() => deleteSheet(tag.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
              {isOpen && <SheetEditor tagId={tag.id} sheet={sheet} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
