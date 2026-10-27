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
import { normalizeItemName } from '../public/js/history.js';

// Expression SQL qui donne l'heure actuelle au format ISO (UTC, millièmes)
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

// Liste des migrations (texte SQL ou fonction). Ne jamais modifier une
// migration déjà publiée : pour changer le schéma, en ajouter une à la fin.
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

  // --- Migration 2 : double authentification (étape 2) ---
  `
  -- Numéro de la dernière période de 30 secondes dont le code 2FA a été
  -- accepté : un code déjà utilisé (ou plus ancien) est ensuite refusé.
  ALTER TABLE users ADD COLUMN totp_last_step INTEGER;
  `,

  // --- Migration 3 : administration (étape 3) ---
  // Une migration peut aussi être une fonction, quand il faut insérer des
  // données : elle reçoit la base et utilise des requêtes paramétrées.
  (db) => {
    // Vaut 1 quand le mot de passe a été choisi par un Admin (création du
    // compte ou réinitialisation) : l'utilisateur doit le changer à sa
    // prochaine connexion avant de pouvoir faire autre chose.
    db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1))');

    // Données de départ, créées une seule fois (une migration ne s'applique
    // qu'une fois) : si l'Admin les supprime ensuite, elles ne reviennent pas.
    const category = db.prepare('INSERT INTO categories (name, is_shopping) VALUES (?, ?)');
    category.run('Courses', 1);
    category.run('Tâches', 0);

    const store = db.prepare('INSERT INTO stores (name) VALUES (?)');
    for (const name of ['Carrefour', 'E.Leclerc', 'Lidl']) store.run(name);

    const aisle = db.prepare('INSERT INTO aisles (name) VALUES (?)');
    for (const name of [
      'Boissons', 'Boucherie', 'Boulangerie', 'Crèmerie', 'Entretien', 'Épicerie salée',
      'Épicerie sucrée', 'Fromages', 'Fruits et légumes', 'Hygiène', 'Poissonnerie', 'Surgelés',
    ]) aisle.run(name);
  },

  // --- Migration 4 : listes et articles (étape 4) ---
  `
  -- Opérations déjà appliquées (file d'attente du téléphone). Chaque
  -- opération porte un identifiant unique : si le téléphone la renvoie après
  -- une coupure, on retrouve ici son résultat au lieu de l'appliquer deux fois.
  -- « result » garde la réponse donnée la première fois (texte JSON).
  CREATE TABLE applied_ops (
    id         TEXT    PRIMARY KEY,           -- UUID créé par le téléphone
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    result     TEXT    NOT NULL,
    applied_at TEXT    NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX applied_ops_date ON applied_ops(applied_at);

  -- Accélère le nettoyage des lignes supprimées depuis plus de 30 jours
  CREATE INDEX lists_deleted ON lists(deleted_at) WHERE deleted_at IS NOT NULL;
  CREATE INDEX items_deleted ON items(deleted_at) WHERE deleted_at IS NOT NULL;
  `,

  // --- Migration 5 : magasin « multi » (étape 6) ---
  (db) => {
    db.exec(`
    -- Un magasin « multi » (is_multi = 1) regroupe plusieurs magasins : dans
    -- une liste qui l'utilise, chaque article a son propre magasin, sans rayon.
    ALTER TABLE stores ADD COLUMN is_multi INTEGER NOT NULL DEFAULT 0 CHECK (is_multi IN (0, 1));

    -- Magasins regroupés par un magasin « multi ». Effacer le « multi » efface
    -- ses lignes ; un magasin regroupé, lui, ne peut pas être effacé.
    CREATE TABLE store_members (
      multi_store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      store_id       INTEGER NOT NULL REFERENCES stores(id),
      PRIMARY KEY (multi_store_id, store_id)
    );
    CREATE INDEX store_members_store ON store_members(store_id);

    -- Magasin d'un article, pour les listes dont le magasin est « multi »
    -- (vide sinon : « Sans magasin »).
    ALTER TABLE items ADD COLUMN store_id INTEGER REFERENCES stores(id);

    -- Historique : une ligne générale par article (store_id vide), comme
    -- avant, plus une ligne par article et par magasin (rayon habituel dans ce
    -- magasin, nombre d'achats dans ce magasin). SQLite ne sait pas retirer
    -- une contrainte UNIQUE : la table est recréée, les lignes existantes
    -- deviennent les lignes générales (rien ne change pour elles).
    CREATE TABLE item_history_new (
      id              INTEGER PRIMARY KEY,
      name_normalized TEXT    NOT NULL,
      store_id        INTEGER REFERENCES stores(id),
      display_name    TEXT    NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
      aisle_id        INTEGER REFERENCES aisles(id),
      use_count       INTEGER NOT NULL DEFAULT 0,
      last_used_at    TEXT    NOT NULL DEFAULT ${NOW}
    );
    INSERT INTO item_history_new (id, name_normalized, store_id, display_name, aisle_id, use_count, last_used_at)
      SELECT id, name_normalized, NULL, display_name, aisle_id, use_count, last_used_at FROM item_history;
    DROP TABLE item_history;
    ALTER TABLE item_history_new RENAME TO item_history;
    -- Une seule ligne par article et par magasin (0 = ligne générale)
    CREATE UNIQUE INDEX item_history_key ON item_history(name_normalized, IFNULL(store_id, 0));
    CREATE INDEX item_history_used ON item_history(last_used_at);
    `);
  },

  // --- Migration 6 : photo d'un article (étape 7) ---
  `
  -- Date de la photo de l'article, posée par le serveur (vide = pas de
  -- photo). L'image elle-même est un fichier data/photos/<id de l'article>.jpg.
  ALTER TABLE items ADD COLUMN photo_at TEXT;
  `,

  // --- Migration 7 : lien public d'une liste (étape 10) ---
  `
  -- Lien public (lecture seule, sans compte). Le jeton de l'adresse n'est
  -- jamais stocké en clair : token_hash (SHA-256) sert à retrouver le lien,
  -- token_sealed (chiffré avec la clé de secrets/) à le réafficher au
  -- propriétaire. password_hash : mot de passe facultatif, haché avec scrypt.
  -- expires_at vide = illimité ; revoked_at rempli = lien arrêté.
  CREATE TABLE public_shares (
    id            INTEGER PRIMARY KEY,
    list_id       TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    token_hash    TEXT    NOT NULL UNIQUE,
    token_sealed  TEXT    NOT NULL,
    password_hash TEXT,
    expires_at    TEXT,
    created_by    INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT    NOT NULL,
    revoked_at    TEXT
  );
  -- Un seul lien non arrêté par liste
  CREATE UNIQUE INDEX public_shares_one_per_list ON public_shares(list_id) WHERE revoked_at IS NULL;
  `,

  // --- Migration 8 : mémoire des noms réservée aux listes de courses ---
  // (décision du 17 octobre 2026 ; aucune table ne change, seules des lignes
  // de l'historique sont effacées, voir pruneHistory)
  (db) => {
    pruneHistory(db);
  },

  // --- Migration 9 : date du coché (zone « Dans le panier » / « Terminés ») ---
  // checked_at : quand l'article a été coché (vide s'il ne l'est pas), posée
  // par le serveur. La zone des cochés va du plus récemment coché au plus
  // ancien. Les articles déjà cochés reçoivent leur date de modification.
  `
  ALTER TABLE items ADD COLUMN checked_at TEXT;
  UPDATE items SET checked_at = updated_at WHERE checked = 1;
  `,

  // --- Migration 10 : priorité et échéance des éléments (listes autres que
  // les courses) ---
  // priority : 'low' (basse), 'normal' (normale, par défaut) ou 'high'
  // (élevée). due_date : date seule AAAA-MM-JJ, sans heure ni fuseau, ou vide.
  // Les éléments existants deviennent « normale », sans échéance : aucune
  // autre donnée ne change.
  `
  ALTER TABLE items ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high'));
  ALTER TABLE items ADD COLUMN due_date TEXT;
  `,

  // --- Migration 11 : code-barres (EAN) des articles des listes de courses ---
  // ean : code sous sa forme normalisée (8 ou 13 chiffres ; un UPC-A est
  // ramené en EAN-13), ou vide. Le serveur vérifie aussi la clé de contrôle
  // avant d'écrire ; la contrainte refuse tout le reste, même écrit
  // directement. Les articles existants n'ont pas de code : aucune autre
  // donnée ne change.
  `
  ALTER TABLE items ADD COLUMN ean TEXT CHECK (ean IS NULL OR (length(ean) IN (8, 13) AND ean NOT GLOB '*[^0-9]*'));
  `,

  // --- Migration 12 : droit de chaque personne sur une liste partagée ---
  // access : 'modification' (peut ajouter, modifier, cocher, supprimer les
  // articles) ou 'lecture' (voit seulement). Les membres déjà présents gardent
  // la modification : rien ne change pour eux. Une appartenance créée ensuite
  // sans droit précisé est en lecture seule (valeur par défaut de la base).
  // Le propriétaire a toujours tous les droits (vérifié dans lists.js).
  // SQLite ne sait pas changer la valeur par défaut d'une colonne : la table
  // est recopiée (aucune autre table ne pointe vers elle).
  `
  CREATE TABLE list_members_new (
    list_id TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access  TEXT    NOT NULL DEFAULT 'lecture' CHECK (access IN ('modification', 'lecture')),
    PRIMARY KEY (list_id, user_id)
  );
  INSERT INTO list_members_new (list_id, user_id, access) SELECT list_id, user_id, 'modification' FROM list_members;
  DROP TABLE list_members;
  ALTER TABLE list_members_new RENAME TO list_members;
  CREATE INDEX list_members_user ON list_members(user_id);
  `,

  // --- Migration 13 : priorité et échéance activées ou non, liste par liste ---
  // Deux réglages (0 ou 1) pour une liste autre que les courses ; une liste
  // de courses les ignore. Valeur par défaut 0 : une nouvelle liste ne les a
  // pas. Les listes existantes autres que les courses les gardent activés
  // (rien ne change, rien ne disparaît). Les valeurs des éléments ne sont
  // jamais effacées : un réglage désactivé les cache seulement.
  `
  ALTER TABLE lists ADD COLUMN priority_enabled INTEGER NOT NULL DEFAULT 0 CHECK (priority_enabled IN (0, 1));
  ALTER TABLE lists ADD COLUMN due_enabled INTEGER NOT NULL DEFAULT 0 CHECK (due_enabled IN (0, 1));
  UPDATE lists SET priority_enabled = 1, due_enabled = 1
    WHERE category_id IN (SELECT id FROM categories WHERE is_shopping = 0);
  `,

  // --- Migration 14 : une icône au choix pour chaque liste ---
  // Identifiant d'une icône de la liste blanche (public/js/list-icons.js),
  // vérifié par le serveur à chaque écriture. Vide par défaut : la liste
  // montre l'icône de sa catégorie, comme avant (rien ne change pour les
  // listes existantes).
  `
  ALTER TABLE lists ADD COLUMN icon TEXT NOT NULL DEFAULT '';
  `,

  // --- Migration 15 : « Après l'ajout », liste par liste ---
  // 'quick' (« Rester sur la liste », comme avant) ou 'detail' (« Ouvrir la
  // fiche » de l'élément ajouté). Voir addModeMigration.
  (db) => addModeMigration(db),
];

