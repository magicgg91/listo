// Commentaires et historique d'une carte ouverte (docs/cadrage-projets.md,
// étape 3, sections 4.3, 4.4, 5.6 et 5.7 ; maquettes
// design/projets/captures/carte-2, carte-3 et pc-carte-1).
//
// - Deux onglets (role="tablist") : « Commentaires · 2 » et « Historique ».
// - Commentaires : pastille, prénom, date (« il y a 2 h », « hier, 21:14 »,
//   « lun. 23 nov., 22:40 »), « modifié » ; texte simple (retours à la
//   ligne gardés ; adresses http et https cliquables, nouvel onglet,
//   rel="noopener noreferrer"), posé par textContent, jamais de HTML. Les
//   siens ont « Modifier » et « Supprimer » ; le propriétaire du projet a
//   « Supprimer » sur ceux des autres (modération, avec confirmation). Un
//   commentaire importé par un assistant IA (étape 5) : bulle en
//   pointillés, « importé par Guillaume », jamais relié à un compte.
// - Écrire (propriétaire, « Peut modifier », Contributeur ; jamais en
//   « Lecture seule ») : téléphone, dans la barre en verre en bas de
//   l'écran ; ordinateur, sous les commentaires. Jamais de curseur mis
//   tout seul : on touche le champ pour écrire.
// - Historique : en ligne seulement (chargé quand on ouvre l'onglet ;
//   hors ligne, une phrase le dit). Phrases faites ici, dans la langue de
//   l'écran, avec les valeurs choisies par le serveur (jamais un titre, une
//   description ni un commentaire), « (assistant IA) » quand l'action vient
//   d'une connexion MCP.
// - Tout passe par la file d'attente (hors ligne compris) ; le serveur
//   revérifie chaque droit.

import { h, icon, replace, avatar } from '../dom.js';
import { app, onDataChange } from '../app.js';
import { toast, confirmDialog, openSheet } from '../ui.js';
import { t, formatDate, formatTime } from '../i18n.js';
import { relativeTime, dueDateLabel, todayKey, addDays } from '../format.js';
import { timeLabel } from '../due-time.js';
import { cleanComment, cleanLinkUrl, commentRights, COMMENT_MAX } from '../projects.js';
import { cardCommentsOf } from '../project-store.js';
import * as projectActions from '../project-actions.js';
import { errorMessage } from '../api.js';
import { rightsOn } from './project.js';

// --- Dates ---

// « il y a 2 h » (aujourd'hui), « hier, 21:14 », « lun. 23 nov., 22:40 »
export function activityWhen(iso, now = Date.now()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const key = todayKey(date);
  const today = todayKey(new Date(now));
  if (key === today) return relativeTime(iso, now);
  const time = formatTime(date, { twoDigits: true });
  if (key === addDays(today, -1)) return t('projets.quand.hier', { time });
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = formatDate(date, sameYear ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return t('projets.quand.date', { day, time });
}

// --- Texte d'un commentaire : morceaux de texte et liens http/https ---
const URL_IN_TEXT = /https?:\/\/[^\s<>"]+/gi;
export function commentParts(text) {
  const parts = [];
  let last = 0;
  for (const match of String(text ?? '').matchAll(URL_IN_TEXT)) {
    // La ponctuation qui suit une adresse n'en fait pas partie
    const raw = match[0].replace(/[.,;:!?)\]»”'’]+$/u, '');
    const url = cleanLinkUrl(raw);
    if (!url) continue;
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: raw, url });
    last = match.index + raw.length;
  }
  if (last < String(text ?? '').length) parts.push({ text: String(text).slice(last) });
  return parts;
}
const commentText = (text) => h('p', { class: 'kcomment__text' },
  commentParts(text).map((part) => (part.url ? h('a', { href: part.url, target: '_blank', rel: 'noopener noreferrer' }, part.text) : part.text)));

