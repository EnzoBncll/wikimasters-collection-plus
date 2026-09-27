/** Ouvre (ou remet au premier plan) l'onglet de revue de l'extension. */
export async function openReviewTab(onlyNew = false) {
  const url = browser.runtime.getURL('/review.html');
  const [existing] = await browser.tabs.query({ url: `${url}*` });
  if (existing?.id) {
    await browser.tabs.update(existing.id, { active: true, ...(onlyNew ? { url: `${url}#new` } : {}) });
    if (existing.windowId) await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url: onlyNew ? `${url}#new` : url });
  }
}
