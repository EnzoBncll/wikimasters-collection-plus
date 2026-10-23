import { STORAGE_COLOR, STORAGE_PREFIX } from './album-kind';
import type { CardFacts, PropId } from './wikidata';
import type { OwnedCard, SiteTag } from './types';

/**
 * Tri automatique par thème : chaque carte reçoit UN album de rangement « · Thème ».
 * Classement sans IA, à partir de ce qu'on sait déjà de la carte :
 *  - faits Wikidata (nature P31, métier P106, sport P641, genre P136, fonction P39), libellés français ;
 *  - description courte de la carte.
 * Chaque thème a une liste de racines de mots ; les faits pèsent plus que la description. Rien ne correspond : « Divers ».
 * Une carte qui a déjà un thème (posé par le tri ou corrigé à la main) n'est jamais retouchée.
 */

export interface Theme {
  name: string;
  /** Racines cherchées en début de mot (sans accents, minuscules). */
  roots: string[];
}

export const THEMES: Theme[] = [
  { name: 'Sports', roots: ['sport', 'footbal', 'joueu', 'athlet', 'cycliste', 'tennis', 'rugby', 'basket', 'handbal', 'volley', 'nageu', 'natation', 'boxe', 'judo', 'escrim', 'gymnast', 'skieu', 'ski ', 'patineu', 'golf', 'pilote automobile', 'pilote de', 'formule 1', 'coureu', 'marathon', 'olympi', 'championnat', 'club de', 'equipe de', 'entraineu', 'arbitre', 'hockey', 'baseball', 'cricket', 'catch', 'lutteu', 'tour de france', 'stade', 'jockey', 'alpinist', 'grimpeu', 'surf'] },
  { name: 'Musique', roots: ['music', 'chanteu', 'chanson', 'single', 'album', 'groupe de', 'rock', 'rap ', 'rappeu', 'hip-hop', 'jazz', 'pop ', 'pop-', 'heavy metal', 'compositeu', 'composit', 'pianist', 'violon', 'guitar', 'batteu', 'bassist', 'orchestr', 'opera', 'symphon', 'concerto', 'disc-jockey', 'dj ', 'auteur-compositeu', 'auteure-compositric', 'festival de musique', 'genre musical'] },
  { name: 'Cinéma & télé', roots: ['film', 'cinema', 'acteu', 'actric', 'realisat', 'scenarist', 'serie', 'episode', 'televis', 'emission', 'animat', 'dessin anime', 'anime', 'doubleu', 'personnage de fiction', 'personnage fictif', 'jeu video', 'youtubeu', 'streameu', 'humorist', 'comedien'] },
  { name: 'Arts & littérature', roots: ['ecrivai', 'roman', 'poet', 'poesi', 'litter', 'auteu', 'autric', 'dramaturg', 'essayist', 'livre', 'oeuvre', 'œuvre', 'peint', 'tableau', 'sculpt', 'dessinat', 'illustrat', 'bande dessinee', 'manga', 'photograph', 'artist', 'art ', 'musee', 'designer', 'architecte', 'danseu', 'choregraph', 'theatre', 'editeu', 'journalist', 'philosoph'] },
  { name: 'Politique', roots: ['homme politique', 'femme politique', 'homme d\'etat', 'femme d\'etat', 'politic', 'politiq', 'depute', 'senat', 'ministre', 'president', 'maire', 'diplomat', 'ambassad', 'parti ', 'election', 'gouvern', 'parlement', 'monarqu', 'roi ', 'reine ', 'souverain', 'empereu', 'imperatric', 'prince', 'princess', 'chef d\'etat', 'militant', 'syndical', 'activist'] },
  { name: 'Histoire', roots: ['bataille', 'guerre', 'militaire', 'officier', 'general', 'soldat', 'resistant', 'empire', 'royaume', 'dynasti', 'antiqu', 'medieva', 'moyen age', 'revolution', 'traite', 'siege de', 'historien', 'explorateu', 'navigateu', 'noble', 'aristocrat', 'chevalier', 'pharaon', 'evenement', 'conflit', 'massacre', 'epidemie'] },
  { name: 'Sciences', roots: ['scientifiq', 'physicien', 'chimist', 'chimi', 'mathemat', 'biolog', 'medecin', 'medical', 'maladi', 'chercheu', 'ingenieu', 'inventeu', 'theorem', 'theori', 'element chimique', 'compose chimique', 'molecul', 'proteine', 'gene ', 'genes ', 'mineral', 'economist', 'psycholog', 'sociolog', 'linguist', 'geolog', 'unite de mesure'] },
  { name: 'Nature', roots: ['espece', 'taxon', 'animal', 'plante', 'oiseau', 'poisson', 'insecte', 'mammifer', 'reptil', 'amphibien', 'araignee', 'papillon', 'coleopter', 'champignon', 'arbre', 'fleur', 'genre d', 'famille d', 'race de', 'cultivar', 'bacteri', 'virus', 'algue', 'mollusq', 'crustace'] },
  { name: 'Espace', roots: ['asteroid', 'planet', 'etoile', 'galaxi', 'constellation', 'comete', 'satellite', 'nebuleus', 'cratere', 'exoplanet', 'astronom', 'astronaut', 'cosmonaut', 'spatial', 'fusee', 'sonde', 'mission spatiale', 'telescope', 'amas'] },
  { name: 'Géographie', roots: ['commune', 'ville', 'village', 'municipalit', 'localite', 'pays', 'region', 'province', 'departement', 'canton', 'comte d', 'etat des', 'ile', 'montagne', 'sommet', 'riviere', 'fleuve', 'lac', 'mer ', 'ocean', 'desert', 'volcan', 'vallee', 'parc national', 'quartier', 'arrondissement', 'capitale', 'territoire', 'cours d\'eau', 'baie', 'plage', 'peninsul', 'archipel'] },
  { name: 'Monuments', roots: ['chateau', 'eglise', 'cathedral', 'basiliq', 'chapelle', 'abbaye', 'monastere', 'temple', 'mosquee', 'synagogue', 'palais', 'monument', 'tour ', 'pont', 'batiment', 'edifice', 'gratte-ciel', 'forteresse', 'fort ', 'citadelle', 'phare', 'moulin', 'statue', 'site archeologique', 'ruine', 'manoir', 'hotel particulier', 'gare', 'aeroport', 'stade', 'theatre', 'opera de'] },
  { name: 'Religion & mythes', roots: ['saint', 'religi', 'eveque', 'pape', 'pretre', 'moine', 'divinite', 'dieu', 'deesse', 'mytholog', 'mythe', 'legend', 'theolog', 'catholiq', 'chretien', 'islam', 'musulman', 'juif', 'judaism', 'bouddh', 'hindou', 'ange', 'demon', 'creature', 'diocese', 'paroisse', 'ordre religieux'] },
  { name: 'Technologie', roots: ['logiciel', 'informatiq', 'ordinateur', 'internet', 'site web', 'application', 'langage de programmation', 'entreprise', 'societe', 'marque', 'technolog', 'electroniq', 'console', 'smartphone', 'robot', 'intelligence artificielle', 'systeme d\'exploitation', 'jeu de societe', 'protocole', 'format de fichier'] },
  { name: 'Transports', roots: ['automobile', 'voiture', 'vehicule', 'avion', 'aeronef', 'helicoptere', 'navire', 'bateau', 'paquebot', 'sous-marin', 'locomotive', 'train', 'ligne de', 'metro', 'tramway', 'autobus', 'moto', 'route ', 'autoroute', 'compagnie aerienne', 'constructeur', 'modele d\'automobile', 'classe de navire'] },
];

