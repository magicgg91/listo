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
// - Les listes, articles et notes ont un identifiant
//   UUID (texte) créé par le téléphone, pour pouvoir les créer hors ligne.
//   Les autres tables utilisent un simple numéro attribué par SQLite.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { normalizeItemName } from '../public/js/history.js';
import { compareNames } from '../public/js/sorting.js';
import { translate, DEFAULT_LOCALE } from '../public/js/i18n.js';

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
  (db, options) => addModeMigration(db, options),

  // --- Migration 16 : nouveautés (journal d'activité et repères de lecture) ---
  // list_events : ce qui s'est passé dans une liste (qui, quoi, sur quel
  // élément, quand) ; jamais de texte d'élément, seulement des identifiants.
  // Numéros croissants jamais réutilisés (AUTOINCREMENT) : un repère ne peut
  // que monter. list_reads : pour chaque membre, le dernier événement vu
  // (last_seen), « behind » quand des événements plus récents que ce repère
  // ont été effacés par le nettoyage (30 jours, 500 par liste), et « muted »
  // (« Ne plus me signaler cette liste »). Réglages du compte :
  // news_enabled (« Nouveautés », activé) et news_checks (« Signaler les
  // éléments cochés », désactivé). Le journal part vide : le repère de chaque
  // membre est posé sur son dernier événement (aucun), personne ne voit
  // l'historique comme nouveau.
  `
  CREATE TABLE list_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id    TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type       TEXT    NOT NULL CHECK (type IN ('add', 'update', 'check', 'uncheck', 'delete')),
    item_id    TEXT    NOT NULL,
    created_at TEXT    NOT NULL
  );
  CREATE INDEX list_events_list ON list_events(list_id, id);
  CREATE INDEX list_events_date ON list_events(created_at);
  CREATE TABLE list_reads (
    list_id   TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_seen INTEGER NOT NULL DEFAULT 0,
    behind    INTEGER NOT NULL DEFAULT 0 CHECK (behind IN (0, 1)),
    muted     INTEGER NOT NULL DEFAULT 0 CHECK (muted IN (0, 1)),
    PRIMARY KEY (list_id, user_id)
  );
  CREATE INDEX list_reads_user ON list_reads(user_id);
  ALTER TABLE users ADD COLUMN news_enabled INTEGER NOT NULL DEFAULT 1 CHECK (news_enabled IN (0, 1));
  ALTER TABLE users ADD COLUMN news_checks INTEGER NOT NULL DEFAULT 0 CHECK (news_checks IN (0, 1));
  INSERT INTO list_reads (list_id, user_id, last_seen)
    SELECT list_members.list_id, list_members.user_id,
           COALESCE((SELECT MAX(id) FROM list_events WHERE list_events.list_id = list_members.list_id), 0)
    FROM list_members;
  `,

  // --- Migration 17 : autorisation OAuth pour Claude (docs/mcp-cadrage.md) ---
  // oauth_clients : applications connues (document d'identification CIMD lu
  // sur claude.ai ou claude.com, ou enregistrement automatique DCR), avec
  // leurs adresses de retour (JSON). oauth_requests : demandes d'autorisation
  // en attente (10 minutes), en attendant l'accord de la personne.
  // oauth_grants : « connexions » accordées (compte, application, portées,
  // toutes les listes ou une sélection dans oauth_grant_lists). oauth_codes
  // (60 s, usage unique) et oauth_tokens : la base ne garde que l'EMPREINTE
  // SHA-256 des codes et des jetons, jamais leur valeur.
  `
  CREATE TABLE oauth_clients (
    client_id     TEXT PRIMARY KEY,
    kind          TEXT NOT NULL CHECK (kind IN ('cimd', 'dcr')),
    client_name   TEXT NOT NULL DEFAULT '',
    redirect_uris TEXT NOT NULL,
    created_ip    TEXT,
    created_at    TEXT NOT NULL,
    fetched_at    TEXT,
    last_used_at  TEXT
  );
  CREATE INDEX oauth_clients_kind ON oauth_clients(kind, created_at);
  CREATE TABLE oauth_requests (
    id             TEXT PRIMARY KEY,
    client_id      TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    redirect_uri   TEXT NOT NULL,
    state          TEXT,
    code_challenge TEXT NOT NULL,
    resource       TEXT NOT NULL,
    scope          TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    expires_at     TEXT NOT NULL
  );
  CREATE TABLE oauth_grants (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id     TEXT    NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    app_key       TEXT    NOT NULL,
    client_host   TEXT    NOT NULL,
    redirect_host TEXT    NOT NULL,
    scope         TEXT    NOT NULL CHECK (scope IN ('lists:read', 'lists:read lists:write')),
    all_lists     INTEGER NOT NULL CHECK (all_lists IN (0, 1)),
    created_at    TEXT    NOT NULL,
    last_used_at  TEXT,
    revoked_at    TEXT
  );
  CREATE INDEX oauth_grants_user ON oauth_grants(user_id, revoked_at);
  CREATE TABLE oauth_grant_lists (
    grant_id INTEGER NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
    list_id  TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    PRIMARY KEY (grant_id, list_id)
  );
  CREATE TABLE oauth_codes (
    code_hash      TEXT    PRIMARY KEY,
    grant_id       INTEGER NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
    client_id      TEXT    NOT NULL,
    redirect_uri   TEXT    NOT NULL,
    code_challenge TEXT    NOT NULL,
    resource       TEXT    NOT NULL,
    scope          TEXT    NOT NULL,
    expires_at     TEXT    NOT NULL,
    used_at        TEXT
  );
  CREATE TABLE oauth_tokens (
    token_hash TEXT    PRIMARY KEY,
    grant_id   INTEGER NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL CHECK (kind IN ('access', 'refresh')),
    resource   TEXT    NOT NULL,
    scope      TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    expires_at TEXT    NOT NULL,
    used_at    TEXT,
    revoked_at TEXT
  );
  CREATE INDEX oauth_tokens_grant ON oauth_tokens(grant_id);
  CREATE INDEX oauth_tokens_expiry ON oauth_tokens(expires_at);
  `,

  // --- Migration 18 : types de liste (courses, tâches, envies) ---
  // Remplace la catégorie. Voir listTypesMigration.
  (db, options) => listTypesMigration(db, options),

  // --- Migration 19 : listes d'envies (bénéficiaire, souhaits, réservations) ---
  // Voir wishesMigration.
  (db) => wishesMigration(db),

  // --- Migration 20 : réservations des visiteurs du lien public (envies) ---
  // Voir visitorReservationsMigration.
  (db) => visitorReservationsMigration(db),

  // --- Migration 21 : niveau d'accord « Lecture, ajout et modification » (Claude) ---
  // Voir oauthEditScopeMigration.
  (db) => oauthEditScopeMigration(db),

  // --- Migration 22 : deux niveaux d'accord seulement pour Claude ---
  // Voir oauthTwoLevelsMigration.
  (db) => oauthTwoLevelsMigration(db),

  // --- Migration 23 : notifications push (LISTO_PUSH=on, voir server/push.js) ---
  `
  -- Abonnement d'un appareil : lié au compte ET à la session de cet
  -- appareil. Déconnexion, session expirée ou fermée, compte supprimé :
  -- l'abonnement disparaît avec elle (ON DELETE CASCADE). Une seule
  -- adresse par session, une adresse n'appartient qu'à une session.
  -- endpoint : adresse du service de push (vérifiée : liste autorisée) ;
  -- p256dh, auth : clé publique et secret de l'appareil (base64url).
  CREATE TABLE push_subscriptions (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id  TEXT    NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    endpoint    TEXT    NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 1 AND 1024),
    p256dh      TEXT    NOT NULL CHECK (length(p256dh) BETWEEN 80 AND 100),
    auth        TEXT    NOT NULL CHECK (length(auth) BETWEEN 16 AND 30),
    created_at  TEXT    NOT NULL,
    last_sent_at TEXT
  );
  CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

  -- Préférences d'une personne (valables sur tous ses appareils). Pas de
  -- ligne : valeurs par défaut (catégories actives, détail désactivé).
  CREATE TABLE push_settings (
    user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    changes  INTEGER NOT NULL DEFAULT 1 CHECK (changes IN (0, 1)),  -- modifications des autres
    due      INTEGER NOT NULL DEFAULT 1 CHECK (due IN (0, 1)),      -- échéances des tâches
    wishes   INTEGER NOT NULL DEFAULT 1 CHECK (wishes IN (0, 1)),   -- réservations, cotisations
    sharing  INTEGER NOT NULL DEFAULT 1 CHECK (sharing IN (0, 1)),  -- partage
    detail   INTEGER NOT NULL DEFAULT 0 CHECK (detail IN (0, 1)),   -- détail dans le texte
    updated_at TEXT NOT NULL
  );

  -- « Silencer cette liste » : plus aucune notification venant d'elle
  CREATE TABLE push_list_mutes (
    list_id  TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, user_id)
  );

  -- Résumé quotidien des échéances : jour (AAAA-MM-JJ, heure du serveur) du
  -- dernier envoi, pour ne jamais l'envoyer deux fois (même après un
  -- redémarrage)
  CREATE TABLE push_digests (
    user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_day TEXT    NOT NULL
  );
  `,

  // --- Migration 24 : tâches qui se répètent (11 novembre 2026) ---
  // repeat : règle de répétition d'une tâche (public/js/repeat.js : 'day',
  // 'week:1,3', '2week:1', 'month:5', 'year'), ou vide. Contrôlée par le
  // serveur ; toujours avec une échéance. Une tâche cochée revient à la date
  // suivante au lieu d'aller dans « Terminés ».
  `
  ALTER TABLE items ADD COLUMN repeat TEXT CHECK (repeat IS NULL OR length(repeat) BETWEEN 1 AND 20);
  `,

  // --- Migration 25 : attribuer une tâche (11 novembre 2026) ---
  // lists.assign_enabled : option « Attribution » de la liste (listes de
  // tâches ; désactivée au départ, comme la priorité et l'échéance).
  // items.assigned_to : la personne à qui la tâche est attribuée (le
  // propriétaire ou un membre « Peut modifier »), ou vide. Effacée quand la
  // personne quitte la liste, en est retirée ou passe en lecture seule
  // (server/lists.js), ou si son compte est supprimé (ON DELETE SET NULL).
  `
  ALTER TABLE lists ADD COLUMN assign_enabled INTEGER NOT NULL DEFAULT 0 CHECK (assign_enabled IN (0, 1));
  ALTER TABLE items ADD COLUMN assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;
  `,

  // --- Migration 26 : heure d'échéance et rappel (11 novembre 2026) ---
  // due_time : heure facultative « HH:MM » (24 h), seulement avec une date.
  // remind_before : rappel choisi pour la tâche, en minutes avant l'heure
  // (0 : à l'heure ; 1440 : la veille), seulement avec une heure.
  // push_reminders : le dernier rappel envoyé pour chaque tâche (signature
  // date, heure, délai) : jamais deux fois le même, même après un
  // redémarrage ; un changement d'heure en prévoit un nouveau.
  `
  ALTER TABLE items ADD COLUMN due_time TEXT CHECK (due_time IS NULL OR (length(due_time) = 5 AND due_time GLOB '[0-2][0-9]:[0-5][0-9]'));
  ALTER TABLE items ADD COLUMN remind_before INTEGER CHECK (remind_before IS NULL OR remind_before IN (0, 15, 30, 60, 120, 1440));
  CREATE TABLE push_reminders (
    item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    sent_key TEXT NOT NULL
  );
  `,

  // --- Migration 27 : retirer un article de « Souvent ajoutés » (11 novembre 2026) ---
  // hidden_at : date à laquelle quelqu'un a retiré l'article de « Souvent
  // ajoutés » pour ce magasin (ligne du magasin ; ligne générale pour les
  // listes sans magasin). Effacée au prochain ajout de l'article
  // (public/js/history.js, recordUse) : il revient s'il est racheté.
  `
  ALTER TABLE item_history ADD COLUMN hidden_at TEXT;
  `,

  // --- Migration 28 : plusieurs personnes, chacun son tour (11 novembre 2026) ---
  // assign_mode : 'one' (une personne ou personne, comme avant), 'all'
  // (plusieurs personnes à la fois), 'turn' (chacun son tour ; assigned_to
  // est la personne de cette fois). assign_people : les personnes, dans
  // l'ordre, « 3,5,7 » (public/js/assign.js) ; vide en mode 'one'.
  `
  ALTER TABLE items ADD COLUMN assign_mode TEXT NOT NULL DEFAULT 'one' CHECK (assign_mode IN ('one', 'all', 'turn'));
  ALTER TABLE items ADD COLUMN assign_people TEXT CHECK (assign_people IS NULL OR (length(assign_people) BETWEEN 3 AND 300 AND assign_people NOT GLOB '*[^0-9,]*'));
  `,

  // --- Migration 29 : connexion avec le fournisseur d'identité (15 novembre 2026, voir server/oidc.js) ---
  // users.oidc_sub : identifiant interne du compte chez le fournisseur d'identité relié à ce
  // compte Listo (retenu à la première connexion, ou à l'acceptation d'une
  // demande) ; un compte chez le fournisseur d'identité ne peut être relié qu'à un seul compte.
  // account_requests : demandes de compte faites en se connectant avec
  // le fournisseur d'identité sans compte Listo ; l'Admin les accepte (le compte est créé)
  // ou les refuse (gardées 30 jours, pour ne pas redemander aussitôt).
  `
  ALTER TABLE users ADD COLUMN oidc_sub TEXT CHECK (oidc_sub IS NULL OR length(oidc_sub) BETWEEN 1 AND 255);
  CREATE UNIQUE INDEX users_oidc_sub ON users(oidc_sub) WHERE oidc_sub IS NOT NULL;
  CREATE TABLE account_requests (
    id           INTEGER PRIMARY KEY,
    oidc_sub     TEXT    NOT NULL UNIQUE CHECK (length(oidc_sub) BETWEEN 1 AND 255),
    username     TEXT    NOT NULL CHECK (length(username) BETWEEN 1 AND 50),
    display_name TEXT    NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
    status       TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'refused')),
    created_at   TEXT    NOT NULL,
    refused_at   TEXT
  );
  `,

  // --- Migration 30 : comment chaque session a été ouverte (15 novembre 2026) ---
  // method : 'password' (identifiant et mot de passe Listo ; toutes les
  // sessions d'avant) ou 'oidc' (connexion avec le fournisseur d'identité). Une session
  // ouverte ainsi ne change ni le mot de passe ni la double authentification de
  // Listo ; avec LISTO_LOCAL_LOGIN=off, les sessions 'password' sont refusées.
  `
  ALTER TABLE sessions ADD COLUMN method TEXT NOT NULL DEFAULT 'password' CHECK (method IN ('password', 'oidc'));
  `,

  // --- Migration 31 : sous-tâches (17 novembre 2026) ---
  // lists.subtasks_enabled : option « Sous-tâches » de la liste (listes de
  // tâches ; désactivée au départ, comme la priorité et l'échéance).
  // items.parent_id : la tâche principale d'une sous-tâche (même liste, un
  // seul niveau : vérifié par server/lists.js), ou vide. Option coupée ou
  // liste d'un autre type : gardé en base, ignoré (tâches à plat). Si la
  // principale est effacée pour de bon, la sous-tâche redevient une tâche
  // (ON DELETE SET NULL).
  `
  ALTER TABLE lists ADD COLUMN subtasks_enabled INTEGER NOT NULL DEFAULT 0 CHECK (subtasks_enabled IN (0, 1));
  ALTER TABLE items ADD COLUMN parent_id TEXT REFERENCES items(id) ON DELETE SET NULL;
  CREATE INDEX items_parent ON items(parent_id) WHERE parent_id IS NOT NULL;
  `,

  // --- Migration 32 : ménage des catégories (17 novembre 2026) ---
  // Depuis les types de liste (migration 18), la table categories et la
  // colonne lists.category_id n'étaient plus gardées que pour revenir à
  // une image plus ancienne. Décision du propriétaire : elles sont
  // effacées. Une liste encore sans type (créée par une image d'avant,
  // après un retour en arrière) en reçoit un d'abord. Revenir ensuite à
  // une image d'avant cette migration demande de restaurer une sauvegarde.
  (db) => {
    fillListTypes(db);
    db.exec('ALTER TABLE lists DROP COLUMN category_id; DROP TABLE categories;');
  },

  // --- Migration 33 : ordre manuel des sous-tâches (17 novembre 2026) ---
  // items.position : place d'une sous-tâche parmi celles de sa tâche
  // principale (1, 2, 3… ; public/js/subtasks.js), choisie à la main ;
  // vide pour les autres éléments. Les sous-tâches existantes gardent
  // l'ordre où elles s'affichaient (tri par défaut : à faire puis cochées,
  // chacune par ordre alphabétique).
  (db) => subtaskPositionsMigration(db),

  // --- Migration 34 : langue de chaque compte (20 novembre 2026) ---
  // users.locale : langue choisie dans « Mon compte » (public/js/i18n.js :
  // « fr » ou « en ») ; vide : automatique (langue du navigateur, sinon
  // celle de l'installation, LISTO_LANG). Les comptes existants sont en
  // automatique : rien ne change pour eux.
  `
  ALTER TABLE users ADD COLUMN locale TEXT CHECK (locale IS NULL OR locale IN ('fr', 'en'));
  `,

  // --- Migration 35 : rayons propres à un magasin (21 novembre 2026) ---
  // aisles.store_id : le magasin simple auquel le rayon appartient, ou vide
  // pour un rayon commun à tous les magasins (« Tous les magasins »). Les
  // rayons existants deviennent tous communs : rien ne change. Le même nom
  // peut désormais exister dans deux magasins : la contrainte UNIQUE du nom
  // part, et la table est recréée (voir aislesByStoreMigration).
  (db) => aislesByStoreMigration(db),

  // --- Migration 36 : notes (23 novembre 2026, docs/cadrage-accueil-notes-notifications.md) ---
  // notes : une note (identifiant UUID créé par le téléphone, pour la créer
  // hors ligne), son propriétaire, un titre facultatif (120 caractères au
  // plus), un texte simple (20 000 au plus), un numéro de version (+1 à
  // chaque enregistrement du titre ou du texte : sert à repérer deux
  // enregistrements faits sur la même version, server/notes.js), qui a
  // écrit en dernier, et la corbeille (deleted_at, deleted_by : effacée
  // pour de bon 30 jours après par le ménage).
  // note_user_state : ce qui est propre à chaque personne qui voit la note
  // (l'épingle ; gardée pendant la corbeille). Le partage (étape 3) ajoutera
  // des membres sans changer ces tables. (Catégories des notes : abandonnées
  // le 23 novembre 2026, aucune table.)
  // Un compte effacé (seul cas permis : compte jamais utilisé) n'a pas de
  // note ; ON DELETE CASCADE en filet de sécurité. Les tables partent vides :
  // rien ne change pour les données existantes.
  `
  CREATE TABLE notes (
    id         TEXT    PRIMARY KEY,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL DEFAULT '' CHECK (length(title) <= 120),
    body       TEXT    NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
    version    INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TEXT,
    deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX notes_owner ON notes(owner_id, updated_at);
  CREATE INDEX notes_deleted ON notes(deleted_at) WHERE deleted_at IS NOT NULL;

  CREATE TABLE note_user_state (
    note_id TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned  INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    PRIMARY KEY (note_id, user_id)
  );
  CREATE INDEX note_user_state_user ON note_user_state(user_id);
  `,

  // --- Migration 37 : partage des notes (23 novembre 2026, étape 3 du cadrage) ---
  // note_members : les personnes avec qui une note est partagée et leur
  // droit ('modification' : « Peut modifier » ; 'lecture' : « Lecture
  // seule »), comme list_members ; le propriétaire n'y figure pas (il a tous
  // les droits, notes.owner_id).
  // notes.changed_at : dernier changement de la note POUR LA
  // SYNCHRONISATION (texte, corbeille, mais aussi partage et lien public) ;
  // updated_at reste la date de modification du texte, montrée à l'écran
  // (ajouter une personne ne doit pas faire remonter la note). Les notes
  // existantes reçoivent leur date de modification.
  // note_user_state reçoit ce qui est propre à chaque personne, en plus de
  // l'épingle (une seule ligne par personne et par note, effacée quand elle
  // perd l'accès : épingle, lecture et sourdines partent ensemble) :
  // last_read_version (Nouveautés : la dernière version lue ; une note
  // modifiée par quelqu'un d'autre au-delà est « nouvelle »), muted_news
  // (menu de la note, « Masquer les nouveautés ») et muted_push (« Couper
  // les notifications »). Deux sourdines séparées, comme
  // list_reads.muted et push_list_mutes pour les listes.
  // note_public_shares : lien public d'une note, mêmes colonnes et mêmes
  // règles que public_shares (empreinte du jeton, jeton chiffré pour le
  // réafficher au propriétaire, mot de passe haché, expiration, arrêt) ;
  // un seul lien non arrêté par note.
  `
  ALTER TABLE notes ADD COLUMN changed_at TEXT;
  UPDATE notes SET changed_at = updated_at;
  CREATE INDEX notes_changed ON notes(changed_at);

  CREATE TABLE note_members (
    note_id TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access  TEXT    NOT NULL DEFAULT 'lecture' CHECK (access IN ('modification', 'lecture')),
    PRIMARY KEY (note_id, user_id)
  );
  CREATE INDEX note_members_user ON note_members(user_id);

  ALTER TABLE note_user_state ADD COLUMN last_read_version INTEGER NOT NULL DEFAULT 0 CHECK (last_read_version >= 0);
  ALTER TABLE note_user_state ADD COLUMN muted_news INTEGER NOT NULL DEFAULT 0 CHECK (muted_news IN (0, 1));
  ALTER TABLE note_user_state ADD COLUMN muted_push INTEGER NOT NULL DEFAULT 0 CHECK (muted_push IN (0, 1));

  CREATE TABLE note_public_shares (
    id            INTEGER PRIMARY KEY,
    note_id       TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    token_hash    TEXT    NOT NULL UNIQUE,
    token_sealed  TEXT    NOT NULL,
    password_hash TEXT,
    expires_at    TEXT,
    created_by    INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT    NOT NULL,
    revoked_at    TEXT
  );
  CREATE UNIQUE INDEX note_public_shares_one_per_note ON note_public_shares(note_id) WHERE revoked_at IS NULL;
  `,

  // --- Migration 38 : page Notifications (23 novembre 2026, étape 4 du cadrage) ---
  // inbox : ce que Listo a signalé à une personne (server/inbox.js), qu'elle
  // ait un appareil inscrit aux notifications push ou non.
  // - category : la catégorie des réglages des notifications ('changes'
  //   Modifications, 'due' Échéances, 'wishes' Envies, 'sharing' Partage) ;
  // - text_key et params : le NOM du texte et ses valeurs (JSON construit
  //   champ par champ par server/notify.js), mis en phrase au moment de la
  //   lecture, dans la langue du compte (changer de langue traduit aussi
  //   l'historique). Jamais le texte d'une note : une note n'est désignée
  //   que par son identifiant (target_id), son titre est relu à l'affichage ;
  // - target_type et target_id : ce qu'ouvre la ligne ('list', 'item',
  //   'note', 'deadlines'), revérifié avec les droits du moment à chaque lecture ;
  // - group_key et count : les modifications rapprochées d'une même liste
  //   (ou d'une même note) mettent à jour une seule ligne ;
  // - read_at : vide tant que la ligne n'est pas lue (lu sur un appareil =
  //   lu sur tous) ;
  // - num : le numéro de la ligne montré au téléphone, compté pour CHAQUE
  //   personne (users.inbox_seq, qui ne fait que monter) : jamais le numéro
  //   commun de la table, qui laisserait deviner qu'une autre personne a
  //   reçu quelque chose entre-temps (une réservation, pour le bénéficiaire
  //   d'une liste d'envies).
  // Gardées 30 jours, 300 au plus par personne (ménage de server/inbox.js).
  // La table part vide : rien ne change pour les données existantes.
  `
  ALTER TABLE users ADD COLUMN inbox_seq INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE inbox (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    num         INTEGER NOT NULL CHECK (num >= 1),
    category    TEXT    NOT NULL CHECK (category IN ('changes', 'due', 'wishes', 'sharing')),
    text_key    TEXT    NOT NULL CHECK (length(text_key) BETWEEN 1 AND 60),
    params      TEXT    NOT NULL DEFAULT '{}' CHECK (length(params) <= 4000),
    target_type TEXT    CHECK (target_type IN ('list', 'item', 'note', 'deadlines')),
    target_id   TEXT,
    group_key   TEXT,
    count       INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    read_at     TEXT
  );
  CREATE UNIQUE INDEX inbox_user_num ON inbox(user_id, num);
  CREATE INDEX inbox_user ON inbox(user_id, updated_at);
  CREATE INDEX inbox_group ON inbox(user_id, group_key) WHERE group_key IS NOT NULL;
  CREATE INDEX inbox_updated ON inbox(updated_at);
  `,

  // --- Migration 39 : « À offrir », la case « Acheté » (23 novembre 2026) ---
  // gift_bought : les souhaits qu'une personne a cochés « Acheté » dans sa
  // liste automatique « À offrir » (ses réservations et participations).
  // Propre à chaque personne et PRIVÉ : lu et écrit seulement par
  // server/reservations.js, envoyé à elle seule ; jamais au bénéficiaire, ni
  // aux autres proches, ni dans les nouveautés, les notifications, le
  // journal, la page publique ou l'accès des assistants IA.
  // Une marque n'a de sens que pendant la réservation : quand la personne
  // ne participe plus au souhait (départ, retrait, libération, souhait ou
  // compte effacé), le déclencheur l'efface avec la ligne de reservations.
  // La table part vide : rien ne change pour les données existantes.
  `
  CREATE TABLE gift_bought (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id    TEXT    NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );
  CREATE INDEX gift_bought_item ON gift_bought(item_id);
  CREATE TRIGGER gift_bought_cleanup AFTER DELETE ON reservations
  BEGIN
    DELETE FROM gift_bought WHERE user_id = OLD.user_id AND item_id = OLD.item_id;
  END;
  `,

  // --- Migration 40 : réglage « Accueil » de chaque compte (23 novembre 2026) ---
  // Réglages › Accueil, le même sur tous les appareils de la personne
  // (public/js/home-tiles.js, server/home.js) :
  // - home_enabled : l'Accueil est affiché (1, au départ) ou coupé (0) ;
  // - home_start : le premier écran quand l'Accueil est coupé (« lists »
  //   au départ ; « deadlines » ou « notes » possibles) ;
  // - home_tiles : l'ordre des tuiles et celles qui sont masquées, un petit
  //   texte JSON {"order":[…],"hidden":[…]} vérifié par le serveur avant
  //   d'être écrit ; vide : l'ordre de départ, toutes affichées.
  // Les comptes existants gardent l'Accueil tel qu'il était : rien ne change.
  `
  ALTER TABLE users ADD COLUMN home_enabled INTEGER NOT NULL DEFAULT 1 CHECK (home_enabled IN (0, 1));
  ALTER TABLE users ADD COLUMN home_start TEXT NOT NULL DEFAULT 'lists' CHECK (home_start IN ('deadlines', 'lists', 'notes'));
  ALTER TABLE users ADD COLUMN home_tiles TEXT CHECK (home_tiles IS NULL OR length(home_tiles) <= 200);
  `,

  // --- Migration 41 : réglage « Fonctions » de chaque compte (24 novembre 2026) ---
  // Réglages › Fonctions, le même sur tous les appareils de la personne
  // (public/js/features.js, server/features.js) : une colonne
  // <fonction>_enabled par fonction qu'on peut couper pour soi.
  // - notes_enabled : les notes sont utilisées (1, au départ) ou coupées
  //   (0 : ni bouton, ni tuile, ni nouveautés, ni notifications des notes
  //   pour cette personne ; rien n'est effacé).
  // Les comptes existants gardent les notes : rien ne change.
  `
  ALTER TABLE users ADD COLUMN notes_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notes_enabled IN (0, 1));
  `,

  // --- Migration 42 : étiquettes des notes (24 novembre 2026) ---
  // labels : la réserve d'étiquettes, commune à tous les comptes
  // (server/labels.js, public/js/labels.js) : un nom (1 à 30 caractères),
  // sa forme comparable name_key (sans accents ni majuscules, espaces
  // regroupés : UNIQUE, « Été » et « ete » sont la même étiquette) et une
  // couleur parmi huit. Le créateur n'est pas gardé (le journal de sécurité
  // le dit) : il n'est envoyé à personne.
  // note_labels : les étiquettes posées sur une note, communes à la note
  // (tous ceux qui la voient les voient). Effacer une étiquette (Admin) la
  // retire de ses notes sans toucher aux notes ; effacer une note emporte
  // ses liens (ON DELETE CASCADE des deux côtés).
  // Les tables partent vides : rien ne change pour les données existantes.
  `
  CREATE TABLE labels (
    id       INTEGER PRIMARY KEY,
    name     TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
    name_key TEXT    NOT NULL UNIQUE CHECK (length(name_key) BETWEEN 1 AND 200),
    color    TEXT    NOT NULL CHECK (color IN ('gris', 'rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose')),
    created_at TEXT  NOT NULL
  );
  CREATE TABLE note_labels (
    note_id  TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, label_id)
  );
  CREATE INDEX note_labels_label ON note_labels(label_id);
  `,

  // --- Migration 43 : projets, le socle (25 novembre 2026, docs/cadrage-projets.md) ---
  // users.projects_enabled : la fonction « Projets » (Réglages › Fonctions),
  // COUPÉE au départ pour tous les comptes, anciens et nouveaux.
  // users.home_start accepte aussi « projects » (premier écran quand
  // l'Accueil est coupé) : SQLite ne sait pas changer une contrainte CHECK,
  // la colonne est donc refaite (nouvelle colonne, valeurs recopiées,
  // ancienne retirée, nouvelle renommée) ; la table users n'est pas recréée.
  // projects : un projet (UUID créé par le téléphone), son propriétaire, son
  // nom, l'option « Priorité », le projet d'origine d'une copie, la
  // corbeille, changed_at (dernier changement de sa STRUCTURE pour la
  // synchronisation : nom, partage, colonnes, étiquettes, cartes effacées)
  // et cards_reset_at (projet restauré : ses membres reçoivent de nouveau
  // toutes ses cartes).
  // project_members : les personnes avec qui il est partagé et leur droit
  // ('modification' : « Peut modifier », 'contribution' : « Contributeur »,
  // 'lecture' : « Lecture seule ») ; le propriétaire n'y figure pas ;
  // added_at : depuis quand (la personne reçoit alors toutes les cartes).
  // project_columns, project_labels : colonnes (nom unique dans le projet,
  // majuscules et accents ignorés : name_key, couleur, position réelle) et
  // étiquettes propres au projet (même règle de nom).
  // cards : les cartes (colonne, position, titre, qui l'a créée : c'est ce
  // qui donne ses droits au Contributeur ; corbeille du projet, avec le nom
  // de sa colonne d'alors). Une carte présente a toujours une colonne.
  // card_labels, card_assignees : étiquettes posées et personnes attribuées
  // (la table des personnes est créée dès cette étape : les droits du
  // Contributeur en dépendent).
  // card_events : l'historique des cartes et les Nouveautés des projets
  // (type dans une liste fermée, valeurs construites champ par champ :
  // jamais un titre, une description ni un commentaire).
  // project_user_state : ce qui est propre à chaque personne (dernier
  // événement vu, deux sourdines, « Afficher dans Échéances »), jamais
  // transmis aux autres, effacé quand elle perd l'accès.
  // Les tables partent vides : une installation n'a aucun projet.
  `
  ALTER TABLE users ADD COLUMN projects_enabled INTEGER NOT NULL DEFAULT 0 CHECK (projects_enabled IN (0, 1));
  ALTER TABLE users ADD COLUMN home_start_next TEXT NOT NULL DEFAULT 'lists' CHECK (home_start_next IN ('deadlines', 'lists', 'notes', 'projects'));
  UPDATE users SET home_start_next = home_start;
  ALTER TABLE users DROP COLUMN home_start;
  ALTER TABLE users RENAME COLUMN home_start_next TO home_start;

  CREATE TABLE projects (
    id               TEXT    PRIMARY KEY,
    owner_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    priority_enabled INTEGER NOT NULL DEFAULT 0 CHECK (priority_enabled IN (0, 1)),
    duplicated_from  TEXT,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL,
    changed_at       TEXT    NOT NULL,
    cards_reset_at   TEXT,
    deleted_at       TEXT,
    deleted_by       INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX projects_owner ON projects(owner_id);
  CREATE INDEX projects_deleted ON projects(deleted_at) WHERE deleted_at IS NOT NULL;

  CREATE TABLE project_members (
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access     TEXT    NOT NULL DEFAULT 'lecture' CHECK (access IN ('modification', 'contribution', 'lecture')),
    added_at   TEXT    NOT NULL,
    PRIMARY KEY (project_id, user_id)
  );
  CREATE INDEX project_members_user ON project_members(user_id);

  CREATE TABLE project_columns (
    id         TEXT    PRIMARY KEY,
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
    name_key   TEXT    NOT NULL CHECK (length(name_key) BETWEEN 1 AND 400),
    color      TEXT    NOT NULL CHECK (color IN ('gris', 'rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose')),
    position   REAL    NOT NULL,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );
  CREATE INDEX project_columns_project ON project_columns(project_id, position);
  CREATE UNIQUE INDEX project_columns_name ON project_columns(project_id, name_key);

  CREATE TABLE project_labels (
    id         TEXT    PRIMARY KEY,
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
    name_key   TEXT    NOT NULL CHECK (length(name_key) BETWEEN 1 AND 300),
    color      TEXT    NOT NULL CHECK (color IN ('gris', 'rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose')),
    created_at TEXT    NOT NULL
  );
  CREATE UNIQUE INDEX project_labels_name ON project_labels(project_id, name_key);

  CREATE TABLE cards (
    id                  TEXT    PRIMARY KEY,
    project_id          TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    column_id           TEXT    REFERENCES project_columns(id) ON DELETE SET NULL,
    position            REAL    NOT NULL,
    title               TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL,
    updated_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deleted_at          TEXT,
    deleted_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deleted_column_name TEXT    CHECK (deleted_column_name IS NULL OR length(deleted_column_name) <= 40),
    CHECK (column_id IS NOT NULL OR deleted_at IS NOT NULL)
  );
  CREATE INDEX cards_project ON cards(project_id, updated_at);
  CREATE INDEX cards_column ON cards(column_id, position);
  CREATE INDEX cards_created_by ON cards(project_id, created_by);
  CREATE INDEX cards_deleted ON cards(deleted_at) WHERE deleted_at IS NOT NULL;

  CREATE TABLE card_labels (
    card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES project_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, label_id)
  );
  CREATE INDEX card_labels_label ON card_labels(label_id);

  CREATE TABLE card_assignees (
    card_id  TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (card_id, user_id)
  );
  CREATE INDEX card_assignees_user ON card_assignees(user_id);

  CREATE TABLE card_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    card_id    TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type       TEXT    NOT NULL CHECK (type IN ('create', 'move', 'rename', 'describe', 'task', 'assign', 'unassign', 'due', 'done', 'undone',
                 'label', 'unlabel', 'link', 'unlink', 'comment', 'delete', 'restore', 'duplicate')),
    params     TEXT    NOT NULL DEFAULT '{}' CHECK (length(params) <= 2000),
    source     TEXT    NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'mcp')),
    created_at TEXT    NOT NULL
  );
  CREATE INDEX card_events_card ON card_events(card_id, id);
  CREATE INDEX card_events_project ON card_events(project_id, id);

  CREATE TABLE project_user_state (
    project_id      TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_seen_event INTEGER NOT NULL DEFAULT 0 CHECK (last_seen_event >= 0),
    muted_news      INTEGER NOT NULL DEFAULT 0 CHECK (muted_news IN (0, 1)),
    muted_push      INTEGER NOT NULL DEFAULT 0 CHECK (muted_push IN (0, 1)),
    in_deadlines    INTEGER NOT NULL DEFAULT 0 CHECK (in_deadlines IN (0, 1)),
    PRIMARY KEY (project_id, user_id)
  );
  CREATE INDEX project_user_state_user ON project_user_state(user_id);
  `,

  // --- Migration 44 : projets, détails de la carte (25 novembre 2026,
  // docs/cadrage-projets.md, étape 2) ---
  // cards : description (marques des notes, 20 000 caractères au plus) et
  // son numéro de version (jamais d'écrasement : comme une note), qui l'a
  // écrite et quand (choix « Garder les deux ») ; priorité (basse, normale,
  // élevée : montrée seulement quand l'option du projet est allumée) ;
  // échéance (date, heure et rappel facultatifs) et case « Fait » (la seule
  // marque de « fait », avec la date du coché). Une carte sans échéance
  // n'est jamais faite.
  // card_links : les liens d'une carte (titre facultatif, adresse http ou
  // https vérifiée par le serveur, jamais appelée par lui).
  // card_reminders : rappel d'une carte déjà remis à une personne, pour
  // cette signature (date + heure + délai) : jamais deux fois (comme
  // push_reminders pour les tâches).
  // (card_assignees existe depuis la migration 43.)
  `
  ALTER TABLE cards ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000);
  ALTER TABLE cards ADD COLUMN description_version INTEGER NOT NULL DEFAULT 1 CHECK (description_version >= 1);
  ALTER TABLE cards ADD COLUMN description_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE cards ADD COLUMN description_at TEXT;
  ALTER TABLE cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high'));
  ALTER TABLE cards ADD COLUMN due_date TEXT CHECK (due_date IS NULL OR length(due_date) = 10);
  ALTER TABLE cards ADD COLUMN due_time TEXT CHECK (due_time IS NULL OR (due_date IS NOT NULL AND length(due_time) = 5));
  ALTER TABLE cards ADD COLUMN remind_before INTEGER CHECK (remind_before IS NULL OR (due_time IS NOT NULL AND remind_before IN (0, 15, 30, 60, 120, 1440)));
  ALTER TABLE cards ADD COLUMN due_done INTEGER NOT NULL DEFAULT 0 CHECK (due_done IN (0, 1) AND (due_done = 0 OR due_date IS NOT NULL));
  ALTER TABLE cards ADD COLUMN due_done_at TEXT;
  CREATE INDEX cards_due ON cards(due_date) WHERE due_date IS NOT NULL;

  CREATE TABLE card_links (
    id         TEXT    PRIMARY KEY,
    card_id    TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL DEFAULT '' CHECK (length(title) <= 100),
    url        TEXT    NOT NULL CHECK (length(url) BETWEEN 8 AND 500 AND (url LIKE 'http://%' OR url LIKE 'https://%')),
    position   INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT    NOT NULL
  );
  CREATE INDEX card_links_card ON card_links(card_id, position);

  CREATE TABLE card_reminders (
    card_id   TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signature TEXT    NOT NULL CHECK (length(signature) <= 40),
    sent_at   TEXT    NOT NULL,
    PRIMARY KEY (card_id, user_id)
  );
  `,

  // --- Migration 45 : projets, commentaires, cartes suivies et page
  // Notifications (25 novembre 2026, docs/cadrage-projets.md, étape 3) ---
  // card_comments : les commentaires d'une carte (texte simple, 1 à 4 000
  // caractères ; « modifié » : edited). Supprimé : suppression logique (le
  // texte est effacé tout de suite, la ligne reste pour que les autres
  // appareils l'apprennent, puis le ménage l'efface après 30 jours).
  // imported_author, imported_at, imported_by : un commentaire importé par
  // un assistant IA (étape 5) garde son auteur d'origine comme simple texte,
  // jamais relié à un compte.
  // card_follows : « Suivre » (1) ou « Ne plus suivre » (0), choisi par une
  // personne pour une carte ; sans ligne, elle suit les cartes qu'elle a
  // créées, qui lui sont attribuées ou qu'elle a commentées.
  // inbox : target_type accepte aussi 'project' et 'card' (table recréée,
  // toutes ses lignes gardées : voir inboxProjectTargetsMigration).
  (db) => inboxProjectTargetsMigration(db),

  // --- Migration 46 : projets, option « Échéances » (25 novembre 2026,
  // décision du propriétaire après l'essai) ---
  // projects.deadlines_enabled : comme l'option « Priorité », mais allumée
  // au départ (projets existants compris). Coupée, l'échéance, l'heure, le
  // rappel et la case « Fait » des cartes sont gardés, ni montrés ni
  // comptés (public/js/projects.js, deadlinesOn).
  `
  ALTER TABLE projects ADD COLUMN deadlines_enabled INTEGER NOT NULL DEFAULT 1 CHECK (deadlines_enabled IN (0, 1));
  `,

  // --- Migration 47 : rôle « Invité » (25 novembre 2026,
  // docs/cadrage-comptes.md, étape 1) ---
  // users.guest : 1 pour un invité (toujours discret : absent de l'annuaire
  // des autres sauf des Admin, annuaire vide). users.role garde ses deux
  // valeurs ('admin', 'user') : une colonne ajoutée, sans recréer la table
  // des comptes (que 43 tables référencent). La contrainte interdit
  // « invité et Admin ». 0 pour tous les comptes existants : rien ne change
  // pour eux. Le rôle se lit seulement par accountRole()
  // (public/js/access.js).
  `
  ALTER TABLE users ADD COLUMN guest INTEGER NOT NULL DEFAULT 0 CHECK (guest IN (0, 1) AND (guest = 0 OR role = 'user'));
  `,

  // --- Migration 48 : fonctions autorisées par l'Admin (25 novembre 2026,
  // docs/cadrage-comptes.md, étape 2) ---
  // Cases de la page d'un compte (Administration › Comptes) : ce que la
  // personne PEUT utiliser. Elle allume ensuite elle-même Notes et Projets
  // dans Réglages › Fonctions (notes_enabled, projects_enabled, qui
  // existent déjà) ; une fonction est utilisée si elle est autorisée ET
  // allumée (public/js/features.js, usedFeatures).
  // - notes_allowed, projects_allowed : Notes, Projets ;
  // - projects_create : « Peut créer ses propres projets » (permission,
  //   sans interrupteur personnel) ;
  // - mcp_allowed : « Assistants IA » (permission).
  // 1 pour tous les comptes existants : la famille garde tout ce qu'elle a.
  // Ignorées pour un Admin (il a tout). Un nouvel invité reçoit 0 partout,
  // écrit par le serveur à la création (public/js/access.js, defaultAllowed).
  `
  ALTER TABLE users ADD COLUMN notes_allowed INTEGER NOT NULL DEFAULT 1 CHECK (notes_allowed IN (0, 1));
  ALTER TABLE users ADD COLUMN projects_allowed INTEGER NOT NULL DEFAULT 1 CHECK (projects_allowed IN (0, 1));
  ALTER TABLE users ADD COLUMN projects_create INTEGER NOT NULL DEFAULT 1 CHECK (projects_create IN (0, 1));
  ALTER TABLE users ADD COLUMN mcp_allowed INTEGER NOT NULL DEFAULT 1 CHECK (mcp_allowed IN (0, 1));
  `,
];

