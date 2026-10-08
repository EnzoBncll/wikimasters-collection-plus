# Fiche Chrome Web Store — Collection+ (WikiMasters)

Tout ce qu'il faut coller dans le Developer Dashboard (https://chrome.google.com/webstore/devconsole).

## Package

Zip à envoyer au Store : `WXT_STORE=1 pnpm zip` (dans `.output/`), à copier dans `store/`.

⚠️ Le build Store n'a pas de champ `key` (le Chrome Web Store refuse tout import qui en contient un :
« Le champ key n'est pas autorisé dans le fichier manifeste »). Le build normal (`pnpm zip`, Releases GitHub)
garde `key`, pour que les installations existantes conservent leur identifiant et leurs données.
Le Store va attribuer son propre identifiant au premier import. **Note bien cet identifiant**
(visible dans l'URL de l'item une fois le brouillon créé) : c'est lui qu'il faudra renseigner comme
« Item ID » du client OAuth « Extension Chrome » dans Google Cloud Console, le jour où tu veux activer
l'export Google Sheets.

⚠️ Pour activer l'export Google Sheets (OAuth) dans une version publiée, renseigne
`WXT_GOOGLE_CLIENT_ID` dans `.env.local` **avant** de lancer `WXT_STORE=1 pnpm zip` : sans ça, les permissions
`identity` et le bloc `oauth2` ne sont pas inclus dans le manifest (c'est le cas du zip actuel —
build "sans Google Sheets", permissions minimales).

Rebuild à tout moment avec :
```bash
WXT_STORE=1 pnpm zip
```

## Images

- `store/screenshots/01-cartes.png` … `05-album-relie.png` — 1280×800, 5 captures qui couvrent des fonctions différentes (pas que les albums à compléter) :
  1. **Cartes** — vue d'ensemble, filtres, grille de cartes
  2. **Albums à compléter** — thème « jeux Nintendo sur GameCube », les 3 états (collée / prête à coller / à trouver), vraies cartes WmCard
  3. **Tagging fluide** — vraie capture de l'app : sélection multiple, raccourcis clavier (barre du bas), boîte d'envoi ouverte avec le détail des changements en attente
  4. **Habillages de cartes** — les 9 styles (Défaut + Style 1 à 8 : imprimé, foil, matière...), vraie capture du sélecteur dans Paramètres
  5. **Album relié** — rendu « livre » feuilletable
- `store/promo/small-tile-440x280.png` — tuile promo obligatoire, identité générale (logo + accroche multi-fonctions)
- `store/promo/marquee-1400x560.png` — bannière marquee (facultative), identité générale avec 3 vraies cartes en accent décoratif, pas centrée sur une seule fonction
- Icône 128×128 : `public/icon/128.png` (déjà dans le manifest, pas besoin de la re-uploader séparément sauf si le formulaire le demande)

## Nom de l'extension

WikiMasters Collection+

## Description courte (132 caractères max — 126 utilisés)

```
Albums à compléter : décris un thème (jeux GameCube, rois de Hongrie...), Collection+ fait l'album. Étiquettes, Trade, export.
```

## Description détaillée

