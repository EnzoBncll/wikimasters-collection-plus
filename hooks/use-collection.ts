import { create } from 'zustand';
import { collectionCache, saveCards, type CollectionCache } from '@/lib/cache';
import type { QueueProgress } from '@/lib/queue';
import { siteTagsApi } from '@/lib/siteTags';
import { getSettings, lastReviewAtItem, reviewedSnapshotItem, settingsItem, type Settings } from '@/lib/store';
import { syncCollection, type SyncProgress } from '@/lib/sync';
import {
  groupPending,
  pendingItem,
  prunePending,
  pruneTagEdits,
  stageChanges,
  stageTagEdit,
  tagEditsItem,
  withPending,
  withTagEdits,
  type PendingChanges,
  type TagEdits,
} from '@/lib/pending';
import { applyTagChanges, type TagChange } from '@/lib/tagging';
import { explicitStatus, newCardIds, tradeStatus, type TradeTags, statusChanges, systemTagIds, type StatusTarget } from '@/lib/trade';
import { DEFAULT_SETTINGS } from '@/lib/store';
import type { OwnedCard, SiteTag, TradeStatus } from '@/lib/types';
import { sleep } from '@/lib/queue';
import { toast } from './use-toast';

const api = siteTagsApi;

interface CollectionState {
  ready: boolean;
  /** Cartes telles qu'affichées : état du site + modifications en attente. */
  cards: OwnedCard[];
  /** Cartes telles que sur le site. */
  remote: OwnedCard[];
  /** Modifications d'étiquettes (dont Trade / Not Trade) pas encore envoyées. */
  pending: PendingChanges;
  /** Étiquettes telles qu'affichées : état du site + renommages / couleurs en attente. */
  tags: SiteTag[];
  /** Étiquettes telles que sur le site. */
  remoteTags: SiteTag[];
  /** Renommages et couleurs d'étiquettes pas encore envoyés. */
  tagEdits: TagEdits;
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
  /** Statut réellement posé (ou en attente), sans le « Trade par défaut ». */
  explicitOf(card: OwnedCard): TradeStatus;
  /** Met le statut en attente d'envoi. */
  setTrade(cards: OwnedCard[], target: StatusTarget): void;
  /** Sans statut → Trade → Not Trade → Trade… */
  cycleTrade(card: OwnedCard): void;
  /** Met des changements d'étiquettes en attente d'envoi. */
  stageTags(cards: OwnedCard[], changes: TagChange[]): void;
  /** Envoie toutes les modifications en attente au site, calmement (une requête à la fois). */
  pushPending(): Promise<void>;
  discardPending(): void;
  /** Applique tout de suite sur le site (règles automatiques…). */
  changeTags(cards: OwnedCard[], changes: TagChange[], label: string): Promise<void>;
  /** Met des cartes dans un album (pose de l'étiquette en attente d'envoi, visible dans la boîte d'envoi de l'album). */
  stageIntoAlbum(cards: OwnedCard[], tag: { id: string; name: string }): void;
  /** Retire des cartes d'un album (retrait de l'étiquette en attente d'envoi). */
  stageOutOfAlbum(cards: OwnedCard[], tagId: string): void;
  createTag(name: string, color: string): Promise<SiteTag | null>;
  /** Met un renommage / changement de couleur en attente d'envoi (renvoie false si le nom est déjà pris). */
  updateTag(tagId: string, patch: { name?: string; color?: string }): Promise<boolean>;
  deleteTag(tagId: string): Promise<void>;
  validateReview(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
}

/** Le site garde ses étiquettes en mémoire : propose de recharger l'onglet WikiMasters ouvert pour voir les nouveaux noms. */
async function suggestSiteReload() {
  const tabs = await browser.tabs.query({ url: 'https://www.wiki-masters.com/*' }).catch(() => []);
  if (!tabs.length) return;
  toast('Recharge WikiMasters pour y voir les nouveaux noms', 'info', {
    label: 'Recharger',
    onClick: () => tabs.forEach((tab) => tab.id && browser.tabs.reload(tab.id)),
  });
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const useCollection = create<CollectionState>((set, get) => {
  /** Écrit l'état courant dans le cache, horodaté avant écriture pour ignorer notre propre notification. */
  const persist = async (patch: Partial<CollectionCache> = {}) => {
    const syncedAt = Date.now();
    set({ syncedAt });
    const cache = await collectionCache.getValue();
    if (cache) await collectionCache.setValue({ ...cache, cards: get().remote, tags: get().remoteTags, ...patch, syncedAt });
    else await saveCards(get().remote, syncedAt);
  };

  const remoteById = () => new Map(get().remote.map((c) => [c.cardId, c]));

  /** Recalcule les cartes affichées ; `pending` est enregistré pour survivre à la fermeture de l'onglet. */
  const setPending = (pending: PendingChanges) => {
    set({ pending, cards: withPending(get().remote, pending), version: get().version + 1 });
    pendingItem.setValue(pending);
  };

  /** Étiquettes du site (le cache) ; l'affichage y ajoute les modifications en attente. */
  const setRemoteTags = (remoteTags: SiteTag[]) => {
    const tagEdits = pruneTagEdits(get().tagEdits, remoteTags);
    tagEditsItem.setValue(tagEdits);
    set({ remoteTags, tagEdits, tags: withTagEdits(remoteTags, tagEdits) });
  };

  const setTagEdits = (tagEdits: TagEdits) => {
    tagEditsItem.setValue(tagEdits);
    set({ tagEdits, tags: withTagEdits(get().remoteTags, tagEdits) });
  };

  const adopt = async (cache: CollectionCache) => {
    const byId = new Map(cache.cards.map((c) => [c.cardId, c]));
    const pending = prunePending(get().pending, byId, new Set(cache.tags.map((t) => t.id)));
    pendingItem.setValue(pending);
    set({
      remote: cache.cards,
      pending,
      cards: withPending(cache.cards, pending),
      tradeTags: cache.tradeTags,
      syncedAt: cache.syncedAt,
      newIds: newCardIds(cache.cards, await reviewedSnapshotItem.getValue()),
      version: get().version + 1,
      ready: true,
    });
    setRemoteTags(cache.tags);
  };

  return {
    ready: false,
    cards: [],
    remote: [],
    pending: {},
    tags: [],
    remoteTags: [],
    tagEdits: {},
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
      const [settings, cache, lastReviewAt, pending, tagEdits] = await Promise.all([
        getSettings(),
        collectionCache.getValue(),
        lastReviewAtItem.getValue(),
        pendingItem.getValue(),
        tagEditsItem.getValue(),
      ]);
      set({ settings, lastReviewAt, pending, tagEdits });
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

    explicitOf(card) {
      const { tradeTags } = get();
      return tradeTags ? explicitStatus(card, tradeTags) : 'unset';
    },

    setTrade(cards, target) {
      const { tradeTags } = get();
      if (!tradeTags || !cards.length) return;
      get().stageTags(cards, statusChanges(tradeTags, target));
    },

    cycleTrade(card) {
      // Trade → Not Trade → Discard → Trade (une carte sans statut passe en Trade).
      const next: Record<string, StatusTarget> = { trade: 'not_trade', not_trade: 'discard', discard: 'trade', unset: 'trade' };
      get().setTrade([card], next[get().explicitOf(card)]!);
    },

    stageTags(cards, changes) {
      if (!cards.length || !changes.length) return;
      setPending(stageChanges(get().pending, remoteById(), cards.map((c) => c.cardId), changes));
    },

    async pushPending() {
      if (get().job) return;
      const groups = groupPending(get().pending);
      const edits = Object.entries(get().tagEdits);
      if (!groups.length && !edits.length) return;
      const byId = remoteById();
      const label = 'Envoi sur WikiMasters';
      const total = edits.length + groups.length;
      let done = 0;
      let failed = 0;
      let renamed = 0;
      set({ job: { done: 0, total, failed: 0, label } });
      try {
        // 1. Renommages et couleurs, un par un, vérifiés (voir siteTagsApi.update).
        for (const [tagId, patch] of edits) {
          try {
            await api.update(tagId, patch);
            renamed++;
            setRemoteTags(get().remoteTags.map((t) => (t.id === tagId ? { ...t, ...patch } : t)));
            const { tradeTags } = get();
            if (tradeTags) {
              const fix = (tag?: SiteTag) => (tag?.id === tagId ? { ...tag, ...patch } : tag);
              set({ tradeTags: { trade: fix(tradeTags.trade)!, notTrade: fix(tradeTags.notTrade)!, discard: fix(tradeTags.discard) } });
            }
          } catch (error) {
            failed++;
            console.error('[Collection+]', error);
          }
          set({ job: { done: ++done, total, failed, label } });
          await sleep(350);
        }

        // 2. Poses et retraits sur les cartes, une requête à la fois, espacées : pas de rafale sur l'API du site.
        for (const group of groups) {
          const cards = group.cardIds.map((id) => byId.get(id)).filter((c): c is OwnedCard => Boolean(c));
          const result = await applyTagChanges(api, cards, [{ tagId: group.tagId, on: group.on }], undefined, { concurrency: 1, minDelayMs: 350 });
          failed += result.failed;
          set({ job: { done: ++done, total, failed, label } });
        }
        // applyTagChanges a mis à jour les cartes du site en mémoire : ce qui est passé sort de l'attente.
        set({ remote: [...get().remote] });
        setPending(prunePending(get().pending, remoteById()));
        await persist();

        const leftCards = Object.keys(get().pending).length;
        const leftTags = Object.keys(get().tagEdits).length;
        const left = [leftTags && `${leftTags} étiquette(s)`, leftCards && `${leftCards} carte(s)`].filter(Boolean).join(' et ');
        toast(left ? `Envoi partiel : ${left} encore en attente` : 'Modifications envoyées sur WikiMasters', left ? 'error' : 'success');
        if (renamed) await suggestSiteReload();
      } catch (error) {
        toast(errorText(error), 'error');
      } finally {
        set({ job: null });
      }
    },

    discardPending() {
      setPending({});
      setTagEdits({});
    },

    stageIntoAlbum(cards, tag) {
      get().stageTags(cards, [{ tagId: tag.id, on: true }]);
    },

    stageOutOfAlbum(cards, tagId) {
      get().stageTags(cards, [{ tagId, on: false }]);
    },

    async changeTags(cards, changes, label) {
      if (!cards.length || !changes.length || get().job) return;
      set({ job: { done: 0, total: 1, failed: 0, label } });
      try {
        const byId = remoteById();
        const remote = cards.map((c) => byId.get(c.cardId)).filter((c): c is OwnedCard => Boolean(c));
        const result = await applyTagChanges(api, remote, changes, (p) => set({ job: { ...p, label } }));
        set({ remote: [...get().remote] });
        setPending(prunePending(get().pending, remoteById()));
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
        setRemoteTags([...get().remoteTags, tag]);
        await persist();
        return tag;
      } catch (error) {
        toast(errorText(error), 'error');
        return null;
      }
    },

    async updateTag(tagId, patch) {
      const name = patch.name?.trim();
      if (name !== undefined) {
        if (!name) return false;
        if (get().tags.some((t) => t.id !== tagId && t.name.toLowerCase() === name.toLowerCase())) {
          toast(`L'étiquette « ${name} » existe déjà`, 'error');
          return false;
        }
      }
      setTagEdits(stageTagEdit(get().tagEdits, get().remoteTags, tagId, name !== undefined ? { ...patch, name } : patch));
      return true;
    },

    async deleteTag(tagId) {
      const { tradeTags } = get();
      if (systemTagIds(tradeTags).has(tagId)) return;
      try {
        await api.delete(tagId);
        const cards = get().remote;
        for (const card of cards) {
          if (!card.tagIds.includes(tagId)) continue;
          for (const ownedId of card.ownedIds) card.ownedTags[ownedId] = (card.ownedTags[ownedId] ?? []).filter((t) => t !== tagId);
          card.tagIds = card.tagIds.filter((t) => t !== tagId);
        }
        set({ remote: [...cards] });
        setRemoteTags(get().remoteTags.filter((t) => t.id !== tagId));
        setPending(prunePending(get().pending, remoteById(), new Set(get().remoteTags.map((t) => t.id))));
        await persist();
        toast('Étiquette supprimée', 'success');
      } catch (error) {
        toast(errorText(error), 'error');
      }
    },

    async validateReview() {
      const snapshot = Object.fromEntries(get().remote.map((c) => [c.cardId, c.count]));
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
