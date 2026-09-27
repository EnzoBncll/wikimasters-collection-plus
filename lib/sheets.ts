import { storage } from '#imports';
import { RARITY_LABEL, RARITY_ORDER, type Rarity, type TradeStatus } from './types';

/**
 * Export vers Google Sheets via l'API officielle (OAuth chrome.identity, scope drive.file :
 * l'extension ne voit que les fichiers qu'elle a créés). Le même classeur est réécrit à chaque export.
 * Tout est écrit en cellules structurées (liens, couleurs) : pas de formules dépendantes de la langue.
 */

export interface SheetRow {
  title: string;
  rarity: Rarity | null;
  count: number;
  status: TradeStatus;
  tags: string[];
  isNew: boolean;
  imageUrl: string | null;
  wikipediaUrl: string | null;
}

export interface SheetExport {
  rows: SheetRow[];
  withImages: boolean;
}

export const EXPORT_SHEETS = 'wmt:export-sheets';

const spreadsheetIdItem = storage.defineItem<string | null>('local:spreadsheetId', { fallback: null });

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const IDS = { collection: 100, trade: 200, stats: 300, tmp: 999 };

const RARITY_COLORS: Record<Rarity, string> = {
  C: '#e5e7eb',
  PC: '#bbf7d0',
  R: '#bfdbfe',
  SR: '#e9d5ff',
  L: '#fde68a',
  UR: '#fbcfe8',
};
const STATUS_LABEL: Record<TradeStatus, string> = { trade: 'Trade', not_trade: 'Not Trade', unset: '' };

// ---------------------------------------------------------------------------

export function isSheetsConfigured() {
  return Boolean(browser.runtime.getManifest().oauth2?.client_id);
}

async function getToken(): Promise<string> {
  const result = await browser.identity.getAuthToken({ interactive: true });
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new Error('Connexion Google refusée ou annulée.');
  return token;
}

async function call<T = any>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
  });
  if (response.status === 401) {
    await browser.identity.removeCachedAuthToken({ token });
    throw Object.assign(new Error('Jeton Google expiré, réessaie.'), { retry: true });
  }
  if (!response.ok) throw new Error(`Google Sheets : HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

/** Crée ou réécrit le classeur, puis renvoie son URL. */
export async function exportToSheets({ rows, withImages }: SheetExport): Promise<string> {
  let token = await getToken();
  try {
    return await write(token, rows, withImages);
  } catch (error) {
    if (!(error as { retry?: boolean }).retry) throw error;
    token = await getToken();
    return write(token, rows, withImages);
  }
}

async function write(token: string, rows: SheetRow[], withImages: boolean): Promise<string> {
  const id = await prepareSpreadsheet(token);
  const batch = (requests: object[]) => call(token, `${API}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });

  const sorted = [...rows].sort(
    (a, b) => rank(a.rarity) - rank(b.rarity) || a.title.localeCompare(b.title, 'fr'),
  );
  const tradeRows = sorted.filter((r) => r.status === 'trade');

  await batch([
    ...collectionSheet(IDS.collection, 'Collection', sorted, withImages, '#6366f1'),
    ...collectionSheet(IDS.trade, 'À échanger', tradeRows, withImages, '#22c55e'),
    ...statsSheet(IDS.stats, sorted),
    { deleteSheet: { sheetId: IDS.tmp } },
    {
      updateSpreadsheetProperties: {
        properties: { title: `WikiMasters · Collection (${new Date().toLocaleDateString('fr-FR')})` },
        fields: 'title',
      },
    },
  ]);

  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/** Réutilise le classeur précédent (vidé) ou en crée un nouveau. Laisse un onglet temporaire « tmp ». */
