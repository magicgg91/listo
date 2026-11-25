// Page Notifications (étape 4 du cadrage docs/cadrage-accueil-notes-notifications.md,
// migration 38) : l'historique de ce que Listo signale à chaque personne.
//
// Qui écrit : SEULEMENT server/notify.js (fonction deliver), qui a déjà
// appliqué les mêmes filtres que les notifications push (catégorie coupée,
// liste ou note dont on a coupé les notifications, jamais l'auteur, jamais
// le bénéficiaire d'une liste d'envies pour les ajouts des autres ni pour une
// réservation). Une ligne est écrite même sans LISTO_PUSH et sans appareil.
//
// Ce qui est gardé : le NOM du texte (text_key) et ses valeurs (params, un
// objet construit champ par champ par notify.js) ; la phrase est faite au
// moment de la lecture, dans la langue du compte (changer de langue traduit
// aussi l'historique). Une note n'est désignée que par son identifiant :
// son titre est relu à l'affichage, seulement si la personne la voit
// encore ; jamais son texte, ni ici ni dans un journal.
//
// Lecture (GET /api/inbox) : réponse construite champ par champ, jamais à
// partir des lignes de la base ; la cible (liste, tâche, note) est revérifiée
// avec les droits du moment : perdue, la ligne reste (c'est un historique)
// mais elle n'ouvre plus rien (« Cette liste n'est plus disponible ») et ne
// donne plus l'identifiant de sa cible.
//
// Regroupement : une ligne avec la même clé (group_key, par exemple les
// modifications d'une liste) écrite moins de 30 minutes après la précédente
// la met à jour (valeurs fusionnées, compte, date) et la rend de nouveau
// non lue, au lieu d'en ajouter une.
//
// Garde : 30 jours, 300 lignes au plus par personne (les plus anciennes
// partent dès l'écriture ; le ménage horaire efface les plus vieilles).
// Pas de plafond par heure ici (celui des notifications push, 30 par heure,
// protège l'écran verrouillé du téléphone) : la page est silencieuse,
// regroupée et bornée à 300 lignes ; un plafond y ferait perdre des lignes
// sans le dire.
//
// Projets (étape 3 du cadrage docs/cadrage-projets.md, migration 45) :
// cibles 'project' et 'card'. Ni le nom du projet, ni le titre d'une carte,
// ni le texte d'un commentaire ne sont gardés : relus à l'affichage, avec
// les droits du moment (projet quitté, carte supprimée : la ligne reste,
// sans nom, et n'ouvre plus rien). Une personne qui a coupé les projets
// garde la ligne « Partage » d'un projet, qui ouvre alors Réglages ›
// Fonctions (cible 'features').
//
// Lu sur un appareil = lu sur tous : chaque changement prévient les
// appareils de la personne par le temps réel (« event: inbox », sans
// données), qui relisent la page.

import { translate, formatDate, formatList } from '../public/js/i18n.js';
import { timeLabel } from '../public/js/due-time.js';
import { noteTitle } from '../public/js/notes.js';
import { wishListOf, beneficiaryId } from '../public/js/wishes.js';
import { userLocale } from './locale.js';
import { noteAccess } from './notes.js';
import { projectAccess } from './projects.js';

export const INBOX_DAYS = 30;
export const INBOX_MAX = 300;
export const INBOX_GROUP_MS = 30 * 60 * 1000;
export const INBOX_CATEGORIES = ['changes', 'due', 'wishes', 'sharing'];
export const INBOX_TARGETS = ['list', 'item', 'note', 'deadlines', 'project', 'card'];
const DAY = 24 * 60 * 60 * 1000;
const NAMES_MAX = 8;          // noms cités au plus dans une ligne
const PARAMS_MAX = 4000;      // taille du JSON des valeurs (contrainte de la base)
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Mot des éléments d'une liste selon son type (« 4 articles », « 2 souhaits »)
const WORDS = { shopping: 'courses', tasks: 'taches', wishes: 'envies' };

// Nom d'une catégorie (même libellé que Réglages › Notifications)
const CATEGORY_LABELS = {
  changes: 'notifications.sujet.modifications',
  due: 'notifications.sujet.echeances',
  wishes: 'notifications.sujet.envies',
  sharing: 'notifications.sujet.partage',
};

