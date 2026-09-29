import type { OwnedCard } from './types';

/**
 * Outils de texte partagés par la recherche et les recommandations d'album :
 * minuscules sans accents, mots utiles ramenés à une forme simple, champs sémantiques.
 */

/** « Impératrice » → « imperatrice ». */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const STOPWORDS = new Set(
  (
    'les des une uns aux par pour sur sous dans avec sans entre vers chez ses son sa leur leurs est sont ete etait qui que quoi dont ' +
    'lui elle ils elles cette ces cet celui celle plus moins tres aussi ainsi mais donc car pas comme tout tous toute toutes autre autres ' +
    'the and for with from ne nee nes nees depuis avant apres jusqu dit dite surnomme surnommee ' +
    'homme femme personne personnalite ancien ancienne actuel actuelle celebre principal principale type serie partie membre'
  ).split(' '),
);

/** Forme simple d'un mot : pluriels et quelques féminins courants (chevaux → cheval, chanteuses → chanteur). */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('eaux')) w = w.slice(0, -1);
  else if (w.length > 4 && w.endsWith('aux')) w = `${w.slice(0, -3)}al`;
  else if (w.length > 3 && /[sx]$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('euse')) w = `${w.slice(0, -4)}eur`;
  else if (w.length > 6 && w.endsWith('ienne')) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith('ere')) w = `${w.slice(0, -3)}er`;
  return w;
}

/** Mots utiles d'un texte, sans doublons. */
export function words(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const raw of fold(text).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOPWORDS.has(raw) || /^\d{4}$/.test(raw)) continue;
    out.add(stem(raw));
  }
  return [...out];
}

/**
 * Champs sémantiques : des mots différents qui parlent de la même chose (roi, reine, pharaon → royauté).
 * Les mots sont écrits sans accents et au singulier, comme après stem().
 */
const FIELDS: Record<string, string> = {
  Royauté:
    'roi reine monarque monarchie souverain souveraine empereur imperatrice imperial pharaon tsar tsarine sultan sultane prince princesse dauphin dauphine dynastie royal royale royaume regne couronne couronnement emir shah calife maharaja duc duchesse archiduc archiduchesse infant infante kaiser mikado shogun',
  Aviation:
    'avion aeronef aviation aviateur aviatrice bombardier helicoptere planeur hydravion biplan monoplan aerien aerienne aeroport aeroplane airbus boeing dassault lockheed concorde mirage rafale spitfire messerschmitt zeppelin dirigeable turboreacteur ulm drone',
  Peinture:
    'peintre peinture tableau toile fresque aquarelle gouache pastel retable triptyque impressionnisme impressionniste cubisme cubiste fauvisme pointillisme expressionnisme surrealisme surrealiste renaissance baroque',
  Sculpture: 'sculpteur sculptrice sculpture statue buste bronze marbre',
  Musique:
    'musicien musicienne musique compositeur compositrice chanteur chanson album single groupe rock jazz blues rap rappeur opera symphonie orchestre pianiste guitariste violoniste batteur concerto',
  Cinéma: 'film cinema cineaste realisateur realisatrice acteur actrice scenariste comedien comedienne metrage',
  Littérature: 'ecrivain ecrivaine romancier romanciere poete poetesse poeme roman auteur autrice dramaturge essayiste nouvelle livre recueil litterature litteraire',
  Militaire: 'bataille guerre general marechal militaire soldat armee siege amiral officier colonel capitaine combat conflit invasion croisade',
  Religion: 'dieu deesse divinite saint sainte pape eveque cardinal prophete apotre religieux religieuse moine pretre eglise cathedrale basilique abbaye temple mosquee synagogue',
  Mythologie: 'mythologie mythologique mythe titan nymphe olympe asgard heros legendaire',
  Politique: 'politique politicien president presidente ministre depute deputee senateur chancelier dictateur gouverneur maire parti',
  Science:
    'scientifique physicien physicienne chimiste mathematicien mathematicienne biologiste astronome inventeur inventrice ingenieur medecin chercheur theorie',
  Philosophie: 'philosophe philosophie penseur',
  Sport:
    'sportif sportive footballeur footballeuse joueur joueuse tennisman tennis athlete cycliste champion championne boxeur basketteur rugby football handball natation nageur club equipe olympique',
  Automobile: 'voiture automobile moto motocyclette camion formule constructeur berline coupe cabriolet',
  Marine: 'navire bateau paquebot sousmarin croiseur cuirasse fregate voilier galion caravelle marine naval navale',
  Ferroviaire: 'train locomotive tgv ferroviaire metro tramway gare',
  Espace: 'planete etoile galaxie astronaute cosmonaute satellite lune comete asteroide fusee spatial spatiale nebuleuse constellation',
  Animaux: 'espece animal mammifere oiseau poisson reptile amphibien insecte felin canide chien chat cheval race primate cetace rapace',
  Plantes: 'plante arbre fleur vegetal vegetale genre botanique fruit legume',
  Géographie: 'ville commune capitale pays fleuve riviere montagne ile lac mer ocean volcan desert region province etat continent archipel',
  Monuments: 'monument chateau palais tour pont musee arc fort forteresse citadelle phare',
  'Jeux vidéo': 'video console nintendo sega playstation xbox',
  Cuisine: 'plat fromage vin biere boisson cuisine patisserie dessert gastronomie recette',
  'Personnages de fiction': 'personnage fictif fictive superheros heroine manga anime bd comics',
};

const FIELD_OF = new Map<string, string[]>();
for (const [field, list] of Object.entries(FIELDS)) {
  for (const w of list.split(' ')) FIELD_OF.set(stem(w), [...(FIELD_OF.get(stem(w)) ?? []), field]);
}

/** Champs sémantiques évoqués par une liste de mots. */
export function fieldsOf(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) for (const f of FIELD_OF.get(t) ?? []) out.add(f);
  return [...out];
}

/** La carte correspond-elle à la recherche ? Tous les mots doivent apparaître dans le titre ou la description. */
export function matchesQuery(card: OwnedCard, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fold(`${card.title} ${card.description ?? ''}`);
  return terms.every((t) => haystack.includes(t));
}
