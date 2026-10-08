// Aperçu hors extension : simule les API chrome.* et le site / Supabase avec de fausses données.
(() => {
  const store = {}; const listeners = [];
  // ?theme=dark&palette=cyberpunk&albumStyle=kraft : réglages de départ (captures du README).
  const params = new URLSearchParams(location.search);
  if (params.has('theme') || params.has('palette') || params.has('albumStyle') || params.has('tagsLayout')) {
    store.settings = {
      theme: params.get('theme') || 'system',
      palette: params.get('palette') || 'nuit-violette',
      albumStyle: params.get('albumStyle') || 'relie',
      tagsLayout: params.get('tagsLayout') || 'folders',
    };
  }
  // Compteur de paquets du popup : 6 / 10, le prochain dans un peu plus de 4 min.
  if (location.pathname.endsWith('popup.html')) store.packState = { n: 6, max: 10, nextAt: Date.now() + 252000, period: 600000, observedAt: Date.now() };
  // ?demo=viewer : ouvre la première carte de l'album en grand ; ?demo=wishes : ajoute trois souhaits et descend au panneau.
  const demo = params.get('demo');
  const until = (sel, cb) => {
    const timer = setInterval(() => {
      const el = document.querySelector(sel);
      if (el) (clearInterval(timer), cb(el));
    }, 200);
  };
  if (demo === 'viewer') {
    until('[data-album-sticker]', (el) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 10, clientY: r.y + 10, button: 0 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: r.x + 10, clientY: r.y + 10 }));
    });
  }
  if (demo === 'wishes') {
    const heart = '[title="Ajouter à la liste de souhaits"]';
    until(heart, async () => {
      for (const skip of [0, 1, 3]) {
        document.querySelectorAll(heart)[skip]?.click();
        await new Promise((r) => setTimeout(r, 300));
      }
      document.querySelector('[data-wishes]')?.scrollIntoView();
    });
  }
  if (params.has('static')) window.__collectionPlusStatic = true;
  // ?static : sans animations CSS (captures figées à l'état final).
  if (params.has('static')) {
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}';
    document.head.append(style);
  }
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = 'x.' + b64({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.y';
  const session = 'base64-' + b64({ access_token: jwt });
  const api = {
    storage: { local: {
      async get(keys) { const ks = keys == null ? Object.keys(store) : [].concat(keys); const o = {}; ks.forEach((k) => k in store && (o[k] = structuredClone(store[k]))); return o; },
      async set(items) { const changes = {}; for (const [k, v] of Object.entries(items)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = structuredClone(v); } listeners.forEach((l) => l(changes, 'local')); },
      async remove(keys) { [].concat(keys).forEach((k) => delete store[k]); },
      onChanged: { addListener: (l) => listeners.push((c) => l(c)), removeListener() {} },
    }, sync: { QUOTA_BYTES: 102400, async get() { return {}; }, async set() {}, async remove() {}, async getBytesInUse() { return 5300; } },
    onChanged: { addListener: (l) => listeners.push(l), removeListener() {} } },
    runtime: { id: 'test', getManifest: () => ({ oauth2: null, version: '0.1.0' }), getURL: (p) => p, sendMessage: async () => ({ error: 'not_configured' }), onMessage: { addListener() {} } },
    tabs: { query: async () => [] },
    cookies: { getAll: async () => [{ name: 'sb-cyrxjeppjqsxxjayfrur-auth-token', value: session }] },
  };
  window.chrome = api; window.browser = api;

  const R = ['C', 'PC', 'R', 'SR', 'L', 'UR'];
  const real = ['Zinédine Zidane', 'Kylian Mbappé', 'Lionel Messi', 'Thierry Henry', 'Michel Platini', 'Zlatan Ibrahimović', 'Paris', 'Lyon', 'Marseille', 'Tokyo', 'New York',
    'Berlin', 'France', 'Japon', 'Brésil', 'Italie', 'Pikachu', 'Dracaufeu', 'Mewtwo', 'Salamèche', 'Le Parrain (film)', 'Titanic (film, 1997)', 'Inception', 'Pulp Fiction',
    'Tour Eiffel', 'Colisée', 'Napoléon Ier', 'Charles de Gaulle', 'Emmanuel Macron', 'Victor Hugo', 'Albert Camus', 'Molière', 'Wolfgang Amadeus Mozart', 'Ludwig van Beethoven',
    'Daft Punk', 'Édith Piaf', 'Albert Einstein', 'Marie Curie', 'Isaac Newton', 'Chat', 'Chien', 'Lion', 'Éléphant', 'Loup gris', 'Mars (planète)', 'Jupiter (planète)',
    'Zeus', 'Athéna', 'Odin', 'Super Mario Bros.', 'Minecraft', 'The Legend of Zelda', 'Tetris', 'Breaking Bad', 'Game of Thrones', 'Friends', 'Apple', 'Google', 'Renault',
    'Real Madrid Club de Fútbol', 'Paris Saint-Germain Football Club', 'Olympique de Marseille', 'Bataille de Waterloo', 'Seconde Guerre mondiale', 'Jean-Paul Belmondo',
    'Brad Pitt', 'Scarlett Johansson', 'Omar Sy', 'Roger Federer', 'Usain Bolt', 'Serena Williams', 'Tony Parker'];
  const DESCRIPTIONS = ['footballeur international français', 'ville et capitale', 'film réalisé en 1972', 'espèce de mammifère', 'physicien théoricien', 'jeu vidéo de plateforme', 'monument historique', 'série télévisée américaine', 'divinité de la mythologie grecque', 'planète du Système solaire'];
  const entries = Array.from({ length: 420 }, (_, i) => {
    const n = i % 400;
    const title = n < real.length ? real[n] : `Carte ${n}`;
    // Doublons simulés : cartes 0 à 19 en deux exemplaires (un shiny, un favori, une ligne de trois).
    return { id: `own-${i}`, card_id: `card-${n}`, count: i === 402 ? 3 : 1, is_shiny: i === 401, starred: i === 3,
      obtained_at: new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString(),
      card: { id: `card-${n}`, wikipedia_title: title, rarity: R[(n * 7) % 6],
        description: DESCRIPTIONS[n % DESCRIPTIONS.length], attack: 1000 + ((n * 7919) % 8000), defense: 1000 + ((n * 104729) % 8000),
        image_url: n % 3 ? `https://picsum.photos/seed/wm${n}/320/240` : null,
        wikipedia_url: n < real.length ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : 'https://fr.wikipedia.org' } };
  });
  const tags = [{ id: 't-trade', name: 'Trade', color: '#22c55e' }, { id: 't-nt', name: 'Not Trade', color: '#ef4444' },
    { id: 't-foot', name: 'Footballeurs', color: '#3b82f6' }, { id: 't-pays', name: 'Pays', color: '#f59e0b' }];
  const uct = [['own-3', 't-nt'], ['own-5', 't-nt'], ['own-0', 't-foot'], ['own-1', 't-foot'], ['own-4', 't-foot'], ['own-5', 't-foot'], ['own-8', 't-pays'], ['own-7', 't-trade']];
  window.__calls = [];
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = init.method || 'GET';
    if (url.hostname.includes('wiki-masters')) {
      await new Promise((r) => setTimeout(r, 120));
      window.__calls.push(method + ' ' + url.pathname);
      if (url.pathname.endsWith('/stats')) return json({ rarityCounts: { C: 70, n: entries.length } });
      const discard = url.pathname.match(/^\/api\/user-cards\/([^/]+)\/discard$/);
      if (discard && method === 'POST') {
        const i = entries.findIndex((e) => e.id === decodeURIComponent(discard[1]));
        if (i < 0) return json({ error: 'Exemplaire introuvable' }, 404);
        if (entries[i].count > 1) entries[i].count--;
        else entries.splice(i, 1);
        return json({ ok: true, wikibidous: 1 });
      }
      const page = Number(url.searchParams.get('page'));
      return json({ collection: entries.slice(page * 100, page * 100 + 100) });
    }
    if (url.hostname.includes('supabase')) {
      window.__calls.push(method + ' ' + url.pathname + url.search);
      const path = url.pathname.replace('/rest/v1/', '');
      if (path === 'tags' && method === 'GET') return json(tags);
      if (path === 'user_cards' && method === 'GET') {
        const ids = (url.searchParams.get('id') || '').replace(/^in\.\(|\)$/g, '').split(',');
        return json(entries.filter((e) => ids.includes(e.id)).map(({ id, count, is_shiny, starred, obtained_at }) => ({ id, count, is_shiny, starred, obtained_at })));
      }
      if (path === 'tags' && method === 'POST') { const b = JSON.parse(init.body); const t = { id: 't-' + Date.now(), ...b }; tags.push(t); return json([t], 201); }
      if (path === 'tags' && method === 'PATCH') { const id = url.searchParams.get('id').slice(3); const tag = tags.find((t) => t.id === id); if (tag) Object.assign(tag, JSON.parse(init.body)); return json(tag ? [tag] : []); }
      if (path === 'user_card_tags' && method === 'GET') { const rows = uct.map(([user_card_id, tag_id]) => ({ user_card_id, tag_id })); const from = Number((init.headers?.range || '0-999').split('-')[0]); return json(rows.slice(from, from + 1000)); }
      if (path === 'user_card_tags' && method === 'POST') { [].concat(JSON.parse(init.body)).forEach((r) => uct.push([r.user_card_id, r.tag_id])); return new Response(null, { status: 201 }); }
      if (path === 'user_card_tags' && method === 'DELETE') { const tag = url.searchParams.get('tag_id').slice(3); const ids = (url.searchParams.get('user_card_id') || '').replace(/^in\.\(|\)$/g, '').split(','); for (let i = uct.length - 1; i >= 0; i--) if (uct[i][1] === tag && ids.includes(uct[i][0])) uct.splice(i, 1); return new Response(null, { status: 204 }); }
      return json([]);
    }
    return orig(input, init);
  };
})();