// Texte court (valeur gardée en base) : chaîne, coupée
const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');
const names = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string').map((v) => v.slice(0, 120)) : []);
const count = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);

// « Lait, Pain et 3 autres »
function nameList(locale, list) {
  const shown = list.slice(0, NAMES_MAX);
  const rest = list.length - shown.length;
  return rest > 0 ? formatList([...shown, translate(locale, 'alertes.noms.autres', { count: rest })], { locale }) : formatList(shown, { locale });
}
// « Léa », « Léa et Marc », « Léa, Marc et 2 autres »
function peopleList(locale, list) {
  if (list.length <= 1) return list[0] ?? translate(locale, 'alertes.quelquun');
  if (list.length <= 3) return formatList(list, { locale });
  return formatList([list[0], list[1], translate(locale, 'alertes.noms.autres', { count: list.length - 2 })], { locale });
}

// Fusion de deux jeux de valeurs d'une même ligne regroupée : les listes de
// noms s'ajoutent (sans doublon), les nombres s'additionnent, le reste
// prend la dernière valeur
export function mergeParams(old, next) {
  const out = { ...old, ...next };
  for (const [key, value] of Object.entries(next)) {
    if (Array.isArray(value) && Array.isArray(old[key])) out[key] = [...new Set([...old[key], ...value])].slice(0, 50);
    else if (Number.isSafeInteger(value) && Number.isSafeInteger(old[key]) && key !== 'access') out[key] = old[key] + value;
  }
  return out;
}

