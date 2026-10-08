import { ago, packsSince, pullsItem, RARITIES, RARITY_COLOR, RARITY_RANK, rarityCounts, SHINY_COLOR, type PullRecord } from '@/lib/packs';
import { ctx, esc, onSettings, PANEL_CSS, themedHost } from './ctx';

/** Statistiques de tirage intégrées à la page /pulls, sous le compteur de paquets. */

const CSS = `${PANEL_CSS}
  :host { display: block; width: 100%; }
  .panel { padding: 12px 14px; position: static; }
  .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .title { font-weight: 700; font-size: 13px; }
  .title i { font-style: normal; background: var(--holo); -webkit-background-clip: text; background-clip: text; color: transparent; font-weight: 800; }
  .sub { font-size: 11px; color: var(--muted-foreground); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
  .cell { background: var(--muted); border-radius: 10px; padding: 6px 8px; font-size: 11px; color: var(--muted-foreground); }
  .cell b { display: block; font-size: 16px; color: var(--foreground); font-variant-numeric: tabular-nums; }
  h5 { margin: 12px 0 6px; font-size: 11px; color: var(--muted-foreground); font-weight: 600; display: flex; justify-content: space-between; }
  .packs { display: flex; flex-direction: column; gap: 4px; }
  .pk { display: flex; align-items: center; gap: 6px; }
  .pk .dots { display: flex; gap: 3px; flex: 1; }
  .pk .dots i { width: 14px; height: 14px; border-radius: 4px; }
  .t { font-size: 11px; color: var(--muted-foreground); flex: none; }
  .it { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .it .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { font-size: 12px; color: var(--muted-foreground); }
  .rates { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
  .rt { display: grid; grid-template-columns: 26px 1fr 46px 30px; align-items: center; gap: 6px; font-size: 11px; }
  .tr { height: 6px; border-radius: 3px; background: var(--muted); overflow: hidden; }
  .tr i { display: block; height: 100%; border-radius: 3px; }
  .pc { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .nb { text-align: right; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .today { margin: 2px 0 4px; padding: 10px; border-radius: 12px; background: var(--muted); }
  .td-h { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .td-h .l { font-size: 11px; font-weight: 700; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: .08em; }
  .td-h .n { font-size: 12px; color: var(--muted-foreground); }
  .td-h .n b { color: var(--foreground); font-size: 14px; font-variant-numeric: tabular-nums; }
  .td-mix { display: flex; height: 5px; border-radius: 3px; overflow: hidden; background: var(--card); margin-bottom: 8px; }
  .td-mix i { display: block; height: 100%; }
  .td-best { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 10px 9px; border-radius: 9px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--c) 22%, transparent), transparent 85%); border-left: 3px solid var(--c); }
  .td-best .k { font-size: 10px; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: .08em; }
  .td-best .nm { flex: 1 0 100%; order: 5; font-weight: 700; font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
  .td-best .sh, .shy { margin-left: auto; font-size: 10px; color: ${SHINY_COLOR}; border: 1px solid rgba(233,193,90,.5); border-radius: 4px; padding: 0 4px; }
  .td-foot { display: flex; gap: 10px; margin-top: 7px; font-size: 11px; color: var(--muted-foreground); }
  .td-foot b { color: var(--primary); }
`;