// --- Historique : une phrase par ligne (valeurs du serveur) ---
export function historySentence(line) {
  const name = line.actorName ?? t('projets.personnes.ancien');
  const p = line.params ?? {};
  const person = p.person?.name ?? t('projets.personnes.ancien');
  let text;
  switch (line.type) {
    case 'create': text = p.column ? t('projets.historique.creee.dans', { name, column: p.column }) : t('projets.historique.creee', { name }); break;
    case 'duplicate': text = t('projets.historique.dupliquee', { name }); break;
    case 'move': text = p.from && p.to ? t('projets.historique.deplacee', { name, from: p.from, to: p.to }) : t('projets.historique.deplacee.court', { name }); break;
    case 'rename': text = t('projets.historique.renommee', { name }); break;
    case 'describe': text = t('projets.historique.description', { name }); break;
    case 'task': text = t(p.checked ? 'projets.historique.coche' : 'projets.historique.decoche', { name, text: p.text ?? '' }); break;
    case 'assign': text = t('projets.historique.attribuee', { name, person }); break;
    case 'unassign': text = t('projets.historique.retiree', { name, person }); break;
    case 'due':
      if (!p.date) text = t('projets.historique.echeance.retiree', { name });
      else {
        const day = dueDateLabel(p.date, todayKey());
        const when = p.time ? t('format.jourAHeure', { day, time: timeLabel(p.time) }) : day;
        text = t('projets.historique.echeance', { name, when });
      }
      break;
    case 'done': text = t('projets.historique.faite', { name }); break;
    case 'undone': text = t('projets.historique.plusFaite', { name }); break;
    case 'label': text = t('projets.historique.etiquette', { name, label: p.label ?? '' }); break;
    case 'unlabel': text = t('projets.historique.etiquette.retiree', { name, label: p.label ?? '' }); break;
    case 'link': text = t('projets.historique.lien', { name }); break;
    case 'unlink': text = t('projets.historique.lien.retire', { name }); break;
    case 'comment': text = t('projets.historique.commentaire', { name }); break;
    case 'delete': text = t('projets.historique.supprimee', { name }); break;
    case 'restore': text = t('projets.historique.restauree', { name }); break;
    default: text = t('projets.historique.modifiee', { name });
  }
  return line.ai ? t('projets.historique.ia', { text }) : text;
}

// --- Feuille « Modifier le commentaire » (le sien) ---
function openEditSheet(cardId, comment) {
  const input = h('textarea', { class: 'input kcomment__edit', rows: '5', maxlength: String(COMMENT_MAX), 'aria-label': t('projets.commentaire.texte') });
  input.value = comment.text;
  const error = h('p', { class: 'field__error', hidden: true });
  const form = h('form', { class: 'stack', novalidate: true },
    input, error,
    h('div', { class: 'dialog__actions' },
      h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, t('projets.annuler')),
      h('button', { class: 'btn btn--primary', type: 'submit' }, t('projets.enregistrer'))));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = cleanComment(input.value);
    if (!text) {
      error.textContent = t('projets.commentaire.invalide', { max: COMMENT_MAX });
      error.hidden = false;
      return;
    }
    sheet.close();
    if (text !== comment.text) projectActions.editComment(cardId, comment.id, text);
  });
  // (aucun curseur mis tout seul : on touche le texte pour le modifier)
  const sheet = openSheet({ title: t('projets.commentaire.modifier'), content: form, pc: 'modal', size: 'sm' });
  return sheet;
}

async function askDelete(cardId, comment) {
  const ok = await confirmDialog({
    title: t('projets.commentaire.supprimer.question'),
    text: comment.byMe ? t('projets.commentaire.supprimer.texte') : t('projets.commentaire.supprimer.autre', { name: comment.authorName ?? t('projets.personnes.ancien') }),
    confirmLabel: t('projets.commentaire.supprimer'),
  });
  if (!ok) return;
  await projectActions.deleteComment(cardId, comment.id);
  toast(t('projets.commentaire.supprime'), { low: true });
}

