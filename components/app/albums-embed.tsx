import { useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useCollection } from '@/hooks/use-collection';
import { useSuggestions } from '@/hooks/use-suggestions';
import { rememberAppearance, watchAppearance } from '@/lib/appearance';
import { ALBUMS_EMBED_CLOSE, OPEN_REVIEW_TAB } from '@/lib/messages';
import { CardViewer } from './card-viewer';
import { Outbox } from './outbox';
import { TagsView } from './tags-view';
import { Toaster } from './toaster';

const closeOverlay = () => window.parent.postMessage({ type: ALBUMS_EMBED_CLOSE }, '*');

/** La page Albums de Collection+, sans la barre de navigation, pour la fenêtre posée sur le site. */
export function AlbumsEmbed() {
  const theme = useCollection((s) => s.settings.theme);
  const palette = useCollection((s) => s.settings.palette);
  useEffect(() => {
    rememberAppearance({ theme, palette });
    return watchAppearance(() => ({ theme, palette }));
  }, [theme, palette]);

  useEffect(() => {
    useSuggestions.getState().load().then(() => useCollection.getState().init());
    // Échap ferme la fenêtre, sauf si une boîte de dialogue ou un album ouvert l'a déjà pris.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [data-state="open"]')) return;
      closeOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider>
      <div className="h-dvh w-full overflow-y-auto">
        <TagsView onOpenReview={() => browser.runtime.sendMessage({ type: OPEN_REVIEW_TAB, onlyNew: false })} />
      </div>
      <Toaster />
      <CardViewer />
      <Outbox />
    </TooltipProvider>
  );
}
