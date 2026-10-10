import { storage } from '#imports';

/**
 * Version des visites guidées : l'augmenter les remontre une fois à tout le monde après une mise à jour.
 * 2 : visite refaite pour la 0.9.2 (albums à objectif, bibliothèque, souhaits, visite sur WikiMasters).
 */
export const TOUR_VERSION = 2;

/** Version de la visite de l'app déjà vue (ou passée) sur ce navigateur ; 0 : jamais. */
export const appTourItem = storage.defineItem<number>('local:appTourSeen', { fallback: 0 });

export interface SiteTourSeen {
  /** Page d'ouverture des paquets. */
  pulls: number;
  /** Premier révélé. */
  reveal: number;
}

/** Version des deux mini-visites sur WikiMasters déjà vues. */
export const siteTourItem = storage.defineItem<SiteTourSeen>('local:siteTourSeen', { fallback: { pulls: 0, reveal: 0 } });

/** Remet les visites sur WikiMasters à zéro (bouton « Revoir la visite »). */
export const resetSiteTour = () => siteTourItem.setValue({ pulls: 0, reveal: 0 });
