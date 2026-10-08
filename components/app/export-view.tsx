import { Bot, ChevronDown, CloudCheck, RefreshCw, ClipboardCopy, Download, FileSpreadsheet, FileText, FolderCog, Globe, Loader2, Monitor, Moon, Palette, Sun, Trash2, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useCollection } from '@/hooks/use-collection';
import { toast } from '@/hooks/use-toast';
import { useVisibleCards } from '@/hooks/use-review';
import { useSuggestions } from '@/hooks/use-suggestions';
import { CLOUD_SYNC_NOW, cloudSyncItem, SYNCED_LABELS, type CloudSyncState } from '@/lib/cloud-sync';
import { downloadText, toCsv, toTsv } from '@/lib/csv';
import { testGeminiKey } from '@/lib/gemini';
import { EXPORT_SHEETS, type SheetExport } from '@/lib/sheets';
import { PALETTES, holoGradient, type PaletteId } from '@/lib/palettes';
import { CARD_STYLE_IDS, type Settings } from '@/lib/store';
import { criterionText, type RuleMode } from '@/lib/suggest';
import { systemTagIds } from '@/lib/trade';
import type { OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ALBUM_STYLE_IDS, ALBUM_STYLES } from './album-styles';
import { BrandIcon } from './brand-icon';
import { CARD_TAG_STYLES } from './card-tags';
import { SiteSettings } from './site-settings';
import { ago } from './sync-status';
import { useOnboarding } from './onboarding';
import { WmCard } from './wm-card';

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

