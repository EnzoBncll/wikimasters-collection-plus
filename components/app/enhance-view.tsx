import { Bot, Layers, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ConsolidateView } from './consolidate-view';
import { SheetsView } from './sheets-view';
import { SuggestionsView } from './suggestions-view';

type Section = 'consolidate' | 'themes' | 'sheets';

/** Onglet Enhance : consolider les albums existants, ou découvrir des thèmes pour en créer. */
export function EnhanceView() {
  const [section, setSection] = useState<Section>('consolidate');
  return (
    <div>
      <div className="mx-auto flex w-full max-w-6xl px-4 pt-6 sm:px-6">
        <div className="flex rounded-full border bg-card p-1" role="tablist" aria-label="Section">
          {(
            [
              ['consolidate', Layers, 'Consolider'],
              ['themes', Sparkles, 'Thèmes'],
              ['sheets', Bot, 'Fiches IA'],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={section === value}
              onClick={() => setSection(value)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                section === value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      {section === 'sheets' ? (
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Fiches d'album</h1>
            <p className="text-sm text-muted-foreground">
              L'IA décrit chaque album : son thème, ce qu'on y range ou pas, ses mots-clés. Les mots-clés affinent les recommandations et la file Consolider.
            </p>
          </header>
          <SheetsView />
        </div>
      ) : section === 'consolidate' ? (
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Consolider</h1>
            <p className="text-sm text-muted-foreground">
              Les cartes que tu possèdes et qui vont clairement dans un album · ajoute-les en lot, elles partent dans la boîte d'envoi.
            </p>
          </header>
          <ConsolidateView />
        </div>
      ) : (
        <SuggestionsView />
      )}
    </div>
  );
}