export const FALLBACK_THEME = 'Divers';
export const ALL_THEME_NAMES = [...THEMES.map((t) => t.name), FALLBACK_THEME];

/** Nom de l'étiquette de rangement d'un thème. */
export const themeTagName = (theme: string) => `${STORAGE_PREFIX}${theme}`;
export const THEME_COLOR = STORAGE_COLOR;

const norm = (s: string) => ` ${s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[’']/g, "'")} `;

/** Poids : ce que dit Wikidata de la nature et du métier pèse plus que la description libre. */
const WEIGHTS: Partial<Record<PropId, number>> = { P106: 4, P31: 4, P641: 6, P136: 3, P39: 3 };

function score(text: string, theme: Theme): number {
  let n = 0;
  for (const root of theme.roots) {
    const r = root.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    // Début de mot : « art » ne prend pas « départ ».
    if (text.includes(` ${r}`) || text.includes(`(${r}`) || text.includes(`-${r}`)) n++;
  }
  return n;
}

/** Thème d'une carte (le premier des meilleurs scores ; « Divers » si rien ne correspond). */
export function themeOf(card: OwnedCard, facts: CardFacts | undefined, labels: Record<string, string>): string {
  const totals = new Map<string, number>();
  const add = (text: string, weight: number) => {
    const t = norm(text);
    for (const theme of THEMES) {
      const s = score(t, theme);
      if (s) totals.set(theme.name, (totals.get(theme.name) ?? 0) + s * weight);
    }
  };
  for (const [pid, weight] of Object.entries(WEIGHTS) as [PropId, number][]) {
    const values = facts?.props[pid] ?? [];
    if (values.length) add(values.map((q) => labels[q] ?? '').join(' '), weight);
  }
  if (facts?.props.P641?.length) totals.set('Sports', (totals.get('Sports') ?? 0) + 10);
  if (card.description) add(card.description, 2);
  add(card.title, 1);
  let best = FALLBACK_THEME;
  let top = 0;
  for (const theme of THEMES) {
    const s = totals.get(theme.name) ?? 0;
    if (s > top) [best, top] = [theme.name, s];
  }
  return best;
}

/** Étiquettes de thème déjà présentes sur le site (par nom de thème). */
export function themeTags(tags: SiteTag[]): Map<string, SiteTag> {
  const byName = new Map(tags.map((t) => [t.name.trim().toLowerCase(), t]));
  const out = new Map<string, SiteTag>();
  for (const name of ALL_THEME_NAMES) {
    const tag = byName.get(themeTagName(name).toLowerCase());
    if (tag) out.set(name, tag);
  }
  return out;
}

export interface ThemePlan {
  /** Thème → cartes à y ranger. */
  byTheme: Map<string, OwnedCard[]>;
  /** Cartes déjà dans un thème (jamais retouchées). */
  alreadySorted: number;
}

/** Cartes sans thème → thème proposé. */
export function planThemes(cards: OwnedCard[], tags: SiteTag[], facts: Record<string, CardFacts>, labels: Record<string, string>): ThemePlan {
  const existing = new Set([...themeTags(tags).values()].map((t) => t.id));
  const byTheme = new Map<string, OwnedCard[]>();
  let alreadySorted = 0;
  for (const card of cards) {
    if (card.tagIds.some((id) => existing.has(id))) {
      alreadySorted++;
      continue;
    }
    const theme = themeOf(card, facts[card.cardId], labels);
    byTheme.set(theme, [...(byTheme.get(theme) ?? []), card]);
  }
  return { byTheme, alreadySorted };
}