// Migration 45 (étape 3 des projets) : commentaires, cartes suivies, et la
// table inbox recréée pour accepter les cibles 'project' et 'card' (SQLite
// ne sait pas changer une contrainte CHECK). Rien ne pointe vers inbox :
// on copie ses lignes dans une nouvelle table, on efface l'ancienne, puis
// on renomme la nouvelle et on refait ses index. Les numéros (id, num) sont
// gardés tels quels.
export function inboxProjectTargetsMigration(db) {
  db.exec(`
    CREATE TABLE card_comments (
      id              TEXT    PRIMARY KEY,
      card_id         TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body            TEXT    NOT NULL DEFAULT '',
      imported_author TEXT    CHECK (imported_author IS NULL OR length(imported_author) BETWEEN 1 AND 60),
      imported_at     TEXT,
      imported_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL,
      edited          INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
      deleted_at      TEXT,
      CHECK (length(body) <= 4000 AND (deleted_at IS NOT NULL OR length(body) >= 1))
    );
    CREATE INDEX card_comments_card ON card_comments(card_id, created_at);
    CREATE INDEX card_comments_updated ON card_comments(updated_at);
    CREATE INDEX card_comments_deleted ON card_comments(deleted_at) WHERE deleted_at IS NOT NULL;

    CREATE TABLE card_follows (
      card_id   TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following INTEGER NOT NULL CHECK (following IN (0, 1)),
      PRIMARY KEY (card_id, user_id)
    );
    CREATE INDEX card_follows_user ON card_follows(user_id);

    CREATE TABLE inbox_new (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      num         INTEGER NOT NULL CHECK (num >= 1),
      category    TEXT    NOT NULL CHECK (category IN ('changes', 'due', 'wishes', 'sharing')),
      text_key    TEXT    NOT NULL CHECK (length(text_key) BETWEEN 1 AND 60),
      params      TEXT    NOT NULL DEFAULT '{}' CHECK (length(params) <= 4000),
      target_type TEXT    CHECK (target_type IN ('list', 'item', 'note', 'deadlines', 'project', 'card')),
      target_id   TEXT,
      group_key   TEXT,
      count       INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1),
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL,
      read_at     TEXT
    );
    INSERT INTO inbox_new (id, user_id, num, category, text_key, params, target_type, target_id, group_key, count, created_at, updated_at, read_at)
      SELECT id, user_id, num, category, text_key, params, target_type, target_id, group_key, count, created_at, updated_at, read_at FROM inbox;
    DROP TABLE inbox;
    ALTER TABLE inbox_new RENAME TO inbox;
    CREATE UNIQUE INDEX inbox_user_num ON inbox(user_id, num);
    CREATE INDEX inbox_user ON inbox(user_id, updated_at);
    CREATE INDEX inbox_group ON inbox(user_id, group_key) WHERE group_key IS NOT NULL;
    CREATE INDEX inbox_updated ON inbox(updated_at);
  `);
}

