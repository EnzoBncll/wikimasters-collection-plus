import { defineContentScript } from '#imports';
import { collectionCache, collectionDirty } from '@/lib/cache';
import { OPEN_REVIEW_MESSAGE, OPEN_REVIEW_TAB } from '@/lib/messages';
import { siteTagsApi } from '@/lib/siteTags';
import { getSettings, reviewedSnapshotItem, settingsItem } from '@/lib/store';
import { newCardIds } from '@/lib/trade';
import { pageTransport, PROXY_FETCH, setTransport } from '@/lib/transport';
import css from '@/ui/review.css?inline';
import { ReviewOverlay } from '@/ui/review';
import { Badges } from './badges';

export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  runAt: 'document_idle',

  async main() {
    setTransport(pageTransport);

    // Le script MAIN world signale les actions qui modifient la collection.
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== 'wmt-intercept') return;
      if (event.data.type === 'collection-changed') collectionDirty.setValue(true);
    });

    const host = document.createElement('wmt-root');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    root.append(style);
    document.documentElement.append(host);

    const badges = new Badges();
    badges.start();

    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.innerHTML = `🏷️ Revue Trade <span class="count" hidden></span>`;
    root.append(fab);

    const overlay = new ReviewOverlay(root, siteTagsApi, 'overlay', () =>
      browser.runtime.sendMessage({ type: OPEN_REVIEW_TAB }),
    );
    fab.addEventListener('click', () => overlay.open());

    // Proxy pour l'onglet de l'extension : requêtes faites depuis la page, avec sa session.
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === PROXY_FETCH) {
        pageTransport.siteFetch(message.path, message.init).then(sendResponse, (e) => sendResponse({ status: 0, text: String(e) }));
        return true;
      }
      if (message?.type === OPEN_REVIEW_MESSAGE) overlay.open({ onlyNew: Boolean(message.onlyNew) });
    });

    const refresh = async () => {
      const [cache, snapshot, settings] = await Promise.all([
        collectionCache.getValue(),
        reviewedSnapshotItem.getValue(),
        getSettings(),
      ]);
      if (cache) badges.update(cache.cards, cache.tradeTags, settings);
      const count = cache ? newCardIds(cache.cards, snapshot).size : 0;
      const badge = fab.querySelector<HTMLElement>('.count')!;
      badge.hidden = !count;
      badge.textContent = String(count);
      fab.title = count ? `${count} carte(s) nouvelle(s) à trier` : 'Ouvrir la revue Trade';
    };

    // Le cache est la source commune : pastilles, compteur et overlay suivent ses mises à jour,
    // y compris celles faites depuis l'onglet de l'extension.
    collectionCache.watch((cache) => {
      refresh();
      overlay.adopt(cache);
    });
    reviewedSnapshotItem.watch(refresh);
    settingsItem.watch(refresh);
    refresh();

    if (location.hash === '#wmt-review') overlay.open();
  },
});
