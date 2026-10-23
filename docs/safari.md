# Version Safari (iPhone, iPad)

La même extension, compilée pour Safari puis emballée dans une petite app iOS par Xcode.

## Construire

1. Installer **Xcode** depuis l'App Store (les outils en ligne de commande seuls ne suffisent pas), puis :
   `sudo xcode-select -s /Applications/Xcode.app`
2. `pnpm build:safari` : build dans `.output/safari-mv3`.
3. `pnpm safari:xcode` : projet Xcode dans `safari/` (ignoré par git). Identifiant de l'app :
   `com.enzobncll.collectionplus`, ou une autre valeur via `SAFARI_BUNDLE_ID=…`.
4. Ouvrir `safari/Collection+/Collection+.xcodeproj`, choisir l'iPhone branché comme cible, régler l'équipe
   de signature (Signing & Capabilities, un Apple ID gratuit suffit), puis lancer (⌘R).
5. Sur l'iPhone : Réglages › Apps › Safari › Extensions › Collection+ : activer, et autoriser
   `wiki-masters.com`.

Le projet référence `.output/safari-mv3` sans le copier : après un nouveau `pnpm build:safari`, relancer
depuis Xcode suffit.

Avec un Apple ID gratuit, l'app expire au bout de 7 jours (il suffit de relancer depuis Xcode). Le compte
développeur (99 €/an) donne TestFlight et l'App Store.

## Ce qui change par rapport à Chrome

| Fonction | Safari | Dans le code |
|---|---|---|
| Notifications (paquets pleins, pack PRO) | Pas d'API | Options masquées, aucune alarme créée (`hasNotifications`) |
| Export Google Sheets, copie Drive | Pas de `identity.getAuthToken` | Pas d'`oauth2` dans le manifeste : carte Sheets et option Drive masquées |
| IA intégrée de Chrome | Absente | Déjà détectée : l'analyse sans IA prend le relais |
| `storage.sync` | Local à l'appareil | La copie WikiMasters et le code CPT1 restent la passerelle avec Chrome |
| Cookies du site | API parfois refusée | Les requêtes passent par l'onglet du site |

## À vérifier sur l'appareil

- Les deux scripts `world: "MAIN"` (`intercept`, `page`) : Safari les accepte dans les versions récentes
  d'iOS. S'ils ne tournent pas, le cache ne se recharge plus tout seul après une action sur le site.
- La mise en page des panneaux posés sur le site et de la bibliothèque sur un écran de téléphone.
