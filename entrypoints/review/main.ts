import { collectionCache } from '@/lib/cache';
import { siteTagsApi } from '@/lib/siteTags';
import { extensionTransport, setTransport } from '@/lib/transport';
import css from '@/ui/review.css?inline';
import { ReviewOverlay } from '@/ui/review';

setTransport(extensionTransport);

const host = document.createElement('div');
const root = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = css;
root.append(style);
document.body.append(host);

const review = new ReviewOverlay(root, siteTagsApi, 'page');
collectionCache.watch((cache) => review.adopt(cache));

review.open({ onlyNew: location.hash === '#new' });
window.addEventListener('hashchange', () => review.open({ onlyNew: location.hash === '#new' }));
