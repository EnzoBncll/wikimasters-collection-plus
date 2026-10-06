import { storage } from '#imports';
import { ai } from './ai';
import type { OwnedCard, SiteTag } from './types';
import { PROPS, type CardFacts, type PropId } from './wikidata';

/**
 * Fiches d'album rédigées par l'IA : ce que l'album rassemble, ce qu'on y met, ce qu'on n'y met pas,
 * et des mots-clés. Les mots-clés et critères nourrissent les recommandations (lib/related.ts, file Consolider).
 */

export interface AlbumSheet {
  /** Deux ou trois phrases sur le thème de l'album. */
  summary: string;
  /** Ce qui a sa place dans l'album. */
  include: string[];
  /** Ce qui n'y a pas sa place (et où le ranger plutôt, si un autre album convient). */
  exclude: string[];
  /** Mots-clés du thème, utilisés pour reconnaître les cartes à y ajouter. */
  keywords: string[];
  emoji: string;
  at: number;
  /** Nombre de cartes de l'album au moment de la rédaction. */
  cardCount: number;
  /** Retouchée à la main après la rédaction. */
  edited?: boolean;
}

export const albumSheetsItem = storage.defineItem<Record<string, AlbumSheet>>('local:albumSheets', { fallback: {} });

/** Cartes envoyées au modèle : le modèle intégré de Chrome a un contexte court. */
const MAX_CARDS = 30;

const SYSTEM =
  "Tu aides un collectionneur du jeu de cartes WikiMasters (une carte = un article de Wikipédia) à ranger sa collection en albums thématiques. Réponds toujours en français, de façon concise et concrète.";

const cardLine = (c: OwnedCard) => `- ${c.title}${c.description ? ` : ${c.description}` : ''}`;

