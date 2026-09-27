import { storage } from '#imports';
import type { OwnedCard, SiteTag } from './types';
import { PROPS, type CardFacts, type PropId } from './wikidata';

/** Un critère Wikidata : « la carte a la valeur Q… pour la propriété P… » (une valeur parmi plusieurs). */
export interface Criterion {
  prop: PropId;
  values: string[];
}

export interface Suggestion {
  /** Clé stable (pour ignorer une suggestion). */
  key: string;
  name: string;
  /** Explication courte : « Métier : footballeur ». */
  reason: string;
  criterion: Criterion;
  source: 'catalogue' | 'discovery';
  /** Cartes concernées qui n'ont pas encore l'étiquette visée. */
  cards: OwnedCard[];
  /** Étiquette existante portant déjà ce nom, le cas échéant. */
  existingTag: SiteTag | null;
}

export type RuleMode = 'review' | 'auto';

export interface Rule {
  id: string;
  tagId: string;
  criterion: Criterion;
  mode: RuleMode;
  createdAt: number;
  /** Cartes écartées à la main pour cette règle. */
  ignored: string[];
}

export const rulesItem = storage.defineItem<Rule[]>('local:rules', { fallback: [] });
export const dismissedItem = storage.defineItem<string[]>('local:dismissedSuggestions', { fallback: [] });

/**
 * Groupes « catalogue » : catégories larges avec un joli nom, reconnues par des valeurs Wikidata connues.
 * Les autres groupes sont découverts automatiquement (valeurs partagées par plusieurs cartes).
 */
const CATALOGUE: { name: string; criterion: Criterion }[] = [
  { name: 'Personnalités', criterion: { prop: 'P31', values: ['Q5'] } },
  { name: 'Footballeurs', criterion: { prop: 'P106', values: ['Q937857'] } },
  { name: 'Acteurs et actrices', criterion: { prop: 'P106', values: ['Q33999', 'Q10800557', 'Q10798782', 'Q2405480'] } },
  { name: 'Musiciens', criterion: { prop: 'P106', values: ['Q177220', 'Q639669', 'Q488205', 'Q36834', 'Q753110'] } },
  { name: 'Politiques', criterion: { prop: 'P106', values: ['Q82955', 'Q372436'] } },
  { name: 'Écrivains', criterion: { prop: 'P106', values: ['Q36180', 'Q6625963', 'Q4853732', 'Q49757'] } },
  { name: 'Scientifiques', criterion: { prop: 'P106', values: ['Q901', 'Q169470', 'Q170790', 'Q593644', 'Q864503'] } },
  { name: 'Sportifs', criterion: { prop: 'P641', values: [] } },
  { name: 'Films', criterion: { prop: 'P31', values: ['Q11424', 'Q24869', 'Q202866'] } },
  { name: 'Séries TV', criterion: { prop: 'P31', values: ['Q5398426', 'Q581714', 'Q117467246'] } },
  { name: 'Jeux vidéo', criterion: { prop: 'P31', values: ['Q7889'] } },
  { name: 'Albums', criterion: { prop: 'P31', values: ['Q482994', 'Q208569'] } },
  { name: 'Chansons', criterion: { prop: 'P31', values: ['Q7366', 'Q134556'] } },
  { name: 'Livres', criterion: { prop: 'P31', values: ['Q7725634', 'Q571', 'Q8261', 'Q47461344'] } },
  { name: 'Pays', criterion: { prop: 'P31', values: ['Q6256', 'Q3624078', 'Q3024240'] } },
  { name: 'Villes', criterion: { prop: 'P31', values: ['Q515', 'Q1549591', 'Q5119', 'Q484170', 'Q1637706', 'Q200250'] } },
  { name: 'Monuments', criterion: { prop: 'P31', values: ['Q4989906', 'Q570116', 'Q12518', 'Q811979', 'Q16970'] } },
  { name: 'Entreprises', criterion: { prop: 'P31', values: ['Q4830453', 'Q891723', 'Q6881511', 'Q783794'] } },
  { name: 'Clubs de sport', criterion: { prop: 'P31', values: ['Q476028', 'Q847017', 'Q13393265'] } },
  { name: 'Animaux et espèces', criterion: { prop: 'P31', values: ['Q16521', 'Q55983715'] } },
  { name: 'Pokémon', criterion: { prop: 'P31', values: ['Q25930719', 'Q3966183'] } },
  { name: 'Personnages de fiction', criterion: { prop: 'P31', values: ['Q95074', 'Q15632617', 'Q15773347'] } },
  { name: 'Divinités', criterion: { prop: 'P31', values: ['Q178885', 'Q22989102', 'Q4271324'] } },
  { name: 'Batailles et guerres', criterion: { prop: 'P31', values: ['Q178561', 'Q198', 'Q103495'] } },
];

const MIN_GROUP = 3;
/** Au-delà de cette part de la collection, un groupe découvert est trop générique. */
const MAX_SHARE = 0.5;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const normName = (s: string) => s.trim().toLowerCase();