// Migration 35 : la table aisles est recréée avec la colonne store_id et
// sans la contrainte UNIQUE sur le nom. Les identifiants sont gardés : les
// articles et l'historique qui pointent vers un rayon le retrouvent.
//
// SQLite ne sait pas retirer une contrainte : on copie les rayons dans une
// table temporaire, on efface la table, on la recrée sous le même nom, puis
// on remet les rayons. Les clés étrangères restent actives : effacer la
// table compte les articles qui la pointent comme « en défaut », et
// defer_foreign_keys repousse la vérification à la fin de la transaction ;
// remettre chaque rayon efface ce défaut. S'il restait un article sans son
// rayon, la transaction échouerait et rien ne changerait.
// Filet de sécurité : un index unique sur (magasin, nom) ; la règle avec les
// rayons communs (public/js/aisles.js, aisleNameClash) est vérifiée par le code.
export function aislesByStoreMigration(db) {
  db.pragma('defer_foreign_keys = ON');
  db.exec(`
    CREATE TEMP TABLE aisles_copy AS SELECT id, name, active FROM aisles;
    DROP TABLE aisles;
    CREATE TABLE aisles (
      id       INTEGER PRIMARY KEY,
      name     TEXT    NOT NULL COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 100),
      active   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      store_id INTEGER REFERENCES stores(id) -- vide : rayon commun
    );
    INSERT INTO aisles (id, name, active, store_id) SELECT id, name, active, NULL FROM aisles_copy;
    DROP TABLE temp.aisles_copy;
    CREATE UNIQUE INDEX aisles_store_name ON aisles(COALESCE(store_id, 0), name COLLATE NOCASE);
    CREATE INDEX aisles_store ON aisles(store_id) WHERE store_id IS NOT NULL;
  `);
}

