# WikiMasters Tags

Extension Chrome pour [WikiMasters](https://www.wiki-masters.com) : revue Trade / Not Trade de la collection, basée sur les étiquettes natives du site, et export CSV / Google Sheets.

## Développement

```bash
pnpm install
pnpm dev      # lance Chrome avec l'extension en rechargement à chaud
pnpm build    # build de production dans .output/chrome-mv3
```

## Installation manuelle

1. `pnpm build`
2. Ouvrir `chrome://extensions`, activer le **Mode développeur**
3. **Charger l'extension non empaquetée** → dossier `.output/chrome-mv3`

## Utilisation

- Bouton **🏷️ Revue Trade** en bas à gauche du site (ou via l'icône de l'extension).
- Clic sur une carte = sélection, Maj+clic = plage, glisser = peindre la sélection.
- Pastille en haut de la carte = bascule Trade / Not Trade en un clic.
- Raccourcis : flèches, `Espace` sélectionner, `T` Trade, `N` Not Trade, `A` tout sélectionner, `/` recherche, `Échap`.
- **✓ Valider la revue** : les cartes actuelles ne sont plus marquées « nouvelles ».

## Cache et synchronisation

- La collection est gardée en cache local (`chrome.storage.local`) : la revue s'affiche instantanément.
- À chaque ouverture, une vérification légère compare `/api/my-collection/stats` et relit les étiquettes (1 requête Supabase).
- Rechargement complet seulement si : le site a fait une action qui modifie la collection (paquet, échange, marché…, détectée automatiquement), les stats ont changé, le cache a plus de 6 h, ou clic sur ↻.
- L'overlay du site et l'onglet de l'extension partagent le même cache et se mettent à jour mutuellement.

## Onglet dédié

Icône de l'extension → **Ouvrir la revue dans un onglet** (ou bouton ↗ Onglet dans l'overlay).
Les requêtes passent par un onglet WikiMasters ouvert s'il y en a un (le plus fiable), sinon directement.

## Export Google Sheets (configuration unique, ~10 min)

L'export crée **un classeur** (onglets *Collection*, *À échanger*, *Stats*), mis en forme, puis le **réécrit au même endroit** à chaque export. L'extension n'a accès qu'aux fichiers qu'elle crée (scope `drive.file`).

1. [console.cloud.google.com](https://console.cloud.google.com) → créer un projet (ex. « WikiMasters Tags »).
2. **API et services → Bibliothèque** → activer **Google Sheets API**.
3. **Écran de consentement OAuth** → type *Externe* → nom de l'app + ton e-mail → dans **Utilisateurs test**, ajouter ton adresse Google.
4. **Identifiants → Créer des identifiants → ID client OAuth** → type **Extension Chrome** → ID de l'élément : `npnhlblglinajejkkjcigeebgbogpbii`.
5. Copier l'ID client dans `.env.local` :
   ```
   WXT_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```
6. `pnpm build` puis recharger l'extension. Chrome doit être connecté au compte Google ajouté en utilisateur test.
