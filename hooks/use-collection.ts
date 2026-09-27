import { create } from 'zustand';
import { collectionCache, saveCards, type CollectionCache } from '@/lib/cache';
import type { QueueProgress } from '@/lib/queue';
import { siteTagsApi } from '@/lib/siteTags';
import { getSettings, lastReviewAtItem, reviewedSnapshotItem, settingsItem, type Settings } from '@/lib/store';
import { syncCollection, type SyncProgress } from '@/lib/sync';
import { applyTagChanges, type TagChange } from '@/lib/tagging';
import { applyTradeStatus, newCardIds, tradeStatus, type TradeTags } from '@/lib/trade';
import { DEFAULT_SETTINGS } from '@/lib/store';
import type { OwnedCard, SiteTag, TradeStatus } from '@/lib/types';
import { toast } from './use-toast';

const api = siteTagsApi;

interface CollectionState {
  ready: boolean;
  cards: OwnedCard[];
  tags: SiteTag[];
  tradeTags: TradeTags | null;
  settings: Settings;
  newIds: Set<string>;
  lastReviewAt: number | null;

  syncing: boolean;
  syncProgress: SyncProgress | null;
  syncedAt: number;
  error: string | null;

  /** Progression d'une opération d'étiquetage en cours. */
  job: (QueueProgress & { label: string }) | null;

  /** Incrémenté à chaque modification des cartes (pour les mémos). */
  version: number;

