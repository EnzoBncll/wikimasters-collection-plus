import { Bot, Loader2, RefreshCw, Smile, Wand2 } from 'lucide-react';
import { useCollection } from '@/hooks/use-collection';
import { sheetOutdated } from '@/lib/album-sheet';
import type { OwnedCard } from '@/lib/types';
import { hasLeadingEmoji, SheetEditor, useAiAvailability, useAlbumSheets, useApplyEmoji, useWriteSheet } from './sheets-view';

/** Sous l'album : sa fiche (thème, ce qu'on y range ou pas, mots-clés), rédigée par l'IA et retouchable à la main. */
export function AlbumSheetPanel({ tagId, cards }: { tagId: string; cards: OwnedCard[] }) {
  const tag = useCollection((s) => s.tags.find((t) => t.id === tagId));
  const availability = useAiAvailability();
  const sheets = useAlbumSheets();
  const { write, busy, download } = useWriteSheet();
  const applyEmoji = useApplyEmoji();
  const sheet = sheets[tagId];

  // Ni fiche ni IA : rien à montrer.
  if (!tag || (!sheet && availability !== 'available' && availability !== 'downloadable' && availability !== 'downloading')) return null;
  const working = busy.has(tagId);
  const outdated = sheet && sheetOutdated(sheet, cards.length);

  return (
    <section className="w-full space-y-3 rounded-3xl bg-white/[0.06] p-6 text-white ring-1 ring-white/10 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-violet-300" />
        <h3 className="font-semibold">Fiche de l'album</h3>
        {outdated && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-200">l'album a changé depuis</span>}
        <div className="ml-auto flex gap-1.5">
          {sheet && !hasLeadingEmoji(tag.name) && (
            <button
              type="button"
              onClick={() => applyEmoji(tag, sheet.emoji)}
              title="Mettre cet emoji devant le nom de l'étiquette"
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20"
            >
              <Smile className="size-3.5" /> Ajouter {sheet.emoji}
            </button>
          )}
          {availability !== 'unavailable' && (
            <button
              type="button"
              disabled={working || cards.length === 0}
              onClick={() => write(tag, cards)}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-violet-500 px-3 py-1 text-xs font-semibold transition hover:bg-violet-400 active:scale-95 disabled:opacity-50"
            >
              {working ? <Loader2 className="size-3.5 animate-spin" /> : sheet ? <RefreshCw className="size-3.5" /> : <Wand2 className="size-3.5" />}
              {working && download !== null ? `Téléchargement de l'IA ${Math.round(download * 100)} %` : sheet ? 'Réécrire' : "Rédiger avec l'IA"}
            </button>
          )}
        </div>
      </div>
      {sheet ? (
        <SheetEditor tagId={tagId} sheet={sheet} tone="dark" />
      ) : (
        <p className="text-sm text-white/50">
          L'IA décrit le thème de l'album, ce qu'on y range ou pas, et des mots-clés. La description apparaît sur la couverture, et les mots-clés affinent les
          cartes proposées ci-dessous. Tout reste modifiable à la main.
          {availability === 'downloadable' && ' Le modèle de Chrome (quelques Go) se télécharge au premier clic.'}
        </p>
      )}
    </section>
  );
}
