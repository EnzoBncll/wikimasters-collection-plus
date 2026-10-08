import { createRoot } from 'react-dom/client';
import '@/assets/globals.css';
import { App } from '@/components/app/app';
import { useReview } from '@/hooks/use-review';
import { applyAppearance, cachedAppearance } from '@/lib/appearance';
import { DEFAULT_SETTINGS } from '@/lib/store';
import { extensionTransport, setTransport } from '@/lib/transport';

setTransport(extensionTransport);
// Couleurs dès le premier rendu, avant le chargement des réglages.
applyAppearance(cachedAppearance() ?? DEFAULT_SETTINGS);

const applyHash = () => {
  if (location.hash === '#new') useReview.getState().set({ onlyNew: true });
};
applyHash();
window.addEventListener('hashchange', applyHash);

// Lien direct vers une vue : review.html#tags, #wishes, #suggestions, #settings (ou #export) ; un album : #album=<id de l'étiquette ou « none »>.
const VIEWS = ['review', 'tags', 'wishes', 'suggestions', 'settings'] as const;
const hash = location.hash === '#export' ? '#settings' : location.hash;
const hashView = hash.startsWith('#album=') ? 'tags' : VIEWS.find((v) => hash === `#${v}`);

createRoot(document.getElementById('root')!).render(<App initialView={hashView} />);