/** Choix de l'affichage des étiquettes, avec un aperçu sur la carte la plus étiquetée de la collection. */
function CardTagStylePicker({ value, onChange }: { value: Settings['cardTagStyle']; onChange: (id: Settings['cardTagStyle']) => void }) {
  const cards = useCollection((s) => s.cards);
  const tags = useCollection((s) => s.tags);
  const tradeTags = useCollection((s) => s.tradeTags);
  const sample = useMemo((): OwnedCard | undefined => {
    const system = systemTagIds(tradeTags);
    let best: OwnedCard | undefined;
    let most = -1;
    for (const card of cards) {
      const n = card.tagIds.filter((id) => !system.has(id)).length;
      if (n > most) [best, most] = [card, n];
    }
    if (!best) return undefined;
    // Aperçu parlant : la carte la plus étiquetée, complétée par d'autres de tes étiquettes jusqu'à 5.
    const ids = new Set(best.tagIds.filter((id) => !system.has(id)));
    for (const t of tags) if (ids.size < 5 && !system.has(t.id)) ids.add(t.id);
    return { ...best, tagIds: [...ids] };
  }, [cards, tags, tradeTags]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CARD_TAG_STYLES.map((s) => {
        const active = s.id === value;
        return (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => onChange(s.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(s.id)}
            aria-pressed={active}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-xs transition',
              active ? 'border-primary bg-accent ring-1 ring-primary' : 'hover:border-foreground/20 hover:bg-muted',
            )}
          >
            {sample && <WmCard card={sample} tilt={false} tagStyle={s.id} className="w-full max-w-36" />}
            <span className={cn('leading-tight', active && 'font-semibold')}>{s.name}</span>
            <span className="text-center leading-tight text-muted-foreground">{s.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Habillages dans l'ordre du sélecteur : « Défaut » puis Style 1 à 8. */
const CARD_STYLES = CARD_STYLE_IDS;
const styleLabel = (i: number) => (i === 0 ? 'Défaut' : `Style ${i}`);

const PREVIEW_RARITIES = ['C', 'PC', 'R', 'SR', 'UR', 'L'] as const;
const FAN_KEY = 'collectionPlus:cardFanOpen';

/** Les six raretés tenues en main : arc léger, chaque carte posée sur la précédente, de gauche à droite. */
function CardFan({ cards, style }: { cards: OwnedCard[]; style: Settings['cardStyle'] }) {
  const n = cards.length;
  return (
    <div className="flex justify-center pt-4 pb-2">
      {cards.map((card, i) => {
        const t = n > 1 ? i / (n - 1) - 0.5 : 0; // -0,5 → 0,5
        return (
          <div
            key={`${style}-${card.cardId}`}
            className="relative w-20 shrink-0 transition-transform duration-300 ease-out not-first:-ml-7 hover:z-50 hover:-translate-y-3 sm:w-24 sm:not-first:-ml-8"
            style={{ zIndex: i, transform: `translateY(${t * t * 48}px) rotate(${t * 26}deg)`, transformOrigin: '50% 120%' }}
          >
            <WmCard card={card} cardStyle={style} showTags={false} className="w-full animate-in fade-in zoom-in-95 duration-300" />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Sélecteur d'habillage en carrousel : la carte du style choisi au centre, les autres glissent sur les côtés
 * en rapetissant. On passe d'un style à l'autre au clic, aux flèches, en glissant ou à la molette ;
 * chaque changement s'applique tout de suite. Dessous, un aperçu repliable des six raretés en éventail.
 */
function CardStylePicker({ value, onChange }: { value: Settings['cardStyle']; onChange: (id: Settings['cardStyle']) => void }) {
  const cards = useCollection((s) => s.cards);
  const pick = useMemo(() => (r: string) => cards.find((c) => c.rarity === r && c.attack != null) ?? cards.find((c) => c.rarity === r), [cards]);
  const showcase = useMemo(() => pick('SR') ?? cards[0], [pick, cards]);
  const previews = useMemo(() => PREVIEW_RARITIES.map(pick).filter((c): c is OwnedCard => Boolean(c)), [pick]);
  const index = Math.max(0, CARD_STYLES.indexOf(value));
  const go = (i: number) => {
    const next = Math.max(0, Math.min(CARD_STYLES.length - 1, i));
    if (next !== index) onChange(CARD_STYLES[next]!);
  };

  // Molette / pavé tactile horizontal : un cran par geste.
  const wheelAt = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (Math.abs(delta) < 8 || Date.now() - wheelAt.current < 260) return;
    wheelAt.current = Date.now();
    go(index + Math.sign(delta));
  };
  // Glisser : au-delà de 40 px, on passe au style voisin.
  const dragFrom = useRef<number | null>(null);

  const [fanOpen, setFanOpen] = useState(() => {
    try {
      return localStorage.getItem(FAN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleFan = () => {
    setFanOpen((open) => {
      try {
        localStorage.setItem(FAN_KEY, open ? '0' : '1');
      } catch {
        /* stockage indisponible : l'état ne sera pas retenu */
      }
      return !open;
    });
  };

  return (
    <div className="space-y-3">
      <div
        tabIndex={0}
        role="listbox"
        aria-label="Habillage des cartes"
        aria-activedescendant={`card-style-${value}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') (e.preventDefault(), go(index + 1));
          else if (e.key === 'ArrowLeft') (e.preventDefault(), go(index - 1));
        }}
        onWheel={onWheel}
        onPointerDown={(e) => (dragFrom.current = e.clientX)}
        onPointerUp={(e) => {
          if (dragFrom.current === null) return;
          const dx = e.clientX - dragFrom.current;
          dragFrom.current = null;
          if (Math.abs(dx) > 40) go(index - Math.sign(dx));
        }}
        className="relative h-80 touch-pan-y overflow-hidden rounded-xl bg-muted/40 outline-none select-none [perspective:1200px] focus-visible:ring-2 focus-visible:ring-primary"
      >
        {CARD_STYLES.map((id, i) => {
          const d = i - index;
          const far = Math.abs(d);
          return (
            <motion.button
              key={id}
              id={`card-style-${id}`}
              type="button"
              role="option"
              aria-selected={d === 0}
              aria-label={styleLabel(i)}
              tabIndex={-1}
              onClick={() => go(i)}
              initial={false}
              animate={{
                x: d * 118 - (d === 0 ? 0 : Math.sign(d) * 34),
                scale: d === 0 ? 1 : Math.max(0.55, 0.78 - (far - 1) * 0.08),
                rotateY: d === 0 ? 0 : -Math.sign(d) * 28,
                opacity: far > 4 ? 0 : 1 - Math.max(0, far - 1) * 0.18,
              }}
              transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.8 }}
              className={cn('absolute top-1/2 left-1/2 -mt-[8.5rem] -ml-[5.375rem] w-43 cursor-pointer', far > 4 && 'pointer-events-none')}
              style={{ zIndex: 20 - far }}
            >
              {showcase && <WmCard card={showcase} cardStyle={id} tilt={d === 0} showTags={false} className={cn('w-full transition-[filter] duration-300', d !== 0 && 'brightness-90')} />}
            </motion.button>
          );
        })}
        <div className="pointer-events-none absolute inset-x-0 bottom-2.5 z-30 flex flex-col items-center gap-1.5">
          <span className="rounded-full bg-background/85 px-2.5 py-0.5 text-xs font-semibold shadow-sm backdrop-blur">{styleLabel(index)}</span>
          <div className="pointer-events-auto flex gap-1.5">
            {CARD_STYLES.map((id, i) => (
              <button
                key={id}
                type="button"
                aria-label={styleLabel(i)}
                onClick={() => go(i)}
                className={cn('h-1.5 cursor-pointer rounded-full transition-all duration-300', i === index ? 'w-4 bg-primary' : 'w-1.5 bg-foreground/25 hover:bg-foreground/50')}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={toggleFan}
          aria-expanded={fanOpen}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ChevronDown className={cn('size-3.5 transition-transform duration-300', fanOpen && 'rotate-180')} />
          {fanOpen ? "Masquer l'aperçu des raretés" : "Voir l'aperçu des six raretés"}
        </button>
      </div>
      {fanOpen && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <CardFan cards={previews} style={value} />
        </div>
      )}
    </div>
  );
}

/** Groupe de réglages : intitulé discret au-dessus d'un panneau, comme les sections de la page Albums. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h2>
      <div className="divide-y rounded-2xl border bg-card">{children}</div>
    </section>
  );
}

/** Bloc d'un groupe avec un sélecteur visuel en dessous du titre. */
function PickerBlock({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 px-5 py-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      {children}
    </div>
  );
}

/** Sélecteur en pastilles, le même que celui des pages Albums et Enhance. */
function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 rounded-full border bg-card p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition',
            value === o.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  );
}

function AppearanceSection() {
  const settings = useCollection((s) => s.settings);
  const updateSettings = useCollection((s) => s.updateSettings);
  return (
    <div className="space-y-8">
      <Group title="Interface">
        <SettingRow title="Mode" text="Clair, sombre ou selon le système.">
          <Segmented
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'system', label: 'Auto', icon: <Monitor className="size-3.5" /> },
              { value: 'light', label: 'Clair', icon: <Sun className="size-3.5" /> },
              { value: 'dark', label: 'Sombre', icon: <Moon className="size-3.5" /> },
            ]}
          />
        </SettingRow>
        <PickerBlock title="Palette" text="Couleurs de l'interface, du bouton sur le site et de l'icône de l'extension.">
          <PalettePicker value={settings.palette} onChange={(palette) => updateSettings({ palette })} />
        </PickerBlock>
      </Group>

      <Group title="Cartes">
        <PickerBlock title="Habillage" text="Partout dans l'app ; la disposition de la carte reste la même.">
          <CardStylePicker value={settings.cardStyle} onChange={(cardStyle) => updateSettings({ cardStyle })} />
        </PickerBlock>
        <PickerBlock title="Étiquettes sur les cartes" text="Collection, albums, recommandations… Survole une étiquette pour voir son nom.">
          <CardTagStylePicker value={settings.cardTagStyle} onChange={(cardTagStyle) => updateSettings({ cardTagStyle })} />
        </PickerBlock>
      </Group>

      <Group title="Albums">
        <SettingRow title="Livre" text="Style des albums qu'on feuillette.">
          <Segmented
            value={settings.albumStyle}
            onChange={(albumStyle) => updateSettings({ albumStyle })}
            options={ALBUM_STYLE_IDS.map((id) => ({ value: id, label: ALBUM_STYLES[id].name }))}
          />
        </SettingRow>
        <SettingRow title="Page Albums" text="Dossiers animés ou liste compacte.">
          <Segmented
            value={settings.tagsLayout}
            onChange={(tagsLayout) => updateSettings({ tagsLayout })}
            options={[
              { value: 'folders', label: 'Dossiers' },
              { value: 'list', label: 'Liste' },
            ]}
          />
        </SettingRow>
      </Group>

      <Group title="Aide">
        <SettingRow title="Présentation de Collection+" text="La visite guidée des quatre pages, comme à la première ouverture.">
          <Button variant="outline" size="sm" onClick={() => useOnboarding.getState().start(0)}>
            Revoir la visite
          </Button>
        </SettingRow>
      </Group>
    </div>
  );
}

/** Règles automatiques créées depuis Enhance : une étiquette posée dès qu'une carte correspond à un critère Wikidata. */
function RulesList() {
  const { rules, labels, setRuleMode, deleteRule } = useSuggestions();
  const tags = useCollection((s) => s.tags);
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  if (!rules.length) {
    return (
      <p className="px-5 py-4 text-sm text-muted-foreground">
        Aucune règle pour l'instant. Elles se créent depuis Enhance, en ajoutant un thème à un album : les nouvelles cartes qui y correspondent y vont seules, ou
        attendent ta validation.
      </p>
    );
  }
  return (
    <>
      {rules.map((rule) => {
        const tag = byId.get(rule.tagId);
        return (
          <div key={rule.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag?.color ?? 'var(--muted-foreground)' }} />
                <span className="truncate">{tag?.name ?? 'Album supprimé'}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {criterionText(rule.criterion, labels)}
                {rule.ignored.length > 0 && ` · ${rule.ignored.length} carte(s) écartée(s)`}
              </p>
            </div>
            <Segmented<RuleMode>
              value={rule.mode}
              onChange={(mode) => setRuleMode(rule.id, mode)}
              options={[
                { value: 'auto', label: 'Automatique', icon: <Zap className="size-3.5" /> },
                { value: 'review', label: 'À valider', icon: <Bot className="size-3.5" /> },
              ]}
            />
            <button
              type="button"
              onClick={() => deleteRule(rule.id)}
              title="Supprimer la règle (les cartes déjà rangées restent dans l'album)"
              aria-label="Supprimer la règle"
              className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      })}
    </>
  );
}

/** Clé Google AI Studio : comprendre les demandes libres (« le top 50 des… »). Gratuite, stockée sur cet ordinateur. */
function GeminiKeyRow() {
  const saved = useCollection((s) => s.settings.geminiApiKey);
  const updateSettings = useCollection((s) => s.updateSettings);
  const [draft, setDraft] = useState(saved);
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const save = async () => {
    const key = draft.trim();
    if (!key) {
      await updateSettings({ geminiApiKey: '' });
      setState('idle');
      return;
    }
    setState('testing');
    try {
      setWarning(await testGeminiKey(key));
      await updateSettings({ geminiApiKey: key });
      setState('ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  };
  return (
    <div className="space-y-3 px-5 py-4">
      <div>
        <p className="text-sm font-medium">Clé Gemini (gratuite)</p>
        <p className="text-xs text-muted-foreground">
          Pour comprendre les demandes en langage naturel (« le top 50 des personnalités féminines françaises avant 1900 »). Crée une clé gratuite sur{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-primary underline underline-offset-2">
            aistudio.google.com/apikey
          </a>
          , sans carte bancaire. Elle reste sur cet ordinateur et n'est envoyée qu'à Google. Sans clé, une analyse plus simple, sans IA, prend le relais.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="password"
          value={draft}
          onChange={(e) => (setDraft(e.target.value), setState('idle'))}
          placeholder="AIza…"
          autoComplete="off"
          aria-label="Clé Gemini"
          className="h-9 min-w-56 flex-1 rounded-lg border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
        />
        <Button type="submit" size="sm" variant="outline" disabled={state === 'testing' || draft.trim() === saved}>
          {state === 'testing' && <Loader2 className="size-4 animate-spin" />} {draft.trim() ? 'Vérifier et enregistrer' : 'Retirer la clé'}
        </Button>
      </form>
      {state === 'ok' &&
        (warning ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>
        ) : (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Clé vérifiée et enregistrée.</p>
        ))}
      {state === 'error' && <p className="text-xs text-destructive">Clé refusée : {error}</p>}
      {state === 'idle' && saved && draft.trim() === saved && <p className="text-xs text-muted-foreground">Une clé est enregistrée.</p>}
    </div>
  );
}

function OrganizeSection() {
  const settings = useCollection((s) => s.settings);
  const updateSettings = useCollection((s) => s.updateSettings);
  return (
    <div className="space-y-8">
      <Group title="Statut d'échange">
        <SettingRow title="Tout Trade par défaut" text="Une carte sans étiquette Trade ni Not Trade est considérée comme Trade.">
          <Switch checked={settings.defaultTrade} onCheckedChange={(defaultTrade) => updateSettings({ defaultTrade })} />
        </SettingRow>
        <SettingRow title="Pastilles sur le site" text="Affiche Trade / Not Trade sur les cartes de WikiMasters.">
          <Switch checked={settings.showBadges} onCheckedChange={(showBadges) => updateSettings({ showBadges })} />
        </SettingRow>
      </Group>

      <Group title="Rangement">
        <SettingRow
          title="Albums de collection et de rangement"
          text="Choisis pour chaque étiquette si c'est un album que tu collectionnes (emoji, couleur vive) ou un simple rangement (« · Nom », gris)."
        >
          <Switch checked={settings.albumKinds} onCheckedChange={(albumKinds) => updateSettings({ albumKinds })} />
        </SettingRow>
      </Group>

      <Group title="Règles automatiques">
        <RulesList />
      </Group>

      <Group title="Albums à objectif">
        <GeminiKeyRow />
      </Group>
    </div>
  );
}

function SiteSection() {
  const settings = useCollection((s) => s.settings);
  const updateSettings = useCollection((s) => s.updateSettings);
  return (
    <div className="space-y-8">
      <SiteSettings settings={settings} update={updateSettings} />
    </div>
  );
}

/** Synchronisation entre ordinateurs par la synchro de Chrome (lib/cloud-sync.ts). */
function CloudSyncGroup() {
  const [sync, setSync] = useState<CloudSyncState | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const refreshUsage = () => browser.storage.sync.getBytesInUse(null).then(setUsed, () => {});
    void cloudSyncItem.getValue().then(setSync);
    refreshUsage();
    return cloudSyncItem.watch((next) => {
      setSync(next);
      refreshUsage();
    });
  }, []);
  const toggle = async (enabled: boolean) => cloudSyncItem.setValue({ ...(await cloudSyncItem.getValue()), enabled });
  const syncNow = async () => {
    setBusy(true);
    try {
      await browser.runtime.sendMessage({ type: CLOUD_SYNC_NOW });
      toast('Synchronisation vérifiée', 'success');
    } finally {
      setBusy(false);
    }
  };
  const last = Math.max(sync?.lastPushAt ?? 0, sync?.lastPullAt ?? 0);
  const quota = browser.storage.sync.QUOTA_BYTES ?? 102400;
  return (
    <Group title="Entre tes ordinateurs">
      <SettingRow
        title="Synchroniser avec ton compte Chrome"
        text="Albums à objectif, mises en page, souhaits, règles et réglages suivent sur chaque ordinateur où tu es connecté à Chrome avec la synchronisation activée. Les cartes et étiquettes sont déjà sur WikiMasters."
      >
        <Switch checked={sync?.enabled ?? true} onCheckedChange={toggle} />
      </SettingRow>
      {sync?.enabled !== false && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <CloudCheck className="size-4 text-primary" />
              {last ? `Dernier échange ${ago(last)}` : 'Pas encore d’échange'}
              {sync?.lastPullAt ? ` · reçu d’un autre ordinateur ${ago(sync.lastPullAt)}` : ''}
            </p>
            {used !== null && (
              <p>
                Place utilisée : {Math.round(used / 1024)} Ko sur {Math.round(quota / 1024)} Ko
              </p>
            )}
            {!!sync?.tooBig.length && (
              <p className="text-destructive">Trop volumineux pour la synchro de Chrome : {sync.tooBig.map((k) => SYNCED_LABELS[k]).join(', ')}.</p>
            )}
            {sync?.error && <p className="text-destructive">{sync.error}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={syncNow} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Synchroniser
          </Button>
        </div>
      )}
    </Group>
  );
}

function ExportSection() {
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

  return (
    <div className="space-y-8">
      <CloudSyncGroup />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Cartes exportées</h2>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: `Toute la collection · ${cards.length}` },
              { value: 'filtered', label: `Filtres de Cards · ${visible.length}` },
            ]}
          />
        </div>
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
      </section>
    </div>
  );
}

type SettingsSection = 'appearance' | 'organize' | 'site' | 'export';

const SECTIONS = [
  { id: 'appearance', icon: Palette, label: 'Apparence', text: "Mode, palette, habillage des cartes et des albums." },
  { id: 'organize', icon: FolderCog, label: 'Rangement', text: 'Statut d’échange, types d’albums et règles automatiques.' },
  { id: 'site', icon: Globe, label: 'Sur WikiMasters', text: 'Ouverture des paquets, volets de rangement, statistiques, notifications et outils sur les cartes du site.' },
  { id: 'export', icon: Download, label: 'Synchro et export', text: 'Tes albums sur tous tes ordinateurs, et ta collection vers Google Sheets, un fichier CSV ou le presse-papier.' },
] as const;

const SECTION_KEY = 'collectionPlus:settingsSection';

/** Paramètres : même gabarit que Enhance (titre à gauche, onglets en pastilles à droite). */
export function ExportView() {
  const [section, setSection] = useState<SettingsSection>(() => {
    try {
      const saved = localStorage.getItem(SECTION_KEY);
      return SECTIONS.some((s) => s.id === saved) ? (saved as SettingsSection) : 'appearance';
    } catch {
      return 'appearance';
    }
  });
  const choose = (id: SettingsSection) => {
    setSection(id);
    try {
      localStorage.setItem(SECTION_KEY, id);
    } catch {
      /* stockage indisponible : l'onglet ne sera simplement pas retenu */
    }
  };
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-64 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{current.label}</h1>
          <p className="text-sm text-muted-foreground">{current.text}</p>
        </div>
        <div data-tour="settings" className="flex shrink-0 rounded-full border bg-card p-1" role="tablist" aria-label="Section des paramètres">
          {SECTIONS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={section === id}
              title={label}
              onClick={() => choose(id)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition',
                section === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" /> <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>
      </header>
      {section === 'appearance' && <AppearanceSection />}
      {section === 'organize' && <OrganizeSection />}
      {section === 'site' && <SiteSection />}
      {section === 'export' && <ExportSection />}
    </div>
  );
}