// Phrase d'une ligne, dans la langue locale : { kind, text, sub }.
// kind : l'icône de la ligne ('changes', 'turn', 'reminder', 'digest',
// 'wishes', 'sharing', 'comment'). note : la note telle que la personne la
// voit encore (ou null) ; son titre n'est jamais gardé en base. project,
// card, column : le projet, la carte et la colonne tels que la personne
// les voit encore (ou null), relus de même ; projectsOff : elle a coupé
// les projets.
export function renderRow(textKey, params, category, locale, { note = null, project = null, card = null, column = null, projectsOff = false } = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const label = translate(locale, CATEGORY_LABELS[category] ?? CATEGORY_LABELS.changes);
  const withContext = (context) => (context ? translate(locale, 'inbox.sous', { label, context }) : label);
  const list = text(p.list, 100);
  const noteName = note ? noteTitle({ title: note.title, body: note.body }) : '';
  switch (textKey) {
    // Modifications d'une liste (regroupées) : chacun son tour, attribution,
    // ajouts seuls, ou changements
    case 'changes': {
      const actors = names(p.actors);
      const people = peopleList(locale, actors);
      const turns = names(p.turns);
      const assigned = names(p.assigned);
      if (turns.length) return { kind: 'turn', text: translate(locale, 'inbox.tour', { names: nameList(locale, turns) }), sub: withContext(list) };
      if (assigned.length) {
        return {
          kind: 'changes',
          text: translate(locale, actors.length > 1 ? 'alertes.attribue.plusieurs' : 'alertes.attribue.un', { people, count: assigned.length, list }),
          sub: label,
        };
      }
      const added = count(p.added);
      const changes = added + count(p.updated) + count(p.checked);
      const word = WORDS[p.listType] ?? 'taches';
      const sentence = changes === added
        ? translate(locale, 'inbox.ajoute', { people, count: actors.length, things: translate(locale, `mots.${word}.nombre`, { count: added }), list })
        : translate(locale, 'inbox.modifie', { people, count: actors.length, changes: translate(locale, 'alertes.changements', { count: changes }), list });
      return { kind: 'changes', text: sentence, sub: label };
    }
    // Une note modifiée par d'autres (regroupée)
    case 'note.changes': {
      const actors = names(p.actors);
      const people = peopleList(locale, actors);
      return {
        kind: 'changes',
        text: noteName
          ? translate(locale, 'alertes.note.modifie', { people, count: actors.length, note: noteName })
          : translate(locale, 'alertes.note.modifie.sansTitre', { people, count: actors.length }),
        sub: label,
      };
    }
    // Partage d'une liste : ajouté, ou droit changé
    case 'list.shared':
      return { kind: 'sharing', text: translate(locale, 'inbox.partage.liste', { actor: text(p.actor, 100) || translate(locale, 'alertes.quelquun'), list }), sub: label };
    case 'list.access':
      return { kind: 'sharing', text: translate(locale, p.access === 'modification' ? 'inbox.droit.liste.modification' : 'inbox.droit.liste.lecture', { list }), sub: label };
    // Partage d'une note
    case 'note.shared': {
      const actor = text(p.actor, 100) || translate(locale, 'alertes.quelquun');
      return { kind: 'sharing', text: noteName ? translate(locale, 'alertes.note.partage', { actor, note: noteName }) : translate(locale, 'alertes.note.partage.sansTitre', { actor }), sub: label };
    }
    case 'note.access': {
      const edit = p.access === 'modification';
      return {
        kind: 'sharing',
        text: noteName
          ? translate(locale, edit ? 'inbox.droit.note.modification' : 'inbox.droit.note.lecture', { note: noteName })
          : translate(locale, edit ? 'inbox.droit.note.modification.sansTitre' : 'inbox.droit.note.lecture.sansTitre'),
        sub: label,
      };
    }
    // Envies : réservation ou participation (jamais pour le bénéficiaire)
    case 'wish.reserve':
    case 'wish.join': {
      const actor = p.visitor ? translate(locale, 'alertes.envie.visiteur', { name: text(p.actor, 40) }) : (text(p.actor, 100) || translate(locale, 'alertes.quelquun'));
      const item = text(p.item, 200);
      const join = textKey === 'wish.join';
      const sentence = item
        ? translate(locale, join ? 'alertes.envie.participe.nom' : 'alertes.envie.reserve.nom', { actor, item })
        : translate(locale, join ? 'alertes.envie.participe' : 'alertes.envie.reserve', { actor });
      return { kind: 'wishes', text: sentence, sub: withContext(list) };
    }
    // Résumé du matin : « 3 tâches à faire aujourd'hui · 1 en retard »
    // (avec des cartes des projets, étape 4 : « 3 échéances aujourd'hui »)
    case 'digest': {
      const today = count(p.today);
      const late = count(p.late);
      const mixed = count(p.cards) > 0;
      const parts = [];
      if (today) parts.push(translate(locale, mixed ? 'alertes.echeances.aujourdhui.cartes' : 'alertes.echeances.aujourdhui', { count: today }));
      if (late) parts.push(translate(locale, today ? 'alertes.echeances.retard' : mixed ? 'alertes.echeances.retard.seules.cartes' : 'alertes.echeances.retard.seules', { count: late }));
      return { kind: 'digest', text: parts.join(' · '), sub: translate(locale, 'inbox.resume') };
    }
    // Rappel d'une tâche : « Dentiste à 9:15 », « … demain à 9:15 », « … le 12/11/2026 à 9:15 »
    case 'reminder': {
      const time = timeLabel(text(p.time, 5), { locale });
      const name = text(p.name, 200);
      let sentence;
      if (p.when === 'tomorrow') sentence = translate(locale, 'inbox.rappel.demain', { name, time });
      else if (p.when === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text(p.date, 10))) {
        const [y, m, d] = p.date.split('-').map(Number);
        const date = formatDate(new Date(Date.UTC(y, m - 1, d)), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }, { locale });
        sentence = translate(locale, 'inbox.rappel.date', { name, time, date });
      } else sentence = translate(locale, 'inbox.rappel.aujourdhui', { name, time });
      return { kind: 'reminder', text: sentence, sub: translate(locale, 'inbox.sous', { label: translate(locale, 'inbox.rappel'), context: list }) };
    }
    // --- Projets (étape 3) ---
    // Nouvelles cartes d'un projet (regroupées)
    case 'project.cards': {
      const actors = names(p.actors);
      const values = { people: peopleList(locale, actors), count: actors.length, cards: translate(locale, 'alertes.projet.cartes', { count: count(p.added) || 1 }) };
      return {
        kind: 'changes',
        text: project ? translate(locale, 'inbox.projet.ajoute', { ...values, project: project.name }) : translate(locale, 'inbox.projet.ajoute.sansNom', values),
        sub: label,
      };
    }
    // Cartes qui me sont attribuées (une : son titre ; plusieurs : le nombre)
    case 'project.assigned': {
      const actors = names(p.actors);
      const cards = Array.isArray(p.cards) ? p.cards.length : 0;
      const values = { people: peopleList(locale, actors), count: actors.length };
      let sentence;
      if (cards <= 1 && card) sentence = translate(locale, 'inbox.projet.attribue.nom', { ...values, card: card.title });
      else sentence = translate(locale, 'inbox.projet.attribue', { ...values, cards: translate(locale, 'alertes.projet.cartes', { count: Math.max(1, cards) }) });
      return { kind: 'changes', text: sentence, sub: withContext(project?.name ?? '') };
    }
    // Commentaires d'une carte suivie (jamais leur texte)
    case 'card.comments': {
      const actors = names(p.actors);
      const n = count(p.count) || 1;
      const values = { people: peopleList(locale, actors), count: actors.length, card: card?.title ?? '', comments: translate(locale, 'alertes.carte.commentaires', { count: n }) };
      const key = !card ? 'inbox.carte.commente.sansTitre' : n === 1 ? 'inbox.carte.commente' : 'inbox.carte.commentaires';
      return { kind: 'comment', text: translate(locale, key, values), sub: withContext(project?.name ?? '') };
    }
    // Modifications d'une carte suivie : déplacée (seulement), faite
    // (seulement), ou modifiée
    case 'card.changes': {
      const actors = names(p.actors);
      const kinds = names(p.kinds);
      const values = { people: peopleList(locale, actors), count: actors.length, card: card?.title ?? '', column: column ?? '' };
      let key = 'inbox.carte.modifie';
      if (!card) key = 'inbox.carte.modifie.sansTitre';
      else if (kinds.length === 1 && kinds[0] === 'move' && column) key = 'inbox.carte.deplace';
      else if (kinds.length === 1 && kinds[0] === 'done') key = 'inbox.carte.faite';
      return { kind: 'changes', text: translate(locale, key, values), sub: withContext(project?.name ?? '') };
    }
    // Rappel d'une carte : « 2FAuth à 18:00 », « … demain à 18:00 »…
    case 'card.reminder': {
      const time = timeLabel(text(p.time, 5), { locale });
      const name = card?.title ?? translate(locale, 'inbox.carte.uneCarte');
      let sentence;
      if (p.when === 'tomorrow') sentence = translate(locale, 'inbox.rappel.demain', { name, time });
      else if (p.when === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text(p.date, 10))) {
        const [y, m, d] = p.date.split('-').map(Number);
        const date = formatDate(new Date(Date.UTC(y, m - 1, d)), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }, { locale });
        sentence = translate(locale, 'inbox.rappel.date', { name, time, date });
      } else sentence = translate(locale, 'inbox.rappel.aujourdhui', { name, time });
      const rappel = translate(locale, 'inbox.rappel');
      return { kind: 'reminder', text: sentence, sub: project ? translate(locale, 'inbox.sous', { label: rappel, context: project.name }) : rappel };
    }
    // Partage d'un projet ; projets coupés : l'invitation à les allumer
    case 'project.shared': {
      const actor = text(p.actor, 100) || translate(locale, 'alertes.quelquun');
      return {
        kind: 'sharing',
        text: project ? translate(locale, 'inbox.projet.partage', { actor, project: project.name }) : translate(locale, 'inbox.projet.partage.sansNom', { actor }),
        sub: projectsOff && project ? translate(locale, 'alertes.projet.allumer') : label,
      };
    }
    default:
      return { kind: 'changes', text: label, sub: '' };
  }
}

