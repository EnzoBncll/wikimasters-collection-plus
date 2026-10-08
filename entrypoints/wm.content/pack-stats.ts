import { goalAlbumsItem, titleKey, type GoalAlbum } from '@/lib/goal-albums';
import { ago, pullsItem, RARITIES, RARITY_COLOR, RARITY_RANK, SHINY_COLOR, type PullRecord } from '@/lib/packs';
import {
  bestCard,
  bestDay,
  byDay,
  freshTrend,
  inPeriod,
  PACK_PLUS_RATES,
  packScore,
  packsPer,
  PERIOD_LABEL,
  streaks,
  summarize,
  type StatsPeriod,
  type Summary,
} from '@/lib/pull-stats';
import { ctx, esc, onSettings, PANEL_CSS, themedHost } from './ctx';

/**
 * Statistiques de tirage intégrées à la page /pulls, sous le compteur de paquets.
 * Période au choix (aujourd'hui, 7 jours, tout), résumé en tuiles, taux de drop comparés, prévisions, records,
 * cartes d'albums à objectif, histogramme sur 30 jours, frise des paquets et image à partager.
 * Une colonne sur mobile, deux au-delà de 640 px ; repliable en une ligne.
 */

const CSS = `${PANEL_CSS}
  :host { display: block; width: 100%; }
  .panel { padding: 12px 14px; position: static; container-type: inline-size; }
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
  .title { font-weight: 700; font-size: 13px; margin-right: auto; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  .title i { font-style: normal; background: var(--holo); -webkit-background-clip: text; background-clip: text; color: transparent; font-weight: 800; }
  .tabs { display: flex; padding: 2px; border-radius: 999px; background: var(--muted); }
  .tabs button { all: unset; cursor: pointer; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; color: var(--muted-foreground); }
  .tabs button.on { background: var(--foreground); color: var(--background); }
  .ic { all: unset; cursor: pointer; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 999px; color: var(--muted-foreground); }
  .ic:hover { background: var(--muted); color: var(--foreground); }
  .ic svg { width: 15px; height: 15px; }
  .chev { transition: transform .2s; }
  .collapsed .chev { transform: rotate(-90deg); }
  .line { font-size: 12px; color: var(--muted-foreground); width: 100%; cursor: pointer; }
  .line b { color: var(--foreground); }
  .body { margin-top: 10px; }
  .collapsed .body { display: none; }
  .panel:not(.collapsed) .line { display: none; }

  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .tile { background: var(--muted); border-radius: 12px; padding: 8px 10px; font-size: 11px; color: var(--muted-foreground); }
  .tile b { display: block; font-size: 20px; line-height: 1.2; color: var(--foreground); font-variant-numeric: tabular-nums; }
  .tile small { font-size: 10px; }
  .cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 22px; }
  .col { min-width: 0; }
  h5 { margin: 14px 0 6px; font-size: 11px; color: var(--muted-foreground); font-weight: 600; display: flex; justify-content: space-between; gap: 8px; }
  h5 span { font-weight: 400; }
  .full { grid-column: 1 / -1; }

  .best { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 10px 9px; border-radius: 9px; margin-top: 10px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--c) 22%, transparent), transparent 85%); border-left: 3px solid var(--c); }
  .best .k { font-size: 10px; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: .08em; }
  .best .nm { flex: 1 0 100%; order: 5; font-weight: 700; font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
  .shy { margin-left: auto; font-size: 10px; color: ${SHINY_COLOR}; border: 1px solid rgba(233,193,90,.5); border-radius: 4px; padding: 0 4px; }
  .mix { display: flex; height: 5px; border-radius: 3px; overflow: hidden; background: var(--muted); margin-top: 8px; }
  .mix i { display: block; height: 100%; }

  .rates { display: flex; flex-direction: column; gap: 4px; }
  .rt { display: grid; grid-template-columns: 26px 1fr 46px 52px 26px; align-items: center; gap: 6px; font-size: 11px; }
  .tr { position: relative; height: 6px; border-radius: 3px; background: var(--muted); overflow: hidden; }
  .tr i { display: block; height: 100%; border-radius: 3px; }
  .tr u { position: absolute; top: -1px; bottom: -1px; width: 2px; background: var(--foreground); opacity: .7; }
  .pc { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .dl { text-align: right; font-variant-numeric: tabular-nums; font-size: 10px; }
  .up { color: oklch(0.72 0.17 150); } .down { color: oklch(0.68 0.2 25); } .eq { color: var(--muted-foreground); }
  .nb { text-align: right; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .note { font-size: 10px; color: var(--muted-foreground); margin-top: 4px; }

  .kv { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
  .kv div { display: flex; align-items: center; gap: 6px; }
  .kv .v { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
  .kv .v small { font-weight: 400; color: var(--muted-foreground); }
  .goal { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .goal span { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--muted); }

  .bars { display: flex; align-items: flex-end; gap: 2px; height: 80px; padding-top: 10px; }
  .bar { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; min-width: 0; }
  .bar i { display: block; width: 100%; border-radius: 2px 2px 0 0; background: var(--primary); opacity: .85; }
  .bar:hover i { opacity: 1; }
  .bar b { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .chart .axis { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted-foreground); margin-top: 3px; }

  .reel { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 8px; scrollbar-width: thin; scroll-snap-type: x proximity; }
  .pk { flex: none; display: flex; flex-direction: column; align-items: center; gap: 3px; scroll-snap-align: end; }
  .pk .dots { display: flex; flex-direction: column; gap: 3px; padding: 4px; border-radius: 7px; background: var(--muted); }
  .pk .dots i { width: 13px; height: 13px; border-radius: 4px; }
  .pk.top .dots { box-shadow: 0 0 0 1.5px var(--primary); }
  .pk .t { font-size: 9px; color: var(--muted-foreground); white-space: nowrap; }
  .empty { font-size: 12px; color: var(--muted-foreground); margin-top: 8px; }

  @container (min-width: 640px) {
    .panel { padding: 16px 20px; }
    .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .col.b { border-left: 1px solid var(--border); padding-left: 22px; }
  }
`;

