import type { GoalEntry } from './goal-albums';

/**
 * Mise en page des parties d'un album à objectif (dynasties, siècles…), au choix par album :
 *  - tile  : une case « titre » ouvre chaque partie (nom et nombre de cartes) ;
 *  - row   : chaque partie commence sur une nouvelle ligne, son titre au-dessus ;
 *  - page  : chaque partie commence sur une nouvelle page (bandeau en tête), les petites parties partagent une page ;
 *  - color : aucune case perdue, un liseré de couleur par partie et une légende en tête de page.
 * Variantes discrètes (aucune case perdue, les cartes restent à la suite) :
 *  - caption : le nom de la partie en petit au-dessus de sa première case ;
 *  - tick    : un fin trait de couleur à gauche de la première case de chaque partie ;
 *  - tint    : les cases de chaque partie prennent un léger fond teinté, les parties sont nommées en tête de page ;
 *  - header  : rien sur les cases, les parties de la page sont nommées dans son en-tête.
 */
export type SectionMode = 'tile' | 'row' | 'page' | 'color' | 'caption' | 'tick' | 'tint' | 'header';

export const SECTION_MODES: { id: SectionMode; label: string; hint: string; discreet?: boolean }[] = [
  { id: 'tile', label: 'Tuile titre', hint: 'Une case porte le nom de la partie' },
  { id: 'row', label: 'Ligne par partie', hint: 'Chaque partie commence sur une nouvelle ligne' },
  { id: 'page', label: 'Page par partie', hint: 'Chaque partie commence sur une nouvelle page' },
  { id: 'color', label: 'Couleur + légende', hint: 'Un liseré de couleur par partie, aucune case perdue' },
  { id: 'caption', label: 'Petit titre', hint: 'Le nom de la partie en petit, au-dessus de sa première case', discreet: true },
  { id: 'tick', label: 'Trait', hint: 'Un fin trait de couleur avant la première case de chaque partie', discreet: true },
  { id: 'tint', label: 'Teinte', hint: 'Un léger fond teinté par partie, les noms en tête de page', discreet: true },
  { id: 'header', label: 'En-tête seul', hint: 'Rien sur les cases : les parties sont nommées en haut de la page', discreet: true },
];

/** Couleurs des parties (liseré, tuile, légende), dans l'ordre des parties. */
export const SECTION_COLORS = ['#7F77DD', '#1D9E75', '#D85A30', '#D4537E', '#378ADD', '#BA7517', '#639922', '#888780'];

export interface SectionRun {
  name: string | null;
  start: number;
  size: number;
  color: string;
}

export interface GoalSlots {
  /** Cases dans l'ordre : identifiant de carte collée, « goal:<n> » (case à trouver), « section:<k> » (tuile titre) ou null (case vide). */
  slots: (string | null)[];
  /** Numéro d'entrée de la liste pour chaque case (null : tuile ou case vide). */
  entryAt: (number | null)[];
  runs: SectionRun[];
  /** Partie de chaque entrée (indice dans runs). */
  runOf: number[];
}

/** Parties consécutives de la liste ; une liste sans parties donne une seule partie sans nom. */
export function sectionRuns(entries: GoalEntry[]): SectionRun[] {
  const runs: SectionRun[] = [];
  entries.forEach((e, i) => {
    const last = runs.at(-1);
    if (last && last.name === (e.section ?? null)) last.size++;
    else runs.push({ name: e.section ?? null, start: i, size: 1, color: SECTION_COLORS[runs.filter((r) => r.name).length % SECTION_COLORS.length]! });
  });
  return runs;
}

/** Cases de l'album selon le mode ; `idFor(i)` donne l'identifiant de la case de l'entrée i (carte collée ou « goal:i »). */
export function goalSlots(entries: GoalEntry[], idFor: (i: number) => string, mode: SectionMode, perPage = 9, perRow = 3): GoalSlots {
  const runs = sectionRuns(entries);
  const slots: (string | null)[] = [];
  const entryAt: (number | null)[] = [];
  const runOf: number[] = [];
  const pad = (to: number) => {
    while (slots.length % to) slots.push(null), entryAt.push(null);
  };
  let onPage = 0;
  let page = 0;
  runs.forEach((run, k) => {
    if (run.name && slots.length) {
      if (mode === 'row') pad(perRow);
      if (mode === 'page') {
        const used = slots.length % perPage;
        const left = used ? perPage - used : perPage;
        // Nouvelle page, sauf pour une petite partie qui tient dans la place restante (3 parties par page au plus).
        if (used && (run.size + (run.size % perRow ? perRow - (run.size % perRow) : 0) > left || onPage >= 3)) pad(perPage);
        else pad(perRow);
      }
    }
    if (Math.floor(slots.length / perPage) !== page) (page = Math.floor(slots.length / perPage)), (onPage = 0);
    onPage++;
    if (mode === 'tile' && run.name) slots.push(`section:${k}`), entryAt.push(null);
    for (let i = run.start; i < run.start + run.size; i++) {
      slots.push(idFor(i));
      entryAt.push(i);
      runOf[i] = k;
    }
  });
  return { slots, entryAt, runs, runOf };
}
