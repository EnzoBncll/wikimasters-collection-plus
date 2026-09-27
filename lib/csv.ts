import type { OwnedCard, SiteTag, TradeStatus } from './types';

interface Row {
  card: OwnedCard;
  status: TradeStatus;
}

const HEADERS = ['Titre', 'Rareté', 'Exemplaires', 'Statut', 'Étiquettes', 'Wikipédia'];

function toCells({ card, status }: Row, tagsById: Map<string, SiteTag>): string[] {
  return [
    card.title,
    card.rarity ?? '',
    String(card.count),
    status === 'trade' ? 'Trade' : status === 'not_trade' ? 'Not Trade' : '',
    card.tagIds.map((id) => tagsById.get(id)?.name ?? id).join(', '),
    card.wikipediaUrl ?? '',
  ];
}

export function toCsv(rows: Row[], tags: SiteTag[]): string {
  const tagsById = new Map(tags.map((t) => [t.id, t]));
  const escape = (value: string) => (/[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  // BOM pour qu'Excel lise correctement les accents.
  return '﻿' + [HEADERS, ...rows.map((r) => toCells(r, tagsById))].map((cells) => cells.map(escape).join(',')).join('\n');
}

/** Format tabulé : se colle directement dans Google Sheets. */
export function toTsv(rows: Row[], tags: SiteTag[]): string {
  const tagsById = new Map(tags.map((t) => [t.id, t]));
  const clean = (value: string) => value.replace(/[\t\n]/g, ' ');
  return [HEADERS, ...rows.map((r) => toCells(r, tagsById))].map((cells) => cells.map(clean).join('\t')).join('\n');
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
