import { BarChart3, Download, ExternalLink, Home, Monitor, Moon, Package, Settings2, Sparkles, Sun, Trash2 } from 'lucide-react';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/globals.css';
import { BrandIcon } from '@/components/app/brand-icon';
import { SiteSettings } from '@/components/app/site-settings';
import { applyAppearance, cachedAppearance, rememberAppearance } from '@/lib/appearance';
import { collectionCache } from '@/lib/cache';
import { downloadText } from '@/lib/csv';
import {
  ago,
  fmtDuration,
  packStateItem,
  packsSince,
  predict,
  pullsCsv,
  pullsItem,
  RARITIES,
  RARITY_COLOR,
  RARITY_RANK,
  rarityCounts,
  SHINY_COLOR,
  today,
  type PackState,
  type PullRecord,
} from '@/lib/packs';
import { holoGradient, PALETTES } from '@/lib/palettes';
import { DEFAULT_SETTINGS, getSettings, reviewedSnapshotItem, settingsItem, type Settings } from '@/lib/store';
import { openReviewTab } from '@/lib/tabs';
import { newCardIds } from '@/lib/trade';
import { availableUpdate, checkForUpdate, currentVersion, type UpdateInfo } from '@/lib/updates';
import { cn } from '@/lib/utils';

applyAppearance(cachedAppearance() ?? DEFAULT_SETTINGS);

function useStored<T>(item: { getValue(): Promise<T>; watch(cb: (v: T) => void): () => void }, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    item.getValue().then(setValue);
    return item.watch((v) => setValue(v ?? fallback));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    getSettings().then(setSettings);
    return settingsItem.watch(() => getSettings().then(setSettings));
  }, []);
  useEffect(() => {
    applyAppearance(settings);
    rememberAppearance(settings);
  }, [settings.theme, settings.palette]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = async (patch: Partial<Settings>) => {
    const next = { ...(await getSettings()), ...patch };
    setSettings(next);
    await settingsItem.setValue(next);
  };
  return [settings, update];
}

type Tab = 'home' | 'pulls' | 'settings';

const chip = (r: string) => (
  <span className="inline-block min-w-[22px] rounded-[5px] px-1 text-center text-[10px] font-extrabold text-zinc-900" style={{ background: RARITY_COLOR[r as keyof typeof RARITY_COLOR] ?? '#9ca3af' }}>
    {r}
  </span>
);

