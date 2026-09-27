import { defineContentScript } from '#imports';

/**
 * Tourne dans le contexte de la page (MAIN world) : repère les requêtes du site qui modifient
 * la collection (tout POST/PUT/PATCH/DELETE sur /api/…) et prévient le content script
 * pour que le cache soit rechargé complètement la prochaine fois.
 * N'altère ni les requêtes ni les réponses ; s'enchaîne avec d'autres extensions qui patchent fetch.
 */
export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    const IGNORED = /^\/api\/(auth|push|broadcast|notifications)/;

    const notify = (method: string | undefined, rawUrl: string | URL | undefined, ok: boolean) => {
      if (!ok || !rawUrl) return;
      if (!method || method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD') return;
      let path: string;
      try {
        const url = new URL(String(rawUrl), location.origin);
        if (url.origin !== location.origin) return;
        path = url.pathname;
      } catch {
        return;
      }
      if (!path.startsWith('/api/') || IGNORED.test(path)) return;
      window.postMessage({ source: 'wmt-intercept', type: 'collection-changed', path }, location.origin);
    };

    const originalFetch = window.fetch;
    window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      const [input, init] = args;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      const url = input instanceof Request ? input.url : input;
      const promise = originalFetch.apply(this, args);
      promise.then((res) => notify(method, url, res.ok)).catch(() => {});
      return promise;
    } as typeof fetch;

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
      this.addEventListener('load', () => notify(method, url, this.status >= 200 && this.status < 300), { once: true });
      return (originalOpen as any).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;
  },
});
