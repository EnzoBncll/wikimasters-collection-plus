import { BookOpen, ExternalLink, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { articleUrl, wikiIntro } from '@/lib/wiki-intro';
import { articleTitle, enrichCards, PROPS, type PropId } from '@/lib/wikidata';
import type { OwnedCard } from '@/lib/types';
import { summary, type Summary } from './wiki-peek';

/**
 * Volet Wikipédia du mode revue : l'article de la carte affichée, pour décider où la ranger.
 * Image et description (résumé REST), introduction complète, faits Wikidata (nature, métier, pays…)
 * et plan de l'article, chaque section ouvrant l'article au bon endroit.
 */

interface Section {
  line: string;
  anchor: string;
  level: number;
}

const sectionsCache = new Map<string, Promise<Section[]>>();

/** Plan de l'article (titres de niveau 2 et 3), gardé en mémoire le temps de la session. */
function sections(url: string): Promise<Section[]> {
  let p = sectionsCache.get(url);
  if (!p) {
    p = (async () => {
      const u = new URL(url);
      const page = decodeURIComponent(u.pathname.slice('/wiki/'.length));
      const params = new URLSearchParams({ action: 'parse', page, prop: 'sections', redirects: '1', format: 'json', formatversion: '2', origin: '*' });
      const res = await fetch(`${u.origin}/w/api.php?${params}`);
      if (!res.ok) return [];
      const json = await res.json();
      return ((json.parse?.sections ?? []) as any[])
        .map((s) => ({ line: String(s.line ?? '').replace(/<[^>]+>/g, ''), anchor: String(s.anchor ?? ''), level: Number(s.toclevel) || 1 }))
        .filter((s) => s.level <= 2 && !/^(Notes|Références|Voir aussi|Liens externes|Bibliographie|Annexes)/i.test(s.line));
    })().catch(() => []);
    sectionsCache.set(url, p);
  }
  return p;
}

interface Context {
  summary: Summary | null;
  intro: string | null;
  facts: { label: string; values: string[] }[];
  sections: Section[];
}

function useWikiContext(card: OwnedCard): Context | null | undefined {
  const [data, setData] = useState<Context | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setData(undefined);
    const url = articleUrl(card.title, card.wikipediaUrl);
    if (!url) {
      setData(null);
      return;
    }
    const facts = enrichCards([card])
      .then(({ facts: all, labels }) =>
        (Object.keys(PROPS) as PropId[])
          .map((pid) => ({ label: PROPS[pid], values: (all[card.cardId]?.props[pid] ?? []).map((q) => labels[q] ?? q) }))
          .filter((f) => f.values.length),
      )
      .catch(() => []);
    Promise.all([summary(articleTitle(card)), wikiIntro(url).catch(() => null), facts, sections(url)]).then(([s, intro, f, secs]) => {
      if (alive) setData(s || intro ? { summary: s, intro, facts: f, sections: secs } : null);
    });
    return () => {
      alive = false;
    };
  }, [card.cardId]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}

export function WikiContext({ card, onClose }: { card: OwnedCard; onClose: () => void }) {
  const data = useWikiContext(card);
  const url = articleUrl(card.title, card.wikipediaUrl);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <BookOpen className="size-3.5 text-white/50" />
        <p className="text-[10.5px] font-semibold tracking-[0.14em] text-white/50 uppercase">Wikipédia</p>
        <button type="button" onClick={onClose} title="Masquer le volet (I)" className="ml-auto grid size-7 cursor-pointer place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {data === undefined ? (
          <p className="flex items-center gap-2 py-6 text-sm text-white/50">
            <Loader2 className="size-4 animate-spin" /> {card.title}
          </p>
        ) : data === null ? (
          <p className="py-6 text-sm text-white/50">Pas d’article trouvé pour « {card.title} ».</p>
        ) : (
          <div className="space-y-4">
            {data.summary?.thumbnail && <img src={data.summary.thumbnail} alt="" className="max-h-44 w-full rounded-xl bg-white/5 object-cover" />}
            <div>
              <p className="font-heading text-lg leading-tight font-bold">{data.summary?.title ?? card.title}</p>
              {data.summary?.description && <p className="mt-0.5 text-xs text-white/55">{data.summary.description}</p>}
            </div>
            {data.facts.length > 0 && (
              <dl className="space-y-1.5">
                {data.facts.map((f) => (
                  <div key={f.label} className="flex gap-2 text-xs">
                    <dt className="w-24 shrink-0 text-white/45">{f.label}</dt>
                    <dd className="flex flex-wrap gap-1">
                      {f.values.map((v) => (
                        <span key={v} className="rounded-full bg-white/10 px-2 py-0.5 text-white/85">
                          {v}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {(data.intro ?? data.summary?.extract) && (
              <div className="space-y-2 text-[13px] leading-relaxed text-white/80">
                {(data.intro ?? data.summary!.extract).split('\n').map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
            {data.sections.length > 0 && url && (
              <div>
                <p className="mb-1.5 text-[10.5px] font-semibold tracking-[0.14em] text-white/45 uppercase">Dans l’article</p>
                <ul className="space-y-0.5">
                  {data.sections.map((s) => (
                    <li key={s.anchor}>
                      <a
                        href={`${url}#${encodeURIComponent(s.anchor)}`}
                        target="_blank"
                        rel="noopener"
                        className={`block truncate rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white ${s.level > 1 ? 'pl-5 text-white/50' : ''}`}
                      >
                        {s.line}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {url && (
              <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Ouvrir l’article <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
