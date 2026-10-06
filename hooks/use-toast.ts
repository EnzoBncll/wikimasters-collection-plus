import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
  action?: ToastAction;
  /** Une notification de même clé remplace la précédente au lieu de s'empiler. */
  key?: string;
}

interface ToastState {
  items: ToastItem[];
  push(text: string, kind?: ToastKind, action?: ToastAction, key?: string): void;
  dismiss(id: number): void;
}

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push(text, kind = 'info', action, key) {
    const same = key ? get().items.find((t) => t.key === key) : undefined;
    const id = same?.id ?? nextId++;
    const item = { id, text, kind, action, key };
    set({ items: same ? get().items.map((t) => (t.id === id ? item : t)) : [...get().items.slice(-3), item] });
    // Une notification avec bouton reste plus longtemps, le temps de cliquer.
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => get().dismiss(id), action ? 10000 : kind === 'error' ? 6000 : 3500));
  },
  dismiss(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set({ items: get().items.filter((t) => t.id !== id) });
  },
}));

export const toast = (text: string, kind?: ToastKind, action?: ToastAction, key?: string) => useToasts.getState().push(text, kind, action, key);