// Migration 33 : positions de départ des sous-tâches existantes (supprimées
// comprises : « Annuler » les remet à leur place). Renvoie le nombre de
// sous-tâches numérotées.
export function subtaskPositionsMigration(db) {
  db.exec('ALTER TABLE items ADD COLUMN position INTEGER CHECK (position IS NULL OR position >= 1)');
  const rows = db.prepare('SELECT id, parent_id, name, checked FROM items WHERE parent_id IS NOT NULL').all();
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.parent_id)) groups.set(row.parent_id, []);
    groups.get(row.parent_id).push(row);
  }
  const set = db.prepare('UPDATE items SET position = ? WHERE id = ?');
  for (const children of groups.values()) {
    // Ordre enregistré en base, le même pour tous les lecteurs : français
    children.sort((a, b) => a.checked - b.checked || compareNames(a.name, b.name, 'fr'));
    children.forEach((child, index) => set.run(index + 1, child.id));
  }
  return rows.length;
}

// Recopie des tables des connexions Claude (oauth_grants et les trois tables
// qui pointent vers elle : listes choisies, codes, jetons) avec une nouvelle
// contrainte sur oauth_grants.scope : SQLite ne sait pas changer une
// contrainte. Les tables enfants sont recopiées AVANT la suppression de
// l'ancienne oauth_grants, pour que rien ne disparaisse en cascade ; puis
// tout est renommé (SQLite met à jour les références). Rien d'autre ne
// change. scopes : les valeurs permises pour oauth_grants.scope.
function rebuildOauthTables(db, scopes) {
  const allowed = scopes.map((scope) => `'${scope}'`).join(', ');
  db.exec(`
    CREATE TABLE oauth_grants_new (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id     TEXT    NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
      app_key       TEXT    NOT NULL,
      client_host   TEXT    NOT NULL,
      redirect_host TEXT    NOT NULL,
      scope         TEXT    NOT NULL CHECK (scope IN (${allowed})),
      all_lists     INTEGER NOT NULL CHECK (all_lists IN (0, 1)),
      created_at    TEXT    NOT NULL,
      last_used_at  TEXT,
      revoked_at    TEXT
    );
    INSERT INTO oauth_grants_new SELECT id, user_id, client_id, app_key, client_host, redirect_host, scope, all_lists, created_at, last_used_at, revoked_at FROM oauth_grants;
    CREATE TABLE oauth_grant_lists_new (
      grant_id INTEGER NOT NULL REFERENCES oauth_grants_new(id) ON DELETE CASCADE,
      list_id  TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      PRIMARY KEY (grant_id, list_id)
    );
    INSERT INTO oauth_grant_lists_new SELECT grant_id, list_id FROM oauth_grant_lists;
    CREATE TABLE oauth_codes_new (
      code_hash      TEXT    PRIMARY KEY,
      grant_id       INTEGER NOT NULL REFERENCES oauth_grants_new(id) ON DELETE CASCADE,
      client_id      TEXT    NOT NULL,
      redirect_uri   TEXT    NOT NULL,
      code_challenge TEXT    NOT NULL,
      resource       TEXT    NOT NULL,
      scope          TEXT    NOT NULL,
      expires_at     TEXT    NOT NULL,
      used_at        TEXT
    );
    INSERT INTO oauth_codes_new SELECT code_hash, grant_id, client_id, redirect_uri, code_challenge, resource, scope, expires_at, used_at FROM oauth_codes;
    CREATE TABLE oauth_tokens_new (
      token_hash TEXT    PRIMARY KEY,
      grant_id   INTEGER NOT NULL REFERENCES oauth_grants_new(id) ON DELETE CASCADE,
      kind       TEXT    NOT NULL CHECK (kind IN ('access', 'refresh')),
      resource   TEXT    NOT NULL,
      scope      TEXT    NOT NULL,
      created_at TEXT    NOT NULL,
      expires_at TEXT    NOT NULL,
      used_at    TEXT,
      revoked_at TEXT
    );
    INSERT INTO oauth_tokens_new SELECT token_hash, grant_id, kind, resource, scope, created_at, expires_at, used_at, revoked_at FROM oauth_tokens;
    DROP TABLE oauth_tokens;
    DROP TABLE oauth_codes;
    DROP TABLE oauth_grant_lists;
    DROP TABLE oauth_grants;
    ALTER TABLE oauth_grants_new RENAME TO oauth_grants;
    ALTER TABLE oauth_grant_lists_new RENAME TO oauth_grant_lists;
    ALTER TABLE oauth_codes_new RENAME TO oauth_codes;
    ALTER TABLE oauth_tokens_new RENAME TO oauth_tokens;
    CREATE INDEX oauth_grants_user ON oauth_grants(user_id, revoked_at);
    CREATE INDEX oauth_tokens_grant ON oauth_tokens(grant_id);
    CREATE INDEX oauth_tokens_expiry ON oauth_tokens(expires_at);
  `);
}

