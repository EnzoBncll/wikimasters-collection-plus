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
  // ?demo=groups&studio=cover|pages|cards|ambiance : ouvre l'album à objectif en mode « Style d'album » sur ce volet (captures).
  const studio = params.get('studio');
  if (studio) {
    const click = (sel, text) => () => [...document.querySelectorAll(sel)].find((b) => !text || b.textContent.trim() === text)?.click();
    until('button', () => {
      [...document.querySelectorAll('button')].find((b) => /Passer la visite/.test(b.textContent))?.click();
      setTimeout(click('button, a, [role=tab]', 'Albums'), 300);
      until('[aria-label^="Ouvrir l\'album ◇"]', (el) => {
        el.click();
        until('[aria-label="Style d\'album"]', (btn) => {
          btn.click();
          const title = { pages: 'Pages', cards: 'Cartes', ambiance: 'Ambiance' }[studio];
          if (title) setTimeout(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.startsWith(title))?.click(), 1200);
        });
      });
    });
  }
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
  // ?demo=groups : les trois groupes de la page Albums (objectif « ◇ », collections, rangements « · »), et des souhaits d'album.
  if (params.get('demo') === 'groups') {
    tags[2].name = '◇ Footballeurs';
    tags.push({ id: 't-myth', name: '🏛️ Mythologie', color: '#a855f7' }, { id: 't-ciné', name: '🎬 Cinéma', color: '#ec4899' },
      { id: 't-trier', name: '· À trier', color: '#71717a' }, { id: 't-div', name: '· Divers', color: '#71717a' });
    // Petites parties qui s'enchaînent (comme des dynasties) : teste la mise en page des parties.
    const part = { 'Zinédine Zidane': 'France', 'Kylian Mbappé': 'France', 'Lionel Messi': 'Argentine', 'Thierry Henry': 'France, génération 98', 'Michel Platini': 'France, génération 98', 'Pelé': 'Brésil', 'Diego Maradona': 'Argentine, Mexico 86', 'Johan Cruyff': 'Pays-Bas' };
    store.goalAlbums = { 't-foot': { entries: ['Zinédine Zidane', 'Kylian Mbappé', 'Lionel Messi', 'Thierry Henry', 'Michel Platini', 'Pelé', 'Diego Maradona', 'Johan Cruyff'].map((title) => ({ title, qid: null, description: null, section: part[title] })), source: { kind: 'list', label: 'Footballeurs' }, annex: false, at: Date.now() } };
    store.wishlists = { 't-foot': [
      { qid: 'Q1', title: 'Pelé', description: 'footballeur brésilien', imageUrl: 'https://picsum.photos/seed/pele/120/120', wikipediaUrl: '#', sitelinks: 160 },
      { qid: 'Q2', title: 'Johan Cruyff', description: 'footballeur néerlandais', imageUrl: 'https://picsum.photos/seed/cruyff/120/120', wikipediaUrl: '#', sitelinks: 120 },
      { qid: 'Q3', title: 'Kylian Mbappé', description: 'footballeur français', imageUrl: 'https://picsum.photos/seed/mbappe/120/120', wikipediaUrl: '#', sitelinks: 110 },
    ] };
  }
  const uct = [['own-3', 't-nt'], ['own-5', 't-nt'], ['own-0', 't-foot'], ['own-1', 't-foot'], ['own-4', 't-foot'], ['own-5', 't-foot'], ['own-8', 't-pays'], ['own-7', 't-trade']];
  if (params.get('demo') === 'groups') {
    for (let i = 10; i < 22; i++) uct.push([`own-${i}`, i % 2 ? 't-myth' : 't-ciné']);
    for (let i = 22; i < 30; i++) uct.push([`own-${i}`, i % 2 ? 't-trier' : 't-div']);
  }
  // ?demo=groups&lib=1 : une bibliothèque garnie (styles variés, albums finis) pour la page Albums.
  if (params.get('demo') === 'groups' && params.get('lib')) {
    const LIB = [
      ['t-byz', '◇ Empereurs byzantins', '#8b2a2a', 'grimoire', 40, 27, ['Constantiniens', 'Justiniens', 'Héraclides', 'Macédoniens', 'Comnènes', 'Anges', 'Paléologues'], '♛'],
      ['t-herb', '◇ Plantes médicinales', '#6f8f5a', 'herbier', 24, 20, ['Fleurs', 'Racines', 'Feuilles'], '🌿'],
      ['t-papes', '◇ Papes', '#4b2a7a', 'grimoire', 30, 6, ['Antiquité', 'Moyen Âge'], '⚜'],
      ['t-paris', '◇ Monuments de Paris', '#b8860b', 'relie', 12, 12, ['Rive droite', 'Rive gauche'], null],
      ['t-alpes', '◇ Herbier des Alpes', '#4f7f8a', 'herbier', 16, 16, ['Prairies', 'Sommets'], '❦'],
      ['t-rois', '◇ Rois de France', '#2f5fb8', 'classeur', 45, 18, ['Mérovingiens', 'Carolingiens', 'Capétiens'], null],
    ];
    let next = 200;
    store.albumStyles = {};
    store.albumLooks = {};
    LIB.forEach(([id, name, color, style, n, have, parts, emblem], g) => {
      tags.push({ id, name, color });
      store.albumStyles[id] = style;
      if (emblem) store.albumLooks[id] = { emblem };
      const first = next;
      next += n;
      store.goalAlbums[id] = {
        entries: Array.from({ length: n }, (_, k) => ({ title: `Carte ${first + k}`, qid: null, description: null, section: parts[Math.floor((k * parts.length) / n)] })),
        source: { kind: 'list', label: name.slice(2) }, annex: false, at: Date.now() - g * 86400e3,
      };
      for (let k = 0; k < have; k++) uct.push([`own-${first + k}`, id]);
    });
    tags.push({ id: 't-myth-done', name: '🏛️ Mythologie grecque ✓', color: '#eab308' });
    for (let i = 30; i < 40; i++) uct.push([`own-${i}`, 't-myth-done']);
  }
  window.__calls = [];
  const wished = ['card-2'];
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
      // Marché : quelques annonces pour le mode Marché des albums à objectif (?q= cherche dans le titre).
      if (url.pathname === '/api/marketplace') {
        window.__calls.push('q=' + url.searchParams.get('q'));
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const sale = [['Lionel Messi', 'SR', 420, 2.5], ['Pelé', 'UR', 1800, 0.4], ['Lionel Messi', 'C', 35, 26], ['Johan Cruyff', 'R', 120, 7], ['Lionel Jospin', 'PC', 20, 3]];
        const auctions = sale.filter(([t]) => t.toLowerCase().includes(q)).map(([t, r, p, h], i) => ({
          id: `auc-${t.length}-${i}`, status: 'active', card_id: `site-${i}`, snapshot_rarity: r, current_bid: p, end_at: new Date(Date.now() + h * 3600e3).toISOString(),
          card: { wikipedia_title: t, image_url: `https://picsum.photos/seed/m${i}/120/90` } }));
        return json({ auctions, hasMore: false });
      }
      // Catalogue : liste de souhaits (?wishlist=1) et recherche (?q=).
      if (url.pathname === '/api/cards') {
        const all = entries.slice(0, 400).map((e) => e.card);
        const extra = [['Rafael Nadal', 'joueur de tennis espagnol'], ['Pelé', 'footballeur brésilien'], ['Diego Maradona', 'footballeur argentin'], ['Johan Cruyff', 'footballeur néerlandais']]
          .map(([t, description], k) => ({ id: `cat-${k}`, wikipedia_title: t, rarity: R[(k * 5 + 2) % 6], description, image_url: `https://picsum.photos/seed/cat${k}/320/240` }));
        const named = { 'card-2': 'footballeur argentin' };
        if (url.searchParams.has('wishlist')) {
          const cards = [...extra, ...wished.map((id) => all.find((c) => c.id === id)).filter(Boolean).map((c) => ({ ...c, description: named[c.id] ?? c.description }))].filter((c) => wished.includes(c.id) || c.id.startsWith('cat-'));
          return json({ cards, total: cards.length, ownedCardIds: ['card-2'], friendOwners: { 'cat-0': [{ id: 'u1', username: 'Léa' }, { id: 'u2', username: 'Max' }], 'cat-2': [{ id: 'u3', username: 'Sam' }] } });
        }
        const q = (url.searchParams.get('q') || '').toLowerCase();
        return json({ cards: [...extra, ...all].filter((c) => c.wikipedia_title.toLowerCase().includes(q)).slice(0, 50) });
      }
      const page = Number(url.searchParams.get('page'));
      return json({ collection: entries.slice(page * 100, page * 100 + 100) });
    }
    if (url.hostname.includes('supabase')) {
      window.__calls.push(method + ' ' + url.pathname + url.search);
      const path = url.pathname.replace('/rest/v1/', '');
      if (path === 'tags' && method === 'GET') return json(tags);
      // Catalogue par titre (aperçu d'un album à objectif) : rareté tirée du titre, une carte sur huit absente du jeu.
      if (path === 'cards' && method === 'GET') {
        const raw = (url.searchParams.get('wikipedia_title') || '').replace(/^in\.\(|\)$/g, '');
        const titles = [...raw.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
        const hash = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
        return json(titles.filter((t) => hash(t) % 8).map((t) => ({ wikipedia_title: t, rarity: ['C', 'C', 'C', 'PC', 'PC', 'R', 'R', 'SR', 'UR', 'L'][hash(t) % 10], image_url: null, atk: hash(t) % 9000, def: (hash(t) >> 3) % 9000 })));
      }
      if (path === 'wishlist_items' && method === 'POST') { wished.push(JSON.parse(init.body).card_id); return new Response(null, { status: 201 }); }
      if (path === 'wishlist_items' && method === 'DELETE') { const id = url.searchParams.get('card_id').slice(3); wished.splice(wished.indexOf(id), 1); return new Response(null, { status: 204 }); }
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
