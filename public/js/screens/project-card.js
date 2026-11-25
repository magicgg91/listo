// Une carte ouverte (#/projets/<id>/cartes/<carte> ; docs/cadrage-projets.md,
// étapes 1 et 2, sections 4.3, 4.4 et 5 ; maquettes
// design/projets/captures/carte-1, carte-2 et pc-carte-1).
//
// Étape 2 : en plus du titre, de la colonne et des étiquettes, les
// personnes attribuées, l'échéance (case « Fait » puis la date et l'heure,
// sur une ligne ; le rappel dessous, en petit), la priorité (quand l'option
// du projet est allumée), la description (mise en forme des notes, cases
// et « 2/3 », screens/card-description.js) et les liens.
//
// Étape 3 : les onglets « Commentaires » et « Historique »
// (screens/card-activity.js ; écrire un commentaire : la barre en verre en
// bas du téléphone, sous les commentaires sur ordinateur), « Suivre » /
// « Ne plus suivre » (menu ⋮ ; colonne Actions sur ordinateur), et la page
// Notifications : ouvrir la carte rend lues ses notifications.
//
// - Téléphone : un écran entier, comme une note : barre du haut (retour au
//   projet, pastille d'état, menu ⋮ de la carte), titre en grand, colonne
//   (« Relecture ⌄ », dans sa couleur : ouvre « Déplacer vers… »), les
//   champs (Personnes, Échéance, Étiquettes, Priorité), puis Description et
//   Liens.
// - Ordinateur : une fenêtre au centre, par-dessus le projet (qui reste
//   ouvert dessous) : à gauche le titre, « dans Relecture · DomoPi
//   Articles · créée par Guillaume le 2 octobre », Description et Liens ; à
//   droite, dans cet ordre (décision du propriétaire du 25 novembre 2026,
//   aucun bouton en double), Colonne, Personnes, Étiquettes, Échéance,
//   Priorité (option allumée), puis Actions (« Déplacer vers… » M,
//   Dupliquer, Supprimer). L'adresse est celle de la carte ; Échap ou la
//   croix la ferment et ramènent au projet ; le focus reste dedans, puis
//   revient au tableau.
// - Un seul chemin pour remplir un champ (remarque du propriétaire du
//   25 novembre 2026) : le champ lui-même, toujours affiché, avec son « + »
//   ou, vide, « + Attribuer », « + Ajouter une échéance », « + Étiquette »,
//   « + Ajouter un lien », « + Ajouter une description ».
// - Personnes (5.2) : propriétaire et « Peut modifier » attribuent sur
//   toutes les cartes (« M'attribuer » en tête du choix) ; un Contributeur
//   sur les cartes qu'il a créées ; sur la carte d'un autre qui lui est
//   attribuée, il peut seulement se retirer (« Me retirer », avec
//   confirmation : il ne pourra plus la modifier). Seulement des membres
//   qui ne sont pas en lecture seule.
// - Le titre se modifie en le touchant (1 à 200 caractères ; le curseur va
//   dans le champ : geste fait pour écrire), enregistré en quittant le
//   champ ou avec Entrée (Échap annule). Jamais de curseur à l'ouverture.
// - Une carte que mon rôle ne permet pas de modifier (Lecture seule ;
//   Contributeur sur une carte qu'il n'a pas créée et qui ne lui est pas
//   attribuée) : sans « + », sans saisie, sans case « Fait » active, avec
//   la ligne « Lecture seule » ou « Vous pouvez la lire, pas la
//   modifier » ; jamais un bouton qui ne marche pas.
// - Liens : titre souligné (nouvel onglet, rel="noopener noreferrer") et
//   adresse en petit ; ⋮ (Modifier, Copier l'adresse, Retirer) ; http et
//   https seulement, vérifiés ici puis par le serveur ; jamais appelés.
// - Enregistrement automatique (file d'attente, hors ligne compris) ; le
//   serveur revérifie tout. Textes posés par textContent (h()).

import { h, icon, iconButton, replace, avatar, field, errorNote } from '../dom.js';
import { navigate, goBack } from '../router.js';
import { app, onDataChange, refreshData } from '../app.js';
import { syncPill, openMenu, openSheet, openPanel, toast, drawWhenIdle, confirmDialog } from '../ui.js';
import { t, formatDate } from '../i18n.js';
import { dueDateLabel, namesList } from '../format.js';
import { REMINDERS, isDueTime, timeLabel } from '../due-time.js';
import {
  projectRights, cleanCardTitle, cleanLinkUrl, cleanLinkTitle, assignableRole, isCardPriority, CARD_PRIORITIES,
  CARD_TITLE_MAX, LABELS_PER_CARD_MAX, ASSIGNEES_MAX, LINKS_PER_CARD_MAX, LINK_TITLE_MAX, LINK_URL_MAX,
} from '../projects.js';
import * as projectActions from '../project-actions.js';
import { singleKeysOn, keycap } from '../shortcuts.js';
import { labelChip } from './note-labels.js';
import { liveProject, rightsOn, cardLabels, cardMenuItems, openMoveSheet, duplicateCard, deleteCard, cardDue, PRIORITY_TEXTS, followItem } from './project.js';
import { openLabelSheet } from './project-settings.js';
import { cardDescription } from './card-description.js';
import { cardActivity } from './card-activity.js';
import { inboxRowsFor } from '../store.js';
import * as actions from '../actions.js';

