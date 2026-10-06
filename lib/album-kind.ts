import { storage } from '#imports';
import type { SiteTag } from './types';

/**
 * Albums de collection et albums de rangement (option des réglages).
 * Le type est porté par le nom de l'étiquette sur le site, pour être visible sur WikiMasters :
 * une étiquette de rangement commence par « · », est grise et sans emoji ;
 * une étiquette de collection garde son emoji et une couleur vive.
 */

export type AlbumKind = 'collection' | 'storage';

export const STORAGE_PREFIX = '· ';
export const STORAGE_COLOR = '#71717a';

/** Emoji et couleur d'une étiquette avant son passage en rangement, pour les retrouver au retour en collection. */
const kindMemoryItem = storage.defineItem<Record<string, { emoji: string | null; color: string | null }>>('local:tagKindMemory', {
  fallback: {},
});

const LEADING_EMOJI = /^((?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)+)\s*/u;

export function kindOf(tag: SiteTag): AlbumKind {
  return tag.name.startsWith(STORAGE_PREFIX.trim()) ? 'storage' : 'collection';
}

/** Nom sans préfixe de rangement ni emoji de tête. */
export function bareName(name: string): string {
  let n = name.trim();
  if (n.startsWith(STORAGE_PREFIX.trim())) n = n.slice(STORAGE_PREFIX.trim().length).trim();
  return n.replace(LEADING_EMOJI, '').trim() || n;
}

/** Nom et couleur de l'étiquette une fois passée dans l'autre type. */
export async function switchKind(tag: SiteTag, fallbackColor: () => string): Promise<{ name: string; color: string }> {
  const memory = await kindMemoryItem.getValue();
  const bare = bareName(tag.name);
  if (kindOf(tag) === 'collection') {
    const emoji = tag.name.trim().match(LEADING_EMOJI)?.[1] ?? null;
    await kindMemoryItem.setValue({ ...memory, [tag.id]: { emoji, color: tag.color } });
    return { name: `${STORAGE_PREFIX}${bare}`, color: STORAGE_COLOR };
  }
  const saved = memory[tag.id];
  const color = saved?.color && saved.color.toLowerCase() !== STORAGE_COLOR ? saved.color : fallbackColor();
  return { name: saved?.emoji ? `${saved.emoji} ${bare}` : bare, color };
}
