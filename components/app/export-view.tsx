import { ClipboardCopy, FileSpreadsheet, FileText, Loader2, Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useCollection } from '@/hooks/use-collection';
import { toast } from '@/hooks/use-toast';
import { useVisibleCards } from '@/hooks/use-review';
import { downloadText, toCsv, toTsv } from '@/lib/csv';
import { EXPORT_SHEETS, type SheetExport } from '@/lib/sheets';
import { PALETTES, holoGradient, type PaletteId } from '@/lib/palettes';
import type { Settings } from '@/lib/store';
import { cn } from '@/lib/utils';
import { BrandIcon } from './brand-icon';

function Card({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">{icon}</div>
        <div className="space-y-0.5">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function SettingRow({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      {children}
    </div>
  );
}

function PalettePicker({ value, onChange }: { value: PaletteId; onChange: (id: PaletteId) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {PALETTES.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            aria-pressed={active}
            className={cn(
              'group flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-xs transition',
              active ? 'border-primary bg-accent font-semibold ring-1 ring-primary' : 'hover:border-foreground/20 hover:bg-muted',
            )}
          >
            <BrandIcon palette={p.id} className="size-12 transition group-hover:-translate-y-0.5" />
            <span className="leading-tight">{p.name}</span>
            <span className="h-1 w-full rounded-full" style={{ backgroundImage: holoGradient(p, 90) }} />
          </button>
        );
      })}
    </div>
  );
}

export function ExportView() {
  const { cards, tags, newIds, statusOf, settings, updateSettings } = useCollection();
  const visible = useVisibleCards();
  const [scope, setScope] = useState<'all' | 'filtered'>('all');
  const [exporting, setExporting] = useState(false);
  const source = scope === 'all' ? cards : visible;
  const rows = source.map((card) => ({ card, status: statusOf(card) }));

  const exportSheets = async () => {
    const tagName = new Map(tags.map((t) => [t.id, t.name]));
    const payload: SheetExport = {
      withImages: settings.sheetImages,
      rows: rows.map(({ card, status }) => ({
        title: card.title,
        rarity: card.rarity,
        count: card.count,
        status,
        tags: card.tagIds.map((id) => tagName.get(id) ?? id),
        isNew: newIds.has(card.cardId),
        imageUrl: card.imageUrl,
        wikipediaUrl: card.wikipediaUrl,
      })),
    };
    setExporting(true);
    try {
      const res = await browser.runtime.sendMessage({ type: EXPORT_SHEETS, payload });
      if (res?.error === 'not_configured') toast("Google Sheets n'est pas encore configuré : voir le README (identifiant OAuth).", 'error');
      else if (res?.error) toast(`Google Sheets : ${res.error}`, 'error');
      else toast(`Classeur mis à jour · ${rows.length} cartes`, 'success');
    } finally {
      setExporting(false);
    }
  };

  const themes: { value: Settings['theme']; icon: React.ReactNode; label: string }[] = [
    { value: 'system', icon: <Monitor className="size-3.5" />, label: 'Auto' },
    { value: 'light', icon: <Sun className="size-3.5" />, label: 'Clair' },
    { value: 'dark', icon: <Moon className="size-3.5" />, label: 'Sombre' },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
          <p className="text-sm text-muted-foreground">Export de ta collection, apparence et réglages.</p>
        </div>
        <div className="flex rounded-full border p-1 text-sm">
          {(['all', 'filtered'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn('cursor-pointer rounded-full px-3 py-1 transition', scope === s ? 'bg-foreground text-background' : 'text-muted-foreground')}
            >
              {s === 'all' ? `Toute la collection · ${cards.length}` : `Filtres de la Revue · ${visible.length}`}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card icon={<FileSpreadsheet className="size-5" />} title="Google Sheets" text="Classeur mis en forme (Collection, À échanger, Stats), mis à jour au même lien à chaque export.">
          <Button onClick={exportSheets} disabled={exporting || !rows.length}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            {exporting ? 'Export…' : 'Exporter'}
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={settings.sheetImages} onCheckedChange={(sheetImages) => updateSettings({ sheetImages })} />
            Miniatures
          </label>
        </Card>
        <Card icon={<FileText className="size-5" />} title="Fichier CSV" text="Pour Excel, Numbers ou un import manuel.">
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() => downloadText(`wikimasters-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, tags))}
          >
            <FileText className="size-4" /> Télécharger
          </Button>
        </Card>
        <Card icon={<ClipboardCopy className="size-5" />} title="Copier le tableau" text="À coller directement dans n'importe quelle feuille (Cmd+V).">
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={async () => {
              await navigator.clipboard.writeText(toTsv(rows, tags));
              toast('Tableau copié dans le presse-papier', 'success');
            }}
          >
            <ClipboardCopy className="size-4" /> Copier
          </Button>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Réglages</h2>
        <div className="divide-y rounded-2xl border bg-card">
          <SettingRow title="Tout Trade par défaut" text="Une carte sans étiquette Trade ni Not Trade est considérée comme Trade.">
            <Switch checked={settings.defaultTrade} onCheckedChange={(defaultTrade) => updateSettings({ defaultTrade })} />
          </SettingRow>
          <SettingRow title="Pastilles sur le site" text="Affiche Trade / Not Trade sur les cartes de WikiMasters.">
            <Switch checked={settings.showBadges} onCheckedChange={(showBadges) => updateSettings({ showBadges })} />
          </SettingRow>
          <SettingRow title="Mode" text="Clair, sombre ou selon le système.">
            <div className="flex rounded-full border p-1">
              {themes.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => updateSettings({ theme: t.value })}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition',
                    settings.theme === t.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </SettingRow>
          <div className="space-y-3 px-5 py-4">
            <div>
              <p className="text-sm font-medium">Palette</p>
              <p className="text-xs text-muted-foreground">Couleurs de l'interface, du bouton sur le site et de l'icône de l'extension.</p>
            </div>
            <PalettePicker value={settings.palette} onChange={(palette) => updateSettings({ palette })} />
          </div>
        </div>
      </section>
    </div>
  );
}