// La carte (présente, dans un projet ouvert que je vois), ou null
function cardOf(projectId, cardId) {
  const card = app.data.cards.get(cardId);
  const project = liveProject(projectId);
  return card && project && card.projectId === projectId && !card.deletedAt ? { card, project } : null;
}
// La carte par son seul identifiant (feuilles ouvertes depuis l'écran)
function foundCard(cardId) {
  const card = app.data.cards.get(cardId);
  const project = card ? liveProject(card.projectId) : null;
  return card && project && !card.deletedAt ? { card, project } : null;
}

// Carte introuvable (supprimée, d'un autre projet, jamais visible)
const cardGone = (projectId) => h('div', { class: 'empty' },
  h('div', { class: 'empty__icon' }, icon('kanban', 'icon--lg')),
  h('h2', { class: 'empty__title' }, t('projets.carte.introuvable.titre')),
  h('p', { class: 'empty__text' }, t('projets.carte.introuvable.texte')),
  h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => navigate('project', { id: projectId }, { replace: true }) }, t('projets.retourProjet')));

// --- Feuille « Étiquettes » d'une carte : les étiquettes du projet à cocher
// (10 au plus) ; « Nouvelle étiquette » pour le propriétaire et « Peut
// modifier » (elle est posée tout de suite sur la carte) ---
export function openCardLabelsSheet(cardId) {
  const found = () => foundCard(cardId);
  const start = found();
  if (!start || !rightsOn(start.card, start.project).edit) return null;
  const list = h('div', { class: 'group' });
  const toggle = (labelId) => {
    const now = found();
    if (!now) return;
    const ids = new Set(now.card.labelIds ?? []);
    if (ids.has(labelId)) ids.delete(labelId);
    else if (ids.size >= LABELS_PER_CARD_MAX) {
      toast(t('projets.etiquettes.limiteCarte', { max: LABELS_PER_CARD_MAX }));
      return;
    } else ids.add(labelId);
    projectActions.setCardLabels(cardId, [...ids]);
  };
  const draw = () => {
    const now = found();
    if (!now) {
      sheet.close();
      return;
    }
    const chosen = new Set(now.card.labelIds ?? []);
    const held = list.contains(document.activeElement) ? document.activeElement.dataset.label : null;
    replace(list, (now.project.labels ?? []).length
      ? now.project.labels.map((label) => {
        const on = chosen.has(label.id);
        const row = h('button', { class: 'tick-row', type: 'button', role: 'checkbox', 'aria-checked': String(on), 'data-label': label.id, onClick: () => toggle(label.id) },
          h('span', { class: `tick${on ? ' is-on' : ''}`, 'aria-hidden': 'true' }, on ? icon('check') : null), labelChip(label));
        return row;
      })
      : h('p', { class: 'kfield__empty' }, t('projets.etiquettes.aucune')));
    if (held) list.querySelector(`[data-label="${held}"]`)?.focus();
  };
  const manager = projectRights(start.project.role).labels;
  const stop = onDataChange(draw);
  const sheet = openSheet({
    title: t('projets.etiquettes'),
    sub: start.card.title,
    content: [
      list,
      manager ? h('button', { class: 'btn btn--secondary btn--block kform__more', type: 'button', onClick: () => openLabelSheet(start.project.id, null, { onCreated: (id) => toggle(id) }) },
        icon('plus', 'icon--sm'), t('projets.etiquette.nouvelle')) : null,
      manager ? null : h('p', { class: 'field__hint' }, t('projets.etiquettes.gerer')),
    ],
    scroll: true,
    pc: 'modal',
    size: 'sm',
    onClose: stop,
  });
  draw();
  return sheet;
}

// --- Personnes (5.2) ---

// Membres qui peuvent être attribués (pas en lecture seule, comptes
// actifs), le propriétaire d'abord
const assignable = (project) => (project.members ?? []).filter((member) => member.active !== false && assignableRole(member.role));
// Personnes attribuées à une carte, dans leur ordre (un compte qui n'est
// plus membre : « Un ancien compte »)
function assigneesOf(card, project) {
  const members = new Map((project.members ?? []).map((member) => [member.id, member]));
  return (card.assigneeIds ?? []).map((id) => members.get(id) ?? { id, displayName: t('projets.personnes.ancien') });
}

