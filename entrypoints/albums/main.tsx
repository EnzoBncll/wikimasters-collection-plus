import { createRoot } from 'react-dom/client';
import '@/assets/globals.css';
import { AlbumsEmbed } from '@/components/app/albums-embed';
import { applyAppearance, cachedAppearance } from '@/lib/appearance';
import { DEFAULT_SETTINGS } from '@/lib/store';
import { extensionTransport, setTransport } from '@/lib/transport';

/** Page Albums seule, ouverte dans la fenêtre posée par-dessus wiki-masters.com (bouton Albums). */
setTransport(extensionTransport);
applyAppearance(cachedAppearance() ?? DEFAULT_SETTINGS);

createRoot(document.getElementById('root')!).render(<AlbumsEmbed />);
