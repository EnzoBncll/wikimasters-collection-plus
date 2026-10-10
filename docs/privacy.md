---
title: Confidentialité · WikiMasters Collection+
---

<!-- Copie de PRIVACY.md servie par GitHub Pages (URL donnée au Chrome Web Store) : garder les deux fichiers identiques. -->

# Confidentialité

Collection+ n'a **aucun serveur** et ne collecte aucune donnée.

- **Ta session WikiMasters** est lue dans le cookie du site, uniquement pour appeler l'API de WikiMasters en ton nom (lire ta collection, poser des étiquettes). Elle n'est jamais stockée ni envoyée ailleurs.
- **Stockage local** (`chrome.storage.local`, sur ton ordinateur uniquement) : cache de ta collection, données Wikidata, introductions Wikipédia, règles, réglages (dont la clé Gemini si tu en ajoutes une), rangement des albums, listes des albums à objectif, listes de souhaits, historique de tes tirages de paquets (lu dans les réponses du site quand tu ouvres un paquet) et estimation du nombre de paquets disponibles.
- **Synchronisation entre ordinateurs** (désactivable dans Paramètres › Synchro et export) : albums à objectif, rangement des albums, listes de souhaits, règles et réglages sont recopiés dans `chrome.storage.sync`, que Chrome transporte vers tes autres ordinateurs connectés au même compte Chrome. La clé Gemini n'en fait jamais partie. Aucun serveur de Collection+ n'intervient.
- **Services contactés** :
  - `www.wiki-masters.com` et son backend Supabase : ta collection, tes étiquettes, ta liste de souhaits (cœur sur le marché) et la défausse des exemplaires que tu confirmes ;
  - `www.wikidata.org` et `query.wikidata.org` : informations publiques sur les articles, suggestions d'album et listes des albums à objectif (seuls des titres d'articles, des critères de thème et le texte de ta demande sont envoyés) ;
  - `fr.wikipedia.org`, `commons.wikimedia.org` et `upload.wikimedia.org` : description courte, introduction et vignette des articles, recherche et pages de liste pour les albums à objectif, et images libres (avec leur auteur) pour les cartes sans image, si tu actives cette option ;
  - `generativelanguage.googleapis.com` (Gemini) : uniquement si tu enregistres une clé Gemini, pour comprendre la phrase d'une demande d'album à objectif (seule cette phrase est envoyée) ; la clé reste dans le stockage local ;
  - `api.github.com` : vérifier s'il existe une nouvelle version ;
  - `sheets.googleapis.com` : uniquement si tu utilises l'export Google Sheets (accès limité aux fichiers créés par l'extension).
- **Notifications** : rappels locaux (réserve de paquets, pack PRO), programmés sur ton ordinateur, sans aucun service extérieur.
- **Sur WikiMasters**, l'extension n'agit jamais seule : chaque étiquette, défausse ou ajout à la liste de souhaits part d'un clic de ta part (l'ajout d'une carte à son album à objectif pendant le révélé se règle dans Paramètres › Sur WikiMasters).
