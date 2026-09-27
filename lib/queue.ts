/**
 * File d'attente à débit limité : évite de spammer l'API du site
 * quand on pose une étiquette sur des centaines de cartes.
 */
export interface QueueProgress {
  done: number;
  total: number;
  failed: number;
}

export async function runQueue<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  {
    concurrency = 3,
    minDelayMs = 120,
    onProgress,
  }: { concurrency?: number; minDelayMs?: number; onProgress?: (p: QueueProgress) => void } = {},
): Promise<QueueProgress> {
  const progress: QueueProgress = { done: 0, total: items.length, failed: 0 };
  let index = 0;

  async function lane() {
    while (index < items.length) {
      const item = items[index++] as T;
      const started = Date.now();
      try {
        await worker(item);
      } catch (error) {
        progress.failed += 1;
        console.warn('[WM Tags] échec', error);
      }
      progress.done += 1;
      onProgress?.({ ...progress });
      const wait = minDelayMs - (Date.now() - started);
      if (wait > 0) await sleep(wait);
    }
  }

  onProgress?.({ ...progress });
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return progress;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