// Migration 21 : troisième niveau d'accord pour Claude, « Lecture, ajout et
// modification » (portée 'lists:read lists:write lists:edit'). Abandonné
// par la migration 22 (décision du propriétaire : deux niveaux seulement) ;
// gardée telle quelle, car les migrations ne changent jamais une fois livrées.
export function oauthEditScopeMigration(db) {
  rebuildOauthTables(db, ['lists:read', 'lists:read lists:write', 'lists:read lists:write lists:edit']);
}

// Migration 22 : retour à deux niveaux d'accord pour Claude, « Lecture
// seule » et « Lecture et écriture » (lists:write, qui donne aussi la
// modification des éléments). Les connexions, codes et jetons au niveau
// « modification » (lists:edit) passent au niveau « écriture » ; rien
// d'autre ne change (connexions, listes choisies, jetons gardés), puis la
// contrainte n'accepte plus que les deux niveaux.
const EDIT_SCOPE = 'lists:read lists:write lists:edit';
const WRITE_SCOPE = 'lists:read lists:write';
export function oauthTwoLevelsMigration(db) {
  for (const table of ['oauth_grants', 'oauth_codes', 'oauth_tokens']) {
    db.prepare(`UPDATE ${table} SET scope = ? WHERE scope = ?`).run(WRITE_SCOPE, EDIT_SCOPE);
  }
  // Une demande en attente (10 minutes au plus) qui demandait lists:edit
  db.prepare("UPDATE oauth_requests SET scope = trim(replace(' ' || scope || ' ', ' lists:edit ', ' ')) WHERE ' ' || scope || ' ' LIKE '% lists:edit %'").run();
  rebuildOauthTables(db, ['lists:read', WRITE_SCOPE]);
}

