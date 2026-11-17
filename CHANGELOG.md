# Notes de version

## 0.11.0 — 17 novembre 2026

Merci pour vos avis sur le Chrome Web Store : cette version y répond en grande partie.

### Nouveautés

**Albums à objectif**
- **Liste modifiable après création** : ajoute des cases, même pour des cartes que tu n'as pas encore (recherche Wikipédia). Tu peux aussi choisir la partie, retirer une case et changer l'ordre.
- **Cartes hors liste** : une carte rangée dans l'album mais absente de sa liste apparaît sous le livre. Le bouton « Ajouter à la liste » lui donne une case comme aux autres.
- **Progression en vue Liste** : barre, pourcentage et « cases remplies / total » sur chaque album (barre dorée à 100 %).
- **Vue grille pleine page** : toutes les cases défilent à l'infini, avec les parties en intertitres et les cases manquantes visibles. Elle marche pour tous les albums, pas seulement en rendu livre.

**Synchro et partage** (nouveau bouton nuage à côté de l'état de synchro)
- **Synchro par compte WikiMasters**, en option et désactivée par défaut : tes albums à objectif te suivent sur tous tes ordinateurs, sans autre connexion. Un bouton efface tes données du serveur quand tu veux. Les détails sont dans la page de confidentialité.
- **Partager un album** par lien, page web interactive, PDF ou code. Sur WikiMasters, le destinataire n'a qu'à cliquer sur « Ajouter à mes albums ».
- **Comparer avec un ami** : sa progression à côté de la tienne pour chaque album. Tu vois les cartes qu'il a et pas toi (idées d'échange), et l'inverse.
- Un **guide pas à pas** dans le panneau.

**Étiquettes et stats**
- **Étiquettes Trade et Discard facultatives** : on peut les désactiver (Paramètres › Rangement › Statut d'échange) et supprimer du site celles déjà créées. Favori (l'étoile du site) reste disponible.
- **Suis-je chanceux ?** Les stats de tirage comparent tes paquets aux taux annoncés (Pack ++) ou à ta propre moyenne (paquets standards), puis donnent un verdict : Chanceux, Dans la norme ou Pas de chance.

**Mises à jour**
- La version du Chrome Web Store s'applique **sans attendre le redémarrage de Chrome**. Une nouvelle version proposera « Mettre à jour maintenant ».

### Corrections
- **Grosses collections** : le chargement ne plante plus vers 150 pages et ne s'arrête plus à 300. Quand le site demande de ralentir, l'extension patiente (« le site ralentit, reprise dans X s »). Si la synchro échoue, la suivante reprend là où elle s'était arrêtée, et toutes les cartes finissent par être chargées.
- **Bibliothèque d'albums** : le livre ne clignote plus au survol de certains bords et le son ne se rejoue plus en boucle. Un clic n'importe où sur l'album (tranche, couverture, médaillon, sceau) l'ouvre. Le bouton ⋯ caché sous l'étagère est de nouveau visible.

### Encore à venir
- Prix moyens et prix du marché (étude faite, construction à suivre).
- Voir la progression des autres sans échange de lien (le serveur est prêt à l'accueillir).

min-version: 0.11.0
