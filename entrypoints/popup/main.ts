import { collectionCache } from '@/lib/cache';
import { applyAppearance } from '@/lib/appearance';
import { brandIconSvg } from '@/lib/brand-icon';
import { getPalette } from '@/lib/palettes';
import { getSettings, reviewedSnapshotItem } from '@/lib/store';
import { openReviewTab } from '@/lib/tabs';
import { newCardIds } from '@/lib/trade';
import { availableUpdate, checkForUpdate, currentVersion } from '@/lib/updates';

const settings = await getSettings();
applyAppearance(settings);
document.getElementById('logo')!.innerHTML = brandIconSvg(getPalette(settings.palette), { small: true });

document.getElementById('open')!.addEventListener('click', async () => {
  await openReviewTab();
  window.close();
});
document.getElementById('openNew')!.addEventListener('click', async () => {
  await openReviewTab(true);
  window.close();
});

const cache = await collectionCache.getValue();
if (cache) {
  const count = newCardIds(cache.cards, await reviewedSnapshotItem.getValue()).size;
  document.getElementById('count')!.textContent = count ? String(count) : '';
}

document.getElementById('version')!.textContent = currentVersion();
const update = availableUpdate(await checkForUpdate());
if (update) {
  const link = document.getElementById('update') as HTMLAnchorElement;
  link.href = update.url;
  link.textContent = `Version ${update.latest} disponible — voir la mise à jour`;
  link.hidden = false;
}
