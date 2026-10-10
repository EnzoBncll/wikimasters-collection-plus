<p align="center">
  <img src="docs/images/banner.png" alt="Collection+ : range ta collection WikiMasters" width="100%">
</p>

<p align="center">
  <a href="https://github.com/EnzoBncll/wikimasters-collection-plus/releases/latest"><img src="https://img.shields.io/github/v/release/EnzoBncll/wikimasters-collection-plus?label=version&color=8b5cf6" alt="Dernière version"></a>
  <img src="https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome MV3">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-f9a8d4" alt="Licence MIT"></a>
</p>

# WikiMasters Collection+

> Extension Chrome **non officielle** pour [WikiMasters](https://www.wiki-masters.com), sans lien avec l'équipe du jeu.

**Fais de tes cartes Wikipédia une vraie collection.** Collection+ te donne de quoi la construire, la ranger et la vivre :

- **Collectionner** : des **albums à objectif** (les rois de France, les jeux GameCube, le top 50 des…) dont chaque case attend sa carte. Tu vois ce que tu as, ce qu'il te manque, et où le trouver.
- **Mettre en albums** : chaque étiquette devient un **livre en 3D** à feuilleter (relié, classeur, grimoire, herbier) que tu composes à ta main, case par case, puis que tu ranges sur les étagères de ta **bibliothèque**.
- **Vivre l'ouverture** : sur WikiMasters, chaque paquet devient un moment. Paquets en éventail, **révélé mis en scène selon la rareté** (tension, explosion, sons), et la carte qui file se coller dans son album sous tes yeux.

Autour de ça, tout le confort : tri **Trade / Not Trade** en quelques clics, étiquettes, liste de souhaits, statistiques de tirage, **synchronisation entre tes ordinateurs** et **export** CSV / Google Sheets.

<p align="center">
  <img src="docs/images/album-grimoire.png" alt="Album à objectif « Empereurs byzantins » en style Grimoire 3D, avec ses parties" width="100%">
</p>

## Nouveautés de la 0.9

### Ouverture des paquets sur WikiMasters

<p align="center">
  <img src="docs/images/site-fullart.png" alt="Révélé d'une carte Légendaire en habillage full-art" width="49%">
  <img src="docs/images/site-stats.png" alt="Page d'ouverture : paquets en éventail et statistiques de tirage" width="49%">
</p>

La page d'ouverture de WikiMasters est redessinée : un bouton rond entouré de tes paquets en 3D, le compteur et le temps avant la réserve pleine, puis un **révélé animé par rareté** (sons, confettis, pastille « New ») où tu ranges la carte sans l'ouvrir. Nouvel habillage **full-art** : la photo sur toute la carte, avec le début de son article Wikipédia. En dessous, les **statistiques de tirage** : taux de drop, prévisions, records, cartes de tes albums ◇, histogramme sur 30 jours et image à partager.

### Albums à objectif repensés

<p align="center">
  <img src="docs/images/goal-cards.png" alt="Assistant d'album à objectif : les cartes retenues de ta liste" width="49%">
  <img src="docs/images/goal-preview.png" alt="Assistant d'album à objectif : aperçu, tri, couleur et style du livre" width="49%">
</p>

Décris ton album (« les empereurs en Europe après 1600 ») ou **colle ta propre liste** (parties « # Titre », colonnes de tableur, CSV) : chaque ligne est rapprochée de sa page Wikipédia. Tu choisis les cartes, l'ordre (liste, rareté, date, A → Z, notoriété, attaque, défense), la couleur et le style du livre. Un **code court** (« CP1-… ») permet de partager l'album : il est recréé à l'identique chez un ami.

### Livres en 3D et bibliothèque

<p align="center">
  <img src="docs/images/album-herbier.png" alt="Album à objectif en style Herbier" width="49%">
  <img src="docs/images/library.png" alt="Bibliothèque : un livre par album à objectif sur l'étagère" width="49%">
</p>

Deux nouveaux styles, **Grimoire** (trois couvertures) et **Herbier**, en plus du relié et du classeur, avec une vraie 3D (couverture, tranches, coins) et un mode **« Style d'album »** pour régler couverture, pages, cartes et ambiance en direct. Coller une carte devient un petit spectacle (chute 3D, onde de choc, son). Tes albums à objectif et tes collections finies se rangent dans une **bibliothèque** : un livre par album, plus haut à mesure qu'il se remplit, halo et sceau une fois fini.

### Et aussi

<img src="docs/images/review-deck.png" alt="Mode revue dans la page Cartes" width="49%" align="right">

- **Mode revue** (touche `R` dans Cartes) : tes cartes une par une, comme à l'ouverture d'un paquet, avec les mêmes raccourcis (← Trade, ↓ Not Trade, → Discard), lot et ordre au choix, avance auto et récapitulatif.
- **Mode Marché** dans les albums à objectif : les cartes qu'il te manque actuellement en vente sur le marché de WikiMasters, d'un clic.
- **Mini-cartes** sur la page des échanges de WikiMasters.
- En-tête d'album simplifié.

<br clear="right">

## Fonctionnalités

- **Visite guidée** : à la première ouverture (et une fois après une mise à jour qui la refait), une présentation pas à pas de l'app : cartes, boîte d'envoi, albums à objectif, bibliothèque, souhaits, Enhance, réglages. Sur WikiMasters, deux mini-visites prennent le relais sur les vrais éléments : la page des paquets, puis le premier révélé. Passables, et relançables depuis **Paramètres › Apparence › Aide**.
- **Cartes** : toutes tes cartes, filtres compacts (statut, rareté, étiquettes séparées Collection / Rangement, doublons, nouvelles), sélection multiple, raccourcis clavier (`T` Trade, `N` Not Trade, `E` étiqueter, `A` tout, `/` recherche, `Entrée` afficher en grand).
- **Boîte d'envoi** : rien ne part sur le site tout de suite. Statuts, étiquettes et albums s'accumulent dans un volet à droite (poignée avec le nombre de modifications) et partent d'un clic ; un tracé aux couleurs de la palette fait le tour du cadre pendant l'envoi.
- **Mode revue** : touche `R` dans Cartes, les cartes une à une avec les raccourcis du révélé, lot et ordre au choix, avance auto, récapitulatif.
- **Cartes au style WikiMasters** : format, couleurs de rareté et statistiques du jeu, dix habillages au choix (imprimé, premium foil, matière, full-art avec l'intro Wikipédia), reflet holographique au survol, plus intense selon la rareté.
- **Carte en grand** : la carte, ses infos et, à côté, le début de son article Wikipédia (dépliable, repliable) ; ← → pour parcourir.
- **Trade / Not Trade** : deux étiquettes natives du site, option « tout Trade par défaut », pastilles sur les cartes de WikiMasters.
- **Étiquettes et albums** : un seul bouton **Nouveau** pour une étiquette / album, un album à objectif ou une étiquette de rangement. Chaque étiquette s'ouvre en livre à feuilleter, **relié**, **classeur**, **grimoire** ou **herbier**, en 3D ou à plat, réglable en direct (« Style d'album ») : rangement à la main ou vue par rareté (sans perdre ton ordre), croix pour retirer une carte (elle passe dans « Écartées »), description de couverture rédigée par l'IA.
- **Albums à objectif** : décris ce que tu veux réunir (« les rois de France », « les empereurs en Europe après 1600 », « le top 50 des personnalités féminines françaises avant 1900 ») ou colle ta propre liste (texte, tableur, CSV) rapprochée de Wikipédia. Collection+ cherche une page « Liste de… » de Wikipédia, une liste Wikidata notée de 0 à 1 selon les dates et le lieu, ou traduit ta phrase en règles modifiables (avec une clé Gemini gratuite, facultative). Tu choisis les cartes, l'ordre et le style du livre ; l'album prend le préfixe « ◇ », ses parties (huit façons de les séparer, de la tuile titre au simple trait de couleur) et ses cases numérotées : cartes collées, cartes possédées à coller d'un clic, cartes à trouver. Partage-le par un code court « CP1-… ».
- **Bibliothèque** : en tête de la page Albums, un livre par album à objectif ou collection finie, rangé par avancement, style, date, couleur ou A → Z, sur une étagère en bois, en verre ou en marbre. Au survol, le livre sort et sa fiche (avancement, parties, cartes à coller) s'affiche au-dessus.
- **Enhance** : cartes à ranger dans tes albums, nouveaux albums possibles d'après Wikidata, fiches d'album rédigées par l'IA intégrée de Chrome.
- **Souhaits** : une page dédiée à ta liste de souhaits WikiMasters (le cœur du site) : recherche dans le catalogue pour en ajouter, filtre « À trouver » et « Chez tes amis » (qui possède la carte, pour proposer un échange), et les souhaits notés sous tes albums, à envoyer sur le site d'un clic.
- **Liste de souhaits et suggestions** : sous chaque album, les cartes les plus connues de son thème que tu n'as pas encore.
- **Export** : CSV, copie pour tableur, ou classeur Google Sheets mis en forme.
- **Doublons et défausse** : « Mes doublons » liste tes cartes en double ; les cartes marquées Discard sont défaussées depuis la boîte d'envoi, après un récapitulatif (un exemplaire toujours gardé, jamais les shiny ni les favoris).
- **Collections finies** : une étiquette terminée prend « ✓ » et la couleur or, reconnue sur tous tes appareils ; elle rejoint la bibliothèque avec son halo et son sceau.
- **Sur WikiMasters** (chaque fonction se règle dans le popup ou Paramètres › Sur WikiMasters) :
  - page d'ouverture redessinée : bouton rond entouré de tes paquets en 3D (prêts, en charge, à venir), compteur et temps avant la réserve pleine ;
  - révélé animé par rareté avec sons, pastille « New », récap du paquet, touche Espace, révélé rapide, cartes qui respirent et habillage Collection+ ;
  - rangement sans ouvrir la carte : rangements à gauche, collections à droite, statut Trade / Not Trade / Discard en arc (flèches ← ↓ →), recherche et création d'étiquette ; chaque volet et les raccourcis clavier se désactivent séparément ;
  - album à objectif : quand la carte tirée est dans la liste, l'album sort de sa ligne et la carte s'y colle ;
  - statistiques de tirage (aujourd'hui, 7 jours ou tout ; résumé, taux de drop comparés, prévisions, records, cartes d'albums ◇, histogramme sur 30 jours, frise des paquets, image à partager ; deux colonnes sur grand écran, une sur mobile, repliables en une ligne), compteur de paquets dans l'onglet et sur l'icône, notifications (réserve pleine, pack PRO) ;
  - plein écran 3D sur les cartes, mini-cartes sur la page des échanges, liste de souhaits mise en avant sur le marché et les échanges (cœur pour en ajouter), images libres en option.
- **Synchronisation entre ordinateurs** : albums à objectif, mises en page, cartes écartées, souhaits, règles et réglages suivent sur chaque ordinateur où tu es connecté à Chrome (synchronisation activée). Rien à configurer, aucun compte en plus ; les cartes et étiquettes, elles, sont déjà sur WikiMasters. État et bouton « Synchroniser » dans **Paramètres › Synchro et export**.
- **Popup** : bouton « Synchroniser » (dernier échange entre ordinateurs), compteur de paquets, historique et export CSV des tirages, réglages rapides et choix du thème.
- **Thèmes** : mode clair, sombre ou auto, et 10 palettes qui recolorent l'interface, le bouton sur le site et l'icône de l'extension. Sur le site, trois styles : couleur pleine, ambiance teintée ou irisé.
- **Cache local** : la collection s'affiche instantanément, seuls les changements sont rechargés.

<p align="center">
  <img src="docs/images/review-light.png" alt="Page Cartes en mode clair" width="49%">
  <img src="docs/images/review-dark.png" alt="Page Cartes en mode sombre" width="49%">
</p>

<p align="center">
  <img src="docs/images/onboarding.png" alt="Visite guidée à la première ouverture" width="100%">
</p>

## Sur WikiMasters

<p align="center">
  <img src="docs/images/site-pulls.png" alt="Page d'ouverture redessinée : paquets en éventail autour du bouton Ouvrir" width="49%">
  <img src="docs/images/site-reveal.png" alt="Révélé d'une carte SR avec ses volets Rangement et Collections" width="49%">
</p>

À gauche, la page d'ouverture : tes paquets en éventail, le compteur et le temps avant la réserve pleine. À droite, le révélé : la carte à l'habillage Collection+ (avec sa description, sans avoir à cliquer), les volets Rangement et Collections pour l'étiqueter d'un clic, et le statut Trade / Not Trade / Discard en dessous.

## Cartes et raretés

Au repos (en haut) et au survol (en bas), de Commun à Légendaire :

<p align="center">
  <img src="docs/images/rarities.png" alt="Les six raretés, au repos et au survol" width="100%">
</p>

<p align="center">
  <img src="docs/images/viewer.png" alt="Une carte Légendaire affichée en grand" width="100%">
</p>

## Albums

Quatre styles de livre : **relié**, **classeur**, **grimoire** et **herbier** (plus haut). Ci-dessous, le relié et le classeur.

<p align="center">
  <img src="docs/images/album-relie.png" alt="Album relié : toile, tranches de pages et papier crème" width="49%">
  <img src="docs/images/album-classeur.png" alt="Album classeur : pochettes plastique et anneaux" width="49%">
</p>

Sous chaque album, la liste de souhaits et les **meilleures cartes à chercher** pour son thème, classées par notoriété (nombre d'éditions de Wikipédia : plus un article est lu, plus la carte est rare).

<p align="center">
  <img src="docs/images/wishes.png" alt="Liste de souhaits et suggestions sous l'album Footballeurs" width="100%">
</p>

<p align="center">
  <img src="docs/images/tags.png" alt="Étiquettes en dossiers" width="49%">
  <img src="docs/images/tags-list.png" alt="Étiquettes en liste" width="49%">
</p>

## Palettes

Dix accords de couleurs, à choisir dans **Paramètres › Apparence › Palette**. Chacun existe en clair et en sombre.

<p align="center">
  <img src="docs/images/settings.png" alt="Paramètres, choix de la palette" width="70%">
</p>

<p align="center">
  <img src="docs/images/palettes.png" alt="Les 10 palettes de Collection+" width="100%">
</p>

<p align="center">
  <img src="docs/images/themes.png" alt="Collection+ en Abysse, Aube, Coucher de soleil et Émeraude" width="100%">
</p>

<img src="docs/images/popup.png" alt="Popup de l'extension" width="300" align="right">

**Popup et bouton sur le site** : un clic sur l'icône ouvre Collection+ ou trie directement les nouvelles cartes. Sur WikiMasters, le bouton **Collection+** en bas à gauche indique combien de cartes attendent d'être triées.

<br clear="right">

## Installation

1. Télécharge le zip de la [dernière version](https://github.com/EnzoBncll/wikimasters-collection-plus/releases/latest) (`wikimasters-collection-plus-x.y.z-chrome.zip`).
2. Dézippe-le dans un dossier que tu gardes (ex. `Documents/Collection+`).
3. Ouvre `chrome://extensions`, active le **Mode développeur** (en haut à droite).
4. **Charger l'extension non empaquetée** → choisis le dossier dézippé.
5. Va sur WikiMasters (connecté) : un bouton **Collection+** apparaît en bas à gauche.

> Garde un onglet WikiMasters ouvert quand tu utilises Collection+ : l'extension passe par lui pour parler au site.

## Mises à jour

Collection+ vérifie les nouvelles versions et affiche **« Version x.y.z disponible »** dans l'app et le popup. Pour mettre à jour :

1. Télécharge le nouveau zip depuis la [page des versions](https://github.com/EnzoBncll/wikimasters-collection-plus/releases/latest).
2. Remplace le contenu de ton dossier par celui du nouveau zip.
3. Dans `chrome://extensions`, clique sur **↻ Recharger** sous Collection+.

Tes réglages, règles et données restent en place (l'identifiant de l'extension est fixe).

## Plusieurs ordinateurs

Installe Collection+ sur chaque ordinateur et connecte-toi à Chrome avec le même compte, synchronisation activée (`chrome://settings/syncSetup`, « Extensions » coché). Tes albums à objectif, mises en page et réglages arrivent d'eux-mêmes, en quelques secondes, et chaque changement repart vers les autres ordinateurs ; une vérification automatique repasse toutes les 5 minutes. Si deux ordinateurs ont modifié les mêmes données hors ligne, les deux versions sont fusionnées.

La synchronisation de Chrome offre 100 Ko par extension : les données sont compressées, ce qui laisse de la place pour des dizaines d'albums à objectif. La place utilisée s'affiche dans **Paramètres › Synchro et export**.

## Confidentialité

Aucun serveur, aucune collecte : voir [PRIVACY.md](PRIVACY.md). La synchronisation entre ordinateurs passe par ton compte Chrome (`chrome.storage.sync`) ; la clé Gemini n'en fait pas partie. Les suggestions et les albums à objectif interrogent Wikidata et Wikipédia (API publiques, sans compte). Si tu ajoutes une clé Gemini (facultative), seule la phrase de ta demande est envoyée à Google pour être comprise ; la clé reste sur ton ordinateur.

---

## Développement

```bash
pnpm install
pnpm dev            # build de développement (.output/chrome-mv3-dev) en rechargement à chaud
pnpm build          # build de production → .output/chrome-mv3
pnpm preview:mock   # aperçu dans un navigateur, avec données simulées
pnpm typecheck
pnpm icons          # régénère les PNG de l'icône (public/icon) depuis lib/brand-icon.ts
pnpm readme:assets  # régénère les images du README (docs/images) depuis l'aperçu simulé
pnpm store:assets   # régénère les captures et visuels promo du Chrome Web Store (store/)
```

Charte : `lib/palettes.ts` (les 10 palettes et leurs variables CSS) et `lib/brand-icon.ts` (l'icône en SVG). Les deux scripts ci-dessus utilisent Chromium en headless (`CHROME=/chemin/vers/chrome` pour en choisir un).

Stack : WXT (MV3) · React 19 · Tailwind v4 · shadcn/ui (`components/ui`) · framer-motion · zustand · TanStack Virtual.

### Publier une version

```bash
npm version patch   # ou minor / major : met à jour package.json, commit + tag vX.Y.Z
git push --follow-tags
```

Le workflow [Release](.github/workflows/release.yml) construit le zip et crée la Release GitHub ; les extensions installées la détectent.

### Export Google Sheets (optionnel)

1. [Google Cloud Console](https://console.cloud.google.com) → nouveau projet → activer **Google Sheets API**.
2. **Écran de consentement OAuth** (externe) → ajouter les comptes testeurs.
3. **Identifiants → ID client OAuth** → type **Extension Chrome**, ID de l'élément : `npnhlblglinajejkkjcigeebgbogpbii`.
4. En local : `WXT_GOOGLE_CLIENT_ID=…` dans `.env.local`. Pour les Releases : variable de dépôt `WXT_GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions → Variables).

### Cache et synchronisation

- Collection en cache (`chrome.storage.local`) ; à l'ouverture, vérification légère (`/api/my-collection/stats` + étiquettes).
- Rechargement complet si le site a modifié la collection (paquet, échange, marché… détecté automatiquement), si les stats changent, si le cache a plus de 6 h, ou via ↻.
- Entre ordinateurs (`lib/cloud-sync.ts`, dans le service worker) : chaque donnée propre à l'extension est compressée (gzip), découpée en morceaux de 8 Ko et recopiée dans `chrome.storage.sync`, avec son empreinte et l'appareil d'origine. Au démarrage, chaque donnée est comparée à la copie partagée (prise, envoyée ou fusionnée) ; ensuite, les changements partent après 2,5 s de calme, et une vérification complète repasse toutes les 5 minutes.

## Licence

[MIT](LICENSE)
