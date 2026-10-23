import { ClipboardPaste, CloudDownload, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { decodeAlbumCode, resolveSharedEntries } from '@/lib/album-code';
import { CLOUD_SYNC_NOW } from '@/lib/cloud-sync';
import { syncGoalRemotes } from '@/lib/goal-remotes';
import { saveGoalAlbum } from '@/lib/goal-albums';
import { importTransferCode } from '@/lib/goal-sync';

/**
 * Album à objectif (« ◇ ») dont la liste des cases n'est pas sur cet ordinateur : on le dit, au lieu de le montrer
 * fini, et on propose de la récupérer (coffre WikiMasters / Google Drive) ou de coller un code.
 */
export function GoalListMissing({ tagId }: { tagId: string }) {
  const [busy, setBusy] = useState<'fetch' | 'paste' | null>(null);

  const fetchRemote = async () => {
    setBusy('fetch');
    try {
      // Synchro de Chrome d'abord (service worker), puis coffre WikiMasters et Google Drive.
      await browser.runtime.sendMessage({ type: CLOUD_SYNC_NOW }).catch(() => {});
      const n = await syncGoalRemotes({ interactive: true });
      toast(n ? `${n} album(s) récupéré(s)` : 'Rien de neuf : ouvre Collection+ sur l’ordinateur où l’album a été créé, puis réessaie.', n ? 'success' : 'info');
    } finally {
      setBusy(null);
    }
  };

  const paste = async () => {
    const code = (window.prompt('Colle le code de l’album (CP1-…) ou le code de transfert (CPT1-…) :') ?? '').trim();
    if (!code) return;
    setBusy('paste');
    try {
      if (code.startsWith('CPT1-')) {
        const n = await importTransferCode(code);
        toast(`${n} album(s) reçu(s)`, 'success');
      } else {
        const shared = await decodeAlbumCode(code);
        const { entries, dropped } = await resolveSharedEntries(shared);
        if (!entries.length) throw new Error('Aucune case retrouvée sur Wikipédia.');
        await saveGoalAlbum(tagId, { entries, source: shared.source, annex: shared.annex, at: Date.now() });
        toast(`Liste rétablie : ${entries.length} cases${dropped ? ` (${dropped} introuvable(s))` : ''}`, 'success');
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full bg-amber-400/15 py-1 pr-1 pl-3 text-xs text-amber-100 ring-1 ring-amber-300/30">
      <span>Liste des cases pas encore sur cet ordinateur</span>
      <button type="button" onClick={fetchRemote} disabled={Boolean(busy)} className="flex h-7 cursor-pointer items-center gap-1 rounded-full bg-white/10 px-2.5 font-semibold hover:bg-white/20 disabled:opacity-50">
        {busy === 'fetch' ? <Loader2 className="size-3.5 animate-spin" /> : <CloudDownload className="size-3.5" />} Récupérer
      </button>
      <button type="button" onClick={paste} disabled={Boolean(busy)} className="flex h-7 cursor-pointer items-center gap-1 rounded-full bg-white/10 px-2.5 font-semibold hover:bg-white/20 disabled:opacity-50">
        {busy === 'paste' ? <Loader2 className="size-3.5 animate-spin" /> : <ClipboardPaste className="size-3.5" />} Coller un code
      </button>
    </div>
  );
}