const chip = (r: string) => `<span class="chip" style="background:${RARITY_COLOR[r as keyof typeof RARITY_COLOR] ?? '#9ca3af'}">${esc(r)}</span>`;
const pct = (x: number) => `${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

export function startPackStats() {
  const { host, root } = themedHost('wmt-pack-stats');
  root.innerHTML = `<style>${CSS}</style><div class="panel"></div>`;
  const box = root.querySelector('.panel')!;
  let pulls: PullRecord[] = [];
  pullsItem.getValue().then((v) => ((pulls = v), render()));
  pullsItem.watch((v) => ((pulls = v ?? []), render()));

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
    host.style.width = `${Math.max(300, Math.min(420, Math.round(ref)))}px`;
    return true;
  };

  function render() {
    if (!mount()) return;
    const { counts, total } = rarityCounts(pulls);
    const opens = pulls.filter((p) => p.src === 'open');
    const maxShare = Math.max(...RARITIES.map((r) => counts[r] / (total || 1)), 0.0001);
    const rates = `<h5>Taux de drop <span>${total.toLocaleString('fr-FR')} cartes ouvertes</span></h5>
      <div class="rates">${RARITIES.map((r) => {
        const share = counts[r] / (total || 1);
        return `<div class="rt">${chip(r)}<span class="tr"><i style="width:${Math.max(share > 0 ? 3 : 0, (share / maxShare) * 100)}%;background:${RARITY_COLOR[r]}"></i></span>
          <span class="pc">${pct(share)}</span><span class="nb">${counts[r]}</span></div>`;
      }).join('')}</div>`;
    const streaks = `<div class="grid">
      <div class="cell">Sans ${chip('L')}<b>${packsSince(pulls, (c) => c.r === 'L')}</b></div>
      <div class="cell">Sans ${chip('UR')}<b>${packsSince(pulls, (c) => c.r === 'UR')}</b></div>
      <div class="cell">Sans ${chip('SR')}<b>${packsSince(pulls, (c) => c.r === 'SR')}</b></div>
      <div class="cell">Sans shiny<b>${packsSince(pulls, (c) => c.s)}</b></div></div>`;
    const sortCards = (cards: PullRecord['cards']) => [...cards].sort((a, b) => (RARITY_RANK[a.r] ?? 9) - (RARITY_RANK[b.r] ?? 9));
    const last = pulls
      .slice(-5)
      .reverse()
      .map(
        (p) => `<div class="pk"><span class="dots">${sortCards(p.cards)
          .map((c) => `<i title="${esc(`${c.r} · ${c.name}`)}" style="background:${RARITY_COLOR[c.r as keyof typeof RARITY_COLOR] ?? '#555'}${c.s ? ';box-shadow:0 0 0 2px #fff inset' : ''}"></i>`)
          .join('')}</span><span class="t">${ago(p.t)}</span></div>`,
      )
      .join('');
    const best = pulls
      .flatMap((p) => p.cards.map((c) => ({ ...c, t: p.t })))
      .filter((c) => (RARITY_RANK[c.r] ?? 9) <= 2 || c.s)
      .slice(-4)
      .reverse()
      .map((c) => `<div class="it">${chip(c.r)}<span class="n">${esc(c.name)}</span>${c.s ? '<span class="shy">shiny</span>' : ''}<span class="t">${ago(c.t)}</span></div>`)
      .join('');

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todayPulls = opens.filter((p) => p.t >= start.getTime());
    const todayCards = todayPulls.flatMap((p) => p.cards.map((c) => ({ ...c, t: p.t })));
    const todayBest = [...todayCards].sort((a, b) => (RARITY_RANK[a.r] ?? 9) - (RARITY_RANK[b.r] ?? 9) || Number(b.s) - Number(a.s) || b.t - a.t)[0];
    const todayNew = todayCards.filter((c) => c.o === 1).length;
    const todayShiny = todayCards.filter((c) => c.s).length;
    const mix = [...RARITIES]
      .reverse()
      .map((r) => {
        const n = todayCards.filter((c) => c.r === r).length;
        return n ? `<i title="${r} : ${n}" style="width:${(n / todayCards.length) * 100}%;background:${RARITY_COLOR[r]}"></i>` : '';
      })
      .join('');
    const todayHtml = `<div class="today">
      <div class="td-h"><span class="l">Aujourd'hui</span><span class="n"><b>${todayPulls.length}</b> paquet${todayPulls.length > 1 ? 's' : ''} · <b>${todayCards.length}</b> cartes</span></div>
      ${
        todayBest
          ? `<div class="td-mix">${mix}</div>
        <div class="td-best" style="--c:${RARITY_COLOR[todayBest.r as keyof typeof RARITY_COLOR] ?? '#9ca3af'}"><span class="k">Meilleure</span>${chip(todayBest.r)}<span class="nm">${esc(todayBest.name)}</span>${todayBest.s ? '<span class="sh">shiny</span>' : ''}</div>
        ${todayNew || todayShiny ? `<div class="td-foot">${todayNew ? `<span><b>${todayNew}</b> nouvelle${todayNew > 1 ? 's' : ''}</span>` : ''}${todayShiny ? `<span><b style="color:${SHINY_COLOR}">${todayShiny}</b> shiny</span>` : ''}</div>` : ''}`
          : `<div class="td-h" style="margin:0"><span class="n">Pas encore de paquet ouvert aujourd'hui.</span></div>`
      }</div>`;

    box.innerHTML = `
      <div class="head"><span class="title">Tirages · Collection<i>+</i></span><span class="sub">${pulls.length} paquet${pulls.length > 1 ? 's' : ''} · ${total} carte${total > 1 ? 's' : ''}</span></div>
      ${
        pulls.length
          ? `${todayHtml}${rates}<h5>Séries en cours</h5>${streaks}<h5>Derniers paquets</h5><div class="packs">${last}</div>${best ? `<h5>Dernières grosses cartes</h5>${best}` : ''}`
          : '<div class="empty">Ouvre un paquet pour commencer à suivre tes tirages.</div>'
      }`;
  }

  onSettings(render);
  setInterval(render, 5000);
  new MutationObserver(() => {
    if (ctx.settings.packStats && location.pathname.startsWith('/pulls') && !host.isConnected) render();
  }).observe(document.body, { childList: true, subtree: true });
}
