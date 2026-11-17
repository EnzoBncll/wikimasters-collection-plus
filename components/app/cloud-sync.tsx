import {
  BookOpen,
  ClipboardPaste,
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudOff,
  Copy,
  FileDown,
  Link2,
  Loader2,
  Printer,
  RefreshCw,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCollection } from '@/hooks/use-collection';
import { toast } from '@/hooks/use-toast';
import { accountSyncItem, deleteAccountData, isAccountSyncAvailable } from '@/lib/account-sync';
import { bareName } from '@/lib/album-kind';
import { downloadAlbumHtml, importLink, printAlbumPdf, type ExportInput } from '@/lib/album-export';
import { encodeAlbumCode } from '@/lib/album-code';
import { driveSyncItem, isDriveAvailable } from '@/lib/drive-sync';
import { goalAlbumsItem, matchEntries, type GoalAlbum } from '@/lib/goal-albums';
import { syncGoalRemotes } from '@/lib/goal-remotes';
import { exportTransferCode, importTransferCode } from '@/lib/goal-sync';
import { clearSiteVault, siteVaultItem } from '@/lib/site-vault';
import { factsItem } from '@/lib/wikidata';
import { cn } from '@/lib/utils';
import { CompareTab } from './friend-compare';
import { ago } from './sync-status';

/**
 * Nuage « Synchro et partage » des albums à objectif : un bouton dans l'encoche (état des copies d'un coup d'œil)
 * qui ouvre un panneau à quatre volets — où vont tes albums (synchro), les partager (lien, page HTML, PDF, code),
 * les comparer avec la collection d'un ami, et un guide pas à pas.
 */

type Tab = 'sync' | 'share' | 'compare' | 'guide';

export const useCloudPanel = create<{ open: boolean; tab: Tab; show: (tab?: Tab) => void; close: () => void }>((set) => ({
  open: false,
  tab: 'sync',
  show: (tab = 'sync') => set({ open: true, tab }),
  close: () => set({ open: false }),
}));

interface CopyState {
  lastAt: number | null;
  error: string | null;
}

/** Les trois copies distantes, suivies en direct. */
function useCopies() {
  const [vault, setVault] = useState<(CopyState & { tags: number }) | null>(null);
  const [drive, setDrive] = useState<(CopyState & { enabled: boolean }) | null>(null);
  const [account, setAccount] = useState<(CopyState & { enabled: boolean; albums: number }) | null>(null);
  useEffect(() => {
    void siteVaultItem.getValue().then(setVault);
    void driveSyncItem.getValue().then(setDrive);
    void accountSyncItem.getValue().then(setAccount);
    const a = siteVaultItem.watch(setVault);
    const b = driveSyncItem.watch(setDrive);
    const c = accountSyncItem.watch(setAccount);
    return () => (a(), b(), c());
  }, []);
  return { vault, drive, account };
}

/* ---------- Bouton de l'encoche ---------- */