// Un commentaire (bulle)
function commentRow(cardId, comment, role) {
  const can = commentRights(comment, app.user?.id ?? null, role);
  const imported = Boolean(comment.importedAuthor);
  const who = imported ? comment.importedAuthor : (comment.authorName ?? t('projets.personnes.ancien'));
  const when = imported
    ? t('projets.commentaire.importe', { date: formatDate(new Date(comment.importedAt ?? comment.createdAt), { day: 'numeric', month: 'short' }), name: comment.importedByName ?? t('projets.personnes.ancien') })
    : activityWhen(comment.createdAt);
  return h('li', { class: `kcomment${imported ? ' kcomment--imported' : ''}`, 'data-comment': comment.id },
    avatar(who, { second: !comment.byMe || imported }),
    h('div', { class: 'kcomment__bubble' },
      h('div', { class: 'kcomment__who' }, who,
        h('span', { class: 'kcomment__when' }, when),
        comment.edited ? h('span', { class: 'kcomment__when' }, t('projets.commentaire.modifie')) : null),
      commentText(comment.text),
      can.edit || can.remove ? h('div', { class: 'kcomment__acts' },
        can.edit ? h('button', { type: 'button', 'aria-label': t('projets.commentaire.modifier.lu', { name: who }), onClick: () => openEditSheet(cardId, comment) }, t('projets.commentaire.modifierCourt')) : null,
        can.remove ? h('button', { type: 'button', 'aria-label': t('projets.commentaire.supprimer.lu', { name: who }), onClick: () => askDelete(cardId, comment) }, t('projets.commentaire.supprimer')) : null)
        : null));
}

