// Journal de sécurité : connexions réussies et échouées, actions sensibles et
// actions d'administration. Une ligne par événement, précédée de « [journal] »,
// écrite à deux endroits :
// - dans les journaux du conteneur (docker logs listo) ;
// - dans le fichier data/journal.log (droits 600), conservé et sauvegardé
//   avec la base.
//
// Règle absolue : on n'y écrit jamais de mot de passe, de jeton de session ni
// de code (2FA, secours, démarrage). Seuls des identifiants de compte et des
// adresses IP y figurent.

import fs from 'node:fs';

const MEGABYTE = 1024 * 1024;

export function createAudit({ write = (line) => console.log(line), file = null, now = Date.now } = {}) {
  // event : ce qui s'est passé ; details : informations utiles (sans secret)
  return function audit(event, details = {}) {
    const time = new Date(now()).toISOString();
    // JSON.stringify protège le journal : un identifiant contenant un retour à
    // la ligne ne peut pas fabriquer une fausse ligne.
    const parts = Object.entries(details).map(([name, value]) => `${name}=${JSON.stringify(value)}`);
    const line = [time, '[journal]', event, ...parts].join(' ');
    write(line);
    if (file) file(line);
  };
}

// Écriture du journal dans un fichier, avec rotation par taille : quand
// journal.log dépasserait 1 Mo, il devient journal.log.1, l'ancien .1 devient
// .2, et ainsi de suite jusqu'à .5 ; le plus ancien est supprimé. Le journal
// occupe donc au plus 6 Mo.
//
// Si l'écriture échoue (disque plein, droits…), Listo continue normalement :
// l'erreur est signalée dans docker logs, une seule fois tant que le problème
// dure, et la connexion en cours n'est jamais bloquée.
export function createJournalFile({ path, maxBytes = MEGABYTE, keep = 5, report = (message) => console.error(message) }) {
  let failing = false;

  // Décale journal.log → .1 → .2 … → .5 (le .5 existant est supprimé)
  function rotate() {
    fs.rmSync(`${path}.${keep}`, { force: true });
    for (let i = keep - 1; i >= 1; i--) {
      if (fs.existsSync(`${path}.${i}`)) fs.renameSync(`${path}.${i}`, `${path}.${i + 1}`);
    }
    fs.renameSync(path, `${path}.1`);
  }

  // Taille actuelle du fichier (0 s'il n'existe pas encore)
  function currentSize() {
    try {
      return fs.statSync(path).size;
    } catch (err) {
      if (err.code === 'ENOENT') return 0;
      throw err;
    }
  }

  return function writeLine(line) {
    try {
      const text = `${line}\n`;
      const size = currentSize();
      if (size > 0 && size + Buffer.byteLength(text) > maxBytes) rotate();
      // Création en droits 600 ; chmod au cas où le fichier existait avec
      // d'autres droits
      fs.appendFileSync(path, text, { mode: 0o600 });
      fs.chmodSync(path, 0o600);
      if (failing) {
        failing = false;
        report(`Journal de sécurité : écriture dans ${path} rétablie.`);
      }
    } catch (err) {
      if (!failing) {
        failing = true;
        report(`Journal de sécurité : impossible d'écrire dans ${path} (${err.code || err.message}). Listo continue ; le journal reste visible dans docker logs.`);
      }
    }
  };
}
