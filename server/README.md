# Serveur de synchro Collection+

**En ligne :** `https://collection-plus-sync.collection-plus-sync.workers.dev` (compte Cloudflare d'Enzo, base D1 `collection-plus-sync` en Europe de l'Ouest). La clé `ACCOUNT_KEY` est rangée hors du dépôt, dans `~/.collection-plus-sync-account-key` sur le Mac d'Enzo.

Synchro **facultative** des albums à objectif, liée au compte WikiMasters, hébergée sur **Cloudflare Workers + D1**
(offre gratuite : 100 000 requêtes par jour, 5 Go de base, pas de mise en pause).

- `src/index.ts` : le Worker (routes, vérification d'identité, fusion, limites).
- `migrations/` : le schéma D1.
- `dev/` : faux service d'identité et test de bout en bout pour le local.

## Ce que fait le serveur

| Route | Rôle |
| --- | --- |
| `GET /v1/albums` | Le paquet d'albums gardé pour ce compte |
| `POST /v1/albums` | `{ bundle }` : fusionné avec la copie gardée (album par album, le plus récent gagne, comme `lib/goal-sync.ts`) ; renvoie le résultat |
| `DELETE /v1/account` | Efface tout ce qui concerne ce compte |
| `GET /v1/health` | Le service répond |

**Identité.** L'extension envoie le jeton de session WikiMasters (`Authorization: Bearer …`). Le Worker le vérifie
auprès du service d'identité du site (`https://cyrxjeppjqsxxjayfrur.supabase.co/auth/v1/user`, en-têtes `apikey` +
`Authorization`), garde seulement l'identifiant du joueur le temps de la requête et oublie le jeton : il n'est ni écrit
en base ni journalisé. Le compte est rangé sous `HMAC-SHA256(ACCOUNT_KEY, identifiant)` : la base seule ne dit pas
de quel joueur il s'agit.

**Données gardées** (table `albums`) : pour chaque album à objectif, son identifiant d'étiquette, son code CP1 (la
liste des cases, sans les cartes du joueur) et sa date de modification ; les albums supprimés restent comme simple date
de suppression, pour ne pas revenir depuis un autre ordinateur. Rien d'autre.

**Limites.** Corps ≤ 512 Ko, 500 albums et 2 000 suppressions par compte, code ≤ 120 000 caractères ; 60 requêtes par
minute et par adresse IP avant vérification du jeton, 30 par minute et par compte ensuite. Seules les origines listées
dans `ALLOWED_ORIGINS` sont acceptées (CORS et refus côté serveur).

**Pour plus tard (pas construit).** Le schéma réserve de quoi partager un album et voir la progression des autres :
`accounts.display_name` et `default_visibility`, `albums.visibility` / `share_id` (lien de partage) /
`progress_have` / `progress_total` / `progress_at`, et la table `follows` (qui suit quel album partagé). Il suffira
d'ajouter les routes (par ex. `POST /v1/albums/:id/share`, `GET /v1/shared/:share_id`) et l'envoi de la progression
depuis l'extension, sans migration de données.

## En local

```bash
cd server
pnpm install
cp .dev.vars.example .dev.vars   # ACCOUNT_KEY de test, faux service d'identité, origines locales
pnpm db:local                    # crée la base D1 locale (.wrangler/)
pnpm dev:auth                    # terminal 1 : faux /auth/v1/user sur :8788
pnpm dev                         # terminal 2 : le Worker sur :8787
pnpm test:e2e                    # terminal 3 : écriture par un profil, lecture par un 2e, fusion, suppression, limites
```

Avec l'extension simulée (`pnpm preview:mock`, à la racine) :

```bash
WXT_SYNC_URL=http://127.0.0.1:8787 pnpm build && PORT=5190 node dev/preview.mjs
```

puis `http://localhost:5190/review.html?demo=groups` → Paramètres › Synchro et export › « Synchro par le serveur
Collection+ » (profil A, qui a un album « Footballeurs »), et `http://localhost:5190/review.html` dans un nouvel onglet
(profil B, stockage vierge) : en activant l'option, l'album arrive. L'origine de l'aperçu doit figurer dans
`ALLOWED_ORIGINS` de `.dev.vars`.

## Déploiement (compte Cloudflare d'Enzo)

Une seule fois :

```bash
cd server
pnpm install
pnpm exec wrangler login                               # ouvre le navigateur, compte Cloudflare
pnpm exec wrangler d1 create collection-plus-sync      # copier le database_id affiché dans wrangler.toml
pnpm db:remote                                         # crée les tables
openssl rand -hex 32 | pnpm exec wrangler secret put ACCOUNT_KEY
```

> ⚠️ Garder `ACCOUNT_KEY` quelque part de sûr : si elle change, les comptes existants deviennent introuvables
> (les joueurs repartent de la copie de leur ordinateur, rien n'est perdu côté extension).

Dans `wrangler.toml`, compléter `ALLOWED_ORIGINS` avec l'identifiant du Chrome Web Store une fois connu :
`chrome-extension://npnhlblglinajejkkjcigeebgbogpbii,chrome-extension://<ID du Store>`. Pour Safari (identifiant
différent sur chaque appareil), ajouter `safari-web-extension://*`.

Puis, à chaque modification :

```bash
pnpm run deploy      # affiche l'adresse : https://collection-plus-sync.<compte>.workers.dev
```

Enfin, côté extension, donner cette adresse au build :

- en local : `WXT_SYNC_URL=https://collection-plus-sync.<compte>.workers.dev` dans `.env.local` (racine) ;
- pour les Releases GitHub : variable de dépôt `WXT_SYNC_URL` (Settings → Secrets and variables → Actions → Variables).

Sans `WXT_SYNC_URL`, l'option n'apparaît pas dans l'extension et aucun accès au serveur n'est demandé dans le
manifeste.

## Effacer des données

- Un joueur : bouton **Effacer mes données du serveur** (Paramètres › Synchro et export), ou en coupant l'option
  (l'extension propose d'effacer) → `DELETE /v1/account`.
- Tout : `pnpm exec wrangler d1 execute collection-plus-sync --remote --command "DELETE FROM albums; DELETE FROM follows; DELETE FROM hits; DELETE FROM accounts;"`.
