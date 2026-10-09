import { create } from 'zustand';
import { findOnMarket, type Listing } from '@/lib/market';

/** Résultat gardé 10 minutes : rouvrir l'album ne relance pas les recherches. */
const FRESH_MS = 10 * 60 * 1000;

export interface MarketSearch {
  status: 'running' | 'done' | 'error';
  done: number;
  total: number;
  at: number;
  /** Annonces par titre de case (clé titleKey). */
  listings: Map<string, Listing[]>;
  error?: string;
}

interface MarketState {
  byAlbum: Record<string, MarketSearch>;
  /** Cherche les cases manquantes de l'album sur le marché (sauf résultat récent, ou `force`). */
  search(albumId: string, titles: string[], force?: boolean): Promise<void>;
}

export const useMarket = create<MarketState>((set, get) => ({
  byAlbum: {},
  async search(albumId, titles, force = false) {
    const prev = get().byAlbum[albumId];
    if (prev?.status === 'running' || (!force && prev?.status === 'done' && Date.now() - prev.at < FRESH_MS)) return;
    const patch = (p: Partial<MarketSearch>) =>
      set((s) => ({ byAlbum: { ...s.byAlbum, [albumId]: { ...(s.byAlbum[albumId] ?? { listings: new Map(), at: 0, done: 0, total: 0, status: 'running' }), ...p } } }));
    patch({ status: 'running', done: 0, total: 0, error: undefined });
    try {
      const listings = await findOnMarket(titles, (done, total) => patch({ done, total }));
      patch({ status: 'done', listings, at: Date.now() });
    } catch (e) {
      patch({ status: 'error', error: (e as Error).message });
    }
  },
}));
