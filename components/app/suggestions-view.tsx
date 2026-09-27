import { Sparkles } from 'lucide-react';
import { EmptyState } from './review-view';

/** Emplacement des suggestions de regroupement (étape suivante : Wikidata / Wikipédia). */
export function SuggestionsView() {
  return (
    <EmptyState
      icon={<Sparkles className="size-6" />}
      title="Suggestions d'étiquettes"
      text="Bientôt : l'extension repérera les groupes de cartes (footballeurs, pays, films…) via Wikidata et te proposera de les étiqueter en un clic."
    />
  );
}
