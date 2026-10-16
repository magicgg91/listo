// Base de données SQLite : ouverture, réglages et schéma.
//
// Le schéma évolue par « migrations numérotées » : chaque migration est un
// bloc de SQL appliqué une seule fois, dans l'ordre. SQLite garde le numéro
// de la dernière migration appliquée (PRAGMA user_version). Au démarrage, on
// applique seulement celles qui manquent : une base existante est mise à jour
// sans perdre ses données.
//
// Conventions :
// - Les dates sont des textes ISO 8601 en UTC, au millième de seconde
//   (ex. « 2026-10-16T21:30:00.000Z »). Elles se lisent facilement et se
//   comparent dans le bon ordre. Elles sont toujours posées par le serveur.
// - Les booléens sont des entiers 0 (non) ou 1 (oui).
// - Les listes et articles ont un identifiant UUID (texte) créé par le
//   téléphone, pour pouvoir les créer hors ligne. Les autres tables utilisent
//   un simple numéro attribué par SQLite.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Expression SQL qui donne l'heure actuelle au format ISO (UTC, millièmes)
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

// Liste des migrations. Ne jamais modifier une migration déjà publiée :
// pour changer le schéma, ajouter une nouvelle migration à la fin.
export const MIGRATIONS = [
  // --- Migration 1 : schéma initial (étape 1) ---
  `
  -- Comptes. Un compte désactivé (active = 0) ne peut plus se connecter.
  -- « COLLATE NOCASE » : « Guillaume » et « guillaume » sont le même identifiant.
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(username) BETWEEN 1 AND 50),
    display_name  TEXT    NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    totp_secret   TEXT,                       -- secret 2FA, chiffré (AES-256-GCM)
    totp_enabled  INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1)),
    created_at    TEXT    NOT NULL DEFAULT ${NOW}
  );

  -- Codes de secours de la double authentification, à usage unique, hachés.
  CREATE TABLE recovery_codes (
    id        INTEGER PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT    NOT NULL,
    used_at   TEXT                            -- vide tant que le code n'a pas servi
  );
  CREATE INDEX recovery_codes_user ON recovery_codes(user_id);

  -- Sessions de connexion. « id » est l'empreinte (hachage) du jeton du
  -- cookie : le jeton lui-même n'est jamais stocké.
  CREATE TABLE sessions (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  -- Catégories de liste (Courses, Tâches…). is_shopping = 1 : la liste
  -- demande un magasin et classe ses articles par rayon.
  CREATE TABLE categories (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 100),
    is_shopping INTEGER NOT NULL DEFAULT 0 CHECK (is_shopping IN (0, 1)),
    active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );

  -- Magasins (liste commune gérée par l'Admin, purement informative).
  CREATE TABLE stores (
    id     INTEGER PRIMARY KEY,
    name   TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 100),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );

  -- Rayons, communs à tous les magasins.
  CREATE TABLE aisles (
    id     INTEGER PRIMARY KEY,
    name   TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 100),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );

  -- Listes. Suppression « logique » : deleted_at est rempli au lieu
  -- d'effacer la ligne, pour que les autres téléphones l'apprennent.
  -- Les clés étrangères sans « ON DELETE » empêchent d'effacer une
  -- catégorie, un magasin ou un compte encore utilisé.
  CREATE TABLE lists (
    id          TEXT    PRIMARY KEY,          -- UUID créé par le téléphone
    name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    store_id    INTEGER REFERENCES stores(id), -- facultatif (listes de courses)
    owner_id    INTEGER NOT NULL REFERENCES users(id),
    created_at  TEXT    NOT NULL DEFAULT ${NOW},
    updated_at  TEXT    NOT NULL DEFAULT ${NOW},
    deleted_at  TEXT
  );

  -- Qui a accès à quelle liste. Le propriétaire y figure aussi.
  CREATE TABLE list_members (
    list_id TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, user_id)
  );
  CREATE INDEX list_members_user ON list_members(user_id);

  -- Articles d'une liste. Suppression logique, comme pour les listes.
  -- Longueurs maximales : nom 100, quantité 30, note 500 caractères.
  CREATE TABLE items (
    id         TEXT    PRIMARY KEY,           -- UUID créé par le téléphone
    list_id    TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    quantity   TEXT    NOT NULL DEFAULT '' CHECK (length(quantity) <= 30),
    note       TEXT    NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    aisle_id   INTEGER REFERENCES aisles(id), -- facultatif (« Sans rayon »)
    checked    INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT    NOT NULL DEFAULT ${NOW},
    updated_at TEXT    NOT NULL DEFAULT ${NOW},
    deleted_at TEXT
  );
  -- Accélère « les changements de cette liste depuis tel instant »
  CREATE INDEX items_list_updated ON items(list_id, updated_at);

  -- Historique des articles, commun à tous les comptes : alimente
  -- l'autocomplétion et le rayon automatique. name_normalized est le nom
  -- en minuscules, sans accents ni espaces superflus (« Lait » = « lait »).
  CREATE TABLE item_history (
    id              INTEGER PRIMARY KEY,
    name_normalized TEXT    NOT NULL UNIQUE,
    display_name    TEXT    NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
    aisle_id        INTEGER REFERENCES aisles(id),
    use_count       INTEGER NOT NULL DEFAULT 0,
    last_used_at    TEXT    NOT NULL DEFAULT ${NOW}
  );
  `,
];

// Ouvre (ou crée) la base, règle SQLite et applique les migrations.
// dbPath peut valoir ':memory:' pour une base temporaire (tests).
export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);

  // Journal « WAL » : lectures et écritures simultanées sans blocage
  db.pragma('journal_mode = WAL');
  // Vérifie les liens entre tables (désactivé par défaut dans SQLite)
  db.pragma('foreign_keys = ON');
  // Si la base est occupée, attendre jusqu'à 5 secondes au lieu d'échouer
  db.pragma('busy_timeout = 5000');

  migrate(db);
  return db;
}

// Applique, dans l'ordre, les migrations pas encore appliquées.
// Chaque migration est faite d'un bloc : tout passe, ou rien ne change.
export function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

// Numéro de version actuel du schéma
export function schemaVersion(db) {
  return db.pragma('user_version', { simple: true });
}