// Feuille « Personnes » d'une carte (propriétaire et « Peut modifier » ;
// Contributeur sur une carte qu'il a créée) : les membres permis à cocher
// (10 au plus), appliqués tout de suite ; « M'attribuer » en tête
export function openAssignSheet(cardId) {
  const start = foundCard(cardId);
  if (!start || !rightsOn(start.card, start.project).assign) return null;
  const list = h('div', { class: 'group' });
  const apply = (ids) => {
    const now = foundCard(cardId);
    if (!now || !rightsOn(now.card, now.project).assign) return;
    if (ids.length > ASSIGNEES_MAX) {
      toast(t('projets.personnes.limite', { max: ASSIGNEES_MAX }));
      return;
    }
    projectActions.setCardAssignees(cardId, ids);
  };
  const toggle = (userId) => {
    const now = foundCard(cardId);
    if (!now) return;
    const ids = now.card.assigneeIds ?? [];
    apply(ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]);
  };
  const me = h('button', { class: 'btn btn--secondary btn--block kform__more', type: 'button', onClick: () => toggle(app.user.id) }, icon('user', 'icon--sm'), t('projets.personnes.mAttribuer'));
  const draw = () => {
    const now = foundCard(cardId);
    if (!now) {
      sheet.close();
      return;
    }
    const chosen = new Set(now.card.assigneeIds ?? []);
    const people = assignable(now.project);
    const held = list.contains(document.activeElement) ? document.activeElement.dataset.person : null;
    me.hidden = chosen.has(app.user.id) || !people.some((m) => m.id === app.user.id);
    replace(list, people.map((member) => {
      const on = chosen.has(member.id);
      return h('button', { class: 'tick-row', type: 'button', role: 'checkbox', 'aria-checked': String(on), 'data-person': String(member.id), onClick: () => toggle(member.id) },
        h('span', { class: `tick${on ? ' is-on' : ''}`, 'aria-hidden': 'true' }, on ? icon('check') : null),
        avatar(member.displayName, { second: member.id !== app.user.id }),
        h('span', {}, member.id === app.user.id ? t('projets.personnes.moi', { name: member.displayName }) : member.displayName));
    }));
    if (held) list.querySelector(`[data-person="${held}"]`)?.focus();
  };
  const stop = onDataChange(draw);
  const sheet = openSheet({
    title: t('projets.personnes'),
    sub: start.card.title,
    content: [me, list, h('p', { class: 'field__hint' }, t('projets.personnes.aide'))],
    scroll: true,
    pc: 'modal',
    size: 'sm',
    onClose: stop,
  });
  draw();
  return sheet;
}

// Contributeur sur la carte d'un autre : se retirer (il ne pourra plus la
// modifier)
async function unassignMe(card) {
  const ok = await confirmDialog({
    title: t('projets.personnes.meRetirer.question'),
    text: t('projets.personnes.meRetirer.texte'),
    confirmLabel: t('projets.personnes.meRetirer'),
    danger: false,
  });
  if (!ok) return;
  const now = app.data.cards.get(card.id);
  if (now) projectActions.setCardAssignees(card.id, (now.assigneeIds ?? []).filter((id) => id !== app.user.id));
}

// Les personnes de la carte (pastille et prénom), et « + » ou « + Attribuer »
function peopleValue(card, project) {
  const can = rightsOn(card, project);
  const people = assigneesOf(card, project);
  const mine = (card.assigneeIds ?? []).includes(app.user.id);
  return [
    people.map((person) => h('span', { class: 'kfield__person' }, avatar(person.displayName, { second: person.id !== app.user.id }), person.displayName)),
    can.assign ? h('button', {
      class: 'kadd', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': people.length ? t('projets.personnes.modifier') : null, onClick: () => openAssignSheet(card.id),
    }, icon('plus'), people.length ? null : t('projets.personnes.attribuer')) : null,
    !can.assign && can.unassignSelf && mine ? h('button', { class: 'kadd', type: 'button', onClick: () => unassignMe(card) }, t('projets.personnes.meRetirer')) : null,
    !people.length && !can.assign ? h('span', { class: 'kfield__empty' }, t('projets.personnes.aucune')) : null,
  ];
}

// --- Échéance, heure, rappel, « Fait » (5.3) ---

const REMIND_TEXTS = { 0: 'projets.rappel.aLHeure', 15: 'projets.rappel.15', 30: 'projets.rappel.30', 60: 'projets.rappel.60', 120: 'projets.rappel.120', 1440: 'projets.rappel.veille' };

