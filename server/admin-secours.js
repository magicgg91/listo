// Secours : reprendre la main sur un compte quand plus personne ne peut se
// connecter (mot de passe du dernier Admin oublié, ou 2FA inutilisable après
// la perte de la clé secrets/secret.key).
//
//   docker exec -u node listo node server/admin-secours.js <identifiant>
//   docker exec -u node listo node server/admin-secours.js <identifiant> --retirer-2fa
//
// Un mot de passe provisoire est tiré au hasard et affiché UNE fois : il faut
// le changer à la connexion suivante. Les sessions du compte sont fermées et
// ses connexions Claude révoquées.
// Avec --retirer-2fa, la double authentification du compte est aussi
// désactivée. Chaque action est écrite dans le journal de sécurité.
// Seul quelqu'un qui a déjà la main sur le serveur peut lancer cette commande.

import path from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import { hashPassword } from './passwords.js';
import { generateSharePassword } from './shares.js';
import { createAudit, createJournalFile } from './audit.js';

const [username, option] = process.argv.slice(2);
if (!username || (option && option !== '--retirer-2fa')) {
  console.error('Utilisation : node server/admin-secours.js <identifiant> [--retirer-2fa]');
  process.exit(1);
}
if (process.getuid?.() === 0) {
  console.error('Lancez cette commande avec « -u node » :');
  console.error(`  docker exec -u node listo node server/admin-secours.js ${username}${option ? ` ${option}` : ''}`);
  process.exit(1);
}

const config = loadConfig();
let db;
try {
  db = new Database(config.dbPath, { fileMustExist: true });
} catch {
  console.error(`Base introuvable (${config.dbPath}).`);
  process.exit(1);
}
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
const audit = createAudit({ file: createJournalFile({ path: path.join(path.dirname(config.dbPath), 'journal.log') }) });

const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
if (!user) {
  console.error(`Aucun compte avec l'identifiant « ${username} ».`);
  process.exit(1);
}

// Mot de passe provisoire (16 caractères, même générateur que les liens publics)
const password = generateSharePassword();
const hash = await hashPassword(password);
db.transaction(() => {
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  // Connexions Claude du compte révoquées, avec leurs jetons (migration 17)
  const now = new Date().toISOString();
  db.prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE revoked_at IS NULL AND grant_id IN (SELECT id FROM oauth_grants WHERE user_id = ?)').run(now, user.id);
  db.prepare('UPDATE oauth_grants SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, user.id);
  if (option === '--retirer-2fa') {
    db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE id = ?').run(user.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
  }
})();
db.close();
audit('secours_mot_de_passe_provisoire', { utilisateur: user.username });
if (option === '--retirer-2fa') audit('secours_2fa_retiree', { utilisateur: user.username });

console.log(`Compte « ${user.username} » : mot de passe provisoire (à changer à la connexion) :`);
console.log('');
console.log(`    ${password}`);
console.log('');
if (option === '--retirer-2fa') console.log('La double authentification de ce compte est désactivée : réactivez-la depuis Réglages → Mon compte.');
if (user.active === 0) console.log("Attention : ce compte est désactivé. Un Admin doit le réactiver (Administration → Comptes).");
console.log("Si la connexion est refusée pour « trop d'essais », redémarrez Listo : docker compose restart");
