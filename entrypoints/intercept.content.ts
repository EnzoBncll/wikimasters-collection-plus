import { defineContentScript } from '#imports';

/**
 * Tourne dans le contexte de la page (MAIN world) : repère les requêtes du site qui modifient
 * la collection (tout POST/PUT/PATCH/DELETE sur /api/…) et prévient le content script
 * pour que le cache soit rechargé complètement la prochaine fois.
 * Lit une copie de la réponse pour repérer les cartes reçues. N'altère ni les requêtes ni les réponses ; s'enchaîne avec d'autres extensions qui patchent fetch.
 */
export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    const IGNORED = /^\/api\/(auth|push|broadcast|notifications)/;

    /** Identifiants présents dans la réponse (cartes reçues d'un paquet, d'un échange…). */
    const collectIds = (value: unknown, out = new Set<string>(), depth = 0): Set<string> => {
      if (out.size >= 500 || depth > 8 || value === null) return out;
      if (typeof value === 'string') {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) out.add(value);
      } else if (typeof value === 'number' && Number.isInteger(value) && value >= 1000) out.add(String(value));
      else if (typeof value === 'object') for (const v of Object.values(value as object)) collectIds(v, out, depth + 1);
      return out;
    };

    const isMutation = (method: string | undefined) => !!method && !['GET', 'HEAD'].includes(method.toUpperCase());

    const notify = (method: string | undefined, rawUrl: string | URL | undefined, ok: boolean, body?: unknown) => {
      if (!ok || !rawUrl || !isMutation(method)) return;
      let path: string;
      try {
        const url = new URL(String(rawUrl), location.origin);
        if (url.origin !== location.origin) return;
        path = url.pathname;
      } catch {
        return;
      }
      if (!path.startsWith('/api/') || IGNORED.test(path)) return;
      let ids: string[] = [];
      try {
        ids = [...collectIds(typeof body === 'string' ? JSON.parse(body) : body)];
      } catch {}
      window.postMessage({ source: 'wmt-intercept', type: 'collection-changed', path, ids }, location.origin);
    };

    const originalFetch = window.fetch;
    window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      const [input, init] = args;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      const url = input instanceof Request ? input.url : input;
      const promise = originalFetch.apply(this, args);
      promise
        .then(async (res) => {
          if (!isMutation(method)) return;
          const body = res.ok ? await res.clone().json().catch(() => null) : null;
          notify(method, url, res.ok, body);
        })
        .catch(() => {});
      return promise;
    } as typeof fetch;

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
      this.addEventListener(
        'load',
        () => {
          const body = this.responseType === '' || this.responseType === 'text' ? this.responseText : this.responseType === 'json' ? this.response : null;
          notify(method, url, this.status >= 200 && this.status < 300, body);
        },
        { once: true },
      );
      return (originalOpen as any).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;
  },
});