// Feuille « Échéance » : la date (sélecteur du téléphone), l'heure
// facultative, le rappel (seulement avec une heure) ; « Retirer
// l'échéance » quand il y en a une
export function openDueSheet(cardId) {
  const start = foundCard(cardId);
  if (!start || !rightsOn(start.card, start.project).edit) return null;
  let date = start.card.dueDate ?? null;
  let time = start.card.dueTime ?? null;
  let remind = start.card.remindBefore ?? null;
  const picker = (input, text) => {
    input.addEventListener('click', () => {
      try {
        input.showPicker?.();
      } catch {
        // sélecteur indisponible : le champ reste utilisable
      }
    });
    return h('div', { class: 'due-picker' }, h('span', { class: 'input input--select', 'aria-hidden': 'true' }, text, icon('chev-d')), input);
  };
  const dateText = h('span', { class: 'input__value' });
  const dateInput = h('input', { class: 'due-picker__input', type: 'date', min: '2000-01-01', max: '2100-12-31' });
  dateInput.addEventListener('change', () => {
    if (dateInput.value) date = dateInput.value;
    draw();
  });
  const timeText = h('span', { class: 'input__value' });
  const timeInput = h('input', { class: 'due-picker__input', type: 'time', step: '60' });
  timeInput.addEventListener('change', () => {
    time = isDueTime(timeInput.value) ? timeInput.value : null;
    draw();
  });
  const clearTime = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => {
    time = null;
    draw();
  } }, t('projets.echeance.effacerHeure'));
  const remindText = h('span', { class: 'input__value' });
  const remindSelect = h('select', { class: 'due-picker__input' }, REMINDERS.map(([minutes, label]) => h('option', { value: minutes === null ? '' : String(minutes) }, t(label))));
  remindSelect.addEventListener('change', () => {
    remind = remindSelect.value === '' ? null : Number(remindSelect.value);
    draw();
  });
  const remindField = h('div', { class: 'field' }, h('span', { class: 'field__label', 'aria-hidden': 'true' }, t('projets.echeance.rappel')),
    h('div', { class: 'due-picker' }, h('span', { class: 'input input--select', 'aria-hidden': 'true' }, remindText, icon('chev-d')), remindSelect),
    h('p', { class: 'field__hint' }, t('projets.echeance.rappel.aide')));
  const saveButton = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => {
    sheet.close();
    projectActions.setCardDue(cardId, { date, time, remindBefore: time ? remind : null });
  } }, t('projets.enregistrer'));
  function draw() {
    if (!time) remind = null;
    const dateLabel = date ? dueDateLabel(date) : t('projets.echeance.choisirDate');
    replace(dateText, icon('calendar', 'icon--sm'), dateLabel);
    dateInput.value = date ?? '';
    dateInput.setAttribute('aria-label', t('projets.echeance.date.lu', { label: dateLabel }));
    const timeShown = time ? timeLabel(time) : t('projets.echeance.aucuneHeure');
    replace(timeText, icon('clock', 'icon--sm'), timeShown);
    timeInput.value = time ?? '';
    timeInput.setAttribute('aria-label', t('projets.echeance.heure.lu', { label: timeShown }));
    clearTime.hidden = !time;
    remindField.hidden = !time;
    remindSelect.value = remind === null ? '' : String(remind);
    const remindLabel = t(REMINDERS.find(([minutes]) => minutes === remind)?.[1] ?? 'repetition.rappel.aucun');
    replace(remindText, icon('bell', 'icon--sm'), remindLabel);
    remindSelect.setAttribute('aria-label', t('projets.echeance.rappel.lu', { label: remindLabel }));
    saveButton.disabled = !date;
  }
  const sheet = openSheet({
    title: t('projets.echeance'),
    sub: start.card.title,
    content: [
      h('div', { class: 'stack' },
        h('div', { class: 'field' }, h('span', { class: 'field__label', 'aria-hidden': 'true' }, t('projets.echeance.date')), picker(dateInput, dateText)),
        h('div', { class: 'field' }, h('span', { class: 'field__label', 'aria-hidden': 'true' }, t('projets.echeance.heure')),
          h('div', { class: 'time-row' }, picker(timeInput, timeText), clearTime)),
        remindField),
      h('div', { class: 'dialog__actions' },
        start.card.dueDate ? h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => {
          sheet.close();
          projectActions.setCardDue(cardId, null);
        } }, t('projets.echeance.retirer')) : h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, t('projets.annuler')),
        saveButton),
    ],
    scroll: true,
    pc: 'modal',
    size: 'sm',
  });
  draw();
  return sheet;
}

