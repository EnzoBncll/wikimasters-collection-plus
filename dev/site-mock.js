// Imitation minimale du DOM de wiki-masters.com (classes et textes sur lesquels s'appuient les scripts de contenu),
// pour essayer l'ouverture, le révélé, la Collection et le marché sans compte ni réseau.
(() => {
  const css = document.createElement('style');
  css.textContent = `
    body { margin: 0; background: #0f1110; color: #f2f4f3; font: 14px system-ui, sans-serif; }
    main { height: 100vh; overflow-y: auto; }
    .card-frame { padding: 10px 16px; border-radius: 14px; background: #1b1f1d; border: 1px solid #2b302d; }
    .flex { display: flex; } .flex-col { flex-direction: column; } .items-center { align-items: center; } .gap-4 { gap: 16px; }
    .flex-wrap { flex-wrap: wrap; } .justify-center { justify-content: center; }
    .wm-card { position: relative; width: 224px; height: 320px; border-radius: 16px; overflow: hidden; background: #f4f1ea; color: #111; box-shadow: 0 0 22px var(--g); }
    .wm-card .h-\\[45\\%\\] { height: 45%; background: #ccc center/cover; }
    .wm-card h3 { margin: 10px; font-size: 16px; }
    .wm-card .r { position: absolute; top: 8px; left: 8px; padding: 2px 6px; border-radius: 6px; background: var(--g); font-weight: 800; font-size: 11px; }
    .glow-c { --g: #b8f2d5; } .glow-pc { --g: #b1cff2; } .glow-r { --g: #c6a7f2; } .glow-sr { --g: #ed6fa3; } .glow-ur { --g: #fa9931; } .glow-l { --g: #ffe144; } .glow-shiny { --g: #e9c15a; }
    button { cursor: pointer; }
    .open { background: none; border: 0; color: inherit; display: flex; flex-direction: column; align-items: center; position: relative; }
    .open img { width: 180px; height: 250px; border-radius: 12px; }
    .w-12 { width: 48px; height: 48px; border-radius: 50%; border: 1px solid #444; background: #1b1f1d; color: #fff; font-size: 20px; }
    .w-3 { width: 12px; height: 12px; border-radius: 50%; border: 0; background: #555; padding: 0; }
    .px-8 { padding: 10px 32px; border-radius: 999px; border: 0; background: #34d399; font-weight: 700; }
    .grid { display: flex; flex-wrap: wrap; gap: 18px; justify-content: center; padding: 24px; }
    .relative { position: relative; } .isolate { isolation: isolate; }
    .pager { display: flex; gap: 12px; justify-content: center; align-items: center; padding: 20px; }
  `;
  document.head.append(css);

  const fiber = (el, card) => {
    el.__reactFiber$harness = { memoizedProps: { card }, return: null };
  };
  const cardEl = (card) => {
    const el = document.createElement('div');
    const shiny = card.is_shiny ? ' glow-shiny' : '';
    el.className = `wm-card glow-${card.rarity.toLowerCase()}${shiny} rounded-2xl`;
    el.innerHTML = `<div class="h-[45%]" style="${card.image_url ? `background-image:url(${card.image_url})` : ''}"></div><span class="r">${card.rarity}</span><h3>${card.wikipedia_title}</h3>`;
    fiber(el, card);
    return el;
  };

  const main = document.createElement('main');
  document.body.append(main);
  const route = location.pathname;

  if (route.startsWith('/pulls')) {
    let packs = 6;
    const idle = () => {
      main.innerHTML = `<div class="flex flex-col items-center gap-4" style="padding:40px 0">
        <div class="text-center"><h1>Ouvrir un paquet</h1></div>
        <div class="card-frame"><b>${packs} / 10</b> paquets disponibles · Prochain dans 4:12</div>
        <button class="open"><img src="https://picsum.photos/seed/pack/180/250" alt="Ouvrir un paquet"><span>Ouvrir</span></button>
      </div>`;
      main.querySelector('.open').addEventListener('click', open);
    };
    const open = async (e) => {
      const btn = e.currentTarget;
      btn.querySelector('span').textContent = 'Ouverture...';
      const res = await fetch('/api/packs/open', { method: 'POST' });
      const data = await res.json();
      packs = data.packs_remaining;
      setTimeout(() => reveal(data.cards, 0), 650);
    };
    const reveal = (cards, i) => {
      const last = i === cards.length - 1;
      main.innerHTML = `<div><div class="flex flex-col items-center gap-4" style="padding:30px 0">
        <div><span>Carte</span> <span>${i + 1}</span> / ${cards.length}</div>
        <div class="relative wrap"></div>
        <div class="flex items-center gap-4"><button class="w-12 prev" ${i ? '' : 'disabled'}>‹</button>${cards.map((_, k) => `<button class="w-3${k === i ? ' scale-125' : ''}"></button>`).join('')}<button class="w-12 next" ${last ? 'disabled' : ''}>›</button></div>
        ${last ? '<button class="px-8 done">Terminer</button>' : ''}
      </div></div>`;
      const flip = document.createElement('div');
      flip.className = 'animate-card-flip';
      flip.append(cardEl(cards[i]));
      main.querySelector('.wrap').append(flip);
      main.querySelector('.prev').addEventListener('click', () => reveal(cards, i - 1));
      main.querySelector('.next').addEventListener('click', () => reveal(cards, i + 1));
      main.querySelector('.done')?.addEventListener('click', idle);
    };
    idle();
  } else if (route.startsWith('/collection') || route.startsWith('/marketplace') || route.startsWith('/global-collection')) {
    const grid = document.createElement('div');
    grid.className = 'flex flex-wrap justify-center grid';
    const rarities = ['C', 'PC', 'R', 'SR', 'UR', 'L'];
    for (let i = 0; i < 12; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'relative isolate group';
      wrap.append(cardEl({ id: 2000 + i, wikipedia_title: ['Paris', 'Lionel Messi', 'Tour Eiffel', 'Zeus', 'Tokyo', 'Pikachu'][i % 6], wikipedia_url: `https://fr.wikipedia.org/wiki/${['Paris', 'Lionel_Messi', 'Tour_Eiffel', 'Zeus', 'Tokyo', 'Pikachu'][i % 6]}`, rarity: rarities[i % 6], image_url: i % 4 === 1 ? null : `https://picsum.photos/seed/c${i}/320/240`, is_shiny: false, lang: 'fr' }));
      grid.append(wrap);
    }
    main.append(grid);
    const pager = document.createElement('div');
    pager.className = 'pager';
    pager.innerHTML = '<button>Précédent</button><span>Page 1 / 3</span><button>Suivant</button>';
    main.append(pager);
  }
})();
