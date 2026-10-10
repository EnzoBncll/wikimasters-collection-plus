# Fiche Chrome Web Store — Collection+ (WikiMasters)

Tout ce qu'il faut coller dans le Developer Dashboard (https://chrome.google.com/webstore/devconsole).

## Package — version 0.9.2

Zip à envoyer au Store : `store/wikimasters-collection-plus-0.9.2-chrome.zip`, à construire une fois la version passée à 0.9.2
(`npm version patch`, puis `WXT_STORE=1 pnpm zip` et copie du zip de `.output/` dans `store/`). Manifest sans champ `key`,
permissions : storage, unlimitedStorage, cookies, alarms, notifications.

⚠️ Le build Store n'a pas de champ `key` (le Chrome Web Store refuse tout import qui en contient un :
« Le champ key n'est pas autorisé dans le fichier manifeste »). Le build normal (`pnpm zip`, Releases GitHub)
garde `key`, pour que les installations existantes conservent leur identifiant et leurs données.
Le Store attribue son propre identifiant au premier import. **Note bien cet identifiant**
(visible dans l'URL de l'item une fois le brouillon créé) : c'est lui qu'il faudra renseigner comme
« Item ID » du client OAuth « Extension Chrome » dans Google Cloud Console, le jour où tu veux activer
l'export Google Sheets.

⚠️ Pour activer l'export Google Sheets (OAuth) dans une version publiée, renseigne
`WXT_GOOGLE_CLIENT_ID` dans `.env.local` **avant** de lancer `WXT_STORE=1 pnpm zip` : sans ça, les permissions
`identity` et le bloc `oauth2` ne sont pas inclus dans le manifest (c'est le cas du zip actuel —
build « sans Google Sheets », permissions minimales).

Rebuild à tout moment avec :
```bash
WXT_STORE=1 pnpm zip
```

## Images

`pnpm store:assets` régénère tout depuis l'aperçu simulé (captures et visuels promo).

Captures 1280×800, chacune avec son titre au-dessus de l'écran, à uploader dans cet ordre :

1. `store/screenshots/01-ouverture.png` — **Chaque paquet devient un moment** : révélé d'une Légendaire en full-art, volets Rangement / Collections, statut en arc
2. `store/screenshots/02-albums-a-completer.png` — **Des albums à compléter, case par case** : album à objectif « ◇ Empereurs byzantins » en Grimoire 3D, parties, cartes collées et cartes à coller
3. `store/screenshots/03-bibliotheque.png` — **Ta bibliothèque, un livre par collection** : un livre tiré de l'étagère, sa fiche d'avancement au-dessus
4. `store/screenshots/04-style-album.png` — **Des livres à ton goût** : mode « Style d'album », volet Pages (cases, séparateurs de parties)
5. `store/screenshots/05-tirages.png` — **Tes paquets, tes tirages, tes chiffres** : page d'ouverture (paquets en éventail) et statistiques de tirage

Promo (refaites pour la 0.9.2 : le livre Grimoire ouvert et une Légendaire full-art) :
- `store/promo/small-tile-440x280.png` — tuile promo obligatoire
- `store/promo/marquee-1400x560.png` — bannière marquee (facultative)
- Icône 128×128 : `public/icon/128.png` (déjà dans le manifest)

## Nom de l'extension

WikiMasters Collection+

## Description courte (132 caractères max — 130 utilisés)

```
Extension non officielle pour WikiMasters : ta collection en albums à compléter, livres 3D et ouverture des paquets mise en scène.
```

