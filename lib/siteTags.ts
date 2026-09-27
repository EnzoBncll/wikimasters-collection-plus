import type { SiteTagsApi } from './api';
import { currentUserId, rest, restAll } from './supabase';
import type { OwnedCard, SiteTag } from './types';

/** Taille des lots : insertion groupée en une requête, suppression via ?user_card_id=in.(…). */
const INSERT_CHUNK = 200;
const DELETE_CHUNK = 80;

const chunks = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const isConflict = (error: unknown) => (error as { status?: number })?.status === 409;

/**
 * Étiquettes natives de WikiMasters (Supabase) :
 *  - table `tags`           { id, user_id, name, color }
 *  - table `user_card_tags` { user_card_id, tag_id } — une ligne par exemplaire possédé.
 */
export const siteTagsApi: SiteTagsApi = {
  async list() {
    const userId = await currentUserId();
    const rows = await rest<any[]>(`tags?select=*&user_id=eq.${userId}&order=name.asc`);
    return rows.map((r): SiteTag => ({ id: r.id, name: r.name, color: r.color ?? null }));
  },

  async create(name, color) {
    const user_id = await currentUserId();
    const [row] = await rest<any[]>('tags', {
      method: 'POST',
      body: { user_id, name, color },
      prefer: 'return=representation',
    });
    return { id: row.id, name: row.name, color: row.color ?? null };
  },

  async update(tagId, patch) {
    await rest(`tags?id=eq.${tagId}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
  },

  async delete(tagId) {
    await rest(`user_card_tags?tag_id=eq.${tagId}`, { method: 'DELETE', prefer: 'return=minimal' });
    await rest(`tags?id=eq.${tagId}`, { method: 'DELETE', prefer: 'return=minimal' });
  },

  async assignments(tagIds) {
    const map = new Map<string, string[]>();
    if (!tagIds.length) return map;
    // Filtrer par nos propres étiquettes limite naturellement aux lignes de l'utilisateur.
    const rows = await restAll<{ user_card_id: string; tag_id: string }>(
      `user_card_tags?select=user_card_id,tag_id&tag_id=in.(${tagIds.join(',')})`,
    );
    for (const { user_card_id, tag_id } of rows) {
      const list = map.get(user_card_id) ?? [];
      if (!list.includes(tag_id)) list.push(tag_id);
      map.set(user_card_id, list);
    }
    return map;
  },

  async addMany(tagId, ownedIds) {
    for (const chunk of chunks(ownedIds, INSERT_CHUNK)) {
      const rows = chunk.map((user_card_id) => ({ user_card_id, tag_id: tagId }));
      try {
        await rest('user_card_tags', { method: 'POST', body: rows, prefer: 'return=minimal' });
      } catch (error) {
        if (!isConflict(error)) throw error;
        // Une ligne existait déjà : on repasse une par une en ignorant les doublons.
        for (const row of rows) {
          await rest('user_card_tags', { method: 'POST', body: row, prefer: 'return=minimal' }).catch((e) => {
            if (!isConflict(e)) throw e;
          });
        }
      }
    }
  },

  async removeMany(tagId, ownedIds) {
    for (const chunk of chunks(ownedIds, DELETE_CHUNK)) {
      await rest(`user_card_tags?tag_id=eq.${tagId}&user_card_id=in.(${chunk.join(',')})`, {
        method: 'DELETE',
        prefer: 'return=minimal',
      });
    }
  },
};

/**
 * Remplace les étiquettes des cartes par celles lues sur Supabase
 * (source de vérité : une étiquette retirée sur le site disparaît aussi du cache).
 */
export function setAssignments(cards: OwnedCard[], assignments: Map<string, string[]>) {
  for (const card of cards) {
    const union = new Set<string>();
    card.ownedTags = {};
    for (const ownedId of card.ownedIds) {
      const tags = assignments.get(ownedId) ?? [];
      card.ownedTags[ownedId] = tags;
      tags.forEach((t) => union.add(t));
    }
    card.tagIds = [...union];
  }
}
