import { storage } from '#imports';
import type { SiteTag } from './types';

/**
 * Type d'une étiquette, lu dans son nom et sa couleur sur le site : le même compte WikiMasters
 * ouvert sur un autre ordinateur retrouve donc le même classement.
 *  - rangement : « · Nom », gris, sans emoji ;
 *  - album à objectif : « ◇ Nom » (anciennement « 🎯 Nom ») (sa liste fermée est dans l'extension, lib/goal-albums.ts) ;
 *  - collection : emoji et couleur vive ;
 *  - collection finie : nom terminé par « ✓ », couleur or.
 */

export type AlbumKind = 'goal' | 'collection' | 'finished' | 'storage';

export const STORAGE_PREFIX = '· ';
export const GOAL_PREFIX = '◇ ';
/** Préfixe des versions 0.8.3 : encore reconnu, remplacé par « ◇ » d'un clic. */
const LEGACY_GOAL_PREFIX = '🎯';
export const STORAGE_COLOR = '#71717a';
export const FINISHED_SUFFIX = ' ✓';
export const FINISHED_COLOR = '#eab308';

/** Emoji et couleur d'une étiquette avant son passage en rangement ou en finie, pour les retrouver au retour. */
const kindMemoryItem = storage.defineItem<Record<string, { emoji: string | null; color: string | null }>>('local:tagKindMemory', {
  fallback: {},
});

const LEADING_EMOJI = /^((?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)+)\s*/u;
const TRAILING_CHECK = /\s*[✓✔]\s*$/u;

export function kindOf(tag: Pick<SiteTag, 'name'>): AlbumKind {
  const name = tag.name.trim();
  if (name.startsWith(STORAGE_PREFIX.trim())) return 'storage';
  if (TRAILING_CHECK.test(name)) return 'finished';
  if (name.startsWith(GOAL_PREFIX.trim()) || name.startsWith(LEGACY_GOAL_PREFIX)) return 'goal';
  return 'collection';
}

/** L'album porte déjà le préfixe actuel « ◇ ». */
export const hasGoalPrefix = (name: string) => name.trim().startsWith(GOAL_PREFIX.trim());

/** Nom d'album à objectif : « ◇ » à la place de l'emoji de tête (et sans « ✓ »). */
export function goalName(name: string): string {
  return `${GOAL_PREFIX}${bareName(name)}`;
}

export const isStorage = (tag: Pick<SiteTag, 'name'>) => kindOf(tag) === 'storage';

/** Nom sans préfixe de rangement, sans « ✓ » final ni emoji de tête. */
export function bareName(name: string): string {
  let n = name.trim();
  if (n.startsWith(STORAGE_PREFIX.trim())) n = n.slice(STORAGE_PREFIX.trim().length).trim();
  if (n.startsWith(GOAL_PREFIX.trim())) n = n.slice(GOAL_PREFIX.trim().length).trim();
  n = n.replace(TRAILING_CHECK, '').trim();
  return n.replace(LEADING_EMOJI, '').trim() || n;
}

/** Nom sans « ✓ » final (garde l'emoji). */
const withoutCheck = (name: string) => name.trim().replace(TRAILING_CHECK, '').trim();

async function remember(tag: SiteTag) {
  const memory = await kindMemoryItem.getValue();
  const emoji = withoutCheck(tag.name).match(LEADING_EMOJI)?.[1] ?? null;
  const prev = memory[tag.id];
  // La couleur or (finie) ou grise (rangement) n'est jamais la couleur « d'origine ».
  const color = tag.color && ![FINISHED_COLOR, STORAGE_COLOR].includes(tag.color.toLowerCase()) ? tag.color : (prev?.color ?? null);
  await kindMemoryItem.setValue({ ...memory, [tag.id]: { emoji: emoji ?? prev?.emoji ?? null, color } });
}

async function restored(tag: SiteTag, fallbackColor: () => string) {
  const saved = (await kindMemoryItem.getValue())[tag.id];
  const color = saved?.color ?? fallbackColor();
  const emoji = withoutCheck(tag.name).match(LEADING_EMOJI)?.[1] ?? saved?.emoji ?? null;
  return { emoji, color };
}

/** Nom et couleur de l'étiquette une fois passée entre collection et rangement. */
export async function switchKind(tag: SiteTag, fallbackColor: () => string): Promise<{ name: string; color: string }> {
  const bare = bareName(tag.name);
  if (kindOf(tag) !== 'storage') {
    await remember(tag);
    return { name: `${STORAGE_PREFIX}${bare}`, color: STORAGE_COLOR };
  }
  const { emoji, color } = await restored(tag, fallbackColor);
  return { name: emoji ? `${emoji} ${bare}` : bare, color };
}

/** Nom et couleur de l'étiquette marquée finie, ou rouverte. */
export async function toggleFinished(tag: SiteTag, fallbackColor: () => string): Promise<{ name: string; color: string }> {
  if (kindOf(tag) === 'finished') {
    const { color } = await restored(tag, fallbackColor);
    return { name: withoutCheck(tag.name), color };
  }
  await remember(tag);
  const base = kindOf(tag) === 'storage' ? bareName(tag.name) : withoutCheck(tag.name);
  return { name: `${base}${FINISHED_SUFFIX}`, color: FINISHED_COLOR };
}

/** Collections finies d'abord, puis les albums à objectif, les autres collections, les rangements ; ordre alphabétique sinon. */
export function byKind(a: Pick<SiteTag, 'name'>, b: Pick<SiteTag, 'name'>): number {
  const rank: Record<AlbumKind, number> = { finished: 0, goal: 1, collection: 2, storage: 3 };
  return rank[kindOf(a)] - rank[kindOf(b)] || bareName(a.name).localeCompare(bareName(b.name), 'fr');
}
