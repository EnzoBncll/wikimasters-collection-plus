/**
 * Ce que le navigateur sait faire. Safari (iPhone, iPad, Mac) n'a ni notifications d'extension
 * ni `identity.getAuthToken` (Google Sheets, copie Drive) : ces options sont masquées au lieu de planter.
 */

/** Build Safari (`pnpm build:safari`). */
export const IS_SAFARI = import.meta.env.BROWSER === 'safari';

/** Notifications système (paquets pleins, rappel du pack PRO). */
export const hasNotifications = () => !IS_SAFARI && Boolean(browser.notifications?.create);
