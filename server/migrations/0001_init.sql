-- Synchro des albums à objectif de Collection+ (Cloudflare D1, SQLite).
-- Aucun jeton n'est stocké. Le compte est désigné par un HMAC de l'identifiant WikiMasters (clé ACCOUNT_KEY) :
-- une copie de la base ne permet pas, seule, de retrouver de quel joueur il s'agit.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,                 -- HMAC-SHA256(ACCOUNT_KEY, identifiant WikiMasters), en hexadécimal
  created_at INTEGER NOT NULL,         -- ms depuis 1970
  updated_at INTEGER NOT NULL,
  -- Réservé au partage (pas encore utilisé) : pseudo affiché aux autres et visibilité par défaut des albums.
  display_name TEXT,
  default_visibility TEXT NOT NULL DEFAULT 'private' CHECK (default_visibility IN ('private', 'link', 'friends', 'public'))
);

-- Un album à objectif par ligne, comme dans le « paquet » de l'extension (lib/goal-sync.ts).
-- album_id = identifiant de l'étiquette WikiMasters « ◇ Nom ». Un album supprimé reste comme pierre tombale
-- (code NULL, gone_at renseigné) pour ne pas revenir depuis un autre ordinateur.
CREATE TABLE albums (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  album_id TEXT NOT NULL,
  code TEXT,                           -- code CP1 de l'album (liste des cases, sans les cartes du joueur)
  at INTEGER NOT NULL DEFAULT 0,       -- date de la dernière modification de l'album (horloge de l'extension)
  gone_at INTEGER,                     -- date de suppression, si supprimé
  updated_at INTEGER NOT NULL,         -- date d'écriture côté serveur
  -- Réservé au partage d'album (pas encore utilisé).
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'link', 'friends', 'public')),
  share_id TEXT UNIQUE,                -- identifiant public court pour un lien de partage
  -- Réservé à la progression vue par les autres (pas encore utilisé) : cases remplies / total, envoyés par l'extension.
  progress_have INTEGER,
  progress_total INTEGER,
  progress_at INTEGER,
  PRIMARY KEY (account_id, album_id)
);

-- Réservé : qui suit quel album partagé (progression des autres). Pas encore utilisé.
CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  share_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, share_id)
);

-- Limite de débit : requêtes par compte et par minute. Vidée au fil de l'eau.
CREATE TABLE hits (
  account_id TEXT NOT NULL,
  minute INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (account_id, minute)
);