// L'échéance d'une carte ouverte : la case « Fait » puis la date et
// l'heure (un bouton qui ouvre la feuille), sur une ligne ; le rappel
// dessous, en petit ; sans échéance, « + Ajouter une échéance »
function dueValue(card, project) {
  const can = rightsOn(card, project).edit;
  if (!card.dueDate) {
    return can
      ? h('button', { class: 'kadd', type: 'button', 'aria-haspopup': 'dialog', onClick: () => openDueSheet(card.id) }, icon('plus'), t('projets.echeance.ajouter'))
      : h('span', { class: 'kfield__empty' }, t('projets.echeance.aucune'));
  }
  const due = cardDue(card);
  const done = Boolean(card.done);
  const tickBox = h('span', { class: `tick${done ? ' is-on' : ''}`, 'aria-hidden': 'true' }, done ? icon('check') : null);
  const doneBox = can
    ? h('button', { class: 'kdone', type: 'button', role: 'checkbox', 'aria-checked': String(done), onClick: () => projectActions.setCardDone(card.id, !done) }, tickBox, t('projets.echeance.fait'))
    : h('span', { class: 'kdone', role: 'checkbox', 'aria-checked': String(done), 'aria-disabled': 'true' }, tickBox, t('projets.echeance.fait'));
  const chip = h('span', { class: `due due--${due.state}` }, icon(due.icon), due.when);
  const date = can
    ? h('button', { class: 'kdue__date', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': t('projets.echeance.modifier.lu', { label: due.label }), onClick: () => openDueSheet(card.id) }, chip)
    : h('span', { class: 'kdue__date', role: 'img', 'aria-label': due.label }, chip);
  return h('div', { class: 'kdue' }, doneBox, date,
    card.remindBefore !== null && card.remindBefore !== undefined && card.dueTime
      ? h('span', { class: 'kdue__remind' }, icon('bell', 'icon--sm'), t(REMIND_TEXTS[card.remindBefore] ?? 'projets.rappel.60')) : null);
}

// --- Priorité (5.5) : basse, normale, élevée, quand l'option du projet est
// allumée ; choix en relief (jamais la couleur seule) ---
function priorityValue(card, project) {
  const current = isCardPriority(card.priority) ? card.priority : 'normal';
  if (!rightsOn(card, project).edit) return h('span', {}, t(PRIORITY_TEXTS[current]));
  return h('div', { class: 'segmented kprio', role: 'radiogroup', 'aria-label': t('projets.priorite') },
    CARD_PRIORITIES.map((value) => h('button', {
      class: 'segmented__opt', type: 'button', role: 'radio', 'aria-checked': String(value === current),
      onClick: () => { if (value !== current) projectActions.setCardPriority(card.id, value); },
    }, t(PRIORITY_TEXTS[value]))));
}

// --- Liens ---

// Feuille d'un lien (ajouter, ou modifier link) : titre facultatif,
// adresse http ou https (vérifiée ici, puis par le serveur)
export function openCardLinkSheet(cardId, link = null) {
  const start = foundCard(cardId);
  if (!start || !rightsOn(start.card, start.project).edit) return null;
  const title = h('input', { class: 'input', type: 'text', autocomplete: 'off', maxlength: String(LINK_TITLE_MAX), placeholder: t('projets.lien.titre.exemple'), value: link?.title || null });
  const address = h('input', { class: 'input', type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: String(LINK_URL_MAX), placeholder: 'https://…', value: link?.url || null });
  const titleField = field(t('projets.lien.titre'), title, { aside: t('projets.facultatif') });
  const addressField = field(t('projets.lien.adresse'), address, { hint: t('projets.lien.aide') });
  const error = errorNote();
  const form = h('form', { class: 'stack', novalidate: true },
    titleField.field, addressField.field, error.note,
    h('div', { class: 'dialog__actions' },
      h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, t('projets.annuler')),
      h('button', { class: 'btn btn--primary', type: 'submit' }, link ? t('projets.enregistrer') : t('projets.lien.ajouterBouton'))));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    addressField.setError(null);
    titleField.setError(null);
    const url = cleanLinkUrl(address.value);
    const name = cleanLinkTitle(title.value);
    if (!url) {
      addressField.setError(t('projets.lien.adresseInvalide'));
      return;
    }
    if (name === null) {
      titleField.setError(t('projets.lien.titreInvalide', { max: LINK_TITLE_MAX }));
      return;
    }
    const now = foundCard(cardId);
    if (!link && (now?.card.links ?? []).length >= LINKS_PER_CARD_MAX) {
      error.show(t('projets.lien.limite', { max: LINKS_PER_CARD_MAX }));
      return;
    }
    sheet.close();
    if (link) projectActions.updateCardLink(cardId, link.id, { title: name, url });
    else projectActions.addCardLink(cardId, { title: name, url });
  });
  const sheet = openSheet({ title: link ? t('projets.lien.modifier') : t('projets.lien.ajouter'), sub: start.card.title, content: form, pc: 'modal', size: 'sm' });
  return sheet;
}

// Adresse montrée sous le titre : sans « https:// » ni « / » final
const shortUrl = (url) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

