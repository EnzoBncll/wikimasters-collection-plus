import { Bot, Layers, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConsolidateView } from './consolidate-view';
import { SheetsView } from './sheets-view';
import { SuggestionsView } from './suggestions-view';

export type EnhanceSection = 'consolidate' | 'themes' | 'sheets';

const SECTIONS = [
  {
    id: 'consolidate',
    icon: Layers,
    label: 'Consolider',
    title: 'Consolider',
    text: 'Les cartes que tu possèdes et qui vont clairement dans un de tes albums · ajoute-les en lot.',
  },
  {
    id: 'themes',
    icon: Sparkles,
    label: 'Thèmes',
    title: 'Nouveaux albums',
    text: 'Thèmes détectés dans ta collection grâce à Wikidata · crée un album en un clic.',
  },
  {
    id: 'sheets',
    icon: Bot,
    label: 'Fiches IA',
    title: "Fiches d'album",
    text: "L'IA décrit chaque album (thème, ce qu'on y range ou pas, mots-clés) · tout se retouche à la main.",
  },
] as const;

/** Onglet Enhance : même gabarit que la page Albums (titre à gauche, sélecteur à droite). */
export function EnhanceView({ section, onSection }: { section: EnhanceSection; onSection: (section: EnhanceSection) => void }) {
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{current.title}</h1>
          <p className="text-sm text-muted-foreground">{current.text}</p>
        </div>
        <div className="flex shrink-0 rounded-full border bg-card p-1" role="tablist" aria-label="Section">
          {SECTIONS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={section === id}
              title={label}
              onClick={() => onSection(id)}
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
      {section === 'consolidate' && <ConsolidateView />}
      {section === 'themes' && <SuggestionsView />}
      {section === 'sheets' && <SheetsView />}
    </div>
  );
}
