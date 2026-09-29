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
}

interface ToastState {
  items: ToastItem[];
  push(text: string, kind?: ToastKind, action?: ToastAction): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push(text, kind = 'info', action) {
    const id = nextId++;
    set({ items: [...get().items.slice(-3), { id, text, kind, action }] });
    // Une notification avec bouton reste plus longtemps, le temps de cliquer.
    setTimeout(() => get().dismiss(id), action ? 10000 : kind === 'error' ? 6000 : 3500);
  },
  dismiss(id) {
    set({ items: get().items.filter((t) => t.id !== id) });
  },
}));

export const toast = (text: string, kind?: ToastKind, action?: ToastAction) => useToasts.getState().push(text, kind, action);
