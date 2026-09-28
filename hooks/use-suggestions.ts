import { systemTagIds } from '@/lib/trade';
import { create } from 'zustand';
import {
  computeSuggestions,
  dismissedItem,
  pendingForRule,
  rulesItem,
  type Criterion,
  type Rule,
  type RuleMode,
  type Suggestion,
} from '@/lib/suggest';
import type { OwnedCard } from '@/lib/types';
import { enrichCards, factsItem, labelsItem, type CardFacts, type EnrichProgress } from '@/lib/wikidata';
import { useCollection } from './use-collection';
import { toast } from './use-toast';

interface SuggestionsState {
  loaded: boolean;
  facts: Record<string, CardFacts>;
  labels: Record<string, string>;
  rules: Rule[];
  dismissed: Set<string>;
  enriching: EnrichProgress | null;
  error: string | null;

  load(): Promise<void>;
  /** Enrichit les cartes sans données Wikidata, puis applique les règles automatiques. */
  analyze(): Promise<void>;
  suggestions(): Suggestion[];
  pending(): { rule: Rule; cards: OwnedCard[] }[];
  accept(
    suggestion: Suggestion,
    options: { name: string; color: string; cards: OwnedCard[]; rule: RuleMode | null },
  ): Promise<void>;
  dismiss(key: string): Promise<void>;
  addRule(tagId: string, criterion: Criterion, mode: RuleMode, ignored?: string[]): Promise<void>;
  setRuleMode(ruleId: string, mode: RuleMode): Promise<void>;
  deleteRule(ruleId: string): Promise<void>;
  applyRule(rule: Rule, cards: OwnedCard[]): Promise<void>;
  ignoreForRule(rule: Rule, cards: OwnedCard[]): Promise<void>;
}

const systemIds = () => {
  const { tradeTags } = useCollection.getState();
  return systemTagIds(tradeTags);
};

export const useSuggestions = create<SuggestionsState>((set, get) => {
  const saveRules = async (rules: Rule[]) => {
    set({ rules });
    await rulesItem.setValue(rules);
  };

  /** Applique les règles en mode automatique aux cartes qui correspondent. */
  const runAutoRules = async () => {
    const { cards, tags, changeTags } = useCollection.getState();
    const tagIds = new Set(tags.map((t) => t.id));
    for (const rule of get().rules) {
      if (rule.mode !== 'auto' || !tagIds.has(rule.tagId)) continue;
      const targets = pendingForRule(rule, cards, get().facts);
      if (!targets.length) continue;
      const tag = tags.find((t) => t.id === rule.tagId)!;
      await changeTags(targets, [{ tagId: rule.tagId, on: true }], `Règle auto « ${tag.name} » · ${targets.length} carte(s)`);
    }
  };

  return {
    loaded: false,
    facts: {},
    labels: {},
    rules: [],
    dismissed: new Set(),
    enriching: null,
    error: null,

    async load() {
      const [facts, labels, rules, dismissed] = await Promise.all([
        factsItem.getValue(),
        labelsItem.getValue(),
        rulesItem.getValue(),
        dismissedItem.getValue(),
      ]);
      set({ facts, labels, rules, dismissed: new Set(dismissed), loaded: true });
    },

    async analyze() {
      if (get().enriching) return;
      const { cards } = useCollection.getState();
      if (!cards.length) return;
      set({ enriching: { done: 0, total: 0 }, error: null });
      try {
        const { facts, labels } = await enrichCards(cards, (enriching) => set({ enriching }));
        set({ facts, labels });
        await runAutoRules();
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        set({ error: text });
        toast(`Analyse Wikidata impossible : ${text}`, 'error');
      } finally {
        set({ enriching: null });
      }
    },

    suggestions() {
      const { cards, tags } = useCollection.getState();
      const { facts, labels, dismissed, rules } = get();
      return computeSuggestions({ cards, facts, labels, tags, systemTagIds: systemIds(), dismissed, rules });
    },

    pending() {
      const { cards, tags } = useCollection.getState();
      const tagIds = new Set(tags.map((t) => t.id));
      return get()
        .rules.filter((r) => r.mode === 'review' && tagIds.has(r.tagId))
        .map((rule) => ({ rule, cards: pendingForRule(rule, cards, get().facts) }))
        .filter((p) => p.cards.length > 0);
    },

    async accept(suggestion, { name, color, cards, rule }) {
      const collection = useCollection.getState();
      let tag = suggestion.existingTag;
      if (!tag) {
        const existing = collection.tags.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
        tag = existing ?? (await collection.createTag(name, color));
      }
      if (!tag) return;
      if (cards.length) await collection.changeTags(cards, [{ tagId: tag.id, on: true }], `« ${tag.name} » · ${cards.length} carte(s)`);
      // Les cartes décochées ne doivent pas revenir via la règle.
      const excluded = suggestion.cards.filter((c) => !cards.includes(c)).map((c) => c.cardId);
      if (rule) await get().addRule(tag.id, suggestion.criterion, rule, excluded);
    },

    async dismiss(key) {
      const dismissed = new Set(get().dismissed).add(key);
      set({ dismissed });
      await dismissedItem.setValue([...dismissed]);
    },

    async addRule(tagId, criterion, mode, ignored = []) {
      const rule: Rule = { id: crypto.randomUUID(), tagId, criterion, mode, createdAt: Date.now(), ignored };
      await saveRules([...get().rules, rule]);
      toast(mode === 'auto' ? 'Règle automatique créée' : 'Règle créée : les nouvelles cartes arriveront ici pour validation', 'success');
    },

    async setRuleMode(ruleId, mode) {
      await saveRules(get().rules.map((r) => (r.id === ruleId ? { ...r, mode } : r)));
      if (mode === 'auto') await runAutoRules();
    },

    async deleteRule(ruleId) {
      await saveRules(get().rules.filter((r) => r.id !== ruleId));
    },

    async applyRule(rule, cards) {
      const tag = useCollection.getState().tags.find((t) => t.id === rule.tagId);
      if (!tag || !cards.length) return;
      await useCollection.getState().changeTags(cards, [{ tagId: rule.tagId, on: true }], `« ${tag.name} » · ${cards.length} carte(s)`);
    },

    async ignoreForRule(rule, cards) {
      const ids = new Set([...rule.ignored, ...cards.map((c) => c.cardId)]);
      await saveRules(get().rules.map((r) => (r.id === rule.id ? { ...r, ignored: [...ids] } : r)));
    },
  };
});