const ICON = {
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/></svg>',
};

const chip = (r: string) => `<span class="chip" style="background:${RARITY_COLOR[r as keyof typeof RARITY_COLOR] ?? '#9ca3af'}">${esc(r)}</span>`;
const pct = (x: number, digits = 1) => `${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
const nf = (n: number) => n.toLocaleString('fr-FR');
const plural = (n: number, word: string) => `${nf(n)} ${word}${n > 1 ? 's' : ''}`;

/** Réglages d'affichage, propres à ce navigateur. */
const UI_KEY = 'wmt:pack-stats-ui';
interface Ui {
  period: StatsPeriod;
  collapsed: boolean;
}
function loadUi(): Ui {
  try {
    return { period: 'today', collapsed: false, ...JSON.parse(localStorage.getItem(UI_KEY) ?? '{}') };
  } catch {
    return { period: 'today', collapsed: false };
  }
}
function saveUi(ui: Ui) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    /* stockage du site indisponible : le choix ne sera pas retenu */
  }
}

export function startPackStats() {
  const { host, root } = themedHost('wmt-pack-stats');
  root.innerHTML = `<style>${CSS}</style><div class="panel"></div>`;
  const box = root.querySelector<HTMLElement>('.panel')!;
  let pulls: PullRecord[] = [];
  let goals: Record<string, GoalAlbum> = {};
  const ui = loadUi();
  pullsItem.getValue().then((v) => ((pulls = v), render()));
  pullsItem.watch((v) => ((pulls = v ?? []), render()));
  goalAlbumsItem.getValue().then((v) => ((goals = v ?? {}), render()));
  goalAlbumsItem.watch((v) => ((goals = v ?? {}), render()));

  box.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'toggle') ui.collapsed = !ui.collapsed;
    else if (act === 'period') ui.period = el.dataset.p as StatsPeriod;
    else if (act === 'share') return void shareImage(pulls, ui.period);
    saveUi(ui);
    render();
  });

  const anchor = () => {
    const frame = [...document.querySelectorAll('main .card-frame')].find((f) => /paquets? disponibles?/i.test(f.textContent ?? ''));
    return frame?.parentElement ?? null;
  };

  const mount = () => {
    if (!ctx.settings.packStats || !location.pathname.startsWith('/pulls')) {
      host.remove();
      return false;
    }
    const col = anchor();
    if (!col) return false;
    if (host.parentElement !== col || col.lastElementChild !== host) col.append(host);
    const ref = [...col.children].filter((c) => c !== host && !c.classList.contains('wmt-bg')).reduce((w, c) => Math.max(w, c.getBoundingClientRect().width), 0);
    // Toute la largeur utile sur grand écran (deux colonnes au-delà de 640 px), la largeur de l'écran sur mobile.
    const room = document.documentElement.clientWidth - 32;
    host.style.width = `${Math.round(Math.min(room, Math.max(ref, room >= 700 ? Math.min(920, room) : 300)))}px`;
    return true;
  };

  let lastHtml = '';
  function render() {
    if (!mount()) return;
    const html = view(pulls, goals, ui);
    // Rendu toutes les 5 s pour les « il y a… » : on ne touche au DOM (et à la frise défilée) que s'il a changé.
    if (html === lastHtml) return;
    const reel = box.querySelector<HTMLElement>('.reel');
    const atEnd = !reel || reel.scrollLeft + reel.clientWidth >= reel.scrollWidth - 8;
    lastHtml = html;
    box.classList.toggle('collapsed', ui.collapsed);
    box.innerHTML = html;
    const next = box.querySelector<HTMLElement>('.reel');
    if (next && atEnd) next.scrollLeft = next.scrollWidth;
  }

  onSettings(render);
  setInterval(render, 5000);
  addEventListener('resize', () => mount());
  new MutationObserver(() => {
    if (ctx.settings.packStats && location.pathname.startsWith('/pulls') && !host.isConnected) render();
  }).observe(document.body, { childList: true, subtree: true });
}

/* ---------- Contenu ---------- */

function view(pulls: PullRecord[], goals: Record<string, GoalAlbum>, ui: Ui): string {
  const list = inPeriod(pulls, ui.period);
  const s = summarize(list);
  const all = summarize(pulls);
  const tabs = (['today', 'week', 'all'] as StatsPeriod[])
    .map((p) => `<button data-act="period" data-p="${p}" class="${ui.period === p ? 'on' : ''}">${PERIOD_LABEL[p]}</button>`)
    .join('');
  const head = `<div class="head">
      <span class="title" data-act="toggle"><span class="chev">${ICON.chevron}</span>Tirages · Collection<i>+</i></span>
      ${ui.collapsed ? '' : `<span class="tabs">${tabs}</span><button class="ic" data-act="share" title="Image à partager (téléchargée et copiée)">${ICON.share}</button>`}
      <span class="line" data-act="toggle">${oneLine(s, ui.period)}</span>
    </div>`;
  if (!pulls.length) return `${head}<div class="body"><div class="empty">Ouvre un paquet pour commencer à suivre tes tirages.</div></div>`;
  if (!list.length) return `${head}<div class="body">${tiles(s)}<div class="empty">Aucun paquet ${ui.period === 'today' ? "aujourd'hui" : 'ces 7 derniers jours'} : choisis « Tout » pour l'historique complet.</div></div>`;

  const colA = `${best(list)}${rates(list, s, all, ui.period)}${forecast(pulls)}`;
  const colB = `${records(pulls)}${goalCards(list, goals)}${freshness(pulls, s)}`;
  return `${head}<div class="body">${tiles(s)}
    <div class="cols"><div class="col a">${colA}</div><div class="col b">${colB}</div>
    <div class="full">${chart(pulls)}${reel(list)}</div></div></div>`;
}

