import { Bot, ChevronDown, Loader2, RefreshCw, Smile, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { toast } from '@/hooks/use-toast';
import { ai, AVAILABILITY_TEXT, type AiAvailability } from '@/lib/ai';
import { albumDescriptionsItem } from '@/lib/album';
import { bareName, kindOf } from '@/lib/album-kind';
import { albumSheetsItem, deleteSheet, sheetOutdated, writeSheet, type AlbumSheet } from '@/lib/album-sheet';
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

function AiStatus({ availability, download }: { availability: AiAvailability | null; download: number | null }) {
  if (!availability) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm',
        availability === 'unavailable' ? 'border-destructive/40 bg-destructive/5' : 'bg-card',
      )}
    >
      <Bot className="size-4 shrink-0 text-muted-foreground" />
      <span>
        {ai.name} : <strong>{download !== null ? `téléchargement ${Math.round(download * 100)} %` : AVAILABILITY_TEXT[availability]}</strong>
        {availability === 'unavailable' &&
          " · il faut un Chrome récent (138+) sur un ordinateur compatible (environ 22 Go libres, 4 Go de mémoire vidéo ou 16 Go de RAM). D'autres fournisseurs d'IA pourront être ajoutés plus tard."}
        {availability === 'downloadable' && ' · le modèle (quelques Go) se télécharge au premier clic sur « Rédiger ».'}
      </span>
    </div>
  );
}

function SheetBody({ sheet }: { sheet: AlbumSheet }) {
  return (
    <div className="space-y-3 text-sm">
      <p>{sheet.summary}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wider text-emerald-600 uppercase dark:text-emerald-400">On y range</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
            {sheet.include.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wider text-rose-600 uppercase dark:text-rose-400">On n'y range pas</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
            {sheet.exclude.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {sheet.keywords.map((k) => (
          <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Fiches d'album : l'IA décrit chaque album (thème, ce qu'on y range ou pas, mots-clés).
 * Les mots-clés aident les recommandations ; l'emoji proposé peut être appliqué au nom de l'étiquette.
 */
export function SheetsView() {
  const { cards, tags, tradeTags, settings, updateTag } = useCollection();
  const facts = useSuggestions((s) => s.facts);
  const labels = useSuggestions((s) => s.labels);
  const availability = useAiAvailability();
  const [sheets, setSheets] = useState<Record<string, AlbumSheet>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState(false);
  const [download, setDownload] = useState<number | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    albumSheetsItem.getValue().then(setSheets);
    albumDescriptionsItem.getValue().then(setNotes);
  }, []);

  const albums = useMemo(() => {
    const systemIds = systemTagIds(tradeTags);
    const own = tags.filter((t) => !systemIds.has(t.id) && !(settings.albumKinds && kindOf(t) === 'storage'));
    const byTag = new Map(own.map((t) => [t.id, [] as OwnedCard[]]));
    for (const card of cards) for (const id of card.tagIds) byTag.get(id)?.push(card);
    return own.map((tag) => ({ tag, cards: byTag.get(tag.id)! })).filter((a) => a.cards.length);
  }, [cards, tags, tradeTags, settings.albumKinds]);

  const write = async (tag: SiteTag, albumCards: OwnedCard[]) => {
    setBusy((b) => new Set(b).add(tag.id));
    try {
      const sheet = await writeSheet({
        tag,
        name: bareName(tag.name),
        cards: albumCards,
        description: notes[tag.id],
        otherAlbums: albums.filter((a) => a.tag.id !== tag.id).map((a) => bareName(a.tag.name)),
        facts,
        labels,
        onDownload: (p) => setDownload(p < 1 ? p : null),
      });
      setSheets((s) => ({ ...s, [tag.id]: sheet }));
      setOpen((o) => new Set(o).add(tag.id));
      return true;
    } catch (error) {
      toast(`Fiche « ${tag.name} » : ${error instanceof Error ? error.message : String(error)}`, 'error');
      return false;
    } finally {
      setDownload(null);
      setBusy((b) => {
        const next = new Set(b);
        next.delete(tag.id);
        return next;
      });
    }
  };

  const missing = albums.filter((a) => !sheets[a.tag.id] || sheetOutdated(sheets[a.tag.id]!, a.cards.length));

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

  /** Met l'emoji de la fiche en tête du nom de l'étiquette (remplace l'emoji actuel). */
  const applyEmoji = async (tag: SiteTag, emoji: string) => {
    const name = `${emoji} ${bareName(tag.name)}`;
    if (name !== tag.name && (await updateTag(tag.id, { name }))) toast(`Renommée en « ${name} » (en attente d'envoi)`, 'success');
  };

  const leadingEmoji = (name: string) => bareName(name) !== name.trim();

  return (
    <div className="space-y-6">
      <AiStatus availability={availability} download={download} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {Object.keys(sheets).length} fiche(s) sur {albums.length} album(s){missing.length > 0 && ` · ${missing.length} à rédiger ou à mettre à jour`}
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
                  onClick={() => setOpen((o) => (o.has(tag.id) ? new Set([...o].filter((id) => id !== tag.id)) : new Set(o).add(tag.id)))}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left disabled:cursor-default"
                >
                  <span className="truncate font-medium">{tag.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {albumCards.length} carte{albumCards.length > 1 ? 's' : ''}
                    {sheet ? (outdated ? ' · fiche à mettre à jour' : ' · fiche prête') : ' · pas de fiche'}
                  </span>
                  {sheet && <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />}
                </button>
                {sheet && !leadingEmoji(tag.name) && (
                  <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={() => applyEmoji(tag, sheet.emoji)} title="Mettre cet emoji devant le nom de l'étiquette">
                    <Smile className="size-3.5" /> Ajouter {sheet.emoji}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={sheet && !outdated ? 'ghost' : 'outline'}
                  className="h-7 rounded-full text-xs"
                  disabled={working || batch || availability === 'unavailable'}
                  onClick={() => write(tag, albumCards)}
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
                    onClick={async () => {
                      await deleteSheet(tag.id);
                      setSheets(({ [tag.id]: _, ...rest }) => rest);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
              {isOpen && <SheetBody sheet={sheet} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