/** Valeurs Wikidata les plus partagées par les cartes : « Métier : footballeur (80 %) ». */
function sharedFacts(cards: OwnedCard[], facts: Record<string, CardFacts>, labels: Record<string, string>): string[] {
  const counts = new Map<string, number>();
  for (const c of cards) {
    const f = facts[c.cardId];
    if (!f) continue;
    for (const prop of Object.keys(f.props) as PropId[]) for (const v of f.props[prop] ?? []) counts.set(`${prop}:${v}`, (counts.get(`${prop}:${v}`) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n / Math.max(1, cards.length) >= 0.3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .flatMap(([k, n]) => {
      const [prop, v] = k.split(':') as [PropId, string];
      return labels[v] && !/^Q\d+$/.test(labels[v]!) ? [`${PROPS[prop]} : ${labels[v]} (${Math.round((n / cards.length) * 100)} %)`] : [];
    });
}

const SHEET_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    include: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    exclude: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    keywords: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    emoji: { type: 'string' },
  },
  required: ['summary', 'include', 'exclude', 'keywords', 'emoji'],
};

export async function writeSheet({
  tag,
  name,
  cards,
  description,
  otherAlbums,
  facts,
  labels,
  onDownload,
}: {
  tag: SiteTag;
  /** Nom sans emoji ni préfixe. */
  name: string;
  cards: OwnedCard[];
  description?: string;
  otherAlbums: string[];
  facts: Record<string, CardFacts>;
  labels: Record<string, string>;
  onDownload?: (progress: number) => void;
}): Promise<AlbumSheet> {
  const shown = cards.slice(0, MAX_CARDS);
  const prompt = [
    `Album « ${name} »${description ? ` — description actuelle (écrite ou validée par le collectionneur, à respecter) : ${description}` : ''}.`,
    `Il contient ${cards.length} carte(s), dont :`,
    ...shown.map(cardLine),
    cards.length > shown.length ? `… et ${cards.length - shown.length} autres.` : '',
    sharedFacts(cards, facts, labels).length ? `Points communs (Wikidata) : ${sharedFacts(cards, facts, labels).join(' ; ')}.` : '',
    otherAlbums.length ? `Ses autres albums : ${otherAlbums.slice(0, 40).join(', ')}.` : '',
    '',
    "Rédige la fiche de cet album : summary (2 phrases sur le thème), include (ce qui y a sa place, formulé comme des règles courtes), exclude (ce qui n'y a pas sa place ; si un de ses autres albums convient mieux, nomme-le), keywords (mots-clés simples au singulier qui caractérisent les cartes de l'album), emoji (un seul emoji qui représente le thème).",
  ]
    .filter(Boolean)
    .join('\n');
  const out = await ai.generateJson<Omit<AlbumSheet, 'at' | 'cardCount'>>({ system: SYSTEM, prompt, schema: SHEET_SCHEMA, onDownload });
  const sheet: AlbumSheet = {
    summary: out.summary?.trim() ?? '',
    include: (out.include ?? []).map((s) => s.trim()).filter(Boolean),
    exclude: (out.exclude ?? []).map((s) => s.trim()).filter(Boolean),
    keywords: [...new Set((out.keywords ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean))],
    emoji: firstEmoji(out.emoji) ?? '📁',
    at: Date.now(),
    cardCount: cards.length,
  };
  const all = await albumSheetsItem.getValue();
  await albumSheetsItem.setValue({ ...all, [tag.id]: sheet });
  return sheet;
}

/** Retouche à la main (résumé, listes, mots-clés, emoji). */
export async function updateSheet(tagId: string, patch: Partial<Omit<AlbumSheet, 'at' | 'cardCount'>>) {
  const all = await albumSheetsItem.getValue();
  const sheet = all[tagId];
  if (!sheet) return;
  await albumSheetsItem.setValue({ ...all, [tagId]: { ...sheet, ...patch, edited: true } });
}

export async function deleteSheet(tagId: string) {
  const { [tagId]: _, ...rest } = await albumSheetsItem.getValue();
  await albumSheetsItem.setValue(rest);
}

/** Texte ajouté à la description de l'album pour les recommandations : mots-clés et règles d'inclusion. */
export function sheetText(sheet: AlbumSheet | undefined): string {
  return sheet ? [...sheet.keywords, ...sheet.include].join(' ') : '';
}

/** La fiche date-t-elle (l'album a beaucoup changé depuis) ? */
export const sheetOutdated = (sheet: AlbumSheet, cardCount: number) =>
  Math.abs(cardCount - sheet.cardCount) >= Math.max(5, sheet.cardCount * 0.3);

function firstEmoji(text: string | undefined): string | null {
  return text?.match(/\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*|\p{Regional_Indicator}{2}/u)?.[0] ?? null;
}

const THEME_SCHEMA = {
  type: 'object',
  properties: { name: { type: 'string' }, emoji: { type: 'string' } },
  required: ['name', 'emoji'],
};

/** Nom d'album proposé pour un groupe de cartes (ex. « Villes de Pologne », 🇵🇱). */
export async function nameTheme({
  cards,
  reason,
  onDownload,
}: {
  cards: OwnedCard[];
  /** Critère Wikidata du groupe : « Nature : ville · Pays : Pologne ». */
  reason: string;
  onDownload?: (progress: number) => void;
}): Promise<{ name: string; emoji: string }> {
  const prompt = [
    `Ces cartes ont en commun : ${reason}.`,
    ...cards.slice(0, 20).map(cardLine),
    '',
    "Propose un nom d'album court et naturel en français (2 à 5 mots, au pluriel si c'est une catégorie, ex. « Rois de France », « Plats français », « Villes de Pologne ») et un seul emoji qui le représente.",
  ].join('\n');
  const out = await ai.generateJson<{ name: string; emoji: string }>({ system: SYSTEM, prompt, schema: THEME_SCHEMA, onDownload });
  return { name: out.name.trim().replace(/^["«\s]+|["»\s]+$/g, ''), emoji: firstEmoji(out.emoji) ?? '' };
}