function oneLine(s: Summary, period: StatsPeriod): string {
  if (!s.packs) return `${PERIOD_LABEL[period]} : aucun paquet`;
  const top = RARITIES.filter((r) => ['L', 'UR', 'SR'].includes(r) && s.counts[r]).map((r) => `<b>${s.counts[r]}</b> ${r}`);
  return `${PERIOD_LABEL[period]} : <b>${nf(s.packs)}</b> paquet${s.packs > 1 ? 's' : ''} · <b>${nf(s.cards)}</b> cartes${top.length ? ` · ${top.join(' · ')}` : ''}${s.shiny ? ` · <b>${s.shiny}</b> shiny` : ''}`;
}

function tiles(s: Summary): string {
  const freshRate = s.known ? ` <small>${pct(s.fresh / s.known, 0)}</small>` : '';
  return `<div class="tiles">
    <div class="tile">Paquets<b>${nf(s.packs)}</b></div>
    <div class="tile">Cartes<b>${nf(s.cards)}</b></div>
    <div class="tile">Nouvelles<b>${nf(s.fresh)}${freshRate}</b></div>
    <div class="tile">Shiny<b style="color:${s.shiny ? SHINY_COLOR : 'inherit'}">${nf(s.shiny)}</b></div>
  </div>`;
}

