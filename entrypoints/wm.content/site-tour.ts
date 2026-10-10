import { siteTourItem, TOUR_VERSION, type SiteTourSeen } from '@/lib/tour';
import { DISPLAY_FONT, esc, PANEL_CSS, siteModalOpen, themedHost } from './ctx';
import { reveal } from './reveal';

/**
 * Mini-visites sur WikiMasters, une fois chacune : la page d'ouverture des paquets, puis le premier révélé.
 * Chaque étape entoure un élément ajouté par Collection+ ; une étape dont l'élément est désactivé est sautée.
 */

interface Step {
  /** Zone mise en lumière ; absent : carte centrée. Une cible introuvable fait sauter l'étape. */
  target?: () => Element | null | undefined;
  title: string;
  text: string;
}

const inShadow = (host: string, selector: string) => () => {
  const el = document.querySelector(host);
  return el?.isConnected ? el.shadowRoot?.querySelector(selector) : null;
};

const SETTINGS_STEP: Step = {
  title: 'Tout se désactive',
  text: 'Chaque élément ajouté par Collection+ a son interrupteur : clique l’icône de l’extension, puis Réglages. Si quelque chose te gêne, coupe-le.',
};

const TOURS: Record<keyof SiteTourSeen, Step[]> = {
  pulls: [
    {
      target: inShadow('wmt-hud', '.dial'),
      title: 'Tes paquets',
      text: 'Le bouton rond ouvre un paquet, la touche Espace aussi. Autour : tes paquets prêts, celui qui charge, et le temps avant la réserve pleine.',
    },
    {
      target: () => document.querySelector('wmt-pack-stats'),
      title: 'Tes tirages',
      text: 'Taux de drop, prévisions, records et histogramme de tes paquets, sur aujourd’hui, 7 jours ou tout l’historique. Le bloc se replie en une ligne.',
    },
    SETTINGS_STEP,
  ],
  reveal: [
    {
      target: () => reveal.flip,
      title: 'Le révélé',
      text: 'Chaque carte a sa mise en scène selon sa rareté. Espace passe à la carte suivante.',
    },
    {
      target: inShadow('wmt-panels', '.side.left:not(.off) .panel'),
      title: 'Rangement',
      text: 'Tes étiquettes de rangement. Un clic pose l’étiquette sur la carte, sans l’ouvrir. Au clavier : Maj + 1 à 9.',
    },
    {
      target: inShadow('wmt-panels', '.side.right:not(.off) .panel'),
      title: 'Collections',
      text: 'Tes albums et collections. Un clic y range la carte ; au clavier, 1 à 9. Une carte attendue par un album à objectif s’y colle toute seule.',
    },
    {
      target: () => document.querySelector('wmt-status-arc'),
      title: 'Statut d’échange',
      text: 'Trade, Not Trade ou Discard, d’un clic ou avec les flèches ← ↓ →.',
    },
    {
      target: inShadow('wmt-tag-search', '.search'),
      title: 'Chercher ou créer',
      text: 'Tape / pour chercher une étiquette, Entrée pour la poser. Le + en crée une nouvelle sans quitter le paquet.',
    },
    { ...SETTINGS_STEP, text: 'Volets, raccourcis clavier, sons, animations : chacun a son interrupteur. Clique l’icône de l’extension, puis Réglages.' },
  ],
};

const CARD_W = 330;
const PAD = 8;

const CSS = `${PANEL_CSS}
  :host { position: fixed !important; inset: 0 !important; z-index: 2147483600 !important; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .ring { position: absolute; border-radius: 16px; box-shadow: 0 0 0 2px var(--primary); pointer-events: none; transition: all .3s cubic-bezier(.2,.9,.3,1); }
  .card { position: absolute; width: ${CARD_W}px; padding: 18px; display: flex; flex-direction: column; gap: 10px; background: var(--popover); transition: left .3s cubic-bezier(.2,.9,.3,1), top .3s cubic-bezier(.2,.9,.3,1); }
  .n { margin: 0; font-size: 11px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  h2 { margin: 2px 0 0; font: 700 16px/1.2 ${DISPLAY_FONT}; }
  p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--muted-foreground); }
  .row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .row span { margin-left: auto; }
  button { all: unset; cursor: pointer; height: 34px; padding: 0 12px; border-radius: 9px; font: 600 13px/34px ui-sans-serif, system-ui, sans-serif; color: var(--muted-foreground); }
  button:hover { color: var(--foreground); }
  button.next { padding: 0 16px; background: var(--primary); color: var(--primary-foreground); }
  button.next:hover { filter: brightness(1.1); color: var(--primary-foreground); }
  button.skip { padding: 0; font-weight: 400; }
`;