async function prepareSpreadsheet(token: string): Promise<string> {
  const savedId = await spreadsheetIdItem.getValue();
  if (savedId) {
    try {
      const meta = await call(token, `${API}/${savedId}?fields=sheets.properties(sheetId)`);
      const existing: number[] = meta.sheets.map((s: any) => s.properties.sheetId);
      await call(token, `${API}/${savedId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            ...(existing.includes(IDS.tmp) ? [] : [{ addSheet: { properties: { sheetId: IDS.tmp, title: 'tmp' } } }]),
            ...existing.filter((sid) => sid !== IDS.tmp).map((sheetId) => ({ deleteSheet: { sheetId } })),
          ],
        }),
      });
      return savedId;
    } catch (error) {
      console.warn('[WM Tags] classeur précédent inaccessible, création d’un nouveau', error);
    }
  }
  const created = await call(token, API, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'WikiMasters · Collection' },
      sheets: [{ properties: { sheetId: IDS.tmp, title: 'tmp' } }],
    }),
  });
  await spreadsheetIdItem.setValue(created.spreadsheetId);
  return created.spreadsheetId;
}

// ---------------------------------------------------------------------------
// Construction des onglets
// ---------------------------------------------------------------------------

const rank = (r: Rarity | null) => (r ? RARITY_ORDER.indexOf(r) : 99);
const rgb = (hex: string) => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
});

const text = (value: string, format: object = {}) => ({ userEnteredValue: { stringValue: value }, userEnteredFormat: format });
const num = (value: number, format: object = {}) => ({
  userEnteredValue: { numberValue: value },
  userEnteredFormat: { horizontalAlignment: 'CENTER', ...format },
});
const header = (value: string) =>
  text(value, {
    backgroundColor: rgb('#111827'),
    textFormat: { bold: true, foregroundColor: rgb('#ffffff') },
    verticalAlignment: 'MIDDLE',
    padding: { left: 6, right: 6, top: 4, bottom: 4 },
  });

function collectionSheet(sheetId: number, title: string, rows: SheetRow[], withImages: boolean, tabColor: string): object[] {
  const columns = [
    ...(withImages ? [{ name: 'Image', width: 90 }] : []),
    { name: 'Titre', width: 320 },
    { name: 'Rareté', width: 110 },
    { name: 'Exemplaires', width: 100 },
    { name: 'Doublons', width: 90 },
    { name: 'Statut', width: 100 },
    { name: 'Étiquettes', width: 220 },
    { name: 'Nouvelle', width: 80 },
  ];
  const col = (name: string) => columns.findIndex((c) => c.name === name);

  const dataRows = rows.map((r) => ({
    values: [
      ...(withImages ? [r.imageUrl ? { userEnteredValue: { formulaValue: `=IMAGE("${r.imageUrl.replace(/"/g, '%22')}")` } } : text('')] : []),
      text(r.title, {
        verticalAlignment: 'MIDDLE',
        wrapStrategy: 'WRAP',
        textFormat: { bold: true, ...(r.wikipediaUrl ? { link: { uri: r.wikipediaUrl } } : {}) },
      }),
      text(r.rarity ? `${r.rarity} · ${RARITY_LABEL[r.rarity]}` : '', {
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
        ...(r.rarity ? { backgroundColor: rgb(RARITY_COLORS[r.rarity]) } : {}),
      }),
      num(r.count, { verticalAlignment: 'MIDDLE' }),
      num(Math.max(0, r.count - 1), { verticalAlignment: 'MIDDLE' }),
      text(STATUS_LABEL[r.status], { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', textFormat: { bold: true } }),
      text(r.tags.join(', '), { verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' }),
      text(r.isNew ? '✨' : '', { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }),
    ],
  }));

  const rowCount = rows.length + 1;
  const statusCol = col('Statut');
  const statusRange = { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: statusCol, endColumnIndex: statusCol + 1 };
  const statusRule = (value: string, bg: string, fg: string, index: number) => ({
    addConditionalFormatRule: {
      index,
      rule: {
        ranges: [statusRange],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] },
          format: { backgroundColor: rgb(bg), textFormat: { foregroundColor: rgb(fg), bold: true } },
        },
      },
    },
  });
  const fullRange = { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: columns.length };

  return [
    {
      addSheet: {
        properties: {
          sheetId,
          title,
          tabColor: rgb(tabColor),
          gridProperties: { rowCount: Math.max(rowCount, 2), columnCount: columns.length, frozenRowCount: 1, frozenColumnCount: withImages ? 2 : 1 },
        },
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [{ values: columns.map((c) => header(c.name)) }, ...dataRows],
        fields: 'userEnteredValue,userEnteredFormat',
      },
    },
    ...columns.map((c, i) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: c.width },
        fields: 'pixelSize',
      },
    })),
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 34 },
        fields: 'pixelSize',
      },
    },
    ...(rows.length
      ? [
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: rowCount },
              properties: { pixelSize: withImages ? 64 : 26 },
              fields: 'pixelSize',
            },
          },
          statusRule('Trade', '#dcfce7', '#166534', 0),
          statusRule('Not Trade', '#fee2e2', '#991b1b', 1),
          {
            addBanding: {
              bandedRange: {
                range: { ...fullRange, startRowIndex: 1 },
                rowProperties: { firstBandColor: rgb('#ffffff'), secondBandColor: rgb('#f8fafc') },
              },
            },
          },
          { setBasicFilter: { filter: { range: fullRange } } },
        ]
      : []),
  ];
}

function statsSheet(sheetId: number, rows: SheetRow[]): object[] {
  const statuses: TradeStatus[] = ['trade', 'not_trade', 'unset'];
  const count = (pred: (r: SheetRow) => boolean) => rows.filter(pred).length;
  const copies = (pred: (r: SheetRow) => boolean) => rows.filter(pred).reduce((n, r) => n + r.count, 0);

  const headers = ['Rareté', 'Cartes', 'Exemplaires', 'Trade', 'Not Trade', 'Sans statut'];
  const line = (label: string, pred: (r: SheetRow) => boolean, bg?: string) => ({
    values: [
      text(label, { textFormat: { bold: true }, ...(bg ? { backgroundColor: rgb(bg) } : {}) }),
      num(count(pred)),
      num(copies(pred)),
      ...statuses.map((s) => num(count((r) => pred(r) && r.status === s))),
    ],
  });

  const body = [
    ...RARITY_ORDER.map((r) => line(`${r} · ${RARITY_LABEL[r]}`, (row) => row.rarity === r, RARITY_COLORS[r])),
    line('Total', () => true, '#e5e7eb'),
  ];

  return [
    {
      addSheet: {
        properties: { sheetId, title: 'Stats', tabColor: rgb('#f59e0b'), gridProperties: { rowCount: body.length + 3, columnCount: headers.length, frozenRowCount: 1 } },
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [
          { values: headers.map(header) },
          ...body,
          { values: [] },
          { values: [text(`Export du ${new Date().toLocaleString('fr-FR')}`, { textFormat: { italic: true, foregroundColor: rgb('#6b7280') } })] },
        ],
        fields: 'userEnteredValue,userEnteredFormat',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 170 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: headers.length },
        properties: { pixelSize: 105 },
        fields: 'pixelSize',
      },
    },
  ];
}