  init(): Promise<void>;
  sync(force?: boolean): Promise<void>;
  statusOf(card: OwnedCard): TradeStatus;
  setTrade(cards: OwnedCard[], target: 'trade' | 'not_trade'): Promise<void>;
  changeTags(cards: OwnedCard[], changes: TagChange[], label: string): Promise<void>;
  createTag(name: string, color: string): Promise<SiteTag | null>;
  updateTag(tagId: string, patch: { name?: string; color?: string }): Promise<void>;
  deleteTag(tagId: string): Promise<void>;
  validateReview(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const useCollection = create<CollectionState>((set, get) => {
  /** Écrit l'état courant dans le cache, horodaté avant écriture pour ignorer notre propre notification. */
  const persist = async (patch: Partial<CollectionCache> = {}) => {
    const syncedAt = Date.now();
    set({ syncedAt });
    const cache = await collectionCache.getValue();
    if (cache) await collectionCache.setValue({ ...cache, cards: get().cards, tags: get().tags, ...patch, syncedAt });
    else await saveCards(get().cards, syncedAt);
  };

  const adopt = async (cache: CollectionCache) => {
    set({
      cards: cache.cards,
      tags: cache.tags,
      tradeTags: cache.tradeTags,
      syncedAt: cache.syncedAt,
      newIds: newCardIds(cache.cards, await reviewedSnapshotItem.getValue()),
      version: get().version + 1,
      ready: true,
    });
  };

  return {
    ready: false,
    cards: [],
    tags: [],
    tradeTags: null,
    settings: DEFAULT_SETTINGS,
    newIds: new Set(),
    lastReviewAt: null,
    syncing: false,
    syncProgress: null,
    syncedAt: 0,
    error: null,
    job: null,
    version: 0,

    async init() {
      const [settings, cache, lastReviewAt] = await Promise.all([
        getSettings(),
        collectionCache.getValue(),
        lastReviewAtItem.getValue(),
      ]);
      set({ settings, lastReviewAt });
      if (cache?.version === 2) await adopt(cache);

      // Mises à jour venant d'autres vues (site, autre onglet).
      collectionCache.watch((next) => {
        if (next && !get().syncing && !get().job && next.syncedAt > get().syncedAt) adopt(next);
      });
      settingsItem.watch(async () => set({ settings: await getSettings() }));
      reviewedSnapshotItem.watch((snapshot) => set({ newIds: newCardIds(get().cards, snapshot) }));

      await get().sync();
    },

    async sync(force = false) {
      if (get().syncing) return;
      set({ syncing: true, syncProgress: null, error: null });
      try {
        const { cache, mode } = await syncCollection(api, get().settings, {
          force,
          onProgress: (syncProgress) => set({ syncProgress }),
        });
        await adopt(cache);
        if (force && mode === 'full') toast('Collection rechargée depuis le site');
      } catch (error) {
        console.error('[Collection+]', error);
        set({ error: errorText(error) });
        if (get().cards.length) toast(`Synchronisation impossible : ${errorText(error)}`, 'error');
      } finally {
        set({ syncing: false, syncProgress: null, ready: true });
      }
    },

    statusOf(card) {
      const { tradeTags, settings } = get();
      return tradeTags ? tradeStatus(card, tradeTags, settings) : 'unset';
    },

    async setTrade(cards, target) {
      const { tradeTags } = get();
      if (!tradeTags || !cards.length || get().job) return;
      const label = target === 'trade' ? 'Trade' : 'Not Trade';
      set({ job: { done: 0, total: 1, failed: 0, label } });
      try {
        const result = await applyTradeStatus(api, cards, target, tradeTags, (p) => set({ job: { ...p, label } }));
        set({ version: get().version + 1 });
        await persist();
        toast(
          result.failed
            ? `${label} : ${result.failed} lot(s) en échec sur ${result.total}`
            : `${label} · ${cards.length} carte${cards.length > 1 ? 's' : ''}`,
          result.failed ? 'error' : 'success',
        );
      } catch (error) {
        toast(errorText(error), 'error');
      } finally {
        set({ job: null });
      }
    },

    async changeTags(cards, changes, label) {
      if (!cards.length || !changes.length || get().job) return;
      set({ job: { done: 0, total: 1, failed: 0, label } });
      try {
        const result = await applyTagChanges(api, cards, changes, (p) => set({ job: { ...p, label } }));
        set({ version: get().version + 1 });
        await persist();
        toast(result.failed ? `${label} : ${result.failed} lot(s) en échec` : label, result.failed ? 'error' : 'success');
      } catch (error) {
        toast(errorText(error), 'error');
      } finally {
        set({ job: null });
      }
    },

    async createTag(name, color) {
      const trimmed = name.trim();
      if (!trimmed) return null;
      if (get().tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
        toast(`L'étiquette « ${trimmed} » existe déjà`, 'error');
        return null;
      }
      try {
        const tag = await api.create(trimmed, color);
        set({ tags: [...get().tags, tag].sort((a, b) => a.name.localeCompare(b.name, 'fr')) });
        await persist();
        return tag;
      } catch (error) {
        toast(errorText(error), 'error');
        return null;
      }
    },

    async updateTag(tagId, patch) {
      try {
        await api.update(tagId, patch);
        set({ tags: get().tags.map((t) => (t.id === tagId ? { ...t, ...patch } : t)) });
        await persist();
      } catch (error) {
        toast(errorText(error), 'error');
      }
    },

    async deleteTag(tagId) {
      const { tradeTags } = get();
      if (tradeTags && (tagId === tradeTags.trade.id || tagId === tradeTags.notTrade.id)) return;
      try {
        await api.delete(tagId);
        const cards = get().cards;
        for (const card of cards) {
          if (!card.tagIds.includes(tagId)) continue;
          for (const ownedId of card.ownedIds) card.ownedTags[ownedId] = (card.ownedTags[ownedId] ?? []).filter((t) => t !== tagId);
          card.tagIds = card.tagIds.filter((t) => t !== tagId);
        }
        set({ tags: get().tags.filter((t) => t.id !== tagId), version: get().version + 1 });
        await persist();
        toast('Étiquette supprimée', 'success');
      } catch (error) {
        toast(errorText(error), 'error');
      }
    },

    async validateReview() {
      const snapshot = Object.fromEntries(get().cards.map((c) => [c.cardId, c.count]));
      const now = Date.now();
      await reviewedSnapshotItem.setValue(snapshot);
      await lastReviewAtItem.setValue(now);
      set({ newIds: new Set(), lastReviewAt: now });
      toast('Revue validée : plus aucune carte « nouvelle »', 'success');
    },

    async updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      await settingsItem.setValue(settings);
    },
  };
});

/** Nombre de cartes par étiquette. */
export function tagCounts(cards: OwnedCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) for (const id of card.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