export function createInbox(ctx) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();
  const oldest = () => new Date(ctx.now() - INBOX_DAYS * DAY).toISOString();

  const q = {
    recent: db.prepare(`SELECT id, num, params, count FROM inbox WHERE user_id = ? AND group_key = ? AND updated_at >= ?
      ORDER BY updated_at DESC, num DESC LIMIT 1`),
    // Numéro suivant de CETTE personne (jamais le numéro commun de la table)
    nextNum: db.prepare('UPDATE users SET inbox_seq = inbox_seq + 1 WHERE id = ? RETURNING inbox_seq').pluck(),
    insert: db.prepare(`INSERT INTO inbox (user_id, num, category, text_key, params, target_type, target_id, group_key, count, created_at, updated_at)
      VALUES (:userId, :num, :category, :textKey, :params, :targetType, :targetId, :groupKey, 1, :now, :now)`),
    regroup: db.prepare('UPDATE inbox SET params = ?, count = count + 1, updated_at = ?, read_at = NULL, text_key = ?, target_type = ?, target_id = ? WHERE id = ?'),
    trim: db.prepare(`DELETE FROM inbox WHERE user_id = :userId AND id NOT IN (
      SELECT id FROM inbox WHERE user_id = :userId ORDER BY updated_at DESC, num DESC LIMIT :max)`),
    rows: db.prepare(`SELECT num, category, text_key, params, target_type, target_id, count, created_at, updated_at, read_at
      FROM inbox WHERE user_id = ? AND updated_at >= ? ORDER BY updated_at DESC, num DESC LIMIT ${INBOX_MAX}`),
    stamp: db.prepare(`SELECT COUNT(*) AS n, MAX(updated_at) AS updated, MAX(read_at) AS read, SUM(read_at IS NULL) AS unread
      FROM inbox WHERE user_id = ? AND updated_at >= ?`),
    readIds: db.prepare('UPDATE inbox SET read_at = ? WHERE user_id = ? AND num = ? AND read_at IS NULL'),
    readUpTo: db.prepare('UPDATE inbox SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND updated_at <= ?'),
    dropId: db.prepare('DELETE FROM inbox WHERE user_id = ? AND num = ?'),
    dropUpTo: db.prepare('DELETE FROM inbox WHERE user_id = ? AND updated_at <= ?'),
    purge: db.prepare('DELETE FROM inbox WHERE updated_at < ?'),
    // Cibles, telles que la personne les voit maintenant (membre actif,
    // liste non supprimée ; élément non supprimé)
    list: db.prepare(`SELECT lists.id, lists.type, lists.owner_id, lists.for_user_id, lists.for_name FROM lists
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      WHERE lists.id = :id AND lists.deleted_at IS NULL`),
    item: db.prepare(`SELECT items.id, lists.id AS list_id, lists.type, lists.owner_id, lists.for_user_id, lists.for_name FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      WHERE items.id = :id AND items.deleted_at IS NULL`),
    note: db.prepare(`SELECT notes.id, notes.title, notes.body, notes.owner_id, notes.deleted_at,
        (SELECT access FROM note_members WHERE note_members.note_id = notes.id AND note_members.user_id = :userId) AS member_access
      FROM notes WHERE notes.id = :id`),
    locale: db.prepare('SELECT locale FROM users WHERE id = ?').pluck(),
    // Projets : le projet tel que la personne le voit (son droit), et si
    // elle a allumé les projets ; une carte ; une colonne
    project: db.prepare(`SELECT projects.id, projects.name, projects.owner_id, projects.deleted_at,
        (SELECT access FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = :userId) AS member_access
      FROM projects WHERE projects.id = :id`),
    projectsOn: db.prepare('SELECT projects_enabled FROM users WHERE id = ?').pluck(),
    card: db.prepare('SELECT id, title, project_id, deleted_at FROM cards WHERE id = ?'),
    column: db.prepare('SELECT name FROM project_columns WHERE id = ? AND project_id = ?').pluck(),
  };

  const changed = (userId) => ctx.events?.notifyInbox?.([userId]);

  // Écrit une ligne pour une personne (appelé par notify.js seulement).
  // entry : { category, textKey, params, targetType, targetId, groupKey }.
  // Renvoie le numéro de la ligne écrite ou mise à jour (num : propre à
  // cette personne).
  function add(userId, { category, textKey, params = {}, targetType = null, targetId = null, groupKey = null }) {
    if (!INBOX_CATEGORIES.includes(category)) throw new Error(`Catégorie inconnue : ${category}`); // technique
    if (targetType !== null && !INBOX_TARGETS.includes(targetType)) throw new Error(`Cible inconnue : ${targetType}`); // technique
    const now = nowIso();
    const id = db.transaction(() => {
      const previous = groupKey ? q.recent.get(userId, groupKey, new Date(ctx.now() - INBOX_GROUP_MS).toISOString()) : null;
      if (previous) {
        let old = {};
        try {
          old = JSON.parse(previous.params);
        } catch {
          old = {};
        }
        q.regroup.run(fit(mergeParams(old, params)), now, textKey, targetType, targetId === null ? null : String(targetId), previous.id);
        return previous.num;
      }
      const num = q.nextNum.get(userId);
      q.insert.run({
        userId, num, category, textKey, params: fit(params), targetType, targetId: targetId === null ? null : String(targetId), groupKey, now,
      });
      q.trim.run({ userId, max: INBOX_MAX });
      return num;
    })();
    changed(userId);
    return id;
  }

  // JSON des valeurs, sous la limite de la base (listes de noms raccourcies)
  function fit(params) {
    let value = JSON.stringify(params);
    if (value.length <= PARAMS_MAX) return value;
    const smaller = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, NAMES_MAX + 1) : v]));
    value = JSON.stringify(smaller);
    return value.length <= PARAMS_MAX ? value : '{}';
  }

  // Cible d'une ligne, revérifiée avec les droits du moment. Renvoie
  // { target, note, hidden } : target null si elle n'est plus disponible ;
  // hidden : ligne d'une liste d'envies dont la personne est le
  // bénéficiaire (filet de sécurité : jamais montrée)
  function resolve(user, row) {
    const id = row.target_id;
    switch (row.target_type) {
      case 'deadlines': return { target: { type: 'deadlines' } };
      case 'list': {
        const list = id ? q.list.get({ userId: user.id, id }) : null;
        if (list && hiddenFor(user, list, row)) return { hidden: true };
        return { target: list ? { type: 'list', listId: list.id } : null };
      }
      case 'item': {
        const item = id ? q.item.get({ userId: user.id, id }) : null;
        if (item && hiddenFor(user, item, row)) return { hidden: true };
        return { target: item ? { type: 'item', itemId: item.id, listId: item.list_id } : null };
      }
      case 'note': {
        const note = id ? q.note.get({ userId: user.id, id }) : null;
        const visible = note && noteAccess(user, note) && !note.deleted_at ? note : null;
        return { target: visible ? { type: 'note', noteId: visible.id } : null, note: visible };
      }
      case 'project': {
        const project = visibleProject(user, id);
        if (!project) return { target: null };
        const off = q.projectsOn.get(user.id) !== 1;
        // Projets coupés : seule la ligne « Partage » ouvre quelque chose
        // (Réglages › Fonctions, pour les allumer)
        if (off) return { target: row.category === 'sharing' ? { type: 'features' } : null, project, projectsOff: true };
        return { target: { type: 'project', projectId: project.id }, project };
      }
      case 'card': {
        const card = id ? q.card.get(id) : null;
        const project = card && !card.deleted_at ? visibleProject(user, card.project_id) : null;
        if (!project) return { target: null };
        let params = {};
        try {
          params = JSON.parse(row.params);
        } catch {
          params = {};
        }
        const column = typeof params.column === 'string' ? q.column.get(params.column, project.id) ?? null : null;
        if (q.projectsOn.get(user.id) !== 1) return { target: null, project, card, column, projectsOff: true };
        return { target: { type: 'card', projectId: project.id, cardId: card.id }, project, card, column };
      }
      default: return { target: null };
    }
  }
  // Un projet que la personne voit encore (projectAccess, hors corbeille)
  function visibleProject(user, projectId) {
    const project = projectId ? q.project.get({ userId: user.id, id: projectId }) : null;
    return project && !project.deleted_at && projectAccess(user, project) ? project : null;
  }
  function hiddenFor(user, list, row) {
    if (list.type !== 'wishes' || row.category === 'sharing') return false;
    return beneficiaryId(wishListOf(list)) === user.id;
  }

  // Les lignes d'une personne, la plus récente en haut, phrases dans la
  // langue de son compte. Champ par champ : rien d'autre ne sort.
  function rowsFor(user) {
    const locale = userLocale({ locale: q.locale.get(user.id) }, ctx.config);
    const out = [];
    for (const stored of q.rows.all(user.id, oldest())) {
      let params = {};
      try {
        params = JSON.parse(stored.params);
      } catch {
        params = {};
      }
      // Plusieurs cartes attribuées regroupées : la ligne ouvre le projet
      const row = stored.text_key === 'project.assigned' && Array.isArray(params.cards) && params.cards.length > 1 && typeof params.project === 'string'
        ? { ...stored, target_type: 'project', target_id: params.project }
        : stored;
      const { target, note = null, hidden = false, project = null, card = null, column = null, projectsOff = false } = resolve(user, row);
      if (hidden) continue;
      const rendered = renderRow(row.text_key, params, row.category, locale, { note, project, card, column, projectsOff });
      out.push({
        id: row.num,
        category: row.category,
        kind: rendered.kind,
        text: rendered.text,
        sub: rendered.sub,
        targetType: row.target_type,
        target,
        count: row.count,
        createdAt: row.created_at,
        at: row.updated_at,
        read: row.read_at !== null,
      });
    }
    return out;
  }

  // Empreinte de la page d'une personne : change dès qu'une ligne est
  // ajoutée, regroupée, lue ou effacée (la synchronisation la donne ; le
  // téléphone relit la page quand elle change)
  function stamp(userId) {
    const s = q.stamp.get(userId, oldest());
    return `${s.n}|${s.updated ?? ''}|${s.read ?? ''}|${s.unread ?? 0}`;
  }

  // Marque lues : ids (les miennes seulement ; les autres sont ignorées), ou
  // toutes celles écrites jusqu'à upTo (« Tout marquer comme lu »)
  function markRead(userId, { ids = null, upTo = null }) {
    const now = nowIso();
    let n = 0;
    db.transaction(() => {
      if (ids) for (const id of ids) n += q.readIds.run(now, userId, id).changes;
      else n += q.readUpTo.run(now, userId, upTo).changes;
    })();
    if (n) changed(userId);
    return n;
  }

  // Efface : ids (les miennes seulement), ou toutes jusqu'à upTo (« Tout effacer »)
  function remove(userId, { ids = null, upTo = null }) {
    let n = 0;
    db.transaction(() => {
      if (ids) for (const id of ids) n += q.dropId.run(userId, id).changes;
      else n += q.dropUpTo.run(userId, upTo).changes;
    })();
    if (n) changed(userId);
    return n;
  }

  // Ménage (toutes les heures) : lignes de plus de 30 jours
  const purgeOld = () => q.purge.run(oldest()).changes;

  return { add, rowsFor, stamp, markRead, remove, purgeOld };
}