// Migration 19 : listes d'envies.
// - lists.for_user_id (compte bénéficiaire) ou lists.for_name (prénom d'une
//   personne sans compte, 80 caractères au plus), jamais les deux ; aucun
//   des deux : le propriétaire est le bénéficiaire ;
// - items.link (lien web http ou https, 500 caractères au plus) et
//   items.price_cents (prix indicatif en centimes, de 0 à 100 000 €) ;
// - reservations : les participants d'un souhait réservé, une ligne par
//   compte (clé item_id + user_id : un compte ne participe pas deux fois),
//   effacée avec le souhait ou avec le compte ;
// - reservation_states : l'état « ouvert à d'autres » d'un souhait réservé
//   (une ligne par souhait réservé, effacée avec le souhait), à part pour ne
//   toucher ni items ni lists.
// Jamais transmises au bénéficiaire (voir server/reservations.js). Une
// participation ne rend pas un compte « utilisé » dans l'administration :
// sinon un Admin bénéficiaire pourrait deviner qu'il en existe une.
// Non destructive (des colonnes vides et une table vide sont ajoutées) ;
// chaque ajout vérifie d'abord qu'il n'existe pas déjà.
export function wishesMigration(db) {
  const has = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has('lists', 'for_user_id')) db.exec('ALTER TABLE lists ADD COLUMN for_user_id INTEGER REFERENCES users(id)');
  if (!has('lists', 'for_name')) {
    db.exec('ALTER TABLE lists ADD COLUMN for_name TEXT CHECK (for_name IS NULL OR (for_user_id IS NULL AND length(for_name) BETWEEN 1 AND 80))');
  }
  if (!has('items', 'link')) db.exec('ALTER TABLE items ADD COLUMN link TEXT CHECK (link IS NULL OR length(link) BETWEEN 1 AND 500)');
  if (!has('items', 'price_cents')) {
    db.exec('ALTER TABLE items ADD COLUMN price_cents INTEGER CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 10000000)');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS reservations (
      item_id    TEXT    NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT    NOT NULL,
      updated_at TEXT    NOT NULL,
      PRIMARY KEY (item_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS reservations_user ON reservations(user_id);
    CREATE TABLE IF NOT EXISTS reservation_states (
      item_id    TEXT    PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      open       INTEGER NOT NULL DEFAULT 0 CHECK (open IN (0, 1)),
      created_at TEXT    NOT NULL,
      updated_at TEXT    NOT NULL
    );
  `);
}

// Migration 20 : participations des visiteurs sans compte (lien public d'une
// liste d'envies). Une ligne par visiteur et par souhait ; le visiteur est
// reconnu par l'empreinte (SHA-256) du jeton de son cookie, jamais par le
// jeton lui-même. Effacée avec le souhait. Seul server/reservations.js lit
// cette table. Non destructive (nouvelle table), idempotente.
// Elle ajoute aussi le nettoyage de l'état « ouvert à d'autres »
// (reservation_states) : cet état n'a de sens que pour un souhait qui a au
// moins un participant. Avant, la suppression d'un compte effaçait ses
// participations (ON DELETE CASCADE) mais laissait l'état seul : le souhait
// paraissait « Réservé » sur la page publique et le gestionnaire ne pouvait
// pas le libérer. Deux déclencheurs (triggers) effacent désormais l'état dès
// que le dernier participant disparaît, quelle que soit la façon (départ,
// retrait, suppression du compte) ; les états déjà orphelins sont effacés.
export function visitorReservationsMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitor_reservations (
      item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
      first_name TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 40),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (item_id, token_hash)
    );
    CREATE INDEX IF NOT EXISTS visitor_reservations_token ON visitor_reservations(token_hash);
  `);
  dropOrphanStates(db);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS reservations_state_cleanup AFTER DELETE ON reservations
    BEGIN
      DELETE FROM reservation_states WHERE item_id = OLD.item_id
        AND NOT EXISTS (SELECT 1 FROM reservations WHERE item_id = OLD.item_id)
        AND NOT EXISTS (SELECT 1 FROM visitor_reservations WHERE item_id = OLD.item_id);
    END;
    CREATE TRIGGER IF NOT EXISTS visitor_reservations_state_cleanup AFTER DELETE ON visitor_reservations
    BEGIN
      DELETE FROM reservation_states WHERE item_id = OLD.item_id
        AND NOT EXISTS (SELECT 1 FROM reservations WHERE item_id = OLD.item_id)
        AND NOT EXISTS (SELECT 1 FROM visitor_reservations WHERE item_id = OLD.item_id);
    END;
  `);
}

// Efface les états « ouvert à d'autres » des souhaits qui n'ont plus aucun
// participant (compte ou visiteur). Renvoie le nombre de lignes effacées.
export function dropOrphanStates(db) {
  return db.prepare(`
    DELETE FROM reservation_states
    WHERE NOT EXISTS (SELECT 1 FROM reservations WHERE reservations.item_id = reservation_states.item_id)
      AND NOT EXISTS (SELECT 1 FROM visitor_reservations WHERE visitor_reservations.item_id = reservation_states.item_id)
  `).run().changes;
}

// Migration 18 : colonne lists.type ('shopping', 'tasks' ou 'wishes').
// Toute liste dont la catégorie est « courses » (is_shopping) devient
// shopping, toutes les autres deviennent tasks (listes supprimées depuis
// moins de 30 jours comprises). Non destructive : la table categories et la
// colonne lists.category_id restent en place, inutilisées par le code (sauf
// la traduction des anciennes opérations et les champs provisoires envoyés
// aux téléphones qui n'ont pas rechargé), pour pouvoir revenir à l'image
// précédente ; effacées par la migration 32 (17 novembre 2026).
// Le nombre de listes de chaque type est écrit dans le journal du conteneur
// (aucun nom de liste), dans la langue de la console (locale), et renvoyé
// (tests).
export function listTypesMigration(db, { locale = DEFAULT_LOCALE } = {}) {
  db.exec("ALTER TABLE lists ADD COLUMN type TEXT CHECK (type IS NULL OR type IN ('shopping', 'tasks', 'wishes'))");
  ensureLegacyCategories(db);
  const counts = fillListTypes(db);
  console.log(translate(locale, 'demarrage.migration18', counts));
  return counts;
}

// Donne un type aux listes qui n'en ont pas (catégorie « courses » ->
// shopping, sinon tasks). Sans effet sur une liste qui a déjà un type :
// peut être relancée sans risque. Renvoie le nombre de listes complétées.
export function fillListTypes(db) {
  const shopping = db.prepare(`
    UPDATE lists SET type = 'shopping'
    WHERE type IS NULL AND category_id IN (SELECT id FROM categories WHERE is_shopping = 1)
  `).run().changes;
  const tasks = db.prepare("UPDATE lists SET type = 'tasks' WHERE type IS NULL").run().changes;
  return { shopping, tasks };
}

// lists.category_id reste obligatoire en base : chaque type courses et
// tâches doit garder au moins une catégorie qui lui correspond (celle
// qu'on écrit dans category_id, voir legacyCategoryId dans server/lists.js).
// Si l'une des deux sortes manque (supprimée par l'Admin quand elle était
// encore permise), on la recrée ; un nom déjà pris reçoit un suffixe.
export function ensureLegacyCategories(db) {
  for (const [isShopping, name] of [[1, 'Courses'], [0, 'Tâches']]) {
    if (db.prepare('SELECT 1 FROM categories WHERE is_shopping = ?').get(isShopping)) continue;
    let candidate = name;
    for (let n = 2; db.prepare('SELECT 1 FROM categories WHERE name = ?').get(candidate); n++) candidate = `${name} ${n}`;
    db.prepare('INSERT INTO categories (name, is_shopping) VALUES (?, ?)').run(candidate, isShopping);
  }
}

// Migration 15 : colonne add_mode ('quick' ou 'detail', rien d'autre).
// Listes existantes :
// - liste de courses : 'quick' (rien ne change) ;
// - autre liste avec la priorité ou l'échéance activée : 'detail' (on veut
//   le plus souvent régler ces options juste après l'ajout) ;
// - autre liste sans ni l'une ni l'autre : 'quick'.
// Les listes supprimées depuis moins de 30 jours sont traitées de la même
// façon. Le nombre de listes de chaque sorte est écrit dans le journal du
// conteneur (aucun nom de liste), dans la langue de la console (locale),
// et renvoyé (tests).
export function addModeMigration(db, { locale = DEFAULT_LOCALE } = {}) {
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
    console.log(translate(locale, 'demarrage.migration15', counts));
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

// Installation neuve : aucun magasin ni rayon au départ, quelle que soit la
// langue (décision du 21 novembre 2026). La migration 3 en crée encore
// quelques-uns (Carrefour, Boulangerie…) : ils servent de données d'exemple
// aux tests, et une base existante les garde tels quels. index.js appelle
// cette fonction seulement pour une base qui vient d'être créée ; par
// prudence, elle ne fait rien s'il existe déjà une liste ou un compte.
// Renvoie le nombre de lignes retirées.
export function clearStartingData(db) {
  const used = db.prepare('SELECT (SELECT COUNT(*) FROM lists) + (SELECT COUNT(*) FROM users)').pluck().get();
  if (used > 0) return 0;
  let removed = 0;
  db.transaction(() => {
    removed += db.prepare('DELETE FROM item_history').run().changes;
    // Les rayons d'abord : un rayon peut pointer vers son magasin
    removed += db.prepare('DELETE FROM aisles').run().changes;
    removed += db.prepare('DELETE FROM stores').run().changes;
  })();
  return removed;
}

// Ouvre (ou crée) la base, règle SQLite et applique les migrations.
// dbPath peut valoir ':memory:' pour une base temporaire (tests).
// locale : langue des messages des migrations dans la console (LISTO_LANG,
// voir consoleLocale dans server/config.js), le français par défaut.
export function openDatabase(dbPath, { locale = DEFAULT_LOCALE } = {}) {
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

  migrate(db, { locale });
  return db;
}

// Applique, dans l'ordre, les migrations pas encore appliquées.
// Chaque migration est faite d'un bloc : tout passe, ou rien ne change.
// options.locale : langue des messages écrits dans la console.
export function migrate(db, options = {}) {
  const current = db.pragma('user_version', { simple: true });
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      const migration = MIGRATIONS[version];
      if (typeof migration === 'function') migration(db, options);
      else db.exec(migration);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

// Numéro de version actuel du schéma
export function schemaVersion(db) {
  return db.pragma('user_version', { simple: true });
}
