import { Download, LayoutGrid, Sparkles, Tags } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NotchNav, type NotchItemData } from '@/components/ui/adaptive-notch-navigation-bar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useCollection } from '@/hooks/use-collection';
import { ExportView } from './export-view';
import { ReviewView } from './review-view';
import { SuggestionsView } from './suggestions-view';
import { SyncStatus } from './sync-status';
import { TagsView } from './tags-view';
import { Toaster } from './toaster';

type ViewId = 'review' | 'tags' | 'suggestions' | 'export';

function Logo() {
  return (
    <div className="flex h-8.5 items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Tags className="size-4" />
      </div>
      <span className="hidden text-sm font-bold tracking-tight sm:inline">Collection+</span>
    </div>
  );
}

/** Applique le thème (auto / clair / sombre) sur <html>. */
function useTheme() {
  const theme = useCollection((s) => s.settings.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

export function App({ initialView = 'review' }: { initialView?: ViewId }) {
  const [view, setView] = useState<ViewId>(initialView);
  const newCount = useCollection((s) => s.newIds.size);
  useTheme();

  useEffect(() => {
    useCollection.getState().init();
  }, []);

  const items: NotchItemData[] = [
    { id: 'review', label: 'Revue', icon: LayoutGrid, badge: newCount ? String(newCount) : undefined },
    { id: 'tags', label: 'Étiquettes', icon: Tags },
    { id: 'suggestions', label: 'Suggestions', icon: Sparkles, badge: 'Bientôt' },
    { id: 'export', label: 'Export', icon: Download },
  ];

  return (
    <TooltipProvider>
      <NotchNav
        items={items}
        activeId={view}
        onActiveChange={(id) => setView(id as ViewId)}
        logo={<Logo />}
        rightContent={<SyncStatus />}
        contentClassName="items-stretch justify-start px-0 sm:px-0 md:px-0 pb-0 overflow-hidden"
      >
        <div className="h-full w-full overflow-y-auto">
          {view === 'review' && <ReviewView />}
          {view === 'tags' && <TagsView onOpenReview={() => setView('review')} />}
          {view === 'suggestions' && <SuggestionsView />}
          {view === 'export' && <ExportView />}
        </div>
      </NotchNav>
      <Toaster />
    </TooltipProvider>
  );
}