```
Collection+ est une extension Chrome non officielle pour WikiMasters (wiki-masters.com), sans lien avec l'équipe du jeu. Elle transforme ta collection de cartes Wikipédia en une vraie interface à parcourir, trier et ranger — sans rien changer à ta façon de jouer sur le site.

★ ALBUMS À COMPLÉTER — LA FONCTIONNALITÉ PHARE
Tape n'importe quel thème, Collection+ te construit l'album correspondant avec les cases qu'il te reste à trouver. Quelques exemples :
– « les spécialités culinaires de Hongrie »
– « les jeux Nintendo sortis sur GameCube »
– « le top 30 des plus longs règnes royaux de la planète »
– « les rois de France », « le top 50 des personnalités féminines françaises avant 1900 »...
Collection+ cherche une liste Wikipédia ou Wikidata correspondante, ou traduit ta phrase en règles modifiables (avec une clé Gemini gratuite, facultative). Tu verrouilles la liste, l'album à compléter a ses cases numérotées : cartes déjà collées, cartes possédées à ajouter d'un clic, cartes qu'il te reste à trouver. Survole une carte pour lire l'article.

ÉQUITABLE PAR CONCEPTION
Collection+ n'automatise rien sur WikiMasters et n'offre aucun avantage de jeu : pas de bot, pas d'action en ton absence, pas d'accès à des informations que le site ne donne pas déjà. C'est uniquement du confort (tri, étiquettes, albums, export) sur des données que tu peux déjà voir et des actions que tu valides toi-même, un clic à la fois. Rien ici n'enfreint les règles du jeu.

TRI TRADE / NOT TRADE
Deux étiquettes natives du site pour marquer tes doublons en un clic, avec une option « tout Trade par défaut » et des pastilles visibles directement sur WikiMasters.

CARTES
Toute ta collection, filtres compacts (statut, rareté, étiquettes, doublons, nouvelles cartes), sélection multiple, recherche, et raccourcis clavier (T Trade, N Not Trade, E étiqueter, A tout sélectionner, / rechercher, Entrée afficher en grand). Rien ne part sur le site tout de suite : tes changements s'accumulent dans une boîte d'envoi et partent d'un clic.

ÉTIQUETTES ET ALBUMS
Un seul bouton « Nouveau » pour créer une étiquette, un album à compléter ou une étiquette de rangement. Chaque étiquette se feuillette comme un album — relié ou classeur — avec rangement à la main ou tri par rareté, et une description de couverture rédigée par IA.

SUGGESTIONS ET EXPORT
Sous chaque album, les cartes les plus connues du thème qu'il te manque encore, classées par notoriété. Export CSV, copie pour tableur, ou classeur Google Sheets mis en forme directement depuis l'extension.

CARTE EN GRAND
Le visuel façon WikiMasters (couleurs de rareté, stats du jeu, reflet holographique au survol) avec, à côté, le début de l'article Wikipédia correspondant — dépliable, et navigable à la flèche.

THÈMES
Mode clair, sombre ou automatique, et 10 palettes qui recolorent l'interface, le bouton sur le site et jusqu'à l'icône de l'extension.

CONFIDENTIALITÉ
Aucun serveur, aucune collecte de données. Ta session WikiMasters est lue uniquement pour appeler l'API du site en ton nom ; tout le reste (cache, réglages, albums) reste stocké localement dans ton navigateur. Détails complets : https://github.com/EnzoBncll/wikimasters-collection-plus/blob/main/PRIVACY.md

Projet open source, gratuit, sans publicité : https://github.com/EnzoBncll/wikimasters-collection-plus
```

## Catégorie

**Entertainment** (ou **Fun** selon le libellé affiché) — c'est un compagnon pour un jeu, pas un outil de productivité générique.

## Langue

Français (fr)

## Site web / support

`https://github.com/EnzoBncll/wikimasters-collection-plus`

## Politique de confidentialité (URL)

`https://github.com/EnzoBncll/wikimasters-collection-plus/blob/main/PRIVACY.md`

(Le fichier existe déjà dans le repo. Comme le dépôt est public, ce lien GitHub suffit comme URL de politique de confidentialité — pas besoin d'un site dédié.)

---

## Onglet « Privacy practices » (obligatoire pour publier)

### Single purpose (finalité unique — un champ texte libre)

```
Collection+ permet de consulter, trier (Trade / Not Trade), étiqueter, ranger en albums et exporter la collection de cartes d'un utilisateur sur le site WikiMasters (wiki-masters.com). Toutes les fonctionnalités de l'extension servent cette seule finalité de gestion de la collection.
```

### Justification des permissions

**storage**
```
Stocke en local (chrome.storage.local) le cache de la collection, les étiquettes, les réglages,
le rangement des albums et les listes des albums à compléter, pour un affichage instantané sans
tout retélécharger à chaque ouverture.
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

**host_permissions — https://www.wiki-masters.com/\***
```
Site officiel du jeu : nécessaire pour lire la collection de l'utilisateur et appliquer les
changements (étiquettes, statut Trade) qu'il valide dans l'extension.
```

**host_permissions — https://cyrxjeppjqsxxjayfrur.supabase.co/\***
```
Backend (Supabase) du site WikiMasters lui-même, utilisé pour stocker les étiquettes et statuts
Trade des utilisateurs. L'extension appelle directement cette API, au nom de l'utilisateur
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
- [ ] Upload du zip `store/wikimasters-collection-plus-0.7.0-chrome.zip`
- [ ] 5 captures d'écran uploadées, dans l'ordre (`store/screenshots/01-cartes.png` en premier)
- [ ] Tuile promo 440×280 uploadée (`store/promo/small-tile-440x280.png`)
- [ ] Marquee 1400×560 uploadée si tu veux l'option (`store/promo/marquee-1400x560.png`)
- [ ] Descriptions courte + détaillée collées
- [ ] Catégorie + langue définies
- [ ] URL de la politique de confidentialité renseignée
- [ ] Onglet Privacy practices entièrement rempli (finalité, justifications, data usage, certifications)
- [ ] Vérifier que la version du manifest (0.7.0) correspond bien à ce que tu veux publier
