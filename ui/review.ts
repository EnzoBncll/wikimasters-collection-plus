import type { SiteTagsApi } from '@/lib/api';
import { collectionCache, saveCards, type CollectionCache } from '@/lib/cache';
import { downloadText, toCsv, toTsv } from '@/lib/csv';
import { getSettings, lastReviewAtItem, reviewedSnapshotItem, settingsItem, type Settings } from '@/lib/store';
import { EXPORT_SHEETS, type SheetExport } from '@/lib/sheets';
import { syncCollection, type SyncProgress } from '@/lib/sync';
import { applyTradeStatus, explicitStatus, newCardIds, tradeStatus, type TradeTags } from '@/lib/trade';
import { RARITY_LABEL, RARITY_ORDER, type OwnedCard, type Rarity, type SiteTag, type TradeStatus } from '@/lib/types';

type StatusFilter = 'all' | TradeStatus;
type SortKey = 'rarity' | 'title' | 'count';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type ReviewMode = 'overlay' | 'page';

const ago = (ts: number) => {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
};

/**
 * Écran de revue Trade / Not Trade.
 *  - mode « overlay » : plein écran par-dessus le site (Shadow DOM du content script) ;
 *  - mode « page »    : onglet dédié de l'extension.
 */
export class ReviewOverlay {
  private el: HTMLElement;
  private cards: OwnedCard[] = [];
  private tags: SiteTag[] = [];
  private tradeTags: TradeTags | null = null;
  private settings!: Settings;
  private newIds = new Set<string>();

  private visible: OwnedCard[] = [];
  private selected = new Set<string>();
  private anchor: number | null = null;
  private focus = 0;
  private painting: boolean | null = null;
  private busy = false;
  private syncing = false;
  private syncedAt = 0;
  private syncTimer: ReturnType<typeof setInterval> | undefined;

  private filter = {
    query: '',
    onlyNew: false,
    status: 'all' as StatusFilter,
    rarities: new Set<Rarity>(),
    duplicates: false,
    sort: 'rarity' as SortKey,
  };

