import { storage } from '#imports';

/**
 * Introduction de l'article Wikipédia d'une carte (texte brut), pour la carte en grand.
 * Une requête légère à l'API publique de Wikipédia (CORS ouvert, sans clé), puis mise en cache locale.
 */

const TTL = 30 * 24 * 60 * 60 * 1000;

/** Par URL d'article : texte de l'introduction ('' quand l'article n'en a pas). */
const introCacheItem = storage.defineItem<Record<string, { text: string; at: number }>>('local:wikiIntros', { fallback: {} });

const memory = new Map<string, Promise<string | null>>();

function apiUrl(articleUrl: string): string | null {
  try {
    const url = new URL(articleUrl);
    if (!url.hostname.endsWith('wikipedia.org') || !url.pathname.startsWith('/wiki/')) return null;
    const title = decodeURIComponent(url.pathname.slice('/wiki/'.length));
    const params = new URLSearchParams({
      action: 'query',
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      redirects: '1',
      format: 'json',
      formatversion: '2',
      origin: '*',
      titles: title,
    });
    return `${url.origin}/w/api.php?${params}`;
  } catch {
    return null;
  }
}

async function load(articleUrl: string): Promise<string | null> {
  const cache = await introCacheItem.getValue();
  const hit = cache[articleUrl];
  if (hit && Date.now() - hit.at < TTL) return hit.text || null;
  const api = apiUrl(articleUrl);
  if (!api) return null;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Wikipédia : ${res.status}`);
  const data = (await res.json()) as { query?: { pages?: { extract?: string }[] } };
  const text = (data.query?.pages?.[0]?.extract ?? '')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n');
  const latest = await introCacheItem.getValue();
  await introCacheItem.setValue({ ...latest, [articleUrl]: { text, at: Date.now() } });
  return text || null;
}

/** Introduction de l'article, ou null s'il n'y en a pas. Les échecs réseau ne sont pas mis en cache. */
export function wikiIntro(articleUrl: string): Promise<string | null> {
  let pending = memory.get(articleUrl);
  if (!pending) {
    pending = load(articleUrl).catch((error) => {
      memory.delete(articleUrl);
      throw error;
    });
    memory.set(articleUrl, pending);
  }
  return pending;
}

/** Condensé : les deux premières phrases du premier paragraphe. */
export function condense(intro: string): string {
  const first = intro.split('\n')[0] ?? '';
  const sentences = first.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"(])/u);
  return sentences.slice(0, 2).join(' ');
}
