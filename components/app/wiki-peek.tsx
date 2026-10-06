import { ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveTitles } from '@/lib/goal-albums';

interface Summary {
  title: string;
  description: string | null;
  extract: string;
  thumbnail: string | null;
  url: string;
}

const summaries = new Map<string, Promise<Summary | null>>();

/** Résumé d'un article (API REST de Wikipédia), gardé en mémoire le temps de la session. */
function summary(title: string): Promise<Summary | null> {
  let p = summaries.get(title);
  if (!p) {
    p = fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d
          ? {
              title: d.title,
              description: d.description ?? null,
              extract: d.extract ?? '',
              thumbnail: d.thumbnail?.source ?? null,
              url: d.content_urls?.desktop?.page ?? `https://fr.wikipedia.org/wiki/${encodeURIComponent(title)}`,
            }
          : null,
      )
      .catch(() => null);
    summaries.set(title, p);
  }
  return p;
}

const W = 300;

/**
 * Aperçu de l'article Wikipédia au survol (après un court délai) : image, description, début de l'introduction.
 * Enveloppe n'importe quel élément ; le survol de l'aperçu lui-même le garde ouvert.
 */
export function WikiPeek({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timers = useRef<{ open?: number; close?: number }>({});
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [data, setData] = useState<Summary | null | undefined>(undefined);

  useEffect(() => () => (window.clearTimeout(timers.current.open), window.clearTimeout(timers.current.close)), []);

  const enter = () => {
    window.clearTimeout(timers.current.close);
    timers.current.open = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const right = r.right + 10 + W < window.innerWidth;
      setPos({ x: right ? r.right + 10 : Math.max(8, r.left - 10 - W), y: Math.min(r.top, window.innerHeight - 340) });
      summary(title).then(setData);
    }, 380);
  };
  const leave = () => {
    window.clearTimeout(timers.current.open);
    timers.current.close = window.setTimeout(() => setPos(null), 160);
  };

  return (
    <span ref={ref} onMouseEnter={enter} onMouseLeave={leave} className={className}>
      {children}
      {pos &&
        createPortal(
          <div
            onMouseEnter={() => window.clearTimeout(timers.current.close)}
            onMouseLeave={leave}
            className="fixed z-[90] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl"
            style={{ left: pos.x, top: Math.max(8, pos.y), width: W }}
          >
            {data === undefined ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {title}
              </p>
            ) : data === null ? (
              <p className="p-4 text-sm text-muted-foreground">Pas d'aperçu pour « {title} ».</p>
            ) : (
              <>
                {data.thumbnail && <img src={data.thumbnail} alt="" className="h-36 w-full bg-muted object-cover" />}
                <div className="space-y-1.5 p-3.5">
                  <p className="font-semibold leading-tight">{data.title}</p>
                  {data.description && <p className="text-xs text-muted-foreground">{data.description}</p>}
                  <p className="line-clamp-6 text-xs leading-relaxed">{data.extract}</p>
                  <a href={data.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-primary hover:underline">
                    Ouvrir l'article <ExternalLink className="size-3" />
                  </a>
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

const thumbs = new Map<string, string | null>();

/** Miniatures d'une liste d'articles, demandées par lots de 50 et gardées en mémoire. */
export function useThumbnails(titles: string[]) {
  const [, bump] = useState(0);
  const key = titles.join('|');
  useEffect(() => {
    const missing = titles.filter((t) => !thumbs.has(t));
    if (!missing.length) return;
    let alive = true;
    for (const t of missing) thumbs.set(t, null);
    resolveTitles(missing)
      .then((all) => {
        for (const [t, e] of all) thumbs.set(t, e.thumbnail ?? null);
        if (alive) bump((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (title: string) => thumbs.get(title) ?? null;
}