  constructor(
    private root: ShadowRoot,
    private api: SiteTagsApi,
    private mode: ReviewMode,
    private onOpenInTab?: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = `overlay mode-${mode}`;
    this.el.hidden = mode === 'overlay';
    this.el.innerHTML = this.template();
    root.append(this.el);
    this.bind();
    reviewedSnapshotItem.watch(async (snapshot) => {
      this.newIds = newCardIds(this.cards, snapshot);
      if (this.cards.length) this.render();
      this.syncControls();
    });
    settingsItem.watch(async () => {
      this.settings = await getSettings();
      this.syncControls();
      if (this.cards.length) this.render();
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  async open({ onlyNew = false } = {}) {
    this.el.hidden = false;
    if (this.mode === 'overlay') document.documentElement.style.overflow = 'hidden';
    this.filter.onlyNew = onlyNew;
    this.syncControls();
    await this.load();
  }

  close() {
    if (this.mode === 'page') return;
    this.el.hidden = true;
    document.documentElement.style.overflow = '';
  }

  /** Adopte une mise à jour du cache faite par une autre vue (autre onglet, overlay…). */
  adopt(cache: CollectionCache | null) {
    if (!cache || this.busy || this.syncing || cache.syncedAt <= this.syncedAt) return;
    this.applyCache(cache);
    this.render();
  }

  // -------------------------------------------------------------------------
  // Données
  // -------------------------------------------------------------------------

  /**
   * Affiche tout de suite le cache local, puis synchronise en arrière-plan
   * (léger si rien n'a changé, complet sinon).
   */
  private async load(force = false) {
    if (this.syncing) return;
    this.settings = await getSettings();

    if (!this.cards.length) {
      const cached = await collectionCache.getValue();
      if (cached?.version === 2) {
        await this.applyCache(cached);
        this.render();
      } else {
        this.message('Premier chargement de la collection…');
      }
    }

    this.syncing = true;
    this.renderSync();
    try {
      const { cache, mode } = await syncCollection(this.api, this.settings, {
        force,
        onProgress: (p) => this.renderSync(p),
      });
      await this.applyCache(cache);
      this.render();
      if (mode === 'full' && force) this.toast('Collection rechargée depuis le site');
    } catch (error) {
      console.error('[WM Tags]', error);
      const text = error instanceof Error ? error.message : String(error);
      if (this.cards.length) this.toast(`Synchronisation impossible : ${text}`);
      else this.message(`Impossible de charger la collection : ${text}`);
    } finally {
      this.syncing = false;
      this.renderSync();
    }
  }

  private async applyCache(cache: CollectionCache) {
    this.cards = cache.cards;
    this.tags = cache.tags;
    this.tradeTags = cache.tradeTags;
    this.syncedAt = cache.syncedAt;
    this.newIds = newCardIds(this.cards, await reviewedSnapshotItem.getValue());
    this.syncControls();
  }

  private renderSync(p?: SyncProgress) {
    const el = this.ref('sync');
    clearInterval(this.syncTimer);
    if (this.syncing) {
      el.dataset.state = 'busy';
      el.textContent =
        p?.step === 'collection'
          ? `Rechargement… page ${(p.page ?? 0) + 1} · ${p.cards} cartes`
          : p?.step === 'tags'
            ? 'Lecture des étiquettes…'
            : 'Vérification…';
      return;
    }
    el.dataset.state = 'idle';
    const paint = () => (el.textContent = this.syncedAt ? `À jour · ${ago(this.syncedAt)}` : '');
    paint();
    this.syncTimer = setInterval(paint, 30_000);
  }

  private status(card: OwnedCard): TradeStatus {
    return this.tradeTags ? tradeStatus(card, this.tradeTags, this.settings) : 'unset';
  }

  private computeVisible() {
    const q = this.filter.query.trim().toLowerCase();
    const rank = (r: Rarity | null) => (r ? RARITY_ORDER.indexOf(r) : 99);
    this.visible = this.cards
      .filter((c) => !this.filter.onlyNew || this.newIds.has(c.cardId))
      .filter((c) => this.filter.status === 'all' || this.status(c) === this.filter.status)
      .filter((c) => !this.filter.rarities.size || (c.rarity && this.filter.rarities.has(c.rarity)))
      .filter((c) => !this.filter.duplicates || c.count > 1)
      .filter((c) => !q || c.title.toLowerCase().includes(q))
      .sort((a, b) => {
        if (this.filter.sort === 'title') return a.title.localeCompare(b.title, 'fr');
        if (this.filter.sort === 'count') return b.count - a.count || a.title.localeCompare(b.title, 'fr');
        return rank(a.rarity) - rank(b.rarity) || a.title.localeCompare(b.title, 'fr');
      });
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  private template() {
    const rarityChips = RARITY_ORDER.map(
      (r) => `<button class="chip" data-rarity="${r}" aria-pressed="false" title="${RARITY_LABEL[r]}">${r}</button>`,
    ).join('');
    return `
      <header>
        <h1>🏷️ Revue Trade</h1>
        <div class="stats" data-ref="stats"></div>
        <div class="spacer"></div>
        <label class="toggle" title="Une carte sans étiquette est considérée Trade">
          <input type="checkbox" data-ref="defaultTrade"> Tout Trade par défaut
        </label>
        <span class="sync" data-ref="sync"></span>
        <button class="btn" data-action="reload" title="Recharger toute la collection depuis le site">↻</button>
        ${this.mode === 'overlay' ? `<button class="btn" data-action="openTab" title="Ouvrir dans un onglet dédié">↗ Onglet</button>
        <button class="btn" data-action="close" title="Fermer (Échap)">✕</button>` : ''}
      </header>
      <div class="toolbar">
        <input type="search" data-ref="query" placeholder="Rechercher une carte…">
        <button class="chip" data-ref="onlyNew" aria-pressed="false">✨ Nouvelles</button>
        <select data-ref="status">
          <option value="all">Tous statuts</option>
          <option value="trade">🟢 Trade</option>
          <option value="not_trade">🔴 Not Trade</option>
          <option value="unset">⚪ Sans statut</option>
        </select>
        ${rarityChips}
        <button class="chip" data-ref="duplicates" aria-pressed="false">Doublons</button>
        <select data-ref="sort">
          <option value="rarity">Tri : rareté</option>
          <option value="title">Tri : titre</option>
          <option value="count">Tri : exemplaires</option>
        </select>
      </div>
      <div class="actions">
        <span class="sel-count" data-ref="selCount"></span>
        <button class="btn" data-action="selectAll">Tout sélectionner <kbd>A</kbd></button>
        <button class="btn" data-action="clear">Désélectionner</button>
        <span class="sep"></span>
        <button class="btn trade" data-action="trade">🟢 Trade <kbd>T</kbd></button>
        <button class="btn not-trade" data-action="notTrade">🔴 Not Trade <kbd>N</kbd></button>
        <button class="btn" data-action="fillTrade" title="Pose l'étiquette Trade sur toutes les cartes sans statut, pour pouvoir filtrer sur le site">Poser Trade sur les « sans statut »</button>
        <span class="spacer"></span>
        <button class="btn" data-action="csv">⬇ CSV</button>
        <button class="btn" data-action="sheets" title="Crée ou met à jour un classeur Google Sheets mis en forme">📊 Google Sheets</button>
        <button class="btn" data-action="tsv" title="Copie un tableau à coller dans n'importe quelle feuille">📋 Copier</button>
        <button class="btn primary" data-action="validate" title="Marque toutes les cartes actuelles comme vues">✓ Valider la revue</button>
      </div>
      <div class="progress" hidden data-ref="progress"><div></div></div>
      <div class="main" data-ref="main"></div>
    `;
  }

  private ref<T extends HTMLElement = HTMLElement>(name: string) {
    return this.el.querySelector<T>(`[data-ref="${name}"]`)!;
  }

  private message(text: string) {
    this.ref('main').innerHTML = `<div class="message">${esc(text)}</div>`;
  }

  private syncControls() {
    this.ref<HTMLButtonElement>('onlyNew').setAttribute('aria-pressed', String(this.filter.onlyNew));
    this.ref('onlyNew').textContent = `✨ Nouvelles${this.newIds.size ? ` (${this.newIds.size})` : ''}`;
    if (this.settings) this.ref<HTMLInputElement>('defaultTrade').checked = this.settings.defaultTrade;
  }

  private render() {
    this.computeVisible();
    const visibleIds = new Set(this.visible.map((c) => c.cardId));
    for (const id of this.selected) if (!visibleIds.has(id)) this.selected.delete(id);
    this.focus = Math.min(this.focus, Math.max(0, this.visible.length - 1));

    if (!this.visible.length) {
      this.message(this.cards.length ? 'Aucune carte ne correspond aux filtres.' : 'Collection vide.');
    } else {
      this.ref('main').innerHTML = `<div class="grid">${this.visible.map((c, i) => this.tileHtml(c, i)).join('')}</div>`;
    }
    this.renderMeta();
  }

  private tileHtml(card: OwnedCard, index: number) {
    const status = this.status(card);
    const implicit = this.tradeTags && explicitStatus(card, this.tradeTags) === 'unset' && status === 'trade';
    const label = status === 'trade' ? 'Trade' : status === 'not_trade' ? 'Not Trade' : 'Sans statut';
    const classes = ['tile', `s-${status}`, this.selected.has(card.cardId) ? 'selected' : '', index === this.focus ? 'focused' : '']
      .filter(Boolean)
      .join(' ');
    const img = card.imageUrl
      ? `<img src="${esc(card.imageUrl)}" loading="lazy" alt="">`
      : `<div class="noimg"></div>`;
    const rarity = card.rarity
      ? `<span class="rarity" style="background:var(--r-${card.rarity})">${card.rarity}</span>`
      : '';
    return `
      <div class="${classes}" data-index="${index}">
        ${img}
        ${this.newIds.has(card.cardId) ? '<span class="new-flag">NEW</span>' : ''}
        <button class="status-btn s-${status}${implicit ? ' implicit' : ''}" data-toggle title="Cliquer pour basculer${implicit ? ' (Trade par défaut, pas encore étiqueté)' : ''}">${label}</button>
        <div class="body">
          <div class="title" title="${esc(card.title)}">${esc(card.title)}</div>
          <div class="meta">${rarity}<span>×${card.count}</span></div>
        </div>
      </div>`;
  }

  private updateTile(index: number) {
    const tile = this.el.querySelector(`.tile[data-index="${index}"]`);
    const card = this.visible[index];
    if (!tile || !card) return;
    tile.outerHTML = this.tileHtml(card, index);
  }

  private renderMeta() {
    const counts = { trade: 0, not_trade: 0, unset: 0 };
    for (const c of this.cards) counts[this.status(c)]++;
    this.ref('stats').innerHTML =
      `<span><b>${this.cards.length}</b> cartes</span>` +
      `<span>🟢 <b>${counts.trade}</b></span>` +
      `<span>🔴 <b>${counts.not_trade}</b></span>` +
      (counts.unset ? `<span>⚪ <b>${counts.unset}</b></span>` : '') +
      `<span>✨ <b>${this.newIds.size}</b> nouvelles</span>`;
    const n = this.selected.size;
    this.ref('selCount').textContent = n ? `${n} sélectionnée${n > 1 ? 's' : ''}` : `${this.visible.length} affichées`;
    for (const action of ['trade', 'notTrade']) {
      this.el.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled = this.busy;
    }
  }

  private toast(text: string) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.root.append(t);
    setTimeout(() => t.remove(), 3000);
  }

  // -------------------------------------------------------------------------
  // Sélection & actions
  // -------------------------------------------------------------------------

  private setSelected(index: number, on: boolean) {
    const card = this.visible[index];
    if (!card) return;
    if (on) this.selected.add(card.cardId);
    else this.selected.delete(card.cardId);
    this.el.querySelector(`.tile[data-index="${index}"]`)?.classList.toggle('selected', on);
  }

  private moveFocus(index: number) {
    const next = Math.max(0, Math.min(this.visible.length - 1, index));
    this.el.querySelector(`.tile[data-index="${this.focus}"]`)?.classList.remove('focused');
    this.focus = next;
    const tile = this.el.querySelector(`.tile[data-index="${next}"]`);
    tile?.classList.add('focused');
    tile?.scrollIntoView({ block: 'nearest' });
  }

  /** Cible des actions : la sélection, ou à défaut la carte ayant le focus clavier. */
  private targets(): OwnedCard[] {
    if (this.selected.size) return this.visible.filter((c) => this.selected.has(c.cardId));
    const focused = this.visible[this.focus];
    return focused ? [focused] : [];
  }

  private async apply(cards: OwnedCard[], target: 'trade' | 'not_trade') {
    if (!cards.length || !this.tradeTags || this.busy) return;
    this.busy = true;
    this.renderMeta();
    const bar = this.ref('progress');
    bar.hidden = false;
    const result = await applyTradeStatus(this.api, cards, target, this.tradeTags, ({ done, total }) => {
      (bar.firstElementChild as HTMLElement).style.width = `${total ? (done / total) * 100 : 100}%`;
    });
    bar.hidden = true;
    this.busy = false;

    const byId = new Map(this.visible.map((c, i) => [c.cardId, i]));
    for (const card of cards) {
      const i = byId.get(card.cardId);
      if (i !== undefined) this.updateTile(i);
    }
    this.renderMeta();
    // Horodatage posé avant l'écriture : la notification du cache ne doit pas re-rendre cette vue.
    this.syncedAt = Date.now();
    await saveCards(this.cards, this.syncedAt);
    const label = target === 'trade' ? '🟢 Trade' : '🔴 Not Trade';
    this.toast(result.failed ? `${label} : ${result.done - result.failed}/${result.total} OK, ${result.failed} échec(s)` : `${label} appliqué à ${cards.length} carte(s)`);
    // Si un filtre de statut est actif, la carte peut sortir de la vue.
    if (this.filter.status !== 'all') this.render();
  }

  private async toggleOne(index: number) {
    const card = this.visible[index];
    if (!card) return;
    await this.apply([card], this.status(card) === 'not_trade' ? 'trade' : 'not_trade');
  }

  private exportRows() {
    const source = this.selected.size ? this.targets() : this.visible;
    return source.map((card) => ({ card, status: this.status(card) }));
  }

  private async exportSheets(button: HTMLButtonElement) {
    const tagName = new Map(this.tags.map((t) => [t.id, t.name]));
    const payload: SheetExport = {
      withImages: this.settings.sheetImages,
      rows: this.exportRows().map(({ card, status }) => ({
        title: card.title,
        rarity: card.rarity,
        count: card.count,
        status,
        tags: card.tagIds.map((id) => tagName.get(id) ?? id),
        isNew: this.newIds.has(card.cardId),
        imageUrl: card.imageUrl,
        wikipediaUrl: card.wikipediaUrl,
      })),
    };
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '📊 Export en cours…';
    try {
      const res = await browser.runtime.sendMessage({ type: EXPORT_SHEETS, payload });
      if (res?.error === 'not_configured') {
        this.toast("Export Google Sheets pas encore configuré (voir README). En attendant : « 📋 Copier ».");
      } else if (res?.error) {
        this.toast(`Google Sheets : ${res.error}`);
      } else {
        this.toast(`Classeur mis à jour (${payload.rows.length} cartes)`);
      }
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  // -------------------------------------------------------------------------
  // Événements
  // -------------------------------------------------------------------------

  private bind() {
    const main = this.ref('main');

    main.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      const tile = target.closest<HTMLElement>('.tile');
      if (!tile || target.closest('[data-toggle]')) return;
      e.preventDefault();
      const index = Number(tile.dataset.index);
      this.moveFocus(index);

      if (e.shiftKey && this.anchor !== null) {
        const [a, b] = [Math.min(this.anchor, index), Math.max(this.anchor, index)];
        for (let i = a; i <= b; i++) this.setSelected(i, true);
      } else {
        const on = !this.selected.has(this.visible[index]?.cardId ?? '');
        this.setSelected(index, on);
        this.anchor = index;
        this.painting = on; // glisser pour peindre la sélection
      }
      this.renderMeta();
    });

    main.addEventListener('mouseover', (e) => {
      if (this.painting === null) return;
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.tile');
      if (!tile) return;
      this.setSelected(Number(tile.dataset.index), this.painting);
      this.renderMeta();
    });
    window.addEventListener('mouseup', () => (this.painting = null));

    main.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-toggle]');
      if (!btn) return;
      const tile = btn.closest<HTMLElement>('.tile')!;
      this.toggleOne(Number(tile.dataset.index));
    });

    this.el.addEventListener('click', async (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (!action) return;
      switch (action) {
        case 'close':
          return this.close();
        case 'reload':
          return this.load(true);
        case 'openTab':
          this.close();
          return this.onOpenInTab?.();
        case 'selectAll':
          this.visible.forEach((c) => this.selected.add(c.cardId));
          return this.render();
        case 'clear':
          this.selected.clear();
          return this.render();
        case 'trade':
          return this.apply(this.targets(), 'trade');
        case 'notTrade':
          return this.apply(this.targets(), 'not_trade');
        case 'fillTrade': {
          if (!this.tradeTags) return;
          const unset = this.cards.filter((c) => explicitStatus(c, this.tradeTags!) === 'unset');
          if (!unset.length) return this.toast('Toutes les cartes ont déjà un statut.');
          const btn = e.target as HTMLButtonElement;
          if (btn.dataset.confirm !== '1') {
            btn.dataset.confirm = '1';
            btn.textContent = `Confirmer : ${unset.length} cartes → Trade ?`;
            setTimeout(() => {
              btn.dataset.confirm = '';
              btn.textContent = 'Poser Trade sur les « sans statut »';
            }, 4000);
            return;
          }
          btn.dataset.confirm = '';
          btn.textContent = 'Poser Trade sur les « sans statut »';
          await this.apply(unset, 'trade');
          return this.render();
        }
        case 'csv':
          downloadText(`wikimasters-collection-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(this.exportRows(), this.tags));
          return this.toast('CSV téléchargé');
        case 'tsv':
          await navigator.clipboard.writeText(toTsv(this.exportRows(), this.tags));
          return this.toast('Copié ! Colle-le dans une feuille Google Sheets (Cmd+V).');
        case 'sheets':
          return this.exportSheets(e.target as HTMLButtonElement);
        case 'validate': {
          const snapshot = Object.fromEntries(this.cards.map((c) => [c.cardId, c.count]));
          await reviewedSnapshotItem.setValue(snapshot);
          await lastReviewAtItem.setValue(Date.now());
          this.newIds.clear();
          this.filter.onlyNew = false;
          this.syncControls();
          this.render();
          return this.toast('Revue validée : les cartes actuelles ne sont plus « nouvelles ».');
        }
      }
    });

    const query = this.ref<HTMLInputElement>('query');
    let debounce: ReturnType<typeof setTimeout>;
    query.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this.filter.query = query.value;
        this.render();
      }, 150);
    });

    this.ref('onlyNew').addEventListener('click', () => {
      this.filter.onlyNew = !this.filter.onlyNew;
      this.syncControls();
      this.render();
    });
    this.ref('duplicates').addEventListener('click', (e) => {
      this.filter.duplicates = !this.filter.duplicates;
      (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(this.filter.duplicates));
      this.render();
    });
    this.ref<HTMLSelectElement>('status').addEventListener('change', (e) => {
      this.filter.status = (e.target as HTMLSelectElement).value as StatusFilter;
      this.render();
    });
    this.ref<HTMLSelectElement>('sort').addEventListener('change', (e) => {
      this.filter.sort = (e.target as HTMLSelectElement).value as SortKey;
      this.render();
    });
    this.el.querySelectorAll<HTMLElement>('[data-rarity]').forEach((chip) =>
      chip.addEventListener('click', () => {
        const r = chip.dataset.rarity as Rarity;
        if (this.filter.rarities.has(r)) this.filter.rarities.delete(r);
        else this.filter.rarities.add(r);
        chip.setAttribute('aria-pressed', String(this.filter.rarities.has(r)));
        this.render();
      }),
    );
    this.ref<HTMLInputElement>('defaultTrade').addEventListener('change', async (e) => {
      this.settings = { ...this.settings, defaultTrade: (e.target as HTMLInputElement).checked };
      await settingsItem.setValue(this.settings);
      this.render();
    });

    // Raccourcis clavier (uniquement quand l'overlay est ouvert et qu'on ne tape pas dans un champ).
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isOpen) return;
        const typing = e.composedPath().some((n) => n instanceof HTMLInputElement || n instanceof HTMLSelectElement);
        if (e.key === 'Escape') {
          if (typing) (e.composedPath()[0] as HTMLElement).blur();
          else if (this.selected.size) {
            this.selected.clear();
            this.render();
          } else this.close();
          e.preventDefault();
          return;
        }
        if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

        const cols = Math.max(1, getComputedStyle(this.el.querySelector('.grid') ?? this.el).gridTemplateColumns.split(' ').length);
        const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
        if (e.key in moves) {
          const from = this.focus;
          this.moveFocus(this.focus + (moves[e.key] ?? 0));
          if (e.shiftKey) {
            this.setSelected(from, true);
            this.setSelected(this.focus, true);
            this.renderMeta();
          }
        } else if (e.key === ' ') {
          const card = this.visible[this.focus];
          if (card) this.setSelected(this.focus, !this.selected.has(card.cardId));
          this.renderMeta();
        } else if (e.key === 't' || e.key === 'T') {
          this.apply(this.targets(), 'trade');
        } else if (e.key === 'n' || e.key === 'N') {
          this.apply(this.targets(), 'not_trade');
        } else if (e.key === 'a' || e.key === 'A') {
          this.visible.forEach((c) => this.selected.add(c.cardId));
          this.render();
        } else if (e.key === '/') {
          query.focus();
        } else return;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
  }
}
