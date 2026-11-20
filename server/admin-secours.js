// Secours : reprendre la main sur un compte quand plus personne ne peut se
// connecter (mot de passe du dernier Admin oublié, ou 2FA inutilisable après
// la perte de la clé secrets/secret.key).
//
//   docker exec -u node listo node server/admin-secours.js <identifiant>
//   docker exec -u node listo node server/admin-secours.js <identifiant> --remove-2fa
//
// Un mot de passe provisoire est tiré au hasard et affiché UNE fois : il faut
// le changer à la connexion suivante. Les sessions du compte sont fermées et
// ses connexions Claude révoquées.
// Avec --remove-2fa (ou son ancien nom français --retirer-2fa, toujours
// accepté), la double authentification du compte est aussi désactivée. Chaque action est écrite dans le journal de sécurité.
// Seul quelqu'un qui a déjà la main sur le serveur peut lancer cette commande.

import path from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig, consoleLocale } from './config.js';
import { hashPassword } from './passwords.js';
import { generateSharePassword } from './shares.js';
import { createAudit, createJournalFile } from './audit.js';
import { translate } from '../public/js/i18n.js';

// Configuration lue d'abord : les messages suivent la langue de
// l'installation (LISTO_LANG), le français si elle n'est pas valable
const config = loadConfig();
const lang = consoleLocale(config);

const [username, option] = process.argv.slice(2);
// Option de la 2FA : --remove-2fa, ou l'ancien nom --retirer-2fa
const removeTwoFactor = option === '--remove-2fa' || option === '--retirer-2fa';
if (!username || (option && !removeTwoFactor)) {
  console.error(translate(lang, 'demarrage.secours.utilisation', { argument: `<${translate(lang, 'demarrage.secours.argument')}>` }));
  process.exit(1);
}
if (process.getuid?.() === 0) {
  console.error(translate(lang, 'demarrage.secours.utilisateur'));
  console.error(`  docker exec -u node listo node server/admin-secours.js ${username}${option ? ` ${option}` : ''}`);
  process.exit(1);
}

let db;
try {
  db = new Database(config.dbPath, { fileMustExist: true });
} catch {
  console.error(translate(lang, 'demarrage.secours.baseIntrouvable', { path: config.dbPath }));
  process.exit(1);
}
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
const audit = createAudit({ file: createJournalFile({ path: path.join(path.dirname(config.dbPath), 'journal.log'), locale: lang }) });

const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
if (!user) {
  console.error(translate(lang, 'demarrage.secours.inconnu', { username }));
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
  if (removeTwoFactor) {
    db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE id = ?').run(user.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
  }
})();
db.close();
audit('rescue_temporary_password', { user: user.username });
if (removeTwoFactor) audit('rescue_2fa_removed', { user: user.username });

console.log(translate(lang, 'demarrage.secours.motDePasse', { username: user.username }));
console.log('');
console.log(`    ${password}`);
console.log('');
if (removeTwoFactor) console.log(translate(lang, 'demarrage.secours.sans2fa'));
if (user.active === 0) console.log(translate(lang, 'demarrage.secours.desactive'));
console.log(translate(lang, 'demarrage.secours.tropDEssais'));
