# Confidentialité

Collection+ n'a **aucun serveur** et ne collecte aucune donnée.

- **Ta session WikiMasters** est lue dans le cookie du site, uniquement pour appeler l'API de WikiMasters en ton nom (lire ta collection, poser des étiquettes). Elle n'est jamais stockée ni envoyée ailleurs.
- **Stockage local** (`chrome.storage.local`, sur ton ordinateur uniquement) : cache de ta collection, données Wikidata, règles, réglages, rangement des albums et listes de souhaits.
- **Services contactés** :
  - `www.wiki-masters.com` et son backend Supabase : ta collection et tes étiquettes ;
  - `www.wikidata.org` : informations publiques sur les articles et recherche des suggestions d'album (seuls des titres d'articles et des critères de thème sont envoyés) ;
  - `fr.wikipedia.org` et `upload.wikimedia.org` : description courte et vignette des cartes suggérées ;
  - `api.github.com` : vérifier s'il existe une nouvelle version ;
  - `sheets.googleapis.com` : uniquement si tu utilises l'export Google Sheets (accès limité aux fichiers créés par l'extension).
