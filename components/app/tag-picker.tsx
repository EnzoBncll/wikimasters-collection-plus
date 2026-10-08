import { Check, Minus, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/hooks/use-collection';
import type { OwnedCard } from '@/lib/types';
import { systemTagIds } from '@/lib/trade';
import { cn } from '@/lib/utils';
import { randomTagColor } from '@/lib/tag-colors';

/**
 * Liste des étiquettes perso avec état pour la sélection (toutes / certaines / aucune).
 * Clic = pose sur toutes les cartes sélectionnées, ou retire si toutes l'ont déjà.
 * Les changements restent en attente jusqu'à « Envoyer sur WikiMasters ».
 */
export function TagPicker({ cards, onDone }: { cards: OwnedCard[]; onDone?: () => void }) {
  const { tags, tradeTags, stageTags, createTag, job } = useCollection();
  const [query, setQuery] = useState('');

  const systemIds = systemTagIds(tradeTags);
  const ownTags = tags.filter((t) => !systemIds.has(t.id));
  const q = query.trim().toLowerCase();
  const filtered = ownTags.filter((t) => !q || t.name.toLowerCase().includes(q));
  const exact = ownTags.some((t) => t.name.toLowerCase() === q);

  const coverage = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) for (const id of c.tagIds) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [cards]);

  const toggle = (tagId: string) => {
    const all = coverage.get(tagId) === cards.length;
    stageTags(cards, [{ tagId, on: !all }]);
  };

  const create = async () => {
    const tag = await createTag(query, randomTagColor());
    if (tag) {
      setQuery('');
      stageTags(cards, [{ tagId: tag.id, on: true }]);
      onDone?.();
    }
  };

  return (
    <div className="w-64">
      <div className="relative border-b p-2">
        <Search className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q && !exact) create();
            e.stopPropagation();
          }}
          placeholder="Chercher ou créer…"
          className="h-8 pl-7"
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {filtered.map((tag) => {
          const n = coverage.get(tag.id) ?? 0;
          const state = n === 0 ? 'none' : n === cards.length ? 'all' : 'some';
          return (
            <button
              key={tag.id}
              type="button"
              disabled={Boolean(job)}
              onClick={() => toggle(tag.id)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded border',
                  state !== 'none' && 'border-transparent bg-primary text-primary-foreground',
                )}
              >
                {state === 'all' && <Check className="size-3" />}
                {state === 'some' && <Minus className="size-3" />}
              </span>
              <span className="size-2.5 rounded-full" style={{ backgroundColor: tag.color ?? 'var(--muted-foreground)' }} />
              <span className="truncate">{tag.name}</span>
              {state === 'some' && <span className="ml-auto text-xs text-muted-foreground">{n}/{cards.length}</span>}
            </button>
          );
        })}
        {q && !exact && (
          <button
            type="button"
            onClick={create}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-muted"
          >
            <Plus className="size-3.5" /> Créer « {query.trim()} »
          </button>
        )}
        {!q && ownTags.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">Tape un nom pour créer ta première étiquette.</p>
        )}
      </div>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">En attente jusqu'à « Envoyer » (en bas de la barre latérale).</p>
    </div>
  );
}