// Vérifie la demande « lire » ou « effacer » : { ids: [1, 2] } ou
// { all: true, upTo: "<date ISO>" } (upTo facultatif : maintenant).
// Renvoie { ids } ou { upTo }, ou null si elle est invalide.
export function parseSelection(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.all === true && body.ids === undefined) {
    if (body.upTo === undefined) return { upTo: now };
    return typeof body.upTo === 'string' && ISO.test(body.upTo) ? { upTo: body.upTo } : null;
  }
  if (body.all !== undefined) return null;
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > INBOX_MAX) return null;
  if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) return null;
  return { ids: [...new Set(ids)] };
}

// Opérations de la file d'attente du téléphone (POST /api/ops) :
// « inbox.read » et « inbox.delete », avec { ids } ou { all, upTo }
export function inboxHandlers(inbox, { OpError, now }) {
  const selection = (op) => {
    const value = parseSelection({ ids: op.ids, all: op.all, upTo: op.upTo }, now());
    if (!value) throw new OpError(400, 'ops.inboxInvalide');
    return value;
  };
  return {
    'inbox.read'(user, op) {
      inbox.markRead(user.id, selection(op));
      return {};
    },
    'inbox.delete'(user, op) {
      inbox.remove(user.id, selection(op));
      return {};
    },
  };
}