// Migration 15 : colonne add_mode ('quick' ou 'detail', rien d'autre).
// Listes existantes :
// - liste de courses : 'quick' (rien ne change) ;
// - autre liste avec la priorité ou l'échéance activée : 'detail' (on veut
//   le plus souvent régler ces options juste après l'ajout) ;
// - autre liste sans ni l'une ni l'autre : 'quick'.
// Les listes supprimées depuis moins de 30 jours sont traitées de la même
// façon. Le nombre de listes de chaque sorte est écrit dans le journal du
// conteneur (aucun nom de liste), et renvoyé (tests).
export function addModeMigration(db) {
  db.exec("ALTER TABLE lists ADD COLUMN add_mode TEXT NOT NULL DEFAULT 'quick' CHECK (add_mode IN ('quick', 'detail'))");
  const counts = db.prepare(`
    SELECT
      COALESCE(SUM(categories.is_shopping = 1), 0) AS shopping,
      COALESCE(SUM(categories.is_shopping = 0 AND (lists.priority_enabled = 1 OR lists.due_enabled = 1)), 0) AS detail,
      COALESCE(SUM(categories.is_shopping = 0 AND lists.priority_enabled = 0 AND lists.due_enabled = 0), 0) AS quick
    FROM lists JOIN categories ON categories.id = lists.category_id
  `).get();
  db.prepare(`
    UPDATE lists SET add_mode = 'detail'
    WHERE category_id IN (SELECT id FROM categories WHERE is_shopping = 0) AND (priority_enabled = 1 OR due_enabled = 1)
  `).run();
  if (counts.shopping + counts.detail + counts.quick > 0) {
    console.log(`Migration 15 (« Après l'ajout ») : ${counts.shopping} liste(s) de courses → « Rester sur la liste » ; `
      + `${counts.detail} autre(s) liste(s) avec priorité ou échéance → « Ouvrir la fiche » ; `
      + `${counts.quick} autre(s) liste(s) sans priorité ni échéance → « Rester sur la liste ».`);
  }
  return counts;
}

