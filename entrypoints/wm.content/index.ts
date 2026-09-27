import { defineContentScript } from '#imports';
import { collectionCache, collectionDirty } from '@/lib/cache';
import { OPEN_REVIEW_TAB } from '@/lib/messages';
import { getSettings, reviewedSnapshotItem, settingsItem } from '@/lib/store';
import { newCardIds } from '@/lib/trade';
import { pageTransport, PROXY_FETCH } from '@/lib/transport';
import { Badges } from './badges';

const FAB_CSS = `
  :host { all: initial; }
  button {
    position: fixed; left: 16px; bottom: 16px; z-index: 2147483000;
    display: flex; align-items: center; gap: 8px; padding: 9px 14px 9px 10px;
    border: 0; border-radius: 999px; cursor: pointer;
    background: #09090b; color: #fafafa; box-shadow: 0 8px 28px rgb(0 0 0 / .45), inset 0 0 0 1px rgb(255 255 255 / .1);
    font: 600 13px/1 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    transition: transform .15s ease;
  }
  button:hover { transform: translateY(-2px); }
  .logo {
    display: grid; place-items: center; width: 24px; height: 24px; border-radius: 8px;
    background: oklch(0.702 0.183 293.541); color: #09090b; font-size: 13px;
  }
  .count {
    min-width: 20px; padding: 3px 6px; border-radius: 999px; text-align: center;
    background: oklch(0.702 0.183 293.541); color: #09090b; font-size: 11px; font-weight: 800;
  }
  [hidden] { display: none; }
`;

export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  runAt: 'document_idle',

  async main() {
    // Relais pour l'onglet de l'extension : requêtes faites depuis la page, avec sa session.
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== PROXY_FETCH) return;
      pageTransport.siteFetch(message.path, message.init).then(sendResponse, (e) => sendResponse({ status: 0, text: String(e) }));
      return true;
    });

    // Le script MAIN world signale les actions qui modifient la collection.
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== 'wmt-intercept') return;
      if (event.data.type === 'collection-changed') collectionDirty.setValue(true);
    });

    const badges = new Badges();
    badges.start();

    const host = document.createElement('wmt-root');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${FAB_CSS}</style><button type="button"><span class="logo">🏷</span>WM Tags<span class="count" hidden></span></button>`;
    document.documentElement.append(host);
    const fab = root.querySelector('button')!;
    fab.addEventListener('click', () => browser.runtime.sendMessage({ type: OPEN_REVIEW_TAB, onlyNew: fab.dataset.new === '1' }));

    const refresh = async () => {
      const [cache, snapshot, settings] = await Promise.all([
        collectionCache.getValue(),
        reviewedSnapshotItem.getValue(),
        getSettings(),
      ]);
      if (cache) badges.update(cache.cards, cache.tradeTags, settings);
      const count = cache ? newCardIds(cache.cards, snapshot).size : 0;
      const badge = root.querySelector<HTMLElement>('.count')!;
      badge.hidden = !count;
      badge.textContent = String(count);
      fab.dataset.new = count ? '1' : '';
      fab.title = count ? `${count} carte(s) nouvelle(s) à trier` : 'Ouvrir WM Tags';
    };

    collectionCache.watch(refresh);
    reviewedSnapshotItem.watch(refresh);
    settingsItem.watch(refresh);
    refresh();
  },
});
