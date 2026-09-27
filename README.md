# WikiMasters Collection+

> Extension **non officielle**, sans lien avec l'équipe de WikiMasters.

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

- **Collection+** s'ouvre dans un onglet dédié : bouton flottant **Collection+** en bas à gauche du site, ou icône de l'extension.
- Navigation en encoche : **Revue** · **Étiquettes** · **Suggestions** (à venir) · **Export** (export + réglages + thème).
- Revue : clic = sélection, Maj+clic = plage, glisser = peindre la sélection ; la pastille d'une carte bascule Trade / Not Trade.
- Raccourcis : flèches, `Espace`, `T` Trade, `N` Not Trade, `E` étiqueter, `A` tout sélectionner, `/` recherche, `Échap`.
- Garde un onglet WikiMasters ouvert : l'extension passe par lui pour parler au site.

## Stack

WXT (MV3) · React 19 · Tailwind v4 · shadcn/ui (`components/ui`) · framer-motion · lucide · zustand · TanStack Virtual.

## Cache et synchronisation

- La collection est gardée en cache local (`chrome.storage.local`) : la revue s'affiche instantanément.
- À chaque ouverture, une vérification légère compare `/api/my-collection/stats` et relit les étiquettes (1 requête Supabase).
- Rechargement complet seulement si : le site a fait une action qui modifie la collection (paquet, échange, marché…, détectée automatiquement), les stats ont changé, le cache a plus de 6 h, ou clic sur ↻.
- L'onglet Collection+, les pastilles du site et le popup partagent le même cache et se mettent à jour mutuellement.

## Export Google Sheets (configuration unique, ~10 min)

L'export crée **un classeur** (onglets *Collection*, *À échanger*, *Stats*), mis en forme, puis le **réécrit au même endroit** à chaque export. L'extension n'a accès qu'aux fichiers qu'elle crée (scope `drive.file`).

1. [console.cloud.google.com](https://console.cloud.google.com) → créer un projet (ex. « WikiMasters Collection+ »).
2. **API et services → Bibliothèque** → activer **Google Sheets API**.
3. **Écran de consentement OAuth** → type *Externe* → nom de l'app + ton e-mail → dans **Utilisateurs test**, ajouter ton adresse Google.
4. **Identifiants → Créer des identifiants → ID client OAuth** → type **Extension Chrome** → ID de l'élément : `npnhlblglinajejkkjcigeebgbogpbii`.
5. Copier l'ID client dans `.env.local` :
   ```
   WXT_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```
6. `pnpm build` puis recharger l'extension. Chrome doit être connecté au compte Google ajouté en utilisateur test.