function Popup() {
  const [settings, update] = useSettings();
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('collectionPlus:popupTab') as Tab) || 'home');
  const choose = (t: Tab) => {
    setTab(t);
    localStorage.setItem('collectionPlus:popupTab', t);
  };

  return (
    <div className="w-[360px] bg-[radial-gradient(120%_60%_at_50%_-10%,var(--frame-glow),transparent_70%)] bg-no-repeat text-foreground">
      <header className="flex items-center gap-2 bg-frame px-3.5 pt-3.5 pb-3 text-frame-foreground">
        <BrandIcon palette={settings.palette} small className="size-7" />
        <span className="text-sm font-bold">
          Collection<span className="bg-[image:var(--frame-holo)] bg-clip-text text-transparent">+</span>
        </span>
        <nav className="ml-auto flex rounded-full bg-frame-active p-0.5" aria-label="Sections">
          {(
            [
              ['home', Home, 'Accueil'],
              ['pulls', BarChart3, 'Tirages'],
              ['settings', Settings2, 'Réglages'],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => choose(id)}
              title={label}
              className={cn(
                'flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition',
                tab === id ? 'bg-frame-foreground text-frame' : 'text-frame-muted hover:text-frame-foreground',
              )}
            >
              <Icon className="size-3.5" /> {tab === id && label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-h-[540px] overflow-y-auto p-3">
        {tab === 'home' && <HomeTab />}
        {tab === 'pulls' && <PullsTab />}
        {tab === 'settings' && <SettingsTab settings={settings} update={update} />}
      </main>
    </div>
  );
}

function PackCounter() {
  const state = useStored<PackState | null>(packStateItem, null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const p = predict(state);
  if (!p) {
    return (
      <p className="rounded-2xl border bg-card p-3 text-xs text-muted-foreground">
        Ouvre une fois la page <b>Ouvrir un paquet</b> de WikiMasters pour que le compteur démarre.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
      <div className="text-3xl font-extrabold text-primary tabular-nums">
        {p.n}
        <small className="text-base font-bold text-muted-foreground">/{p.max}</small>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex gap-[3px]">
          {Array.from({ length: p.max }, (_, i) => (
            <i key={i} className={cn('h-3.5 flex-1 rounded-[3px]', i < p.n ? 'bg-[image:var(--holo)]' : 'bg-muted')} />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {p.n >= p.max ? 'Réserve pleine : la régénération est en pause' : `Prochain dans ${fmtDuration((p.nextAt ?? 0) - Date.now())} · plein dans ${fmtDuration((p.fullAt ?? 0) - Date.now())}`}
        </p>
      </div>
    </div>
  );
}

function HomeTab() {
  const cache = useStored(collectionCache, null);
  const snapshot = useStored(reviewedSnapshotItem, null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    checkForUpdate().then((info) => setUpdate(availableUpdate(info)));
  }, []);
  const count = cache ? newCardIds(cache.cards, snapshot).size : 0;
  const open = async (onlyNew = false) => {
    await openReviewTab(onlyNew);
    window.close();
  };
  return (
    <div className="space-y-2.5">
      <PackCounter />
      <button
        type="button"
        onClick={() => open()}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[image:var(--holo)] p-2.5 text-sm font-semibold text-zinc-900 transition hover:-translate-y-px"
      >
        Ouvrir Collection+
      </button>
      <button
        type="button"
        onClick={() => open(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border bg-card p-2.5 text-sm transition hover:-translate-y-px hover:border-foreground/25"
      >
        <Sparkles className="size-4 text-primary" /> Trier les nouvelles
        {count > 0 && <span className="rounded-full bg-[image:var(--holo)] px-1.5 text-[11px] font-bold text-zinc-900">{count}</span>}
      </button>
      <a
        href="https://www.wiki-masters.com/pulls"
        target="_blank"
        rel="noopener"
        className="flex w-full items-center justify-center gap-1.5 rounded-full border bg-card p-2.5 text-sm transition hover:-translate-y-px hover:border-foreground/25"
      >
        <Package className="size-4 text-primary" /> Ouvrir un paquet <ExternalLink className="size-3 text-muted-foreground" />
      </a>
      {update?.latest && (
        <a href={update.url} target="_blank" rel="noopener" className="block rounded-xl bg-muted px-3 py-2 text-center text-xs hover:underline">
          Version {update.latest} disponible — voir la mise à jour
        </a>
      )}
      <p className="pt-1 text-center text-[11px] text-muted-foreground">v{currentVersion()}</p>
    </div>
  );
}

function PullsTab() {
  const pulls = useStored<PullRecord[]>(pullsItem, []);
  const [confirm, setConfirm] = useState(false);
  const { counts, total, shiny } = useMemo(() => rarityCounts(pulls), [pulls]);
  const maxShare = Math.max(0.0001, ...RARITIES.map((r) => counts[r] / (total || 1)));
  const best = useMemo(
    () =>
      pulls
        .flatMap((p) => p.cards.map((c) => ({ ...c, t: p.t })))
        .filter((c) => (RARITY_RANK[c.r] ?? 9) <= 2 || c.s)
        .sort((a, b) => b.t - a.t)
        .slice(0, 25),
    [pulls],
  );
  if (!pulls.length) {
    return <p className="rounded-2xl border bg-card p-4 text-center text-sm text-muted-foreground">Aucun tirage enregistré. Ouvre un paquet sur WikiMasters : il apparaîtra ici.</p>;
  }
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="space-y-1.5">
      <h3 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      <div className="rounded-2xl border bg-card p-3">{children}</div>
    </section>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          [pulls.length, 'paquets suivis'],
          [total, 'cartes tirées'],
          [shiny, 'shiny'],
        ].map(([n, label]) => (
          <div key={label} className="rounded-2xl border bg-card p-2.5 text-center">
            <b className="block text-lg tabular-nums">{n}</b>
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <Section title="Taux de drop">
        <div className="space-y-1.5">
          {RARITIES.map((r) => {
            const share = counts[r] / (total || 1);
            return (
              <div key={r} className="grid grid-cols-[26px_1fr_70px] items-center gap-2 text-[11px]">
                {chip(r)}
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <i className="block h-full rounded-full" style={{ width: `${(share / maxShare) * 100}%`, background: RARITY_COLOR[r] }} />
                </span>
                <span className="text-right tabular-nums">
                  {counts[r]} <small className="text-muted-foreground">{(share * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</small>
                </span>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Séries en cours">
        <div className="grid grid-cols-4 gap-1 text-center text-[11px] text-muted-foreground">
          {(['L', 'UR', 'SR'] as const).map((r) => (
            <div key={r}>
              Sans {chip(r)}
              <b className="block text-base text-foreground tabular-nums">{packsSince(pulls, (c) => c.r === r)}</b>
            </div>
          ))}
          <div>
            Sans shiny
            <b className="block text-base text-foreground tabular-nums">{packsSince(pulls, (c) => c.s)}</b>
          </div>
        </div>
      </Section>
      <Section title="Derniers paquets">
        <ul className="space-y-1">
          {pulls
            .slice(-8)
            .reverse()
            .map((p) => (
              <li key={p.t} className="flex items-center gap-2">
                <span className="flex flex-1 gap-[3px]">
                  {[...p.cards]
                    .sort((a, b) => (RARITY_RANK[a.r] ?? 9) - (RARITY_RANK[b.r] ?? 9))
                    .map((c, i) => (
                      <i key={i} title={`${c.r} · ${c.name}`} className="size-3.5 rounded-[4px]" style={{ background: RARITY_COLOR[c.r as keyof typeof RARITY_COLOR] ?? '#555', boxShadow: c.s ? 'inset 0 0 0 2px #fff' : undefined }} />
                    ))}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {p.src !== 'open' && `${p.src} · `}
                  {ago(p.t)}
                </span>
              </li>
            ))}
        </ul>
      </Section>
      <Section title="Grosses cartes">
        <ul className="space-y-1">
          {best.length ? (
            best.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                {chip(c.r)}
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.s && <span className="rounded border px-1 text-[10px]" style={{ color: SHINY_COLOR, borderColor: `${SHINY_COLOR}80` }}>shiny</span>}
                <span className="text-[11px] text-muted-foreground">{ago(c.t)}</span>
              </li>
            ))
          ) : (
            <li className="text-xs text-muted-foreground">Pas encore de SR, UR ou L.</li>
          )}
        </ul>
      </Section>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => downloadText(`wikimasters-tirages-${today()}.csv`, pullsCsv(pulls))}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border bg-card p-2 text-xs font-medium transition hover:border-foreground/25"
        >
          <Download className="size-3.5" /> Export CSV
        </button>
        <button
          type="button"
          onClick={() => (confirm ? (pullsItem.setValue([]), setConfirm(false)) : setConfirm(true))}
          onBlur={() => setConfirm(false)}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1.5 rounded-full p-2 px-3 text-xs font-medium transition',
            confirm ? 'bg-destructive text-white' : 'border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <Trash2 className="size-3.5" /> {confirm ? 'Sûr ?' : 'Effacer'}
        </button>
      </div>
    </div>
  );
}

function SettingsTab({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  return (
    <div className="space-y-3">
      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Thème</h2>
        <div className="space-y-3 rounded-2xl border bg-card p-3">
          <div className="flex rounded-full border bg-muted p-0.5" role="radiogroup" aria-label="Mode">
            {(
              [
                ['system', Monitor, 'Auto'],
                ['light', Sun, 'Clair'],
                ['dark', Moon, 'Sombre'],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={settings.theme === value}
                onClick={() => update({ theme: value })}
                className={cn(
                  'flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-full py-1.5 text-xs font-medium transition',
                  settings.theme === value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.name}
                aria-pressed={settings.palette === p.id}
                onClick={() => update({ palette: p.id })}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-1.5 transition',
                  settings.palette === p.id ? 'border-primary bg-accent ring-1 ring-primary' : 'hover:border-foreground/25',
                )}
              >
                <BrandIcon palette={p.id} small className="size-8" />
                <span className="h-0.5 w-full rounded-full" style={{ backgroundImage: holoGradient(p, 90) }} />
              </button>
            ))}
          </div>
        </div>
      </section>
      <SiteSettings settings={settings} update={update} dense />
      <button
        type="button"
        onClick={async () => {
          const url = browser.runtime.getURL('/review.html#settings');
          await browser.tabs.create({ url });
          window.close();
        }}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border bg-card p-2 text-xs text-muted-foreground transition hover:text-foreground"
      >
        Tous les paramètres <ExternalLink className="size-3" />
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