export function CloudSyncButton() {
  const settings = useCollection((s) => s.settings);
  const show = useCloudPanel((s) => s.show);
  const { vault, drive, account } = useCopies();
  const on = [settings.siteVault && vault, account?.enabled && account, drive?.enabled && drive].filter(Boolean) as CopyState[];
  const error = on.find((c) => c.error)?.error;
  const last = Math.max(0, ...on.map((c) => c.lastAt ?? 0));
  const Icon = !on.length ? CloudOff : error ? CloudAlert : last ? CloudCheck : Cloud;
  const label = !on.length ? 'Albums à objectif : aucune copie hors de cet ordinateur' : error ? `Synchro des albums : ${error}` : last ? `Albums synchronisés ${ago(last)}` : 'Synchro des albums activée';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => show()}
          aria-label="Synchro et partage des albums"
          className={cn(
            'relative flex size-8.5 items-center justify-center rounded-full transition-colors hover:bg-accent',
            error ? 'text-destructive' : on.length ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <Icon className="size-4.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/* ---------- Panneau ---------- */

const TABS: { id: Tab; label: string; icon: typeof Cloud }[] = [
  { id: 'sync', label: 'Synchro', icon: Cloud },
  { id: 'share', label: 'Partager', icon: Share2 },
  { id: 'compare', label: 'Comparer', icon: Users },
  { id: 'guide', label: 'Guide', icon: BookOpen },
];

export function CloudSyncPanel({ onOpenAlbums }: { onOpenAlbums: () => void }) {
  const { open, tab, show, close } = useCloudPanel();
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? show(tab) : close())}>
      <DialogContent className="flex h-[min(88vh,680px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-5 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="size-5 text-primary" /> Synchro et partage des albums
          </DialogTitle>
          <DialogDescription>Tes albums à objectif sur tous tes ordinateurs, et à partager avec qui tu veux.</DialogDescription>
          <div className="mt-3 flex gap-1 rounded-full bg-muted p-1" role="tablist">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => show(id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'sync' && <SyncTab />}
          {tab === 'share' && <ShareTab />}
          {tab === 'compare' && <CompareTab />}
          {tab === 'guide' && (
            <GuideTab
              onOpenAlbums={() => {
                close();
                onOpenAlbums();
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ title, text, status, error, children }: { title: string; text: string; status?: string | null; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1 px-6 py-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{text}</p>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
      {(error || status) && <p className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{error ?? status}</p>}
    </div>
  );
}

function useRunner() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

/* ---------- Synchro ---------- */

function SyncTab() {
  const settings = useCollection((s) => s.settings);
  const updateSettings = useCollection((s) => s.updateSettings);
  const { vault, drive, account } = useCopies();
  const { busy, run } = useRunner();

  const toggleVault = (on: boolean) =>
    run('vault', async () => {
      await updateSettings({ siteVault: on });
      if (on) await syncGoalRemotes();
      else if (window.confirm('Retirer aussi la copie déjà rangée dans ton compte WikiMasters ?')) await clearSiteVault();
    });
  const toggleAccount = (on: boolean) =>
    run('account', async () => {
      await accountSyncItem.setValue({ ...(await accountSyncItem.getValue()), enabled: on, error: null });
      if (on) {
        await syncGoalRemotes();
        const state = await accountSyncItem.getValue();
        if (state.error) throw new Error(state.error);
      } else if (account?.lastAt && window.confirm('Effacer aussi la copie gardée sur le serveur Collection+ ?')) await deleteAccountData();
    });
  const eraseAccount = () =>
    run('erase', async () => {
      if (!window.confirm('Effacer du serveur Collection+ tout ce qui concerne ton compte WikiMasters ? Tes albums restent sur cet ordinateur.')) return;
      await accountSyncItem.setValue({ ...(await accountSyncItem.getValue()), enabled: false });
      await deleteAccountData();
      toast('Données effacées du serveur', 'success');
    });
  const toggleDrive = (on: boolean) =>
    run('drive', async () => {
      await driveSyncItem.setValue({ ...(await driveSyncItem.getValue()), enabled: on });
      if (on) await syncGoalRemotes({ interactive: true });
    });
  const exchange = () =>
    run('sync', async () => {
      const n = await syncGoalRemotes({ interactive: true });
      toast(n ? `${n} album(s) reçu(s)` : 'Albums à jour', 'success');
    });
  const copyCode = () =>
    run('export', async () => {
      const { code, count } = await exportTransferCode();
      await navigator.clipboard.writeText(code);
      toast(`Code de transfert copié : ${count} album(s), ${code.length} caractères`, 'success');
    });
  const pasteCode = () =>
    run('import', async () => {
      const code = (window.prompt('Colle le code de transfert (CPT1-…) venu de l’autre ordinateur :') ?? '').trim();
      if (!code) return;
      const n = await importTransferCode(code);
      toast(n ? `${n} album(s) reçu(s)` : 'Tout était déjà là', 'success');
    });

  const anyOn = settings.siteVault || drive?.enabled || account?.enabled;
  return (
    <div className="divide-y">
      <p className="px-6 py-3 text-xs text-muted-foreground">
        La liste des cases d’un album à objectif n’existe que dans l’extension. Garde-en au moins une copie pour la retrouver sur un autre ordinateur ; tes cartes, elles, sont déjà sur WikiMasters.
      </p>
      {isAccountSyncAvailable() && (
        <Row
          title="Serveur Collection+ · recommandé"
          text="Tes albums suivent ton compte WikiMasters, où que tu te connectes. Seule la liste des cases est gardée (codes CP1, sans tes cartes). Ton jeton de session sert uniquement à vérifier qui tu es, il n’est jamais conservé."
          status={account?.enabled ? (account.lastAt ? `Dernier échange ${ago(account.lastAt)} · ${account.albums} album(s) sur le serveur` : 'Pas encore d’échange') : null}
          error={account?.enabled ? account.error : null}
        >
          <Switch checked={account?.enabled ?? false} onCheckedChange={toggleAccount} disabled={busy === 'account' || busy === 'erase'} />
        </Row>
      )}
      <Row
        title="Copie dans ton compte WikiMasters"
        text="Rangée dans des étiquettes « ⚙ Collection+ » sans carte : cachées dans Collection+, visibles dans la liste d’étiquettes du site."
        status={settings.siteVault && vault?.lastAt ? `Dernier échange ${ago(vault.lastAt)} · ${vault.tags} étiquette(s)` : null}
        error={settings.siteVault ? vault?.error : null}
      >
        <Switch checked={settings.siteVault} onCheckedChange={toggleVault} disabled={busy === 'vault'} />
      </Row>
      {isDriveAvailable() && (
        <Row
          title="Google Drive"
          text="Un fichier caché (dossier réservé à l’extension) suit ton compte Google."
          status={drive?.enabled && drive.lastAt ? `Dernier échange ${ago(drive.lastAt)}` : null}
          error={drive?.enabled ? drive.error : null}
        >
          <Switch checked={drive?.enabled ?? false} onCheckedChange={toggleDrive} disabled={busy === 'drive'} />
        </Row>
      )}
      <Row title="Transfert manuel" text="Tous tes albums en un code (CPT1-…) à coller sur l’autre ordinateur, sans compte ni réseau.">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyCode} disabled={Boolean(busy)}>
            {busy === 'export' ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />} Copier
          </Button>
          <Button variant="outline" size="sm" onClick={pasteCode} disabled={Boolean(busy)}>
            {busy === 'import' ? <Loader2 className="size-4 animate-spin" /> : <ClipboardPaste className="size-4" />} Coller
          </Button>
        </div>
      </Row>
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
        {anyOn ? (
          <Button size="sm" onClick={exchange} disabled={Boolean(busy)}>
            {busy === 'sync' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Échanger maintenant
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Active une copie pour échanger.</span>
        )}
        {isAccountSyncAvailable() && (account?.enabled || account?.lastAt) && (
          <Button variant="ghost" size="sm" onClick={eraseAccount} disabled={Boolean(busy)} className="text-muted-foreground">
            {busy === 'erase' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Effacer mes données du serveur
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- Partager ---------- */

function ShareTab() {
  const tags = useCollection((s) => s.tags);
  const cards = useCollection((s) => s.cards);
  const [goals, setGoals] = useState<Record<string, GoalAlbum>>({});
  const [facts, setFacts] = useState<Awaited<ReturnType<typeof factsItem.getValue>>>({});
  const { busy, run } = useRunner();
  useEffect(() => {
    void goalAlbumsItem.getValue().then(setGoals);
    void factsItem.getValue().then(setFacts);
    return goalAlbumsItem.watch(setGoals);
  }, []);

  const albums = useMemo(
    () =>
      tags
        .filter((t) => goals[t.id])
        .map((tag) => {
          const goal = goals[tag.id]!;
          const owned = matchEntries(goal.entries, cards, facts);
          return { tag, goal, owned };
        })
        .sort((a, b) => bareName(a.tag.name).localeCompare(bareName(b.tag.name), 'fr')),
    [tags, goals, cards, facts],
  );

  if (!albums.length)
    return <p className="px-6 py-10 text-center text-sm text-muted-foreground">Pas encore d’album à objectif. Le Guide explique comment en créer un.</p>;

  const input = (a: (typeof albums)[number]): ExportInput => ({ name: a.tag.name, color: a.tag.color, goal: a.goal, owned: a.owned });
  const copyLink = (a: (typeof albums)[number]) =>
    run(`link:${a.tag.id}`, async () => {
      await navigator.clipboard.writeText(importLink(await encodeAlbumCode(a.tag.name, a.tag.color, a.goal)));
      toast(`Lien de « ${bareName(a.tag.name)} » copié : à ouvrir avec Collection+ installée`, 'success');
    });
  const copyCode = (a: (typeof albums)[number]) =>
    run(`code:${a.tag.id}`, async () => {
      await navigator.clipboard.writeText(await encodeAlbumCode(a.tag.name, a.tag.color, a.goal));
      toast('Code de l’album copié', 'success');
    });

  return (
    <div className="space-y-3 px-6 py-4">
      <p className="text-xs text-muted-foreground">
        Le <b>lien</b> ouvre WikiMasters et propose d’ajouter l’album à qui a Collection+. La <b>page HTML</b> s’ouvre partout (cherche, filtre, montre ta progression) avec les boutons pour installer l’extension et ajouter l’album ; le <b>PDF</b> en est la version à imprimer. Ce qui est partagé : la liste des cases, et ta progression dans la page et le PDF.
      </p>
      {albums.map((a) => {
        const pct = Math.round((a.owned.size / Math.max(1, a.goal.entries.length)) * 100);
        const k = a.tag.id;
        const spin = (key: string, Icon: typeof Copy) => (busy === `${key}:${k}` ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />);
        return (
          <div key={k} className="rounded-xl border p-3">
            <div className="flex items-center gap-3">
              <span className="size-3 shrink-0 rounded-full" style={{ background: a.tag.color ?? 'var(--primary)' }} />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{bareName(a.tag.name)}</p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {a.owned.size}/{a.goal.entries.length} · {pct} %
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => copyLink(a)} disabled={Boolean(busy)}>
                {spin('link', Link2)} Lien
              </Button>
              <Button size="sm" variant="outline" onClick={() => run(`html:${k}`, () => downloadAlbumHtml(input(a)))} disabled={Boolean(busy)}>
                {spin('html', FileDown)} Page HTML
              </Button>
              <Button size="sm" variant="outline" onClick={() => run(`pdf:${k}`, () => printAlbumPdf(input(a)))} disabled={Boolean(busy)}>
                {spin('pdf', Printer)} PDF
              </Button>
              <Button size="sm" variant="ghost" onClick={() => copyCode(a)} disabled={Boolean(busy)}>
                {spin('code', Copy)} Code
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Guide ---------- */

const STEPS = [
  {
    title: 'Créer un album à objectif',
    text: 'Dans Albums, bouton + › « Album à objectif » : décris une liste (« les rois de France », « les Pokémon de 1re génération »…) ou colle une page de liste Wikipédia. Collection+ prépare les cases dans l’ordre et y range les cartes que tu as déjà.',
  },
  {
    title: 'Le synchroniser',
    text: 'Onglet Synchro : active le serveur Collection+ (ou la copie WikiMasters, ou Google Drive). Sur ton autre ordinateur, installe Collection+, connecte-toi à WikiMasters, active la même option : tes albums reviennent avec toutes leurs cases.',
  },
  {
    title: 'Le partager',
    text: 'Onglet Partager : envoie le lien (ton ami l’ouvre, WikiMasters lui propose d’ajouter l’album), ou la page HTML / le PDF pour montrer ta progression. Sans l’extension, la page explique comment l’installer.',
  },
  {
    title: 'Comparer avec un ami',
    text: 'Onglet Comparer : choisis un ami (ou tape un pseudo). Collection+ lit sa collection comme sa page de profil et la confronte à tes albums : sa progression à côté de la tienne, et les cartes qu’il a et qui te manquent, pour proposer un échange.',
  },
  {
    title: 'Recevoir un album',
    text: 'Ouvre le lien reçu (ou le bouton « Ajouter à Collection+ » de la page) : sur WikiMasters, une bulle te propose l’album. Tu peux aussi coller un code CP1 dans Albums › + › « Importer un album ».',
  },
];

function GuideTab({ onOpenAlbums }: { onOpenAlbums: () => void }) {
  const show = useCloudPanel((s) => s.show);
  return (
    <ol className="space-y-3 px-6 py-4">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded-xl border p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
          <div className="space-y-2">
            <p className="font-medium">{s.title}</p>
            <p className="text-sm text-muted-foreground">{s.text}</p>
            {i === 0 && (
              <Button size="sm" variant="outline" onClick={onOpenAlbums}>
                Aller aux Albums
              </Button>
            )}
            {i === 1 && (
              <Button size="sm" variant="outline" onClick={() => show('sync')}>
                Ouvrir la synchro
              </Button>
            )}
            {i === 2 && (
              <Button size="sm" variant="outline" onClick={() => show('share')}>
                Partager un album
              </Button>
            )}
            {i === 3 && (
              <Button size="sm" variant="outline" onClick={() => show('compare')}>
                Comparer
              </Button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