function best(list: PullRecord[]): string {
  const cards = list.flatMap((p) => p.cards);
  const top = bestCard(cards);
  if (!top) return '';
  const mix = [...RARITIES]
    .reverse()
    .map((r) => {
      const n = cards.filter((c) => c.r === r).length;
      return n ? `<i title="${r} : ${n}" style="width:${(n / cards.length) * 100}%;background:${RARITY_COLOR[r]}"></i>` : '';
    })
    .join('');
  return `<div class="best" style="--c:${RARITY_COLOR[top.r as keyof typeof RARITY_COLOR] ?? '#9ca3af'}"><span class="k">Meilleure carte</span>${chip(top.r)}<span class="nm">${esc(top.name)}</span>${top.s ? '<span class="shy">shiny</span>' : ''}</div>
    <div class="mix">${mix}</div>`;
}

/**
 * Taux de drop de la période. Repère et écart : les taux annoncés quand la période n'a que des Pack ++,
 * sinon ta moyenne sur tout l'historique (les paquets standards n'ont pas de taux publics).
 */
function rates(list: PullRecord[], s: Summary, all: Summary, period: StatsPeriod): string {
  const onlyPlus = list.every((p) => p.src === 'pro-daily');
  const ref = (r: (typeof RARITIES)[number]) => (onlyPlus ? PACK_PLUS_RATES[r] : period !== 'all' && all.cards ? all.counts[r] / all.cards : null);
  const shares = RARITIES.map((r) => s.counts[r] / (s.cards || 1));
  const max = Math.max(...shares, ...RARITIES.map((r) => ref(r) ?? 0), 0.0001);
  const rows = RARITIES.map((r, i) => {
    const share = shares[i]!;
    const base = ref(r);
    const delta = base == null ? null : share - base;
    const deltaHtml =
      delta == null ? '' : Math.abs(delta) < 0.0005 ? '<span class="eq">=</span>' : `<span class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : '−'}${pct(Math.abs(delta))}</span>`;
    return `<div class="rt">${chip(r)}<span class="tr"><i style="width:${Math.max(share > 0 ? 3 : 0, (share / max) * 100)}%;background:${RARITY_COLOR[r]}"></i>${
      base != null ? `<u style="left:calc(${(base / max) * 100}% - 1px)" title="Repère : ${pct(base)}"></u>` : ''
    }</span><span class="pc">${pct(share)}</span><span class="dl">${deltaHtml}</span><span class="nb">${s.counts[r]}</span></div>`;
  }).join('');
  const note = onlyPlus
    ? 'Trait et écart : taux annoncés du Pack ++.'
    : period !== 'all'
      ? 'Trait et écart : ta moyenne sur tout l’historique (les paquets standards n’ont pas de taux publics).'
      : '';
  return `<h5>Taux de drop <span>${plural(s.cards, 'carte')}</span></h5><div class="rates">${rows}</div>${note ? `<div class="note">${note}</div>` : ''}`;
}

/** Prévision : à ton rythme, une carte de cette rareté tous les X paquets, et où tu en es. */
function forecast(pulls: PullRecord[]): string {
  const rows = (['L', 'UR', 'SR'] as const)
    .map((r) => {
      const every = packsPer(pulls, (c) => c.r === r);
      const { current } = streaks(pulls, (c) => c.r === r);
      const v =
        every == null
          ? `<small>pas encore vue · ${plural(current, 'paquet')}</small>`
          : `1 / ${nf(Math.round(every))} paquets <small>· ${current ? `dernière il y a ${plural(current, 'paquet')}` : 'dans le dernier paquet'}</small>`;
      return `<div>${chip(r)}<span class="v">${v}</span></div>`;
    })
    .join('');
  const shinyEvery = packsPer(pulls, (c) => c.s);
  return `<h5>Prévisions <span>à ton rythme</span></h5><div class="kv">${rows}
    <div><span class="chip" style="background:${SHINY_COLOR}">✦</span><span class="v">${shinyEvery == null ? '<small>pas encore de shiny</small>' : `1 shiny / ${nf(Math.round(shinyEvery))} paquets`}</span></div></div>`;
}