/** La carte correspond-elle au critère ? (valeurs vides = « a au moins une valeur pour la propriété »). */
export function matches(facts: CardFacts | undefined, criterion: Criterion): boolean {
  const values = facts?.props[criterion.prop];
  if (!values?.length) return false;
  return criterion.values.length === 0 || values.some((v) => criterion.values.includes(v));
}

export const criterionKey = (c: Criterion) => `${c.prop}:${[...c.values].sort().join(',') || '*'}`;

interface SuggestInput {
  cards: OwnedCard[];
  facts: Record<string, CardFacts>;
  labels: Record<string, string>;
  tags: SiteTag[];
  systemTagIds: Set<string>;
  dismissed: Set<string>;
  rules: Rule[];
}

/** Calcule les suggestions de regroupement, les plus intéressantes d'abord. */
export function computeSuggestions({ cards, facts, labels, tags, systemTagIds, dismissed, rules }: SuggestInput): Suggestion[] {
  const tagByName = new Map(tags.filter((t) => !systemTagIds.has(t.id)).map((t) => [normName(t.name), t]));
  const ruled = new Set(rules.map((r) => criterionKey(r.criterion)));
  const out = new Map<string, Suggestion>();

  const usedNames = new Set<string>();

  const build = (name: string, criterion: Criterion, source: Suggestion['source']) => {
    const key = criterionKey(criterion);
    if (dismissed.has(key) || ruled.has(key) || out.has(key) || usedNames.has(normName(name))) return;
    const existingTag = tagByName.get(normName(name)) ?? null;
    const group = cards.filter((c) => matches(facts[c.cardId], criterion));
    const pending = existingTag ? group.filter((c) => !c.tagIds.includes(existingTag.id)) : group;
    if (pending.length < (existingTag ? 1 : MIN_GROUP)) return;
    out.set(key, { key, name, reason: describe(criterion, group, facts, labels), criterion, source, cards: pending, existingTag });
    usedNames.add(normName(name));
  };

  for (const { name, criterion } of CATALOGUE) build(name, criterion, 'catalogue');

  // Découvertes : toute valeur partagée par assez de cartes.
  const groups = new Map<string, { prop: PropId; value: string; count: number }>();
  for (const card of cards) {
    const f = facts[card.cardId];
    if (!f) continue;
    for (const prop of Object.keys(f.props) as PropId[]) {
      for (const value of f.props[prop] ?? []) {
        const k = `${prop}:${value}`;
        const g = groups.get(k) ?? { prop, value, count: 0 };
        g.count++;
        groups.set(k, g);
      }
    }
  }
  const catalogued = new Set(CATALOGUE.flatMap(({ criterion }) => criterion.values.map((v) => `${criterion.prop}:${v}`)));
  const max = Math.max(MIN_GROUP, cards.length * MAX_SHARE);
  [...groups.values()]
    .filter((g) => g.count >= MIN_GROUP && g.count <= max && !catalogued.has(`${g.prop}:${g.value}`))
    .filter((g) => labels[g.value] && !/^Q\d+$/.test(labels[g.value]!))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60)
    .forEach((g) => build(discoveryName(g.prop, labels[g.value]!), { prop: g.prop, values: [g.value] }, 'discovery'));

  return [...out.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'catalogue' ? -1 : 1;
    return b.cards.length - a.cards.length;
  });
}

/** Nom proposé pour un groupe découvert (préfixé quand le libellé seul serait ambigu, ex. « France »). */
function discoveryName(prop: PropId, label: string) {
  if (prop === 'P27') return `Nationalité ${label}`;
  if (prop === 'P495') return `Origine ${label}`;
  if (prop === 'P17') return `Lieux · ${label}`;
  return capitalize(label);
}

/** « Métier : footballeur, entraîneur » — uniquement les valeurs réellement présentes dans le groupe. */
export function describe(criterion: Criterion, group: OwnedCard[], facts: Record<string, CardFacts>, labels: Record<string, string>) {
  const prop = PROPS[criterion.prop];
  if (!criterion.values.length) return `${prop} renseigné`;
  const present = new Set(group.flatMap((c) => facts[c.cardId]?.props[criterion.prop] ?? []));
  const shown = criterion.values.filter((q) => present.has(q) && labels[q]).map((q) => labels[q]!);
  return shown.length ? `${prop} : ${shown.slice(0, 3).join(', ')}` : prop;
}

/** Cartes qui correspondent à une règle mais n'ont pas encore son étiquette (hors cartes écartées). */
export function pendingForRule(rule: Rule, cards: OwnedCard[], facts: Record<string, CardFacts>): OwnedCard[] {
  const ignored = new Set(rule.ignored);
  return cards.filter((c) => !ignored.has(c.cardId) && !c.tagIds.includes(rule.tagId) && matches(facts[c.cardId], rule.criterion));
}