// Section « Liens · 2 » : une ligne par lien, puis « + Ajouter un lien »
function linksPart(card, project) {
  const can = rightsOn(card, project).edit;
  const links = card.links ?? [];
  const rows = links.map((link) => {
    const url = cleanLinkUrl(link.url); // revérifiée avant d'en faire un lien
    const shown = link.title || shortUrl(link.url);
    const menuLabel = t('projets.lien.actions', { name: shown });
    const menu = iconButton('more', menuLabel, () => openMenu([
      can ? { icon: 'pencil', label: t('projets.lien.modifier'), onSelect: () => openCardLinkSheet(card.id, link) } : null,
      { icon: 'copy', label: t('projets.lien.copier'), onSelect: () => copyAddress(link.url) },
      can ? { icon: 'trash', label: t('projets.lien.retirer'), danger: true, separated: true, onSelect: () => projectActions.removeCardLink(card.id, link.id) } : null,
    ].filter(Boolean), { label: menuLabel, anchor: menu }));
    menu.setAttribute('aria-haspopup', 'menu');
    return h('div', { class: 'klink' },
      icon('link'),
      h('span', { class: 'klink__body' },
        url ? h('a', { class: 'klink__title', href: url, target: '_blank', rel: 'noopener noreferrer' }, shown) : h('span', { class: 'klink__title' }, shown),
        link.title ? h('span', { class: 'klink__url' }, shortUrl(link.url)) : null),
      menu);
  });
  return h('section', { class: 'kc__block', 'aria-label': t('projets.liens') },
    h('h2', { class: 'kc__section' }, t('projets.liens'), links.length ? h('span', { class: 'kcount' }, String(links.length)) : null),
    rows.length || can ? h('div', { class: 'group' },
      rows,
      can && links.length < LINKS_PER_CARD_MAX ? h('button', { class: 'klink klink--add', type: 'button', 'aria-haspopup': 'dialog', onClick: () => openCardLinkSheet(card.id) }, icon('plus'), t('projets.lien.ajouter')) : null)
      : h('p', { class: 'kfield__empty kc__none' }, t('projets.lien.aucun')));
}

async function copyAddress(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast(t('projets.lien.copie'));
  } catch {
    toast(t('projets.lien.copieImpossible'));
  }
}

// --- Morceaux communs au téléphone et à l'ordinateur ---

// Titre : texte (lecture) ou bouton qui passe en saisie (modifier)
function titlePart(getCard, canEdit, className) {
  const slot = h('div', { class: 'kc__titlebox' });
  let editing = false;
  const show = () => {
    const card = getCard();
    if (!card || editing) return;
    if (!canEdit()) {
      replace(slot, h('h1', { class: className }, card.title));
      return;
    }
    replace(slot, h('h1', { class: className }, h('button', {
      class: 'kc__titlebtn', type: 'button', 'aria-label': t('projets.carte.renommer.lu', { name: card.title }), onClick: edit,
    }, card.title)));
  };
  function edit() {
    const card = getCard();
    if (!card) return;
    editing = true;
    const input = h('textarea', { class: `${className} kc__titleinput`, rows: '2', maxlength: String(CARD_TITLE_MAX), 'aria-label': t('projets.carte.titre'), enterkeyhint: 'done' });
    input.value = card.title;
    let cancelled = false;
    const done = () => {
      if (!editing) return;
      editing = false;
      const value = cleanCardTitle(input.value);
      const now = getCard();
      if (!cancelled && now && value && value !== now.title) projectActions.renameCard(now.id, value);
      else if (!cancelled && !value) toast(t('projets.carte.titreVide'));
      show();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelled = true;
        input.blur();
      }
    });
    input.addEventListener('blur', done);
    replace(slot, input);
    // Geste fait pour écrire (toucher le titre) : le curseur va à la fin
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  return { el: slot, show, editing: () => editing };
}

// Bouton de la colonne, dans sa couleur (« Relecture ⌄ ») : ouvre « Déplacer
// vers… » ; sans le droit de déplacer, la colonne est seulement écrite
function columnPart(card, project, className) {
  const column = (project.columns ?? []).find((c) => c.id === card.columnId);
  const name = column?.name ?? '';
  const color = column?.color ?? 'gris';
  if (!rightsOn(card, project).move) {
    return h('span', { class: `${className} c-${color} is-static` }, h('span', { class: 'coldot', 'aria-hidden': 'true' }), t('projets.carte.dans', { name }));
  }
  return h('button', {
    class: `${className} c-${color}`, type: 'button', 'aria-haspopup': 'dialog', 'aria-label': t('projets.carte.colonne.lu', { name }),
    onClick: () => openMoveSheet(card.id),
  }, h('span', { class: 'coldot', 'aria-hidden': 'true' }), name, icon('chev-d'));
}