function records(pulls: PullRecord[]): string {
  const noL = streaks(pulls, (c) => c.r === 'L');
  const top = [...pulls].sort((a, b) => packScore(b) - packScore(a))[0];
  const day = bestDay(pulls);
  const topCards = top ? [...top.cards].sort((a, b) => (RARITY_RANK[a.r] ?? 9) - (RARITY_RANK[b.r] ?? 9)).slice(0, 3) : [];
  const dayText = day
    ? `${new Date(day.day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} <small>· ${[
        day.L && `${day.L} L`,
        day.UR && `${day.UR} UR`,
        day.SR && `${day.SR} SR`,
        plural(day.packs, 'paquet'),
      ]
        .filter(Boolean)
        .join(', ')}</small>`
    : '–';
  return `<h5>Records</h5><div class="kv">
    <div>Plus longue série sans ${chip('L')}<span class="v">${plural(noL.longest, 'paquet')}</span></div>
    <div>Meilleur paquet<span class="v">${top ? `${topCards.map((c) => chip(c.r)).join(' ')} <small>${ago(top.t)}</small>` : '–'}</span></div>
    <div>Meilleur jour<span class="v">${dayText}</span></div>
  </div>`;
}

/** Cartes tirées pendant la période qui font partie d'un album à objectif. */
function goalCards(list: PullRecord[], goals: Record<string, GoalAlbum>): string {
  const wanted = new Set(Object.values(goals).flatMap((g) => g.entries.map((e) => titleKey(e.title))));
  if (!wanted.size) return '';
  const hits = list.flatMap((p) => p.cards).filter((c) => wanted.has(titleKey(c.name)));
  const names = [...new Set(hits.map((c) => c.name))];
  return `<h5>Albums à objectif <span>${plural(hits.length, 'carte')}</span></h5>${
    names.length
      ? `<div class="goal">${names.slice(0, 8).map((n) => `<span>◇ ${esc(n)}</span>`).join('')}${names.length > 8 ? `<span>+${names.length - 8}</span>` : ''}</div>`
      : '<div class="note">Aucune carte de tes albums ◇ sur la période.</div>'
  }`;
}

/** Taux de nouvelles cartes : il baisse à mesure que la collection grossit. */
function freshness(pulls: PullRecord[], s: Summary): string {
  if (!s.known) return '';
  const { before, recent } = freshTrend(pulls);
  const trend =
    before != null && recent != null
      ? `<div>15 jours avant<span class="v">${pct(before, 0)}</span></div><div>15 derniers jours<span class="v ${recent < before ? 'down' : 'up'}">${pct(recent, 0)}</span></div>`
      : '';
  return `<h5>Nouvelles cartes</h5><div class="kv"><div>Sur la période<span class="v">${pct(s.fresh / s.known, 0)} <small>${nf(s.fresh)} / ${nf(s.known)}</small></span></div>${trend}</div>`;
}

/** Histogramme des paquets par jour sur 30 jours, L et UR marqués au-dessus des barres. */
function chart(pulls: PullRecord[]): string {
  const days = byDay(pulls, 30);
  if (!days.some((d) => d.packs)) return '';
  const max = Math.max(...days.map((d) => d.packs), 1);
  const bars = days
    .map((d) => {
      const label = `${new Date(d.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : ${plural(d.packs, 'paquet')}${d.L ? `, ${d.L} L` : ''}${d.UR ? `, ${d.UR} UR` : ''}`;
      const mark = d.L ? RARITY_COLOR.L : d.UR ? RARITY_COLOR.UR : null;
      return `<span class="bar" title="${esc(label)}">${mark ? `<b style="background:${mark}"></b>` : ''}<i style="height:${d.packs ? Math.max(4, (d.packs / max) * 100) : 0}%"></i></span>`;
    })
    .join('');
  const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `<h5>30 derniers jours <span>paquets par jour · ● L / UR</span></h5>
    <div class="chart"><div class="bars">${bars}</div>
    <div class="axis"><span>${fmt(days[0]!.day)}</span><span>${fmt(days[15]!.day)}</span><span>aujourd'hui</span></div></div>`;
}

/** Frise des paquets de la période (les plus récents à droite), meilleur paquet entouré. */
function reel(list: PullRecord[]): string {
  const shown = list.slice(-60);
  const topScore = Math.max(...shown.map(packScore));
  const cols = shown
    .map((p) => {
      const dots = [...p.cards]
        .sort((a, b) => (RARITY_RANK[a.r] ?? 9) - (RARITY_RANK[b.r] ?? 9))
        .map((c) => `<i title="${esc(`${c.r} · ${c.name}${c.s ? ' · shiny' : ''}`)}" style="background:${RARITY_COLOR[c.r as keyof typeof RARITY_COLOR] ?? '#555'}${c.s ? ';box-shadow:0 0 0 2px #fff inset' : ''}"></i>`)
        .join('');
      return `<div class="pk${packScore(p) === topScore && topScore > 0 ? ' top' : ''}"><span class="dots">${dots}</span><span class="t">${ago(p.t)}</span></div>`;
    })
    .join('');
  return `<h5>Paquets <span>${list.length > 60 ? '60 derniers' : plural(list.length, 'paquet')} · fais défiler</span></h5><div class="reel">${cols}</div>`;
}

