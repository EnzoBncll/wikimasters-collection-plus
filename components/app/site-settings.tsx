import { Switch } from '@/components/ui/switch';
import type { Settings } from '@/lib/store';
import { cn } from '@/lib/utils';

type Update = (patch: Partial<Settings>) => void;
type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

interface Row {
  key: BoolKey;
  title: string;
  text: string;
  /** Réglage complémentaire affiché sous la ligne quand l'option est active. */
  extra?: (s: Settings, update: Update) => React.ReactNode;
}

const Range = ({ value, min, max, step, onChange, label, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; format: (v: number) => string }) => (
  <label className="flex items-center gap-3 text-xs text-muted-foreground">
    <span className="shrink-0">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-[var(--primary)]" />
    <span className="w-10 shrink-0 text-right font-medium text-foreground tabular-nums">{format(value)}</span>
  </label>
);

export const SITE_GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Ouverture des paquets',
    rows: [
      { key: 'packStage', title: 'Nouvelle interface d’ouverture', text: 'Fond animé, paquet flottant, jauges et temps avant la réserve pleine.' },
      { key: 'revealFx', title: 'Révélé animé', text: 'Une mise en scène par rareté : silhouette des SR, tension puis explosion des UR et L, reflet des shiny.' },
      {
        key: 'sound',
        title: 'Sons',
        text: 'Petits sons synthétisés pendant l’ouverture et le révélé.',
        extra: (s, update) => <Range label="Volume" value={s.soundVolume} min={0} max={1} step={0.05} onChange={(soundVolume) => update({ soundVolume })} format={(v) => `${Math.round(v * 100)} %`} />,
      },
      { key: 'newBadge', title: 'Pastille « New »', text: 'Sur une carte que tu n’avais pas encore.' },
      { key: 'revealSkin', title: 'Habillage Collection+', text: 'Les cartes révélées prennent l’habillage choisi dans Apparence › Cartes.' },
      { key: 'cardBreathe', title: 'Cartes qui respirent', text: 'Léger va-et-vient et oscillation de la carte révélée.' },
      {
        key: 'goalAlbumFx',
        title: 'Albums à objectif',
        text: 'Si la carte fait partie de la liste d’un album à objectif, l’album sort de sa ligne et la carte s’y glisse.',
        extra: (s, update) => (
          <label className="flex cursor-pointer items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>Ajouter vraiment la carte à l’album sur WikiMasters</span>
            <Switch size="sm" checked={s.goalAutoStick} onCheckedChange={(goalAutoStick) => update({ goalAutoStick })} />
          </label>
        ),
      },
      { key: 'packRecap', title: 'Récap du paquet', text: 'Une fois toutes les cartes vues, en bas à droite.' },
      { key: 'spaceKey', title: 'Touche Espace', text: 'Ouvre un paquet, puis passe à la carte suivante (un appui = une action).' },
      { key: 'fastReveal', title: 'Révélé rapide', text: 'Animations éclair pour C, PC et R ; la grande mise en scène reste pour SR, UR, L et shiny.' },
      { key: 'revealPanels', title: 'Volets de rangement au révélé', text: 'Rangement à gauche (⇧1–9), collections à droite (1–9), statut T / N / D : sans ouvrir la carte.' },
    ],
  },
  {
    title: 'Paquets et tirages',
    rows: [
      { key: 'packStats', title: 'Statistiques de tirage', text: 'Bilan du jour, taux de drop, séries sans L / UR / SR / shiny, derniers paquets.' },
      { key: 'tabTitle', title: 'Compteur dans l’onglet', text: '(8/10) devant le titre de l’onglet WikiMasters.' },
      { key: 'iconBadge', title: 'Compteur sur l’icône', text: 'Nombre de paquets estimé sur l’icône de l’extension.' },
      {
        key: 'notifyFull',
        title: 'Notification de paquets',
        text: 'Quand le nombre de paquets atteint ton seuil.',
        extra: (s, update) => <Range label="Seuil" value={s.notifyThreshold} min={1} max={10} step={1} onChange={(notifyThreshold) => update({ notifyThreshold })} format={(v) => `${v}/10`} />,
      },
      {
        key: 'proReminder',
        title: 'Rappel du pack PRO',
        text: 'Une fois par jour, si tu ne l’as pas encore réclamé.',
        extra: (s, update) => <Range label="Heure" value={s.proHour} min={0} max={23} step={1} onChange={(proHour) => update({ proHour })} format={(v) => `${v} h`} />,
      },
    ],
  },
  {
    title: 'Cartes du site',
    rows: [
      { key: 'cardFullscreen', title: 'Plein écran', text: 'Bouton sur les cartes : carte agrandie, inclinaison 3D qui suit la souris.' },
      { key: 'wishHighlight', title: 'Liste de souhaits', text: 'Cartes souhaitées mises en avant sur le marché et les échanges, cœur pour en ajouter depuis le marché.' },
      { key: 'freeImages', title: 'Images libres', text: 'Pour les cartes sans image : photo Wikipédia ou Commons sous licence libre, avec son auteur.' },
    ],
  },
];

const LOOKS: { value: Settings['siteLook']; label: string; text: string }[] = [
  { value: 'solid', label: 'Pleine', text: 'Couleur de la palette, pleine, avec un halo' },
  { value: 'ambient', label: 'Ambiance', text: 'La scène prend la palette, l’interface reste neutre' },
  { value: 'holo', label: 'Irisé', text: 'Sobre ; l’irisé seulement sur les paquets et « New »' },
];

/** Réglages des fonctions ajoutées sur wiki-masters.com (popup et page Paramètres). */
export function SiteSettings({ settings, update, dense, groupClassName }: { settings: Settings; update: Update; dense?: boolean; groupClassName?: string }) {
  const look = LOOKS.find((l) => l.value === settings.siteLook) ?? LOOKS[0]!;
  return (
    <>
      <section className={cn('space-y-2', groupClassName)}>
        <h2 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Style sur le site</h2>
        <div className={cn('space-y-2 rounded-2xl border bg-card', dense ? 'p-3' : 'px-5 py-4')}>
          <div className="flex rounded-full border bg-muted p-0.5" role="radiogroup" aria-label="Style sur le site">
            {LOOKS.map((l) => (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={settings.siteLook === l.value}
                onClick={() => update({ siteLook: l.value })}
                className={cn(
                  'flex-1 cursor-pointer rounded-full py-1.5 text-xs font-medium transition',
                  settings.siteLook === l.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="px-1 text-[11px] text-muted-foreground">{look.text}</p>
        </div>
      </section>
      {SITE_GROUPS.map((group) => (
        <section key={group.title} className={cn('space-y-2', groupClassName)}>
          <h2 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.title}</h2>
          <div className="divide-y rounded-2xl border bg-card">
            {group.rows.map((row) => (
              <div key={row.key} className={cn('space-y-2', dense ? 'px-3 py-2.5' : 'px-5 py-4')}>
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="min-w-0">
                    <span className={cn('block font-medium', dense ? 'text-[13px]' : 'text-sm')}>{row.title}</span>
                    <span className={cn('block text-muted-foreground', dense ? 'text-[11px] leading-snug' : 'text-xs')}>{row.text}</span>
                  </span>
                  <Switch checked={settings[row.key]} onCheckedChange={(v) => update({ [row.key]: v } as Partial<Settings>)} />
                </label>
                {row.extra && settings[row.key] && row.extra(settings, update)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
