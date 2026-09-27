import { collectionCache } from '@/lib/cache';
import { reviewedSnapshotItem } from '@/lib/store';
import { openReviewTab } from '@/lib/tabs';
import { newCardIds } from '@/lib/trade';

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