export function startSiteTour() {
  const { host, root } = themedHost('wmt-tour');
  let seen: SiteTourSeen = { pulls: TOUR_VERSION, reveal: TOUR_VERSION };
  siteTourItem.getValue().then((v) => (seen = v));
  siteTourItem.watch((v) => (seen = v));

  let running: { id: keyof SiteTourSeen; steps: Step[]; i: number } | null = null;

  const rectOf = (step: Step) => {
    const r = step.target?.()?.getBoundingClientRect();
    return r && r.width > 4 && r.height > 4 ? r : null;
  };

  const close = () => {
    if (!running) return;
    siteTourItem.setValue({ ...seen, [running.id]: TOUR_VERSION });
    running = null;
    host.remove();
  };

  const go = (delta: number) => {
    if (!running) return;
    let i = running.i + delta;
    // Étape dont l'élément n'est pas là (fonction désactivée) : on passe à la suivante.
    while (running.steps[i]?.target && !rectOf(running.steps[i]!)) i += delta;
    if (i < 0) return;
    if (i >= running.steps.length) return close();
    running.i = i;
    draw(true);
  };

  function draw(rebuild = false) {
    if (!running) return;
    const step = running.steps[running.i]!;
    const r = rectOf(step);
    const vw = innerWidth;
    const vh = innerHeight;
    const hole = r ? `M${r.left - PAD} ${r.top - PAD}h${r.width + PAD * 2}v${r.height + PAD * 2}h${-(r.width + PAD * 2)}Z` : '';
    if (rebuild) {
      const last = running.i === running.steps.length - 1;
      root.innerHTML = `<style>${CSS}</style><svg aria-hidden="true"><path fill-rule="evenodd" fill="rgb(0 0 0 / .62)"/></svg><div class="ring"></div>
        <div class="card panel" role="dialog" aria-label="Présentation de Collection+">
          <div><p class="n">${running.i + 1} / ${running.steps.length}</p><h2>${esc(step.title)}</h2></div>
          <p>${esc(step.text)}</p>
          <div class="row">${last ? '' : '<button class="skip" type="button">Passer</button>'}<span></span>${running.i ? '<button class="prev" type="button">Retour</button>' : ''}<button class="next" type="button">${last ? 'Terminer' : 'Suivant'}</button></div>
        </div>`;
      root.querySelector('.skip')?.addEventListener('click', close);
      root.querySelector('.prev')?.addEventListener('click', () => go(-1));
      root.querySelector('.next')!.addEventListener('click', () => go(1));
    }
    root.querySelector('path')!.setAttribute('d', `M0 0H${vw}V${vh}H0Z${hole}`);
    const ring = root.querySelector<HTMLElement>('.ring')!;
    ring.style.display = r ? '' : 'none';
    if (r) Object.assign(ring.style, { left: `${r.left - PAD}px`, top: `${r.top - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px` });
    const card = root.querySelector<HTMLElement>('.card')!;
    const h = card.offsetHeight || 190;
    let left = (vw - CARD_W) / 2;
    let top = (vh - h) / 2;
    if (r) {
      // À côté de la zone si la place le permet, sinon dessous ou dessus.
      const fitsRight = r.right + PAD + 16 + CARD_W < vw;
      const fitsLeft = r.left - PAD - 16 - CARD_W > 0;
      // Du côté extérieur de la zone (loin de la carte révélée, au centre) quand c'est possible.
      const preferLeft = r.left + r.width / 2 < vw / 2 - 40;
      if (fitsLeft && (preferLeft || !fitsRight)) (left = r.left - PAD - 16 - CARD_W), (top = r.top);
      else if (fitsRight) (left = r.right + PAD + 16), (top = r.top);
      else (left = r.left + r.width / 2 - CARD_W / 2), (top = vh - r.bottom > h + 40 ? r.bottom + PAD + 14 : r.top - PAD - 14 - h);
    }
    card.style.left = `${Math.min(Math.max(16, left), vw - CARD_W - 16)}px`;
    card.style.top = `${Math.min(Math.max(16, top), vh - h - 16)}px`;
  }

  const start = (id: keyof SiteTourSeen) => {
    running = { id, steps: TOURS[id], i: -1 };
    document.documentElement.append(host);
    go(1);
  };

  // Les touches vont à la visite, pas au révélé (Espace, chiffres et flèches y rangeraient la carte).
  window.addEventListener(
    'keydown',
    (e) => {
      if (!running || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.code === 'Space') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    },
    true,
  );

  // Déclenchement : la page (ou le révélé) doit être posée depuis un moment, pour ne pas couvrir une animation.
  let since = 0;
  let state = '';
  setInterval(() => {
    if (running) return draw();
    const onPulls = location.pathname.startsWith('/pulls') && !siteModalOpen();
    const now = !onPulls ? '' : reveal.active && reveal.flip ? 'reveal' : document.querySelector('wmt-hud, wmt-pack-stats') ? 'pulls' : '';
    if (now !== state) (state = now), (since = Date.now());
    if (!now || seen[now as keyof SiteTourSeen] >= TOUR_VERSION) return;
    if (Date.now() - since > (now === 'reveal' ? 3800 : 1500)) start(now as keyof SiteTourSeen);
  }, 250);
}
