# Confidentialité

Collection+ n'a **aucun serveur** et ne collecte aucune donnée.

- **Ta session WikiMasters** est lue dans le cookie du site, uniquement pour appeler l'API de WikiMasters en ton nom (lire ta collection, poser des étiquettes). Elle n'est jamais stockée ni envoyée ailleurs.
- **Stockage local** (`chrome.storage.local`, sur ton ordinateur uniquement) : cache de ta collection, données Wikidata, introductions Wikipédia, règles, réglages (dont la clé Gemini si tu en ajoutes une), rangement des albums, listes des albums à objectif et listes de souhaits.
- **Services contactés** :
  - `www.wiki-masters.com` et son backend Supabase : ta collection et tes étiquettes ;
  - `www.wikidata.org` et `query.wikidata.org` : informations publiques sur les articles, suggestions d'album et listes des albums à objectif (seuls des titres d'articles, des critères de thème et le texte de ta demande sont envoyés) ;
  - `fr.wikipedia.org` et `upload.wikimedia.org` : description courte, introduction et vignette des articles, recherche et pages de liste pour les albums à objectif ;
  - `generativelanguage.googleapis.com` (Gemini) : uniquement si tu enregistres une clé Gemini, pour comprendre la phrase d'une demande d'album à objectif (seule cette phrase est envoyée) ; la clé reste dans le stockage local ;
  - `api.github.com` : vérifier s'il existe une nouvelle version ;
  - `sheets.googleapis.com` : uniquement si tu utilises l'export Google Sheets (accès limité aux fichiers créés par l'extension).