// Nettoyage de l'historique (migration 8) : retire les noms qui ne viennent
// que des listes autres que courses (tâches…), pour qu'ils ne soient plus
// suggérés ni montrés dans l'onglet « Articles » de l'administration.
//
// Règle prudente : un nom (toutes ses lignes) est effacé seulement si
// - aucun article d'une liste de courses ne porte ce nom (article actif, ou
//   supprimé mais pas encore effacé par le nettoyage des 30 jours) ;
// - ET aucune de ses lignes n'a jamais eu de rayon ni de magasin (un nom de
//   tâche n'en a jamais : un nom qui en a vient forcément des courses).
// Ainsi, un ancien article de courses acheté il y a longtemps garde sa
// mémoire (son rayon), même si plus aucun article ne porte ce nom.
//
// Le nom normalisé des articles n'est pas en base : il est calculé ici, avec
// la même règle que partout ailleurs (normalizeItemName). La fonction peut
// être relancée sans risque : la seconde fois, elle n'efface plus rien.
// Renvoie le nombre de noms effacés.
export function pruneHistory(db) {
  const shoppingNames = new Set(db.prepare(`
    SELECT items.name FROM items
    JOIN lists ON lists.id = items.list_id
    JOIN categories ON categories.id = lists.category_id AND categories.is_shopping = 1
  `).pluck().all().map(normalizeItemName));
  const candidates = db.prepare(`
    SELECT name_normalized FROM item_history
    GROUP BY name_normalized
    HAVING MAX(aisle_id IS NOT NULL OR store_id IS NOT NULL) = 0
  `).pluck().all();
  const remove = db.prepare('DELETE FROM item_history WHERE name_normalized = ?');
  let removed = 0;
  for (const key of candidates) {
    if (shoppingNames.has(key)) continue;
    remove.run(key);
    removed += 1;
  }
  return removed;
}

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
      const migration = MIGRATIONS[version];
      if (typeof migration === 'function') migration(db);
      else db.exec(migration);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

// Numéro de version actuel du schéma
export function schemaVersion(db) {
  return db.pragma('user_version', { simple: true });
}