// --- Le bloc entier ---
// getFound() : { card, project } ou null ; pc : ordinateur (champ sous les
// commentaires) ; sinon, compose : la barre en verre du téléphone, à
// poser en bas de l'écran par l'appelant. Renvoie { el, compose, draw }.
export function cardActivity({ cardId, getFound, pc }) {
  let tab = 'comments';
  let history = { state: 'idle', lines: [] };
  const ids = Math.random().toString(36).slice(2, 8);
  const commentsTab = h('button', { class: 'tab', type: 'button', role: 'tab', id: `kc-com-${ids}`, 'aria-controls': `kc-comp-${ids}`, onClick: () => select('comments') });
  const historyTab = h('button', { class: 'tab', type: 'button', role: 'tab', id: `kc-his-${ids}`, 'aria-controls': `kc-hisp-${ids}`, onClick: () => select('history') });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('projets.carte.activite') }, commentsTab, historyTab);
  // Flèches gauche et droite d'un onglet à l'autre (clavier)
  tabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    select(tab === 'comments' ? 'history' : 'comments');
    (tab === 'comments' ? commentsTab : historyTab).focus();
  });
  const commentsPanel = h('div', { class: 'kc__panel', role: 'tabpanel', id: `kc-comp-${ids}`, 'aria-labelledby': `kc-com-${ids}` });
  const historyPanel = h('div', { class: 'kc__panel', role: 'tabpanel', id: `kc-hisp-${ids}`, 'aria-labelledby': `kc-his-${ids}` });

  // Écrire : un champ et « Envoyer »
  const input = pc
    ? h('textarea', { class: 'input kcompose__input', rows: '2', maxlength: String(COMMENT_MAX), placeholder: t('projets.commentaire.ecrire'), 'aria-label': t('projets.commentaire.ecrire.lu') })
    : h('input', { class: 'addbar__input', type: 'text', autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'send', maxlength: String(COMMENT_MAX), placeholder: t('projets.commentaire.ecrire'), 'aria-label': t('projets.commentaire.ecrire.lu') });
  const send = async () => {
    const found = getFound();
    if (!found || !rightsOn(found.card, found.project).comment) return;
    const text = cleanComment(input.value);
    if (!text) {
      if (input.value.trim()) toast(t('projets.commentaire.invalide', { max: COMMENT_MAX }));
      return;
    }
    input.value = '';
    await projectActions.addComment(cardId, text);
    if (tab !== 'comments') select('comments');
  };
  const sendButton = h('button', { class: 'btn btn--primary btn--icon', type: 'submit', 'aria-label': t('projets.commentaire.envoyer') }, icon('arrow-up'));
  const form = h('form', { class: pc ? 'kcompose__form' : 'addbar__row', novalidate: true, onSubmit: (event) => {
    event.preventDefault();
    send();
  } }, pc ? [input, h('button', { class: 'btn btn--primary btn--sm', type: 'submit' }, t('projets.commentaire.envoyerCourt'))] : [h('label', { class: 'addbar__field' }, input), sendButton]);
  // Ordinateur : Ctrl+Entrée (ou ⌘+Entrée) envoie ; Entrée seule va à la ligne
  if (pc) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        send();
      }
    });
  }
  const compose = pc
    ? h('div', { class: 'kcompose' }, avatar(app.user?.displayName ?? ''), form)
    : h('div', { class: 'addbar addbar--glass glass kc__compose' }, form);

  const el = h('section', { class: 'kc__block kc__activity', 'aria-label': t('projets.carte.activite') }, tabs, commentsPanel, historyPanel);

  function select(next) {
    tab = next;
    if (tab === 'history' && history.state !== 'loading') loadHistory();
    draw();
  }

  async function loadHistory() {
    const found = getFound();
    if (!found) return;
    if (!navigator.onLine) {
      history = { state: 'offline', lines: history.lines };
      draw();
      return;
    }
    lastStamp = stampOf(found);
    history = { state: 'loading', lines: history.lines };
    draw();
    try {
      history = { state: 'ready', lines: await projectActions.loadCardHistory(found.project.id, cardId) };
    } catch (error) {
      history = { state: 'error', lines: [], message: errorMessage(error) };
    }
    draw();
  }

  function drawHistory() {
    if (history.state === 'offline') return h('p', { class: 'kfield__empty kc__none' }, t('projets.historique.horsLigne'));
    if (history.state === 'error') return h('p', { class: 'kfield__empty kc__none' }, history.message);
    if (history.state === 'loading' && !history.lines.length) return h('p', { class: 'kfield__empty kc__none' }, t('projets.historique.chargement'));
    if (!history.lines.length) return h('p', { class: 'kfield__empty kc__none' }, t('projets.historique.vide'));
    return h('ol', { class: 'khist' }, history.lines.map((line) => h('li', { class: 'khist__row' },
      avatar(line.actorName ?? '?', { second: !line.byMe }),
      h('span', { class: 'khist__text' }, historySentence(line), h('span', { class: 'khist__when' }, activityWhen(line.at))))));
  }

  function draw() {
    const found = getFound();
    if (!found) return;
    const { card, project } = found;
    const comments = cardCommentsOf(app.data, card.id);
    commentsTab.textContent = comments.length ? t('projets.commentaires.nombre', { count: comments.length }) : t('projets.commentaires');
    commentsTab.setAttribute('aria-label', t('projets.commentaires.lu', { count: comments.length }));
    historyTab.textContent = t('projets.historique');
    commentsTab.setAttribute('aria-selected', String(tab === 'comments'));
    historyTab.setAttribute('aria-selected', String(tab === 'history'));
    commentsTab.tabIndex = tab === 'comments' ? 0 : -1;
    historyTab.tabIndex = tab === 'history' ? 0 : -1;
    commentsPanel.hidden = tab !== 'comments';
    historyPanel.hidden = tab !== 'history';
    const canWrite = rightsOn(card, project).comment;
    compose.hidden = !canWrite;
    if (tab === 'comments') {
      replace(commentsPanel,
        comments.length
          ? h('ol', { class: 'kcomments' }, comments.map((comment) => commentRow(cardId, comment, project.role)))
          : h('p', { class: 'kfield__empty kc__none' }, t(canWrite ? 'projets.commentaires.aucun' : 'projets.commentaires.aucun.lecture')),
        pc && canWrite ? compose : null);
    } else replace(historyPanel, drawHistory());
  }

  // Commentaires et réglages changés ailleurs : redessinés ; l'historique
  // ouvert est relu (il change avec la carte)
  // (empreinte : dernière modification de la carte et nombre de ses commentaires)
  const stampOf = (found) => `${found.card.updatedAt}|${cardCommentsOf(app.data, found.card.id).length}`;
  let lastStamp = '';
  const stop = onDataChange(() => {
    const found = getFound();
    if (tab === 'history' && found && history.state !== 'loading' && stampOf(found) !== lastStamp) loadHistory();
  });

  return { el, compose, draw, stop, typing: () => document.activeElement === input };
}
