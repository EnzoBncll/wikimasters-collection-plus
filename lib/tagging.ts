import type { SiteTagsApi } from './api';
import { runQueue, type QueueProgress } from './queue';
import type { OwnedCard } from './types';

const BATCH = 80;

const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export interface TagChange {
  tagId: string;
  /** true = poser l'étiquette, false = la retirer. */
  on: boolean;
}

/**
 * Applique des changements d'étiquettes à tous les exemplaires des cartes données,
 * par lots, puis met à jour les cartes en mémoire. Ne fait des appels que pour ce qui change.
 */
export async function applyTagChanges(
  api: SiteTagsApi,
  cards: OwnedCard[],
  changes: TagChange[],
  onProgress?: (p: QueueProgress) => void,
  queue: { concurrency?: number; minDelayMs?: number } = {},
): Promise<QueueProgress> {
  const jobs = changes.flatMap(({ tagId, on }) => {
    const ids: string[] = [];
    for (const card of cards) {
      for (const ownedId of card.ownedIds) {
        const has = (card.ownedTags[ownedId] ?? []).includes(tagId);
        if (has !== on) ids.push(ownedId);
      }
    }
    return chunk(ids, BATCH).map((batch) => ({ tagId, on, ids: new Set(batch), batch }));
  });

  const touched = new Set<OwnedCard>();
  const progress = await runQueue(
    jobs,
    async (job) => {
      await (job.on ? api.addMany(job.tagId, job.batch) : api.removeMany(job.tagId, job.batch));
      for (const card of cards) {
        for (const ownedId of card.ownedIds) {
          if (!job.ids.has(ownedId)) continue;
          const tags = card.ownedTags[ownedId] ?? [];
          card.ownedTags[ownedId] = job.on ? [...new Set([...tags, job.tagId])] : tags.filter((t) => t !== job.tagId);
          touched.add(card);
        }
      }
    },
    { concurrency: 2, minDelayMs: 150, ...queue, onProgress },
  );

  for (const card of touched) card.tagIds = [...new Set(Object.values(card.ownedTags).flat())];
  return progress;
}