/* ---------- Image à partager ---------- */

async function shareImage(pulls: PullRecord[], period: StatsPeriod) {
  const list = inPeriod(pulls, period);
  const s = summarize(list);
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#17132b');
  grad.addColorStop(1, '#0b0b14');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const holo = g.createLinearGradient(80, 0, W - 80, 0);
  ['#7DD3FC', '#C4B5FD', '#F9A8D4', '#FDE68A', '#86EFAC'].forEach((c, i) => holo.addColorStop(i / 4, c));
  g.fillStyle = holo;
  g.fillRect(80, 80, W - 160, 8);

  g.fillStyle = '#fff';
  g.font = '800 64px ui-sans-serif, system-ui, sans-serif';
  g.fillText('Mes tirages WikiMasters', 80, 190);
  g.fillStyle = '#a7a3c2';
  g.font = '500 34px ui-sans-serif, system-ui, sans-serif';
  g.fillText(`${PERIOD_LABEL[period]} · ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, 80, 245);

  const tilesData: [string, string][] = [
    ['Paquets', nf(s.packs)],
    ['Cartes', nf(s.cards)],
    ['Nouvelles', nf(s.fresh)],
    ['Shiny', nf(s.shiny)],
  ];
  tilesData.forEach(([label, value], i) => {
    const x = 80 + i * 235;
    g.fillStyle = 'rgba(255,255,255,.07)';
    g.beginPath();
    g.roundRect(x, 300, 215, 150, 24);
    g.fill();
    g.fillStyle = '#a7a3c2';
    g.font = '500 28px ui-sans-serif, system-ui, sans-serif';
    g.fillText(label, x + 24, 350);
    g.fillStyle = '#fff';
    g.font = '800 56px ui-sans-serif, system-ui, sans-serif';
    g.fillText(value, x + 24, 420);
  });

  const max = Math.max(...RARITIES.map((r) => s.counts[r] / (s.cards || 1)), 0.0001);
  RARITIES.forEach((r, i) => {
    const y = 520 + i * 62;
    const share = s.counts[r] / (s.cards || 1);
    g.fillStyle = RARITY_COLOR[r];
    g.beginPath();
    g.roundRect(80, y, 70, 40, 10);
    g.fill();
    g.fillStyle = '#111';
    g.font = '800 24px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(r, 115, y + 29);
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.beginPath();
    g.roundRect(175, y + 12, 600, 16, 8);
    g.fill();
    g.fillStyle = RARITY_COLOR[r];
    g.beginPath();
    g.roundRect(175, y + 12, Math.max(share > 0 ? 10 : 0, (share / max) * 600), 16, 8);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '700 28px ui-sans-serif, system-ui, sans-serif';
    g.fillText(`${pct(share)}  ·  ${s.counts[r]}`, 800, y + 30);
  });

  const top = bestCard(list.flatMap((p) => p.cards));
  if (top) {
    const c = RARITY_COLOR[top.r as keyof typeof RARITY_COLOR] ?? '#9ca3af';
    g.fillStyle = c;
    g.fillRect(80, 905, 8, 95);
    g.fillStyle = '#a7a3c2';
    g.font = '600 24px ui-sans-serif, system-ui, sans-serif';
    g.fillText(`MEILLEURE CARTE · ${top.r}${top.s ? ' · SHINY' : ''}`, 110, 935);
    g.fillStyle = '#fff';
    g.font = '800 46px ui-sans-serif, system-ui, sans-serif';
    g.fillText(top.name.length > 34 ? `${top.name.slice(0, 33)}…` : top.name, 110, 990);
  }
  g.fillStyle = '#6f6a8c';
  g.font = '500 22px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'right';
  g.fillText('Collection+ pour WikiMasters', W - 80, H - 40);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tirages-wikimasters-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {
    /* presse-papier refusé : l'image est quand même téléchargée */
  }
}
