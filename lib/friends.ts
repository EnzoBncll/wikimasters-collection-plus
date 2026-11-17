import { storage } from '#imports';
import { apiJson } from './api';
import { bareName, hasGoalPrefix } from './album-kind';
import { titleKey, type GoalAlbum } from './goal-albums';
import { currentUserId } from './supabase';
import type { Rarity } from './types';

/**
 * Comparer ses albums à objectif avec la collection d'un autre joueur.
 * Le site montre déjà la collection d'un joueur sur sa page de profil : on lit les mêmes routes que lui, en lecture
 * seule, uniquement quand on clique (`/api/friends`, `/api/profile/{pseudo}/collection`). Rien n'est écrit sur le site,
 * rien ne part ailleurs. Une copie réduite (titre, rareté, image) est gardée en cache local pour ne pas relire
 * à chaque fois une collection qui peut prendre 30 s.
 * La liste des cases d'un album n'est pas sur le site : la comparaison se fait sur MES albums à objectif
 * (ceux qu'il a aussi, souvent reçus par un lien de partage, sont repérés par leur nom d'étiquette).
 */

export interface Friend {
  id: string | null;
  username: string;
}

export interface FriendCard {
  /** Titre de l'article (wikipedia_title). */
  t: string;
  r: Rarity | null;
  i: string | null;
}

export interface FriendCollection {
  pseudo: string;
  at: number;
  cards: FriendCard[];
  /** Noms de ses étiquettes (tagOptions), quand le site les donne. */
  tags: string[];
}

const MAX_PAGES = 200;
const KEEP = 12;

export const friendCollectionsItem = storage.defineItem<Record<string, FriendCollection>>('local:friendCollections', { fallback: {} });

const str = (...values: unknown[]) => values.find((v): v is string => typeof v === 'string' && v.trim() !== '') ?? null;

/** Amis acceptés (l'autre côté de chaque amitié). */
export async function listFriends(): Promise<Friend[]> {
  const [json, me] = await Promise.all([apiJson<any>('/api/friends'), currentUserId().catch(() => null)]);
  const rows: any[] = Array.isArray(json?.friendships) ? json.friendships : Array.isArray(json?.friends) ? json.friends : Array.isArray(json) ? json : [];
  const out = new Map<string, Friend>();
  for (const row of rows) {
    if (row?.status && !/accept/i.test(String(row.status))) continue;
    const sides = [row?.requester, row?.addressee, row?.friend, row?.user].filter((s) => s && typeof s === 'object');
    const other = sides.find((s) => s.id !== me) ?? sides[0] ?? row;
    const username = str(other?.username, other?.pseudo, other?.name);
    if (username && other?.id !== me) out.set(username.toLowerCase(), { id: other?.id ?? null, username });
  }
  return [...out.values()].sort((a, b) => a.username.localeCompare(b.username, 'fr'));
}

/** Toute la collection visible d'un joueur, page par page (50 par page côté site). */
export async function fetchFriendCollection(pseudo: string, onPage?: (page: number, cards: number) => void): Promise<FriendCollection> {
  const clean = pseudo.trim().replace(/^@/, '');
  if (!clean) throw new Error('Indique un pseudo.');
  const base = `/api/profile/${encodeURIComponent(clean)}/collection`;
  const byTitle = new Map<string, FriendCard>();
  let tags: string[] = [];
  let total: number | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let json: any;
    try {
      json = await apiJson<any>(`${base}?page=${page}&sort=rarity&stats=0`);
    } catch (e) {
      if (page === 0 && /HTTP 404/.test((e as Error).message)) throw new Error(`Joueur « ${clean} » introuvable sur WikiMasters.`);
      if (page === 0 && /HTTP 40[13]/.test((e as Error).message)) throw new Error(`La collection de « ${clean} » n’est pas visible pour toi.`);
      throw e;
    }
    const entries: any[] = Array.isArray(json?.collection) ? json.collection : Array.isArray(json?.cards) ? json.cards : [];
    if (page === 0) {
      total = typeof json?.total === 'number' ? json.total : null;
      const opts: any[] = Array.isArray(json?.tagOptions) ? json.tagOptions : [];
      tags = opts.map((o) => (typeof o === 'string' ? o : str(o?.name, o?.label))).filter((n): n is string => Boolean(n));
    }
    if (!entries.length) break;
    for (const entry of entries) {
      const card = entry?.card ?? entry;
      const t = str(card?.wikipedia_title, entry?.wikipedia_title, card?.title);
      if (!t) continue;
      const key = titleKey(t);
      if (!byTitle.has(key)) byTitle.set(key, { t, r: (card?.rarity ?? entry?.snapshot_rarity ?? null) as Rarity | null, i: str(card?.image_url, entry?.image_url) });
    }
    onPage?.(page, byTitle.size);
    if (json?.has_more === false || json?.hasMore === false) break;
    if (total !== null && (page + 1) * 50 >= total) break;
    if (entries.length < 50) break;
  }
  const result: FriendCollection = { pseudo: clean, at: Date.now(), cards: [...byTitle.values()], tags };
  const all = await friendCollectionsItem.getValue();
  const kept = Object.values({ ...all, [clean.toLowerCase()]: result })
    .sort((a, b) => b.at - a.at)
    .slice(0, KEEP);
  await friendCollectionsItem.setValue(Object.fromEntries(kept.map((c) => [c.pseudo.toLowerCase(), c])));
  return result;
}

export async function forgetFriendCollection(pseudo: string) {
  const all = { ...(await friendCollectionsItem.getValue()) };
  delete all[pseudo.toLowerCase()];
  await friendCollectionsItem.setValue(all);
}

export interface AlbumComparison {
  total: number;
  mine: number;
  theirs: number;
  /** Indices des cases : lui oui / moi non (idées d'échange), moi oui / lui non, personne. */
  onlyTheirs: number[];
  onlyMine: number[];
  nobody: number[];
  both: number[];
  /** Il a aussi une étiquette d'album à objectif de ce nom. */
  sameAlbum: boolean;
}

/** Compare un de mes albums à objectif avec la collection d'un joueur (cases déjà remplies chez moi : `mineIdx`). */
export function compareAlbum(goal: GoalAlbum, albumName: string, mineIdx: Set<number>, friend: FriendCollection): AlbumComparison {
  const theirs = new Set(friend.cards.map((c) => titleKey(c.t)));
  const out: AlbumComparison = { total: goal.entries.length, mine: 0, theirs: 0, onlyTheirs: [], onlyMine: [], nobody: [], both: [], sameAlbum: false };
  goal.entries.forEach((e, i) => {
    const me = mineIdx.has(i);
    const them = theirs.has(titleKey(e.title));
    if (me) out.mine++;
    if (them) out.theirs++;
    (me && them ? out.both : me ? out.onlyMine : them ? out.onlyTheirs : out.nobody).push(i);
  });
  const name = bareName(albumName).toLowerCase();
  out.sameAlbum = friend.tags.some((t) => hasGoalPrefix(t) && bareName(t).toLowerCase() === name);
  return out;
}

/** Ses albums à objectif (d'après ses étiquettes) que je n'ai pas : il faudra qu'il les partage. */
export function theirOtherGoals(friend: FriendCollection, myAlbumNames: string[]): string[] {
  const mine = new Set(myAlbumNames.map((n) => bareName(n).toLowerCase()));
  return friend.tags.filter((t) => hasGoalPrefix(t) && !mine.has(bareName(t).toLowerCase())).map(bareName);
}