(C'est la `description` du manifest, dans `wxt.config.ts`.)

## Description détaillée

```
Collection+ est une extension Chrome non officielle pour WikiMasters (wiki-masters.com), sans lien avec l'équipe du jeu. Elle fait de tes cartes Wikipédia une vraie collection : des albums à compléter, des livres en 3D rangés dans ta bibliothèque, et une ouverture des paquets mise en scène comme un moment à part — sans rien changer à ta façon de jouer.

★ ALBUMS À COMPLÉTER
Tape n'importe quel thème, Collection+ te construit l'album correspondant avec les cases qu'il te reste à trouver :
– « les spécialités culinaires de Hongrie »
– « les jeux Nintendo sortis sur GameCube »
– « les rois de France », « le top 50 des personnalités féminines françaises avant 1900 »...
Collection+ cherche une liste Wikipédia ou Wikidata, traduit ta phrase en règles modifiables (avec une clé Gemini gratuite, facultative), ou part de ta propre liste collée. Tu choisis les cartes et l'ordre : l'album prend le préfixe ◇, ses parties et ses cases numérotées — cartes collées, cartes possédées à coller d'un clic, cartes à trouver (et celles en vente sur le marché). Quand tu tires une carte de la liste, l'album s'ouvre et la carte s'y colle. Un code court « CP1-… » le partage avec un ami.

★ DES LIVRES EN 3D, DANS TA BIBLIOTHÈQUE
Chaque album se feuillette comme un vrai livre : relié, classeur, grimoire ou herbier, en 3D ou à plat. Le mode « Style d'album » règle tout en direct : couverture, couleur, emblème, cases par page, façon de séparer les parties (de la tuile titre au simple trait de couleur), habillage des cartes, ambiance. Tes albums à compléter et tes collections finies se rangent sur les étagères de la bibliothèque (bois, verre ou marbre) : un livre par album, plus haut à mesure qu'il se remplit, halo et sceau une fois fini.

★ OUVERTURE DES PAQUETS
Sur la page d'ouverture de WikiMasters : tes paquets en éventail autour d'un grand bouton, compteur et temps avant la réserve pleine. Au révélé : mise en scène selon la rareté (tension puis explosion des UR et L, reflet des shiny), sons, pastille « New », carte à l'habillage choisi — dont le full-art, la photo sur toute la carte — récap du paquet, touche Espace pour enchaîner.

★ RANGER SANS OUVRIR LA CARTE
Pendant le révélé, tes rangements à gauche, tes collections à droite : un clic (ou 1 à 9) pose l'étiquette. Le statut Trade / Not Trade / Discard est en arc sous la carte, au clavier avec ← ↓ →. Recherche et création d'étiquette sans quitter le paquet. Chaque volet et les raccourcis clavier se désactivent séparément dans le popup.

★ STATISTIQUES DE TIRAGE
Aujourd'hui, 7 jours ou tout l'historique : paquets, cartes, nouvelles, shiny, taux de drop par rareté, prévisions (« un L tous les X paquets »), records (plus longue série sans L, meilleur paquet, meilleur jour), cartes tirées pour tes albums à compléter, histogramme sur 30 jours, frise de tes paquets et image récap à partager. Deux colonnes sur grand écran, une sur mobile.

★ SOUHAITS
Une page pour ta liste de souhaits WikiMasters : recherche dans le catalogue pour ajouter une carte, filtre « à trouver » et « chez tes amis » (qui la possède, pour proposer un échange), et un clic pour retirer les cartes que tu as obtenues.

★ SYNCHRONISATION ENTRE TES ORDINATEURS
Albums à compléter, mises en page, souhaits, règles et réglages suivent sur chaque ordinateur où tu es connecté à Chrome, automatiquement (vérification toutes les 5 minutes) ou d'un clic depuis le popup. Aucun compte à créer, aucun serveur.

ÉQUITABLE PAR CONCEPTION
Collection+ n'automatise rien sur WikiMasters et n'offre aucun avantage de jeu : pas de bot, pas d'action en ton absence, pas d'accès à des informations que le site ne donne pas déjà. C'est uniquement du confort (tri, étiquettes, albums, statistiques, export) sur des données que tu peux déjà voir et des actions que tu valides toi-même, un clic à la fois.

CARTES ET TRI TRADE / NOT TRADE
Toute ta collection, filtres compacts (statut, rareté, étiquettes, doublons, nouvelles cartes), sélection multiple, recherche et raccourcis clavier (T Trade, N Not Trade, E étiqueter, A tout sélectionner, / rechercher). Rien ne part sur le site tout de suite : tes changements s'accumulent dans une boîte d'envoi et partent d'un clic. Défausse des doublons avec récapitulatif (jamais les shiny ni les favoris).

ÉTIQUETTES ET ALBUMS
Trois groupes : albums à compléter (◇), collections, rangements (·). Chaque étiquette se feuillette comme un album, avec rangement à la main ou par rareté. Une collection terminée prend « ✓ » et la couleur or. Mode revue : tes cartes une par une, comme à l'ouverture d'un paquet.

SUGGESTIONS ET EXPORT
Sous chaque album, les cartes les plus connues du thème qu'il te manque encore. Export CSV ou copie pour tableur.

VISITE GUIDÉE
Une présentation pas à pas à la première ouverture, puis deux mini-visites sur WikiMasters (page des paquets, premier révélé). Chaque fonction ajoutée sur le site a son interrupteur : si quelque chose te gêne, tu le coupes.

THÈMES
Mode clair, sombre ou automatique, 10 palettes qui recolorent l'interface, le bouton sur le site et l'icône de l'extension, et dix habillages de cartes.

CONFIDENTIALITÉ
Aucun serveur, aucune collecte de données. Ta session WikiMasters est lue uniquement pour appeler l'API du site en ton nom ; tes données restent dans ton navigateur, et la synchronisation entre ordinateurs passe par ton propre compte Chrome. Détails : https://enzobncll.github.io/wikimasters-collection-plus/privacy.html

Projet open source, gratuit, sans publicité : https://github.com/EnzoBncll/wikimasters-collection-plus
```

## Catégorie

**Entertainment** (ou **Fun** selon le libellé affiché) — c'est un compagnon pour un jeu, pas un outil de productivité générique.

## Langue

Français (fr)

## Site web / support

`https://github.com/EnzoBncll/wikimasters-collection-plus`

## Politique de confidentialité (URL)

`https://enzobncll.github.io/wikimasters-collection-plus/privacy.html`

(Page servie par GitHub Pages depuis `docs/privacy.md`, copie de `PRIVACY.md`. Le lien `github.com/…/blob/main/PRIVACY.md` est refusé par le Store : GitHub répond 503 aux robots sur les pages de fichiers.)

---

## Onglet « Privacy practices » (obligatoire pour publier)

### Single purpose (finalité unique — un champ texte libre)

```
Collection+ permet de consulter, trier (Trade / Not Trade), étiqueter, ranger en albums et exporter la collection de cartes d'un utilisateur sur le site WikiMasters (wiki-masters.com), y compris au moment où il ouvre ses paquets (rangement des cartes tirées, statistiques de ses tirages, liste de souhaits). Toutes les fonctionnalités de l'extension servent cette seule finalité de gestion de la collection.
```

### Justification des permissions

**storage**
```
Stocke en local (chrome.storage.local) le cache de la collection, les réglages, le rangement des albums,
les listes des albums à compléter, les listes de souhaits et l'historique des paquets ouverts, pour un
affichage instantané. Utilise aussi chrome.storage.sync pour retrouver ces mêmes données (sauf le cache)
sur les autres ordinateurs où l'utilisateur est connecté à Chrome : aucun serveur tiers.
```

**unlimitedStorage**
```
Une collection peut compter plusieurs centaines de cartes, avec en plus les données Wikidata et
les introductions Wikipédia mises en cache localement : cela dépasse le quota par défaut de
chrome.storage.local.
```

**cookies**
```
Lit le cookie de session déjà présent sur wiki-masters.com pour appeler l'API du site avec les
identifiants de l'utilisateur connecté (lire sa collection, poser des étiquettes, changer un
statut Trade). Le cookie n'est jamais stocké par l'extension ni envoyé à un autre service.
```

**alarms**
```
Planifie localement la mise à jour du nombre de paquets estimé sur l'icône, les rappels choisis par
l'utilisateur (réserve de paquets pleine, pack PRO du jour) et la synchronisation entre ses ordinateurs
toutes les 5 minutes.
```

**notifications**
```
Affiche les rappels que l'utilisateur active lui-même dans les réglages : réserve de paquets pleine,
pack PRO quotidien pas encore réclamé. Un clic ouvre la page des paquets de WikiMasters.
```

**host_permissions — https://www.wiki-masters.com/\***
```
Site officiel du jeu : nécessaire pour lire la collection de l'utilisateur et appliquer les
changements (étiquettes, statut Trade) qu'il valide dans l'extension.
```

**host_permissions — https://cyrxjeppjqsxxjayfrur.supabase.co/\***
```
Backend (Supabase) du site WikiMasters lui-même, utilisé pour stocker les étiquettes, statuts
Trade et la liste de souhaits des utilisateurs. L'extension appelle directement cette API, au nom de l'utilisateur
connecté, pour appliquer les mêmes changements que ferait le site.
```

**identity / oauth2 (uniquement si tu rebuild avec `WXT_GOOGLE_CLIENT_ID`)**
```
Utilisé uniquement si l'utilisateur choisit d'exporter sa collection vers Google Sheets. Limité
au scope drive.file : l'extension ne peut accéder qu'aux fichiers qu'elle a elle-même créés, pas
au reste du Google Drive de l'utilisateur.
```

**Remote code**
```
Non. Tout le code exécuté est empaqueté dans l'extension au moment du build ; aucun script n'est
chargé ou évalué depuis une source distante.
```

### Déclaration des données utilisateur (« Data usage »)

Cases à cocher côté formulaire Google — à cocher ainsi :

- **Personally identifiable information** : Non
- **Health info** : Non
- **Financial and payment info** : Non
- **Authentication information** : Oui — le cookie de session WikiMasters, lu pour appeler
  l'API du site au nom de l'utilisateur ; jamais transmis ailleurs ni stocké par l'extension.
- **Personal communications** : Non
- **Location** : Non
- **Web history** : Non
- **User activity** : Non (les actions dans l'extension — étiqueter, trier — ne sont envoyées
  qu'au site WikiMasters lui-même, pas collectées par l'extension)
- **Website content** : Oui — la collection de cartes de l'utilisateur (lue sur WikiMasters),
  utilisée uniquement pour l'affichage et les fonctions de l'extension.

Puis cocher les trois certifications :
- Je ne vends ni ne transfère les données utilisateur à des tiers en dehors des cas approuvés.
- Je n'utilise ni ne transfère les données utilisateur à des fins sans rapport avec la finalité
  unique de l'extension.
- Je n'utilise ni ne transfère les données utilisateur pour évaluer la solvabilité ou à des fins
  de prêt.

---

## Checklist avant de cliquer sur « Submit for review »

- [ ] Compte développeur Chrome Web Store (le compte pro) bien sélectionné comme propriétaire de l'item
- [ ] Upload du zip `store/wikimasters-collection-plus-0.9.2-chrome.zip` (Package → Upload new package)
- [ ] Anciennes captures supprimées, puis les 5 nouvelles uploadées dans l'ordre (`01-ouverture.png` en premier)
- [ ] Tuile promo 440×280 et marquee 1400×560 remplacées par les nouvelles
- [ ] Description courte + détaillée remplacées
- [ ] Privacy practices : justification de **storage** mise à jour (chrome.storage.sync), **alarms** et **notifications** ajoutées
- [ ] Data usage inchangé (Authentication information : oui ; Website content : oui ; le reste : non)
- [ ] Version du manifest : 0.9.2
