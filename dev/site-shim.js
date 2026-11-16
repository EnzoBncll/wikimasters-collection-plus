// Banc d'essai hors ligne des scripts de contenu : API chrome.* simulées, session WikiMasters factice,
// réponses du site et de Supabase inventées. Chargé avant intercept.js, qui enveloppe le fetch simulé.
(() => {
  const store = {};
  const listeners = [];
  const params = new URLSearchParams(location.search);
  store.settings = { palette: params.get('palette') || 'nuit-violette', theme: params.get('theme') || 'dark', soundVolume: 0.02,
    siteLook: params.get('look') || 'solid', cardStyle: params.get('style') || 'classic' };
  // Mini-visites déjà vues, sauf avec ?tour (elles couvriraient les captures).
  if (!params.has('tour')) store.siteTourSeen = { pulls: 99, reveal: 99 };
  // ?pulls=demo : un historique de tirages (paquets standards et Pack ++) pour les statistiques de /pulls.
  if (params.get('pulls') === 'demo') {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const draw = (rates) => { let x = rnd(); for (const [r, p] of rates) if ((x -= p) < 0) return r; return 'C'; };
    const STD = [['L', 0.004], ['UR', 0.02], ['SR', 0.06], ['R', 0.16], ['PC', 0.26], ['C', 0.496]];
    const PLUS = [['L', 0.012], ['UR', 0.07], ['SR', 0.13], ['R', 0.25], ['PC', 0.18], ['C', 0.358]];
    const now = Date.now();
    const pulls = [];
    for (let d = 20; d >= 0; d--) {
      const n = d === 0 ? 9 : 4 + Math.floor(rnd() * 8);
      for (let k = 0; k < n; k++) {
        const plus = k === 0 && d % 2 === 0;
        pulls.push({ t: now - d * 864e5 - (n - k) * 12e5, src: plus ? 'pro-daily' : 'open',
          cards: Array.from({ length: plus ? 15 : 5 }, (_, i) => ({ id: String(1000 + d * 100 + k * 15 + i), name: `Carte ${d}-${k}-${i}`, r: draw(plus ? PLUS : STD), s: rnd() < 0.02, o: rnd() < 0.3 ? 1 : 2 })) });
      }
    }
    store.pulls = pulls;
  }
  // Album à objectif « Footballeurs » : Zidane déjà collé, Messi attendu (2e carte du paquet).
  const wiki = (t) => `https://fr.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
  store.goalAlbums = { 't-foot': { entries: ['Zinédine Zidane', 'Kylian Mbappé', 'Michel Platini', 'Thierry Henry', 'Lionel Messi', 'Karim Benzema', 'Antoine Griezmann', 'Paul Pogba', 'Raymond Kopa', 'Just Fontaine']
    .map((title) => ({ title, qid: null, description: null, section: null })), source: { kind: 'list', label: 'Footballeurs' }, annex: false, at: Date.now() } };
  const emit = (changes) => listeners.forEach((l) => l(changes, 'local'));
  const api = {
    storage: {
      local: {
        async get(keys) {
          const ks = keys == null ? Object.keys(store) : [].concat(keys);
          const o = {};
          ks.forEach((k) => k in store && (o[k] = structuredClone(store[k])));
          return o;
        },
        async set(items) {
          const changes = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: store[k], newValue: v };
            store[k] = structuredClone(v);
          }
          emit(changes);
        },
        async remove(keys) {
          [].concat(keys).forEach((k) => delete store[k]);
        },
        onChanged: { addListener: (l) => listeners.push((c) => l(c)), removeListener() {} },
      },
      onChanged: { addListener: (l) => listeners.push(l), removeListener() {} },
    },
    runtime: { id: 'harness', getManifest: () => ({ version: '0.7.0' }), getURL: (p) => p, sendMessage: async () => null, onMessage: { addListener() {} } },
  };
  window.chrome = api;
  window.browser = api;
  window.__store = store;

  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `x.${b64({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 })}.y`;
  document.cookie = `sb-cyrxjeppjqsxxjayfrur-auth-token=${encodeURIComponent(`base64-${b64({ access_token: jwt })}`)}; path=/`;

  const R = ['C', 'C', 'C', 'PC', 'PC', 'R', 'R', 'SR', 'UR', 'L'];
  const NAMES = ['Paris', 'Lionel Messi', 'Tour Eiffel', 'Napoléon Ier', 'Marie Curie', 'Tokyo', 'Pikachu', 'Wolfgang Amadeus Mozart', 'Zeus', 'Minecraft', 'Daft Punk', 'Brad Pitt', 'Colisée', 'Jupiter (planète)'];
  let packs = 6;
  let serial = 0;
  window.__forceRarities = params.get('rarities')?.split(',') ?? null;
  const card = (i, rarity) => ({
    id: 1000 + i,
    wikipedia_title: NAMES[i % NAMES.length],
    wikipedia_url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(NAMES[i % NAMES.length].replace(/ /g, '_'))}`,
    rarity,
    is_shiny: rarity === 'R' && i % 4 === 0,
    // ?nodesc : paquet sans description, comme le site avant le clic sur la carte.
    description: params.has('nodesc') ? null : ['ville et capitale', 'footballeur international', 'monument historique', 'empereur des Français', 'physicienne et chimiste'][i % 5],
    atk: 1000 + ((i * 7919) % 8000), def: 1000 + ((i * 104729) % 8000),
    image_url: i % 5 === 3 ? null : `https://picsum.photos/seed/wmh${i}/320/240`,
    lang: 'fr',
  });
  const tags = [
    { id: 't-trade', name: '🟢 Trade', color: '#22c55e' },
    { id: 't-nt', name: '🔴 Not Trade', color: '#ef4444' },
    { id: 't-discard', name: '🗑️ Discard', color: '#71717a' },
    { id: 't-foot', name: '⚽ Footballeurs', color: '#3b82f6' },
    { id: 't-rois', name: '👑 Rois de France ✓', color: '#eab308' },
    { id: 't-villes', name: '🏙️ Villes', color: '#f97316' },
    { id: 't-div', name: '· Divers', color: '#71717a' },
    { id: 't-a-trier', name: '· À trier', color: '#71717a' },
  ];
  const uct = [];
  store['collectionCache.v2'] = { version: 2, fullAt: Date.now(), syncedAt: Date.now(), statsSig: null,
    cards: [{ cardId: 'c-zz', ownedIds: ['o1'], count: 1, title: 'Zinédine Zidane', rarity: 'R', imageUrl: null, wikipediaUrl: wiki('Zinédine Zidane'), tagIds: ['t-foot'], ownedTags: { o1: ['t-foot'] } }],
    tags, tradeTags: { trade: tags[0], notTrade: tags[1], discard: tags[2] } };
  const wish = new Set(['2001', '2004']);
  window.__calls = [];
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

  const passthrough = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = (init.method || 'GET').toUpperCase();
    window.__calls.push(`${method} ${url.pathname}${url.search}`);
    if (url.pathname === '/api/packs/open' && method === 'POST') {
      await new Promise((r) => setTimeout(r, 300));
      packs = Math.max(0, packs - 1);
      const forced = window.__forceRarities;
      const cards = Array.from({ length: 5 }, (_, j) => card(serial++, forced?.[j] ?? R[Math.floor(Math.random() * R.length)]));
      // Une carte sur deux est nouvelle (un seul exemplaire possédé).
      const owned_copies = cards.flatMap((c, j) => Array.from({ length: j % 2 ? 2 : 1 }, (_, k) => ({ id: `uc-${c.id}-${k}`, card_id: c.id, is_shiny: c.is_shiny && k === 0, count: 1 })));
      return json({ cards, owned_copies, packs_remaining: packs, packs_last_regen_at: new Date(Date.now() - 120e3).toISOString() });
    }
    if (url.pathname.startsWith('/api/my-collection')) return json({ collection: [] });
    // Échanges : deux offres, cartes de chaque côté (la 4e sans image).
    if (url.pathname === '/api/trades') {
      const item = (i, rarity, by) => ({ id: `ti-${i}`, card_id: 1000 + i, offered_by: by, snapshot_rarity: rarity, card: card(i, rarity) });
      return json({ trades: [
        { id: 'tr-1', status: 'pending', initiator_id: 'user-2', recipient_id: 'user-1', items: [item(7, 'SR', 'user-2'), item(8, 'UR', 'user-2'), item(1, 'C', 'user-1')] },
        { id: 'tr-2', status: 'pending', initiator_id: 'user-1', recipient_id: 'user-3', items: [item(3, 'R', 'user-1'), item(13, 'L', 'user-3'), item(10, 'PC', 'user-3')] },
      ] });
    }
    if (url.hostname.includes('supabase')) {
      const path = url.pathname.replace('/rest/v1/', '');
      const body = init.body ? JSON.parse(init.body) : null;
      if (path === 'tags' && method === 'GET') return json(tags);
      if (path === 'tags' && method === 'POST') {
        const t = { id: `t-${Date.now()}`, ...body };
        tags.push(t);
        return json([t], 201);
      }
      if (path === 'user_cards' && method === 'GET') {
        const ids = (url.searchParams.get('card_id') || '').replace(/^in\.\(|\)$/g, '').split(',');
        const rows = ids.flatMap((id) => [
          { id: `uc-${id}-0`, card_id: Number(id), is_shiny: false, user_card_tags: uct.filter(([u]) => u === `uc-${id}-0`).map(([, tag_id]) => ({ tag_id })) },
        ]);
        return json(rows);
      }
      if (path === 'user_card_tags' && method === 'POST') {
        [].concat(body).forEach((r) => uct.push([r.user_card_id, r.tag_id]));
        return new Response(null, { status: 201 });
      }
      if (path === 'user_card_tags' && method === 'DELETE') {
        const tag = url.searchParams.get('tag_id').slice(3);
        const ids = (url.searchParams.get('user_card_id') || '').replace(/^in\.\(|\)$/g, '').split(',');
        for (let i = uct.length - 1; i >= 0; i--) if (uct[i][1] === tag && ids.includes(uct[i][0])) uct.splice(i, 1);
        return new Response(null, { status: 204 });
      }
      if (path === 'wishlist_items' && method === 'GET') return json([...wish].map((card_id) => ({ card_id })));
      if (path === 'wishlist_items' && method === 'POST') {
        wish.add(String(body.card_id));
        return new Response(null, { status: 201 });
      }
      if (path === 'wishlist_items' && method === 'DELETE') {
        wish.delete(url.searchParams.get('card_id').replace(/^eq\./, ''));
        return new Response(null, { status: 204 });
      }
      return json([]);
    }
    if (url.origin !== location.origin) return passthrough(input, init);
    return new Response('', { status: 404 });
  };
  window.__uct = uct;
  window.__wish = wish;
})();
