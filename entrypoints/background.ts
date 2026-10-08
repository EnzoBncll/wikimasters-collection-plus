import { defineBackground } from '#imports';
import { startCloudSync } from '@/lib/cloud-sync';
import { OPEN_REVIEW_TAB } from '@/lib/messages';
import { EXPORT_SHEETS, exportToSheets, isSheetsConfigured } from '@/lib/sheets';
import { fmtDuration, packMetaItem, packStateItem, predict, PRO_PERIOD, thresholdAt, today } from '@/lib/packs';
import { getPalette } from '@/lib/palettes';
import { getSettings, settingsItem } from '@/lib/store';
import { openReviewTab } from '@/lib/tabs';
import { SITE_COOKIES, SITE_ORIGIN } from '@/lib/transport';

/** Icône de la barre d'outils aux couleurs de la palette choisie (PNG générés par `pnpm icons`). */
async function syncToolbarIcon() {
  const { palette } = await getSettings();
  const path = (size: number) => `/icon/themes/${palette}-${size}.png`;
  await browser.action.setIcon({ path: { 16: path(16), 32: path(32) } }).catch(() => {});
}

const SITE_PULLS = `${SITE_ORIGIN}/pulls`;

/** Nombre de paquets estimé sur l'icône, aux couleurs de la palette. */
async function updateBadge() {
  const [settings, state] = await Promise.all([getSettings(), packStateItem.getValue()]);
  const p = settings.iconBadge ? predict(state) : null;
  if (!p) {
    await browser.action.setBadgeText({ text: '' });
    await browser.action.setTitle({ title: 'Collection+' });
    return;
  }
  const palette = getPalette(settings.palette);
  await browser.action.setBadgeText({ text: String(p.n) });
  await browser.action.setBadgeBackgroundColor({ color: p.n >= p.max ? palette.icon.iri[0]! : palette.icon.bg[0] });
  await browser.action.setBadgeTextColor?.({ color: p.n >= p.max ? palette.icon.ink : '#ffffff' }).catch(() => {});
  await browser.action.setTitle({ title: `Collection+ · ~${p.n}/${p.max} paquets${p.fullAt ? `, plein dans ${fmtDuration(p.fullAt - Date.now())}` : ''}` });
}

/** Alarmes : seuil de paquets atteint, rappel du pack PRO quotidien. */
async function schedule() {
  const [settings, state] = await Promise.all([getSettings(), packStateItem.getValue()]);
  await browser.alarms.clear('wmt-full');
  const p = predict(state);
  if (settings.notifyFull && p && p.n < settings.notifyThreshold) {
    const when = thresholdAt(state, settings.notifyThreshold);
    if (when) await browser.alarms.create('wmt-full', { when: Math.max(when, Date.now() + 30_000) });
  }
  if (settings.proReminder) {
    const next = new Date();
    next.setHours(settings.proHour, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    const cur = await browser.alarms.get('wmt-pro');
    if (!cur || Math.abs(cur.scheduledTime - next.getTime()) > 60_000) await browser.alarms.create('wmt-pro', { when: next.getTime(), periodInMinutes: 1440 });
  } else await browser.alarms.clear('wmt-pro');
  await updateBadge();
}

async function onAlarm(alarm: { name: string }) {
  if (alarm.name === 'wmt-tick') return updateBadge();
  const [settings, state, meta] = await Promise.all([getSettings(), packStateItem.getValue(), packMetaItem.getValue()]);
  if (alarm.name === 'wmt-full') {
    const p = predict(state);
    const cycle = state ? `${state.nextAt}:${state.n}` : '';
    if (!settings.notifyFull || !p || p.n < settings.notifyThreshold || meta.notifiedFor === cycle) return updateBadge();
    await packMetaItem.setValue({ ...meta, notifiedFor: cycle });
    await browser.notifications.create('wmt-full', {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      priority: 2,
      title: p.n >= p.max ? 'Paquets pleins !' : `${p.n} paquets disponibles`,
      message: p.n >= p.max ? `Tu as ${p.max}/${p.max} paquets : la régénération est en pause.` : 'Ton seuil est atteint.',
    });
    await updateBadge();
  }
  if (alarm.name === 'wmt-pro') {
    const isPro = state?.period === PRO_PERIOD || settings.regenMode === 'pro' || meta.detectedPeriod === PRO_PERIOD;
    if (settings.proReminder && isPro && meta.proClaimedDate !== today()) {
      await browser.notifications.create('wmt-pro', {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title: 'Pack PRO du jour',
        message: "Tu n'as pas encore réclamé ton pack PRO aujourd'hui.",
      });
    }
  }
}

/** Un clic sur une notification ouvre (ou ramène) la page des paquets. */
async function openPulls(id: string) {
  await browser.notifications.clear(id);
  const tabs = await browser.tabs.query({ url: `${SITE_ORIGIN}/*` });
  const tab = tabs.find((t) => t.url?.includes('/pulls')) ?? tabs[0];
  if (tab?.id) {
    await browser.tabs.update(tab.id, { active: true, ...(tab.url?.includes('/pulls') ? {} : { url: SITE_PULLS }) });
    if (tab.windowId) await browser.windows.update(tab.windowId, { focused: true });
  } else await browser.tabs.create({ url: SITE_PULLS });
}

export default defineBackground(() => {
  startCloudSync();
  syncToolbarIcon();
  settingsItem.watch(() => {
    syncToolbarIcon();
    schedule();
  });
  packStateItem.watch(() => schedule());
  browser.alarms.onAlarm.addListener(onAlarm);
  browser.notifications.onClicked.addListener(openPulls);
  browser.alarms.create('wmt-tick', { periodInMinutes: 1 });
  schedule();

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === SITE_COOKIES) {
      browser.cookies
        .getAll({ url: SITE_ORIGIN })
        .then((list) =>
          sendResponse(
            list.map((c) => {
              try {
                return [c.name, decodeURIComponent(c.value)];
              } catch {
                return [c.name, c.value];
              }
            }),
          ),
        )
        .catch(() => sendResponse([]));
      return true;
    }
    if (message?.type === OPEN_REVIEW_TAB) {
      openReviewTab(Boolean(message.onlyNew));
      return;
    }
    if (message?.type === EXPORT_SHEETS) {
      if (!isSheetsConfigured()) {
        sendResponse({ error: 'not_configured' });
        return;
      }
      exportToSheets(message.payload)
        .then(async (url) => {
          await browser.tabs.create({ url });
          sendResponse({ url });
        })
        .catch((error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
  });
});
