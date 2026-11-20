// Server console messages (docker logs), in English.
// Same names as public/js/i18n/fr/demarrage.js.

export default {
  // Démarrage (server/index.js)
  'demarrage.refus': 'Listo cannot start: {problem}',
  'demarrage.contactIgnore': 'LISTO_PRODUCT_CONTACT ignored: characters not allowed (unaccented letters, digits, @ . : / - _ + ~ only).',
  'demarrage.base': 'Database: {path} (schema version {version})',
  'demarrage.cle.creee': 'Encryption key created: {path}',
  'demarrage.cle.copie': '  Remember to keep a separate copy of it (password manager).',
  'demarrage.cle.chargee': 'Encryption key loaded: {path}',
  'demarrage.cle.invalide': 'The key {path} is invalid (256 bits in base64 expected). Restore the backup copy of this file.',
  'demarrage.push.creees': 'Push notifications enabled. Keys created: {path}',
  'demarrage.push.chargees': 'Push notifications enabled. Keys loaded: {path}',
  'demarrage.push.copie': '  Keep a copy of them with the encryption key (separate backup).',
  'demarrage.push.fichierInvalide': 'The file {path} is invalid. Restore its backup copy, or delete it to create new keys (each device will then have to turn notifications on again, or will subscribe again by itself the next time Listo is opened).',
  'demarrage.oidc.secretManquant': 'LISTO_OIDC=on needs the client secret in {path} (a single line, the same as in the identity provider configuration).',
  'demarrage.oidc.active': 'Sign-in with {name} enabled: {issuer}',
  // Encadré du code de démarrage
  'demarrage.code.titre': '  No account exists yet. Setup code:',
  'demarrage.code.consigne': '  Enter it on the first sign-in screen to create the\n  Admin account. It can only be used once.',
  'demarrage.journal': 'Security journal: {path}',
  'demarrage.port': 'Listo is running on port {port}',
  'demarrage.sauvegardes': 'Nightly backups: {path}',
  'demarrage.signal': 'Signal {signal} received: stopping Listo.',
  'demarrage.arret': 'Database closed. Listo has stopped.',

  // Configuration refusée (server/config.js)
  'demarrage.config.adresse': 'LISTO_PUBLIC_URL is not a valid address (“{value}”). Example: https://listo.exemple.fr',
  'demarrage.config.https': 'In production, LISTO_PUBLIC_URL must start with https:// (currently “{value}”). Fix it in docker-compose.yml, then restart Listo.',
  'demarrage.config.langue': 'LISTO_LANG must be fr or en (currently “{value}”).',
  'demarrage.config.monnaie': 'LISTO_CURRENCY must be the three-letter code of a currency with two decimals (EUR, USD, CHF…); currently “{value}”.',
  'demarrage.config.connexionLocale': 'LISTO_LOCAL_LOGIN=off turns off password sign-in: LISTO_OIDC=on (sign-in with an identity provider) is then required, otherwise nobody can get in.',
  'demarrage.config.oidcAdresse': 'LISTO_OIDC=on needs LISTO_OIDC_ISSUER, the address of the identity provider (currently “{value}”). Example: https://auth.exemple.fr',
  'demarrage.config.oidcHttps': 'LISTO_OIDC_ISSUER must start with https:// (currently “{value}”).',
  'demarrage.config.oidcSimple': 'LISTO_OIDC_ISSUER: a plain address is expected, without a username, “?” or “#”.',
  'demarrage.config.oidcClient': 'Invalid LISTO_OIDC_CLIENT_ID (“{value}”): unaccented letters, digits, . _ ~ - (100 at most).',
  'demarrage.config.port': 'Invalid PORT (“{value}”): a number between 1 and 65535 is expected.',

  // Migrations de la base (server/db.js)
  'demarrage.migration15': 'Migration 15 (“After adding”): {shopping} shopping list(s) → “Stay on the list”; {detail} other list(s) with priority or due date → “Open item details”; {quick} other list(s) without priority or due date → “Stay on the list”.',
  'demarrage.migration18': 'Migration 18 (list types): {shopping} shopping list(s), {tasks} task list(s).',

  // Journal de sécurité (server/audit.js)
  'demarrage.journal.retabli': 'Security journal: writing to {path} restored.',
  'demarrage.journal.impossible': 'Security journal: cannot write to {path} ({reason}). Listo keeps running; the journal is still visible in docker logs.',

  // Erreurs inattendues
  'demarrage.erreur': 'Unexpected error:',
  'demarrage.erreur.mcp': 'Unexpected MCP error:',
  'demarrage.erreur.lienPublic': 'Unexpected error (public link):',

  // Services extérieurs
  'demarrage.majImpossible': 'Update check failed: {reason}',
  'demarrage.produitImpossible': 'Product lookup failed: {reason}',
  'demarrage.raison.delai': 'timed out',
  'demarrage.raison.http': 'HTTP response {status}',
  'demarrage.raison.autreSite': 'response from another site',
  'demarrage.raison.inattendue': 'unexpected response',
  'demarrage.raison.codeInvalide': 'invalid code',
  'demarrage.push.sansReponse': 'Notifications: a push service did not respond.',
  'demarrage.push.expire': 'Notifications: expired subscription removed (HTTP {status}).',
  'demarrage.push.refuse': 'Notifications: sending refused by the push service (HTTP {status}).',

  // Secours (server/admin-secours.js)
  'demarrage.secours.utilisation': 'Usage: node server/admin-secours.js {argument} [--remove-2fa]',
  'demarrage.secours.argument': 'username',
  'demarrage.secours.utilisateur': 'Run this command with “-u node”:',
  'demarrage.secours.baseIntrouvable': 'Database not found ({path}).',
  'demarrage.secours.inconnu': 'No account with the username “{username}”.',
  'demarrage.secours.motDePasse': 'Account “{username}”: temporary password (to be changed at sign-in):',
  'demarrage.secours.sans2fa': 'Two-factor authentication is turned off for this account: turn it back on in Settings → My account.',
  'demarrage.secours.desactive': 'Warning: this account is disabled. An Admin must enable it again (Administration → Accounts).',
  'demarrage.secours.tropDEssais': 'If sign-in is refused for “too many attempts”, restart Listo: docker compose restart',

  // Sauvegarde à la demande (server/backup-now.js)
  'demarrage.sauvegarde.utilisateur': 'Backup not made: run this command with “-u node”:',
  'demarrage.sauvegarde.baseIntrouvable': 'Backup failed: database not found ({path}).',
  'demarrage.sauvegarde.creee': 'Backup created: {file}',
  'demarrage.sauvegarde.ratee': 'Backup failed: {error}',
};
