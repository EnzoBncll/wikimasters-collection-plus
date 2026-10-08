import { defineContentScript } from '#imports';

/**
 * Contexte de la page (MAIN world) : lit les données React des cartes affichées par le site
 * pour les poser en attributs data-wmt-* (lus par le content script isolé). Lecture seule.
 */
export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',

  main() {
    const w = window as any;
    if (w.__wmtPage) return;
    w.__wmtPage = true;

    const fiberOf = (el: Element): any => {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
      return key ? (el as any)[key] : null;
    };
    const cardData = (el: Element, depth = 5): any => {
      let f = fiberOf(el);
      for (let i = 0; i < depth && f; i++, f = f.return) {
        const p = f.memoizedProps;
        if (p?.card && typeof p.card === 'object' && 'wikipedia_title' in p.card) return p.card;
      }
      return null;
    };

    // ---------------- Annotation des cartes ----------------
    const annotate = () => {
      for (const el of document.querySelectorAll<HTMLElement>('main [class*="glow-"]')) {
        const card = cardData(el);
        if (!card) continue;
        const id = String(card.id ?? '');
        if (el.dataset.wmtId === id) continue;
        el.dataset.wmtId = id;
        el.dataset.wmtTitle = String(card.wikipedia_title ?? '');
        el.dataset.wmtWiki = String(card.wikipedia_url ?? '');
        el.dataset.wmtLang = String(card.lang ?? '');
        el.dataset.wmtRarity = String(card.rarity ?? '');
        el.dataset.wmtShiny = card.is_shiny ? '1' : '';
        el.dataset.wmtNoimg = card.hide_image || !card.image_url ? '1' : '';
      }
    };
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        annotate();
      }, 150);
    };
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  },
});
