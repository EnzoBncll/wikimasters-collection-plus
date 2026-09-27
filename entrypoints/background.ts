import { defineBackground } from '#imports';
import { OPEN_REVIEW_TAB } from '@/lib/messages';
import { EXPORT_SHEETS, exportToSheets, isSheetsConfigured } from '@/lib/sheets';
import { getSettings, settingsItem } from '@/lib/store';
import { openReviewTab } from '@/lib/tabs';

/** Icône de la barre d'outils aux couleurs de la palette choisie (PNG générés par `pnpm icons`). */
async function syncToolbarIcon() {
  const { palette } = await getSettings();
  const path = (size: number) => `/icon/themes/${palette}-${size}.png`;
  await browser.action.setIcon({ path: { 16: path(16), 32: path(32) } }).catch(() => {});
}

export default defineBackground(() => {
  syncToolbarIcon();
  settingsItem.watch(syncToolbarIcon);

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === OPEN_REVIEW_TAB) {
      openReviewTab(Boolean(message.onlyNew));
      return;
    }
    if (message?.type === EXPORT_SHEETS) {
      if (!isSheetsConfigured()) {
        sendResponse({ error: 'not_configured' });
        return;
      }
      exportToSheets(message.payload)
        .then(async (url) => {
          await browser.tabs.create({ url });
          sendResponse({ url });
        })
        .catch((error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
  });
});
