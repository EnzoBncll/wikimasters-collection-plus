import { Heart, LayoutGrid, Settings, Sparkles, Tags } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NotchNav, type NotchItemData } from '@/components/ui/adaptive-notch-navigation-bar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useCollection } from '@/hooks/use-collection';
import { rememberAppearance, watchAppearance } from '@/lib/appearance';
import { useSuggestions } from '@/hooks/use-suggestions';
import { BrandIcon } from './brand-icon';
import { CardViewer } from './card-viewer';
import { Onboarding } from './onboarding';
import { Outbox } from './outbox';
import { EnhanceView, type EnhanceSection } from './enhance-view';
import { ExportView } from './export-view';
import { ReviewView } from './review-view';
import { SyncStatus } from './sync-status';
import { ThemeToggle } from './theme-toggle';
import { TagsView } from './tags-view';
import { WishlistView } from './wishlist-view';
import { Toaster } from './toaster';
import { UpdateBanner } from './update-banner';

type ViewId = 'review' | 'tags' | 'wishes' | 'suggestions' | 'settings';

function Logo() {
  const palette = useCollection((s) => s.settings.palette);
  return (
    <div className="flex h-8.5 items-center gap-2">
      <BrandIcon palette={palette} small className="size-7 drop-shadow-[0_2px_6px_var(--frame-glow)]" />
      <span className="hidden text-sm font-bold tracking-tight sm:inline">
        Collection<span className="text-frame-holo">+</span>
      </span>
    </div>
  );
}

/** Applique le mode (auto / clair / sombre) et la palette sur <html>. */
function useAppearance() {
  const theme = useCollection((s) => s.settings.theme);
  const palette = useCollection((s) => s.settings.palette);
  useEffect(() => {
    rememberAppearance({ theme, palette });
    return watchAppearance(() => ({ theme, palette }));
  }, [theme, palette]);
}

export function App({ initialView = 'review' }: { initialView?: ViewId }) {
  const [view, setView] = useState<ViewId>(initialView);
  const [enhanceSection, setEnhanceSection] = useState<EnhanceSection>('consolidate');
  const newCount = useCollection((s) => s.newIds.size);
  const version = useCollection((s) => s.version);
  const { rules, facts } = useSuggestions();
  const pendingCount = useMemo(
    () => useSuggestions.getState().pending().reduce((n, p) => n + p.cards.length, 0),
    [rules, facts, version],
  );
  useAppearance();

  useEffect(() => {
    // Après chaque synchro, les cartes déjà analysées une fois le sont aussi pour les nouvelles
    // (seules les cartes inconnues sont envoyées à Wikidata), puis les règles automatiques s'appliquent.
    const unsubscribe = useCollection.subscribe((state, prev) => {
      if (prev.syncing && !state.syncing && state.cards.length) {
        const suggestions = useSuggestions.getState();
        if (Object.keys(suggestions.facts).length) suggestions.analyze();
      }
    });
    useSuggestions.getState().load().then(() => useCollection.getState().init());
    return unsubscribe;
  }, []);

  const items: NotchItemData[] = [
    { id: 'review', label: 'Cards', icon: LayoutGrid, badge: newCount ? String(newCount) : undefined },
    { id: 'tags', label: 'Albums', icon: Tags },
    { id: 'wishes', label: 'Souhaits', icon: Heart },
    { id: 'suggestions', label: 'Enhance', icon: Sparkles, badge: pendingCount ? String(pendingCount) : undefined },
    { id: 'settings', label: 'Paramètres', icon: Settings, iconOnly: true },
  ];

  return (
    <TooltipProvider>
      <NotchNav
        items={items}
        activeId={view}
        onActiveChange={(id) => setView(id as ViewId)}
        logo={<Logo />}
        rightContent={
          <div className="flex items-center gap-1">
            <SyncStatus />
            <ThemeToggle />
          </div>
        }
        contentClassName="items-stretch justify-start px-0 sm:px-0 md:px-0 pb-0 overflow-hidden"
      >
        <div className="h-full w-full overflow-y-auto">
          {view === 'review' && <ReviewView />}
          {view === 'tags' && (
            <TagsView
              onOpenReview={() => setView('review')}
              onOpenEnhance={(section) => {
                setEnhanceSection(section);
                setView('suggestions');
              }}
            />
          )}
          {view === 'wishes' && <WishlistView />}
          {view === 'suggestions' && <EnhanceView section={enhanceSection} onSection={setEnhanceSection} />}
          {view === 'settings' && <ExportView />}
        </div>
      </NotchNav>
      <Toaster />
      <CardViewer />
      <Outbox />
      <Onboarding onView={setView} />
      <UpdateBanner />
    </TooltipProvider>
  );
}
