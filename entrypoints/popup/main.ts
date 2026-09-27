import { OPEN_REVIEW_MESSAGE } from '@/lib/messages';
import { getSettings, settingsItem, type Settings } from '@/lib/store';
import { openReviewTab } from '@/lib/tabs';

const SITE = 'https://www.wiki-masters.com/';

async function openReview(onlyNew: boolean) {
  const [tab] = await browser.tabs.query({ url: `${SITE}*` });
  if (tab?.id) {
    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId) await browser.windows.update(tab.windowId, { focused: true });
    await browser.tabs.sendMessage(tab.id, { type: OPEN_REVIEW_MESSAGE, onlyNew }).catch(() =>
      browser.tabs.update(tab.id!, { url: `${SITE}collection#wmt-review` }),
    );
  } else {
    await browser.tabs.create({ url: `${SITE}collection#wmt-review` });
  }
  window.close();
}

document.getElementById('openTab')!.addEventListener('click', async () => {
  await openReviewTab();
  window.close();
});
document.getElementById('openSite')!.addEventListener('click', () => openReview(false));
document.getElementById('openNew')!.addEventListener('click', async () => {
  await openReviewTab(true);
  window.close();
});

const settings = await getSettings();
const checkboxes = ['defaultTrade', 'showBadges', 'sheetImages'] as const;
const texts = ['tradeTagName', 'notTradeTagName'] as const;

for (const key of checkboxes) {
  const input = document.getElementById(key) as HTMLInputElement;
  input.checked = settings[key];
  input.addEventListener('change', () => save({ [key]: input.checked }));
}
for (const key of texts) {
  const input = document.getElementById(key) as HTMLInputElement;
  input.value = settings[key];
  input.addEventListener('change', () => input.value.trim() && save({ [key]: input.value.trim() }));
}

async function save(patch: Partial<Settings>) {
  await settingsItem.setValue({ ...(await getSettings()), ...patch });
}
