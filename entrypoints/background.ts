import { defineBackground } from '#imports';
import { OPEN_REVIEW_TAB } from '@/lib/messages';
import { EXPORT_SHEETS, exportToSheets, isSheetsConfigured } from '@/lib/sheets';
import { openReviewTab } from '@/lib/tabs';

export default defineBackground(() => {
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
