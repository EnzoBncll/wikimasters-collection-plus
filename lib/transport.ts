/**
 * Accès au site selon le contexte d'exécution :
 *  - dans une page wiki-masters.com (content script) : fetch direct, même origine ;
 *  - dans l'onglet de l'extension : on passe par un onglet WikiMasters ouvert (proxy),
 *    sinon requête directe avec les cookies lus via chrome.cookies.
 */
export const SITE_ORIGIN = 'https://www.wiki-masters.com';
export const PROXY_FETCH = 'wmt:proxy-fetch';

export interface SiteResponse {
  status: number;
  text: string;
}

export interface Transport {
  siteFetch(path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<SiteResponse>;
  cookies(): Promise<Map<string, string>>;
}

export function parseCookieString(cookie: string): Map<string, string> {
  return new Map(
    cookie
      .split('; ')
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf('=');
        return [pair.slice(0, i), safeDecode(pair.slice(i + 1))] as const;
      }),
  );
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Transport utilisé par le content script, dans la page du site. */
export const pageTransport: Transport = {
  async siteFetch(path, init = {}) {
    const response = await fetch(path, { credentials: 'include', ...init });
    return { status: response.status, text: await response.text() };
  },
  async cookies() {
    return parseCookieString(document.cookie);
  },
};

/** Transport utilisé par l'onglet de l'extension. */
export const extensionTransport: Transport = {
  async siteFetch(path, init = {}) {
    const tabId = await findSiteTab();
    if (tabId !== null) {
      try {
        const res = await browser.tabs.sendMessage(tabId, { type: PROXY_FETCH, path, init });
        if (res && typeof res.status === 'number') return res as SiteResponse;
      } catch {
        // Onglet pas prêt (ou content script absent) : on tente en direct.
      }
    }
    const response = await fetch(SITE_ORIGIN + path, { credentials: 'include', ...init });
    return { status: response.status, text: await response.text() };
  },
  async cookies() {
    const list = await browser.cookies.getAll({ url: SITE_ORIGIN });
    return new Map(list.map((c) => [c.name, safeDecode(c.value)]));
  },
};

async function findSiteTab(): Promise<number | null> {
  const tabs = await browser.tabs.query({ url: `${SITE_ORIGIN}/*` });
  const tab = tabs.find((t) => t.status === 'complete') ?? tabs[0];
  return tab?.id ?? null;
}

let current: Transport = pageTransport;

export function setTransport(transport: Transport) {
  current = transport;
}

export function transport(): Transport {
  return current;
}