// Étiquettes de la carte et « + Étiquette » (qui peut modifier la carte)
function labelsValue(card, project) {
  const labels = cardLabels(card, project);
  const canEdit = rightsOn(card, project).edit;
  return [
    labels.map((label) => labelChip(label)),
    canEdit ? h('button', { class: 'kadd', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': labels.length ? t('projets.carte.etiquettes.modifier') : null, onClick: () => openCardLabelsSheet(card.id) },
      icon('plus'), labels.length ? null : t('projets.carte.etiquette')) : null,
    !labels.length && !canEdit ? h('span', { class: 'kfield__empty' }, t('projets.carte.aucuneEtiquette')) : null,
  ];
}

// Ligne de ce qu'on ne peut pas faire sur cette carte (jamais un bouton qui
// ne marche pas)
function readOnlyNote(card, project) {
  if (rightsOn(card, project).edit) return null;
  const text = project.role === 'reader' ? t('projets.carte.lectureSeule') : t('projets.carte.lireSeulement');
  return h('p', { class: 'note kc__readonly' }, icon('eye', 'icon--sm'), h('span', {}, text));
}

// « dans Publiés · DomoPi Articles · créée par Guillaume le 2 octobre »
function wherePhrase(card, project) {
  const column = (project.columns ?? []).find((c) => c.id === card.columnId);
  const date = formatDate(new Date(card.createdAt), { day: 'numeric', month: 'long' });
  return card.createdByName
    ? t('projets.carte.ou.par', { column: column?.name ?? '', project: project.name, name: card.createdByName, date })
    : t('projets.carte.ou', { column: column?.name ?? '', project: project.name, date });
}

// Un champ du téléphone (nom avec son icône, puis sa valeur)
const phoneField = (iconName, name, value) => h('div', { class: 'kfield' },
  h('span', { class: 'kfield__name' }, icon(iconName), name),
  h('div', { class: 'kfield__value' }, value));

// Personnes attribuées, lues par les lecteurs d'écran (nom du champ)
const peopleSpoken = (card, project) => {
  const names = assigneesOf(card, project).map((p) => p.displayName);
  return names.length ? t('projets.personnes.lu', { names: namesList(names) }) : t('projets.personnes');
};

// --- Téléphone : un écran entier ---
export function renderProjectCard(projectId, cardId, onLeave) {
  const found = () => cardOf(projectId, cardId);
  const canEdit = () => {
    const f = found();
    return Boolean(f) && rightsOn(f.card, f.project).edit;
  };
  const title = titlePart(() => found()?.card ?? null, canEdit, 'kc__title');
  const body = h('div', { class: 'kc' });
  const scroll = h('div', { class: 'scroll' }, body);
  const description = cardDescription({ cardId, getCard: () => found()?.card ?? null, canEdit, pc: false, scroll, onLeave });
  const head = h('div', { class: 'kc__head' });
  const fields = h('div', { class: 'group kfields' });
  const links = h('div', { class: 'kc__links' });
  const activity = cardActivity({ cardId, getFound: found, pc: false });
  onLeave(activity.stop);
  let built = false;
  const menuLabel = t('projets.plusActions');
  const back = () => goBack('project', { id: projectId });
  const menuButton = iconButton('more', menuLabel, () => {
    const f = found();
    if (!f) return;
    const items = cardMenuItems(f.card, f.project, { onGone: back });
    if (items.length) openMenu(items, { label: menuLabel, anchor: menuButton });
  });
  menuButton.setAttribute('aria-haspopup', 'menu');
  menuButton.setAttribute('aria-expanded', 'false');

  const draw = () => {
    if (!app.data.loaded) return;
    const f = found();
    if (!f) {
      built = false;
      menuButton.hidden = true;
      replace(body, cardGone(projectId));
      return;
    }
    const { card, project } = f;
    menuButton.hidden = !cardMenuItems(card, project).length;
    document.title = `${card.title} · Listo`;
    if (!title.editing()) title.show();
    replace(head, columnPart(card, project, 'kc__where'), readOnlyNote(card, project));
    replace(fields,
      phoneField('users', t('projets.personnes'), peopleValue(card, project)),
      phoneField('calendar', t('projets.echeance'), dueValue(card, project)),
      phoneField('tag', t('projets.etiquettes'), labelsValue(card, project)),
      project.priorityEnabled ? phoneField('flag', t('projets.priorite'), priorityValue(card, project)) : null);
    replace(links, linksPart(card, project));
    description.draw();
    activity.draw();
    scroll.classList.toggle('scroll--under-dock', !activity.compose.hidden);
    markCardRead(card);
    // La description reste le même élément (pas redessinée pendant la saisie)
    if (!built) {
      built = true;
      replace(body, title.el, head, fields, description.el, links, activity.el);
    }
  };
  const idle = drawWhenIdle(body, draw);
  onLeave(onDataChange(() => {
    if (!description.editing()) idle.request();
    else description.draw();
  }));
  onLeave(idle.stop);
  draw();
  refreshData({ quiet: true });

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('projets.retourProjet'), back),
      h('span', { class: 'grow' }),
      syncPill(() => refreshData({ full: true })),
      menuButton),
    scroll,
    // Écrire un commentaire (barre en verre ; cachée pendant la saisie de
    // la description)
    activity.compose,
    // La barre de mise en forme, en bas (sur le clavier), pendant la saisie
    // de la description
    description.tools.el);
}

