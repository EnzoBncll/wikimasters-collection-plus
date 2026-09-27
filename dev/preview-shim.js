// Aperçu hors extension : simule les API chrome.* et le site / Supabase avec de fausses données.
(() => {
  const store = {}; const listeners = [];
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = 'x.' + b64({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.y';
  const session = 'base64-' + b64({ access_token: jwt });
  const api = {
    storage: { local: {
      async get(keys) { const ks = keys == null ? Object.keys(store) : [].concat(keys); const o = {}; ks.forEach((k) => k in store && (o[k] = structuredClone(store[k]))); return o; },
      async set(items) { const changes = {}; for (const [k, v] of Object.entries(items)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = structuredClone(v); } listeners.forEach((l) => l(changes, 'local')); },
      async remove(keys) { [].concat(keys).forEach((k) => delete store[k]); },
      onChanged: { addListener: (l) => listeners.push((c) => l(c)), removeListener() {} },
    }, onChanged: { addListener: (l) => listeners.push(l), removeListener() {} } },
    runtime: { id: 'test', getManifest: () => ({ oauth2: null }), getURL: (p) => p, sendMessage: async () => ({ error: 'not_configured' }), onMessage: { addListener() {} } },
    tabs: { query: async () => [] },
    cookies: { getAll: async () => [{ name: 'sb-cyrxjeppjqsxxjayfrur-auth-token', value: session }] },
  };
  window.chrome = api; window.browser = api;

  const R = ['C', 'PC', 'R', 'SR', 'L', 'UR'];
  const words = ['Paris', 'Zinédine Zidane', 'Pikachu', 'Tour Eiffel', 'Napoléon', 'Chat', 'Mars', 'Le Parrain', 'Brésil', 'Mozart', 'Photosynthèse', 'Zeus'];
  const entries = Array.from({ length: 420 }, (_, i) => ({ id: `own-${i}`, card_id: `card-${i % 400}`, count: 1,
    card: { id: `card-${i % 400}`, wikipedia_title: `${words[i % words.length]} ${Math.floor(i / 12) || ''}`.trim(), rarity: R[(i * 7) % 6],
      image_url: i % 3 ? `https://picsum.photos/seed/wm${i % 400}/320/240` : null, wikipedia_url: 'https://fr.wikipedia.org' } }));
  const tags = [{ id: 't-trade', name: 'Trade', color: '#22c55e' }, { id: 't-nt', name: 'Not Trade', color: '#ef4444' },
    { id: 't-foot', name: 'Footballeurs', color: '#3b82f6' }, { id: 't-pays', name: 'Pays', color: '#f59e0b' }];
  const uct = [['own-3', 't-nt'], ['own-5', 't-nt'], ['own-1', 't-foot'], ['own-13', 't-foot'], ['own-8', 't-pays'], ['own-7', 't-trade']];
  window.__calls = [];
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = init.method || 'GET';
    if (url.hostname.includes('wiki-masters')) {
      await new Promise((r) => setTimeout(r, 120));
      window.__calls.push(method + ' ' + url.pathname);
      if (url.pathname.endsWith('/stats')) return json({ rarityCounts: { C: 70 } });
      const page = Number(url.searchParams.get('page'));
      return json({ collection: entries.slice(page * 100, page * 100 + 100) });
    }
    if (url.hostname.includes('supabase')) {
      window.__calls.push(method + ' ' + url.pathname + url.search);
      const path = url.pathname.replace('/rest/v1/', '');
      if (path === 'tags' && method === 'GET') return json(tags);
      if (path === 'tags' && method === 'POST') { const b = JSON.parse(init.body); const t = { id: 't-' + Date.now(), ...b }; tags.push(t); return json([t], 201); }
      if (path === 'tags' && method === 'PATCH') { const id = url.searchParams.get('id').slice(3); Object.assign(tags.find((t) => t.id === id), JSON.parse(init.body)); return new Response(null, { status: 204 }); }
      if (path === 'user_card_tags' && method === 'GET') { const rows = uct.map(([user_card_id, tag_id]) => ({ user_card_id, tag_id })); const from = Number((init.headers?.range || '0-999').split('-')[0]); return json(rows.slice(from, from + 1000)); }
      if (path === 'user_card_tags' && method === 'POST') { [].concat(JSON.parse(init.body)).forEach((r) => uct.push([r.user_card_id, r.tag_id])); return new Response(null, { status: 201 }); }
      if (path === 'user_card_tags' && method === 'DELETE') { const tag = url.searchParams.get('tag_id').slice(3); const ids = (url.searchParams.get('user_card_id') || '').replace(/^in\.\(|\)$/g, '').split(','); for (let i = uct.length - 1; i >= 0; i--) if (uct[i][1] === tag && ids.includes(uct[i][0])) uct.splice(i, 1); return new Response(null, { status: 204 }); }
      return json([]);
    }
    return orig(input, init);
  };
})();
