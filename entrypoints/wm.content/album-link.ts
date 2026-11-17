import { decodeAlbumCode } from '@/lib/album-code';
import { bareName } from '@/lib/album-kind';
import { IMPORT_HASH, pendingAlbumCodeItem } from '@/lib/album-export';
import { OPEN_REVIEW_TAB } from '@/lib/messages';
import { DISPLAY_FONT, themedHost } from './ctx';

/**
 * Lien de partage d'album (lib/album-export.ts) : « …wiki-masters.com/collection#collection-plus=CP1-… ».
 * Une bulle propose d'ajouter l'album ; à l'accord, le code attend dans le stockage et l'app Collection+ s'ouvre
 * sur Albums, qui crée l'album et range les cartes déjà possédées. Rien n'est fait sans clic.
 */

const CSS = `
  :host { all: initial; }
  .card { position: fixed; right: 20px; bottom: 20px; z-index: 2147483001; width: min(360px, calc(100vw - 32px)); box-sizing: border-box;
    padding: 18px; border-radius: 18px; color: var(--frame-foreground);
    background: radial-gradient(120% 140% at 0% 0%, var(--frame-glow), transparent 60%), var(--frame);
    box-shadow: 0 18px 50px rgb(0 0 0 / .5), inset 0 0 0 1px color-mix(in oklch, var(--frame-foreground) 14%, transparent);
    font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; animation: in .35s cubic-bezier(.2,.9,.3,1.2); }
  @keyframes in { from { opacity: 0; transform: translateY(16px) scale(.97); } }
  .kicker { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .7; }
  h3 { margin: 4px 0 2px; font: 700 18px/1.25 ${DISPLAY_FONT}; }
  p { margin: 0 0 14px; opacity: .8; font-size: 13px; }
  .row { display: flex; gap: 8px; }
  button { flex: 1; padding: 10px 12px; border-radius: 999px; border: 0; cursor: pointer; font: 600 13px ui-sans-serif, system-ui, sans-serif; }
  .yes { background: var(--holo); color: #0b0b1a; }
  .no { background: color-mix(in oklch, var(--frame-foreground) 12%, transparent); color: inherit; }
`;

export function startAlbumLink() {
  const check = async () => {
    const at = location.hash.indexOf(IMPORT_HASH);
    if (at < 0) return;
    const code = decodeURIComponent(location.hash.slice(at + IMPORT_HASH.length)).trim();
    // Le lien a servi : on le retire de l'adresse (rechargement, partage de l'URL).
    history.replaceState(null, '', location.pathname + location.search);
    let name = 'Album à objectif';
    let count = 0;
    try {
      const shared = await decodeAlbumCode(code);
      name = bareName(shared.name);
      count = shared.items.length;
    } catch {
      return show(null, 0, null);
    }
    show(name, count, code);
  };

  const show = (name: string | null, count: number, code: string | null) => {
    document.querySelector('wmt-album-link')?.remove();
    const { host, root } = themedHost('wmt-album-link');
    root.innerHTML = `<style>${CSS}</style><div class="card" role="dialog" aria-label="Album partagé">
      <div class="kicker">Collection+ · album partagé</div>
      <h3></h3><p></p>
      <div class="row">${code ? '<button class="yes" type="button">Ajouter à mes albums</button>' : ''}<button class="no" type="button">${code ? 'Plus tard' : 'Fermer'}</button></div></div>`;
    root.querySelector('h3')!.textContent = name ?? 'Lien d’album abîmé';
    root.querySelector('p')!.textContent = code
      ? `${count} cases. Collection+ crée l’album et y range les cartes que tu as déjà.`
      : 'Ce lien ne contient pas un album lisible : vérifie qu’il a été copié en entier.';
    root.querySelector('.no')!.addEventListener('click', () => host.remove());
    root.querySelector('.yes')?.addEventListener('click', async () => {
      await pendingAlbumCodeItem.setValue(code);
      await browser.runtime.sendMessage({ type: OPEN_REVIEW_TAB });
      host.remove();
    });
    document.documentElement.append(host);
  };

  void check();
  window.addEventListener('hashchange', () => void check());
}
