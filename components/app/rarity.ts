import type { Rarity } from '@/lib/types';

export const RARITY_BG: Record<Rarity, string> = {
  C: 'bg-rarity-c',
  PC: 'bg-rarity-pc',
  R: 'bg-rarity-r',
  SR: 'bg-rarity-sr',
  L: 'bg-rarity-l',
  UR: 'bg-rarity-ur',
};

export const RARITY_TEXT: Record<Rarity, string> = {
  C: 'text-rarity-c',
  PC: 'text-rarity-pc',
  R: 'text-rarity-r',
  SR: 'text-rarity-sr',
  L: 'text-rarity-l',
  UR: 'text-rarity-ur',
};

export const RARITY_VAR: Record<Rarity, string> = {
  C: 'var(--rarity-c)',
  PC: 'var(--rarity-pc)',
  R: 'var(--rarity-r)',
  SR: 'var(--rarity-sr)',
  L: 'var(--rarity-l)',
  UR: 'var(--rarity-ur)',
};