// Notifications de la page Notifications qui ouvrent cette carte : lues
// (la carte est ouverte)
function markCardRead(card) {
  const ids = inboxRowsFor(app.data, { cardId: card.id });
  if (ids.length) actions.markInboxRead(ids);
}


// --- Ordinateur : la fenêtre au centre, par-dessus le projet ---
// Fermée par la croix ou Échap (pas par un changement d'écran) : retour au
// projet. Renvoie la fenêtre (close).
export function openProjectCardPanel(projectId, cardId) {
  const found = () => cardOf(projectId, cardId);
  const canEdit = () => {
    const f = found();
    return Boolean(f) && rightsOn(f.card, f.project).edit;
  };
  const hash = location.hash;
  const titleId = `carte-${Math.random().toString(36).slice(2, 8)}`;
  const title = titlePart(() => found()?.card ?? null, canEdit, 'kc__title');
  const main = h('div', { class: 'kdialog__main' });
  const side = h('div', { class: 'kdialog__side' });
  const leaving = [];
  const description = cardDescription({ cardId, getCard: () => found()?.card ?? null, canEdit, pc: true, scroll: main, onLeave: (fn) => leaving.push(fn) });
  const sub = h('p', { class: 'kdialog__sub' });
  const readonly = h('div', {});
  const links = h('div', { class: 'kc__links' });
  const activity = cardActivity({ cardId, getFound: found, pc: true });
  leaving.push(activity.stop);
  let built = false;
  let close = () => {};
  const closeButton = iconButton('close', t('projets.carte.fermer'), () => close(), 'kdialog__close');

  const draw = () => {
    const f = found();
    if (!f) {
      built = false;
      replace(main, app.data.loaded ? cardGone(projectId) : null);
      replace(side, closeButton);
      return;
    }
    const { card, project } = f;
    const can = rightsOn(card, project);
    if (!title.editing()) title.show();
    title.el.querySelector('h1')?.setAttribute('id', titleId);
    sub.textContent = wherePhrase(card, project);
    replace(readonly, readOnlyNote(card, project));
    replace(links, linksPart(card, project));
    description.draw();
    activity.draw();
    markCardRead(card);
    if (!built) {
      built = true;
      replace(main, title.el, sub, readonly, description.el, links, activity.el);
    }
    const section = (text) => h('h2', { class: 'kc__section' }, text);
    const actions = [
      can.move ? h('button', { class: 'kside', type: 'button', 'data-shortcut': 'm', 'aria-keyshortcuts': 'M', 'aria-haspopup': 'dialog', onClick: () => openMoveSheet(card.id) },
        icon('move'), t('projets.carte.deplacer'), keycap('M')) : null,
      can.duplicate ? h('button', { class: 'kside', type: 'button', onClick: () => duplicateCard(card) }, icon('copy'), t('projets.carte.dupliquer')) : null,
      (() => {
        const follow = followItem(card);
        return h('button', { class: 'kside', type: 'button', onClick: follow.onSelect }, icon(follow.icon), follow.label);
      })(),
      can.remove ? h('button', { class: 'kside kside--danger', type: 'button', onClick: () => deleteCard(card, () => close()) }, icon('trash'), t('projets.carte.supprimer')) : null,
    ].filter(Boolean);
    replace(side,
      closeButton,
      section(t('projets.carte.colonne')),
      columnPart(card, project, 'kside kside--col'),
      section(t('projets.personnes')),
      h('div', { class: 'kside-field', role: 'group', 'aria-label': peopleSpoken(card, project) }, peopleValue(card, project)),
      section(t('projets.etiquettes')),
      h('div', { class: 'kside-field' }, labelsValue(card, project)),
      section(t('projets.echeance')),
      h('div', { class: 'kside-field' }, dueValue(card, project)),
      project.priorityEnabled ? [section(t('projets.priorite')), h('div', { class: 'kside-field' }, priorityValue(card, project))] : null,
      actions.length ? [section(t('projets.carte.actionsTitre')), actions] : null);
  };

  // M : « Déplacer vers… » (raccourci à une touche, jamais pendant la saisie)
  const onKey = (event) => {
    if (event.key.toLowerCase() !== 'm' || !singleKeysOn() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    const f = found();
    if (f && rightsOn(f.card, f.project).move) {
      event.preventDefault();
      openMoveSheet(cardId);
    }
  };

  const stop = onDataChange(draw);
  const panel = openPanel(() => h('div', { class: 'kdialog', 'aria-labelledby': titleId, onKeydown: onKey }, main, side), {
    history: false, // l'adresse de la carte est déjà dans l'historique
    onClose: () => {
      stop();
      for (const fn of leaving) fn();
      // Fermée par la croix ou Échap : retour au projet
      setTimeout(() => {
        if (location.hash === hash) goBack('project', { id: projectId });
      }, 0);
    },
  });
  close = panel.close;
  draw();
  return panel;
}
