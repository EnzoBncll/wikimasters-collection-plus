import { createRoot } from 'react-dom/client';
import '@/assets/globals.css';
import { App } from '@/components/app/app';
import { useReview } from '@/hooks/use-review';
import { extensionTransport, setTransport } from '@/lib/transport';

setTransport(extensionTransport);

const applyHash = () => {
  if (location.hash === '#new') useReview.getState().set({ onlyNew: true });
};
applyHash();
window.addEventListener('hashchange', applyHash);

createRoot(document.getElementById('root')!).render(<App />);
