import { ArrowLeft, ArrowLeftRight, Loader2, RefreshCw, UserSearch, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/hooks/use-collection';
import { toast } from '@/hooks/use-toast';
import { bareName } from '@/lib/album-kind';
import {
  compareAlbum,
  fetchFriendCollection,
  forgetFriendCollection,
  friendCollectionsItem,
  listFriends,
  theirOtherGoals,
  type AlbumComparison,
  type Friend,
  type FriendCollection,
} from '@/lib/friends';
import { goalAlbumsItem, matchEntries, type GoalAlbum } from '@/lib/goal-albums';
import type { SiteTag } from '@/lib/types';
import { cn } from '@/lib/utils';
import { factsItem } from '@/lib/wikidata';
import { ago } from './sync-status';

/**
 * Onglet « Comparer » du nuage : la collection d'un ami (ou de n'importe quel joueur dont le profil est visible),
 * confrontée à mes albums à objectif. Lecture seule, au clic ; la collection lue reste en cache local.
 */

interface Row {
  tag: SiteTag;
  goal: GoalAlbum;
  cmp: AlbumComparison;
}

export function CompareTab() {
  const tags = useCollection((s) => s.tags);
  const cards = useCollection((s) => s.cards);
  const [goals, setGoals] = useState<Record<string, GoalAlbum>>({});
  const [facts, setFacts] = useState<Awaited<ReturnType<typeof factsItem.getValue>>>({});
  const [cache, setCache] = useState<Record<string, FriendCollection>>({});
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [pseudo, setPseudo] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ pseudo: string; cards: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void goalAlbumsItem.getValue().then(setGoals);
    void factsItem.getValue().then(setFacts);
    void friendCollectionsItem.getValue().then(setCache);
    const a = goalAlbumsItem.watch(setGoals);
    const b = friendCollectionsItem.watch(setCache);
    listFriends().then(setFriends, (e) => (setFriends([]), setFriendsError((e as Error).message)));
    return () => (a(), b());
  }, []);

  const friend = current ? cache[current.toLowerCase()] ?? null : null;

  const read = async (name: string) => {
    if (loading) return;
    setLoading({ pseudo: name, cards: 0 });
    try {
      const col = await fetchFriendCollection(name, (_, n) => setLoading({ pseudo: name, cards: n }));
      setCurrent(col.pseudo);
      setOpen(null);
      toast(`Collection de ${col.pseudo} lue : ${col.cards.length} cartes`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(null);
    }
  };
  const pick = (name: string) => {
    setOpen(null);
    if (cache[name.toLowerCase()]) setCurrent(cache[name.toLowerCase()]!.pseudo);
    else void read(name);
  };

  const rows = useMemo<Row[]>(() => {
    if (!friend) return [];
    return tags
      .filter((t) => goals[t.id])
      .map((tag) => {
        const goal = goals[tag.id]!;
        const mine = new Set(matchEntries(goal.entries, cards, facts).keys());
        return { tag, goal, cmp: compareAlbum(goal, tag.name, mine, friend) };
      })
      .sort((a, b) => Number(b.cmp.sameAlbum) - Number(a.cmp.sameAlbum) || b.cmp.onlyTheirs.length - a.cmp.onlyTheirs.length);
  }, [friend, tags, goals, cards, facts]);
  const others = useMemo(() => (friend ? theirOtherGoals(friend, tags.filter((t) => goals[t.id]).map((t) => t.name)) : []), [friend, tags, goals]);
  const detail = rows.find((r) => r.tag.id === open) ?? null;

  const known = useMemo(() => {
    const names = new Map<string, string>();
    for (const f of friends ?? []) names.set(f.username.toLowerCase(), f.username);
    for (const c of Object.values(cache)) if (!names.has(c.pseudo.toLowerCase())) names.set(c.pseudo.toLowerCase(), c.pseudo);
    return [...names.values()];
  }, [friends, cache]);

  return (
    <div className="space-y-4 px-6 py-4">
      <p className="text-xs text-muted-foreground">
        Compare tes albums à objectif avec la collection d’un ami : sa progression à côté de la tienne, et les cartes qu’il a et qui te manquent (de bonnes idées d’échange). Collection+ lit sa collection comme le fait sa page de profil sur WikiMasters, sans rien écrire ; elle reste sur ton ordinateur.
      </p>

      <div className="space-y-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pseudo.trim()) void read(pseudo.trim());
          }}
        >
          <Input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="Pseudo WikiMasters" className="h-9" />
          <Button type="submit" size="sm" disabled={!pseudo.trim() || Boolean(loading)}>
            <UserSearch className="size-4" /> Lire
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {friends === null && <span className="text-xs text-muted-foreground">Chargement de tes amis…</span>}
          {friendsError && <span className="text-xs text-muted-foreground">Amis indisponibles ({friendsError}) : tape un pseudo.</span>}
          {known.map((name) => {
            const cached = cache[name.toLowerCase()];
            return (
              <button
                key={name}
                type="button"
                onClick={() => pick(name)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  current?.toLowerCase() === name.toLowerCase() ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
                title={cached ? `Lue ${ago(cached.at)}` : 'Pas encore lue'}
              >
                {name}
                {cached && <span className="ml-1 opacity-60">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lecture de la collection de {loading.pseudo}… {loading.cards ? `${loading.cards} cartes` : ''}
        </p>
      )}

      {friend && !loading && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs">
            <span>
              <b className="text-sm">{friend.pseudo}</b> · {friend.cards.length} cartes · lue {ago(friend.at)}
            </span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => read(friend.pseudo)}>
                <RefreshCw className="size-4" /> Relire
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await forgetFriendCollection(friend.pseudo);
                  setCurrent(null);
                }}
              >
                <X className="size-4" /> Oublier
              </Button>
            </span>
          </div>

          {detail ? (
            <Detail row={detail} friend={friend} onBack={() => setOpen(null)} />
          ) : rows.length ? (
            <div className="space-y-2">
              {rows.map((r) => (
                <button key={r.tag.id} type="button" onClick={() => setOpen(r.tag.id)} className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-accent/50">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.tag.color ?? 'var(--primary)' }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{bareName(r.tag.name)}</span>
                    {r.cmp.sameAlbum && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">album en commun</span>}
                    {r.cmp.onlyTheirs.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-trade">
                        <ArrowLeftRight className="size-3.5" /> {r.cmp.onlyTheirs.length}
                      </span>
                    )}
                  </div>
                  <Bars cmp={r.cmp} them={friend.pseudo} />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Tu n’as pas encore d’album à objectif à comparer.</p>
          )}

          {!detail && others.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Ses autres albums à objectif : {others.map((n) => `« ${n} »`).join(', ')}. Pour les comparer, demande-lui le lien de partage (nuage › Partager).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Bars({ cmp, them }: { cmp: AlbumComparison; them: string }) {
  const pct = (n: number) => Math.round((n / Math.max(1, cmp.total)) * 100);
  return (
    <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span>Toi</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct(cmp.mine)}%` }} />
      </div>
      <span className="tabular-nums">
        {cmp.mine}/{cmp.total}
      </span>
      <span className="max-w-20 truncate">{them}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-trade" style={{ width: `${pct(cmp.theirs)}%` }} />
      </div>
      <span className="tabular-nums">
        {cmp.theirs}/{cmp.total}
      </span>
    </div>
  );
}

function Detail({ row, friend, onBack }: { row: Row; friend: FriendCollection; onBack: () => void }) {
  const theirByTitle = useMemo(() => new Map(friend.cards.map((c) => [c.t.toLowerCase(), c])), [friend]);
  const groups: { title: string; hint: string; idx: number[]; tone: string }[] = [
    { title: `${friend.pseudo} l’a, pas toi`, hint: 'Idées d’échange', idx: row.cmp.onlyTheirs, tone: 'border-trade/60' },
    { title: `Toi oui, ${friend.pseudo} non`, hint: 'Ce que tu peux lui proposer', idx: row.cmp.onlyMine, tone: 'border-primary/60' },
    { title: 'Manque aux deux', hint: '', idx: row.cmp.nobody, tone: 'border-dashed' },
    { title: 'Vous l’avez tous les deux', hint: '', idx: row.cmp.both, tone: '' },
  ];
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {bareName(row.tag.name)}
      </button>
      <Bars cmp={row.cmp} them={friend.pseudo} />
      {groups
        .filter((g) => g.idx.length)
        .map((g) => (
          <section key={g.title} className="space-y-1.5">
            <p className="text-xs font-semibold">
              {g.title} <span className="font-normal text-muted-foreground">· {g.idx.length}{g.hint ? ` · ${g.hint}` : ''}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {g.idx.map((i) => {
                const e = row.goal.entries[i]!;
                const their = theirByTitle.get(e.title.toLowerCase());
                return (
                  <a
                    key={i}
                    href={`https://fr.wikipedia.org/wiki/${encodeURIComponent(e.title.replace(/ /g, '_'))}`}
                    target="_blank"
                    rel="noreferrer"
                    className={cn('rounded-lg border px-2 py-1 text-xs hover:bg-accent', g.tone)}
                    title={e.description ?? undefined}
                  >
                    <span className="mr-1 text-muted-foreground tabular-nums">{i + 1}</span>
                    {e.title}
                    {their?.r && <span className="ml-1 font-semibold text-muted-foreground">{their.r}</span>}
                  </a>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
