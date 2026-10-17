// Sauvegarde nocturne de la base.
//
// Chaque nuit vers 3 h (heure du serveur, variable TZ), Listo copie la base
// dans data/backups avec la commande SQLite « VACUUM INTO » : une copie
// complète et cohérente, faite d'un seul coup. better-sqlite3 traitant une
// seule requête à la fois, la copie ne tombe jamais au milieu d'une écriture.
//
// Après l'écriture, la copie est rouverte en lecture seule et contrôlée
// (PRAGMA integrity_check). Elle n'est lisible que par Listo (droits 600).
// Les 14 dernières copies sont gardées, les plus anciennes supprimées.
// Une ligne est écrite dans le journal de sécurité ; une copie ratée est
// journalisée sans arrêter Listo.
//
// Ce qui n'est PAS copié ici :
// - la clé secrets/secret.key (jamais dans data/backups : à garder à part) ;
// - les photos (data/photos) : de simples fichiers, couverts par la
//   sauvegarde habituelle du dossier data de l'hôte.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const BACKUP_KEEP = 14;
export const BACKUP_HOUR = 3;

// Nom d'une copie : listo-2026-10-17-0300.db (date et heure locales)
const BACKUP_FILE = /^listo-\d{4}-\d{2}-\d{2}-\d{4}\.db$/;
const two = (n) => String(n).padStart(2, '0');
export function backupName(date) {
  return `listo-${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}.db`;
}

// Délai (en millisecondes) jusqu'à la prochaine heure de sauvegarde (3 h 00,
// heure locale), strictement après « now »
export function msUntilNext(now, hour = BACKUP_HOUR) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now;
}

// db : base ouverte ; dir : dossier des copies ; audit : journal de sécurité
export function createBackups({ db, dir, now = Date.now, audit = () => {}, keep = BACKUP_KEEP, timers = globalThis }) {
  let timer = null;

  // Copies existantes, de la plus ancienne à la plus récente
  function list() {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name) => BACKUP_FILE.test(name)).sort();
  }

  // Fait une copie maintenant. Renvoie { ok, file } ou { ok: false, error }.
  function run() {
    const name = backupName(new Date(now()));
    const file = path.join(dir, name);
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.rmSync(file, { force: true }); // même minute (relance) : on refait la copie
      db.prepare('VACUUM INTO ?').run(file);
      fs.chmodSync(file, 0o600);

      // Contrôle : la copie s'ouvre en lecture seule et est intacte
      const copy = new Database(file, { readonly: true, fileMustExist: true });
      let check;
      try {
        check = copy.pragma('integrity_check', { simple: true });
      } finally {
        copy.close();
      }
      if (check !== 'ok') throw new Error(`copie abîmée (${check})`);

      // Rotation : on ne garde que les 14 plus récentes
      const all = list();
      const removed = all.slice(0, Math.max(0, all.length - keep));
      for (const old of removed) fs.rmSync(path.join(dir, old), { force: true });

      audit('sauvegarde_reussie', { fichier: name, taille: fs.statSync(file).size, conservees: all.length - removed.length, supprimees: removed.length });
      return { ok: true, file };
    } catch (err) {
      try {
        fs.rmSync(file, { force: true }); // pas de copie à moitié écrite
      } catch {
        // dossier inaccessible : rien à effacer
      }
      audit('sauvegarde_ratee', { fichier: name, raison: err.message });
      return { ok: false, error: err.message };
    }
  }

  // Programme la sauvegarde de chaque nuit (« unref » : ce minuteur
  // n'empêche pas Listo de s'arrêter)
  function start() {
    stop();
    timer = timers.setTimeout(() => {
      run();
      start();
    }, msUntilNext(now()));
    timer?.unref?.();
  }

  function stop() {
    if (timer) timers.clearTimeout(timer);
    timer = null;
  }

  return { run, start, stop, list, dir };
}
