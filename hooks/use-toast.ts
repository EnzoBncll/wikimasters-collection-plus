import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

interface ToastState {
  items: ToastItem[];
  push(text: string, kind?: ToastKind): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push(text, kind = 'info') {
    const id = nextId++;
    set({ items: [...get().items.slice(-3), { id, text, kind }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 3500);
  },
  dismiss(id) {
    set({ items: get().items.filter((t) => t.id !== id) });
  },
}));

export const toast = (text: string, kind?: ToastKind) => useToasts.getState().push(text, kind);
