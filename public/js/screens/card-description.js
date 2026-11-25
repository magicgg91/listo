// Description d'une carte de projet (docs/cadrage-projets.md, étape 2,
// sections 4.3, 5.1 et 11.3 ; maquettes design/projets/captures/carte-1 et
// pc-carte-1), sur le téléphone (écran de la carte) et l'ordinateur
// (fenêtre de la carte).
//
// Même mise en forme que le texte d'une note, avec les mêmes morceaux
// (note-format.js : renderNoteText, applyFormat, insertLink… ; barre de
// mise en forme et feuille « Insérer un lien » : note-toolbar.js) :
// - hors saisie, le texte est affiché mis en forme, élément par élément
//   (textContent, jamais de HTML), liens http et https dans un nouvel
//   onglet (rel="noopener noreferrer") ; « 2/3 » au-dessus quand il y a des
//   cases (cases cochées sur cases) ;
// - toucher une case la coche ou la décoche SANS passer en saisie, par
//   l'opération card.task (le numéro de la case et son texte) : seule cette
//   case change, même si quelqu'un en coche une autre au même moment ;
// - toucher le texte ailleurs (ou Entrée) passe en saisie : le champ prend
//   sa place, curseur à l'endroit touché (geste fait pour écrire) ; la
//   barre de mise en forme apparaît pendant la saisie (téléphone : en bas,
//   sur le clavier ; ordinateur : en haut du texte) ; quitter le champ
//   réaffiche le texte mis en forme. Description vide : « + Ajouter une
//   description » (un seul chemin pour remplir un champ).
// - Enregistrement automatique, une seconde après la dernière frappe, en
//   quittant le champ, l'écran, ou quand l'application passe en
//   arrière-plan ; numéro de version : jamais d'écrasement. Description
//   changée entre-temps : la carte passe « À vérifier » (mon texte gardé sur
//   ce téléphone) et la feuille du choix s'ouvre : « Garder la mienne »,
//   « Prendre la leur », « Garder les deux » (la mienne ajoutée sous la
//   leur, après « Version de Guillaume, 25 nov. 21:04 »), « Décider plus
//   tard ».
// - Qui ne peut pas modifier la carte : le texte seulement (liens
//   cliquables, cases montrées sans être cochables).

import { h, icon, replace } from '../dom.js';
import { app, onDataChange } from '../app.js';
import { openSheet, confirmDialog } from '../ui.js';
import { t, formatDate, formatTime } from '../i18n.js';
import { renderNoteText, applyFormat, formatsAt, insertLink, linkAround, taskLines, taskCount, LINE_KINDS } from '../note-format.js';
import { CARD_DESCRIPTION_MAX } from '../projects.js';
import * as projectActions from '../project-actions.js';
import { noteToolbar, openLinkSheet, offsetAt, chosenRange } from './note-toolbar.js';

const SAVE_DELAY_MS = 1000;
const KEEP_CHOSEN_MS = 1000;

// « Version de Guillaume, 25 nov. 21:04 » : la ligne écrite avant ma
// version quand je garde les deux
function versionHeading(name, at) {
  const date = new Date(at);
  const when = Number.isNaN(date.getTime()) ? '' : `${formatDate(date, { day: 'numeric', month: 'short' })} ${formatTime(date, { twoDigits: true })}`;
  return t('projets.description.versionDe', { name: name || t('projets.description.moi'), when });
}

// La description d'une carte. getCard() : la carte (ou null) ; canEdit() :
// mon rôle permet-il de la modifier ; pc : ordinateur ; scroll : la zone
// qui défile (téléphone : l'endroit touché est remonté avant le clavier) ;
// onLeave : pour se retirer avec l'écran. Renvoie { el (titre de section
// et texte), tools (la barre, à poser par l'écran du téléphone en bas),
// draw }.
export function cardDescription({ cardId, getCard, canEdit, pc, scroll, onLeave }) {
  const kept = () => app.data.cardConflicts?.get(cardId) ?? null;
  let base = getCard()?.descriptionVersion ?? 1; // version sur laquelle le texte est écrit
  let text = kept()?.description ?? getCard()?.description ?? '';
  let dirty = false;
  let saving = false;
  let timer = null;
  let sheetShown = false;

  const count = h('span', { class: 'kcount' });
  const heading = h('h2', { class: 'kc__section' }, t('projets.description'), count);
  const view = h('div', { class: 'note-edit__body kc__text', tabindex: '0' });
  const input = h('textarea', {
    class: 'note-edit__body note-edit__body--input kc__text', maxlength: String(CARD_DESCRIPTION_MAX), 'data-fit-keyboard': '',
    'aria-label': t('projets.description'), placeholder: t('projets.description.vide'), hidden: true,
  });
  const add = h('button', { class: 'klink klink--add', type: 'button', onClick: () => edit(0) }, icon('plus'), t('projets.description.ajouter'));
  const none = h('p', { class: 'kfield__empty kc__none' }, t('projets.description.aucune'));
  const banner = h('p', { class: 'note kc__check', role: 'alert', hidden: true }, icon('alert'), h('span', {}, t('projets.description.aVerifier')));
  const box = h('div', { class: 'group kc__desc' }, view, input, add, none);
  const el = h('section', { class: 'kc__block', 'aria-label': t('projets.description') }, heading, banner, box);

  const fitInput = () => {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  };
  const editable = () => Boolean(getCard()) && canEdit();

  // --- Texte affiché ---
  let drawn = null;
  function drawView() {
    const card = getCard();
    const can = editable();
    const key = `${can}\n${text}`;
    if (key !== drawn) {
      drawn = key;
      replace(view, text ? renderNoteText(text, { h, icon, editable: can && !kept() }) : null);
    }
    view.setAttribute('role', can ? 'textbox' : 'document');
    view.setAttribute('aria-label', t('projets.description'));
    if (can) view.setAttribute('aria-multiline', 'true');
    else view.removeAttribute('aria-multiline');
    const writing = !input.hidden;
    view.hidden = writing || !text;
    add.hidden = writing || Boolean(text) || !can;
    none.hidden = writing || Boolean(text) || can;
    // « 2/3 » (et « tout est coché » en vert : coche ET nombres)
    const tasks = taskCount(text);
    count.hidden = !tasks.total;
    replace(count, tasks.total ? [icon('check', 'icon--sm'), `${tasks.done}/${tasks.total}`] : null);
    count.classList.toggle('kcount--all', tasks.total > 0 && tasks.done === tasks.total);
    count.setAttribute('aria-label', t('projets.cases.lu', { done: tasks.done, count: tasks.total }));
    banner.hidden = !kept() || !card;
  }

  // Passer en saisie, curseur à cet endroit (geste fait pour écrire)
  function edit(at, y = null) {
    if (!input.hidden || !editable() || kept()) return;
    input.value = text;
    input.hidden = false;
    drawView();
    fitInput();
    tools.el.hidden = false;
    if (!pc && y !== null && scroll) {
      const target = window.innerHeight * 0.3;
      if (y > target) scroll.scrollTop += y - target;
    }
    input.focus({ preventScroll: true });
    input.setSelectionRange(at, at);
  }
  view.addEventListener('click', (event) => {
    if (event.target.closest('a')) return; // un lien s'ouvre, sans passer en saisie
    const boxEl = event.target.closest('.nf-task__box');
    if (boxEl) {
      tick(boxEl);
      return;
    }
    if (chosenRange(view)) return; // texte en train d'être choisi
    edit(text ? offsetAt(view, event, text.length) : 0, event.clientY);
  });
  view.addEventListener('keydown', (event) => {
    if (event.target !== view || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    edit(text.length);
  });

  // Une case touchée : seulement elle (son numéro et son texte), par la
  // file d'attente ; la copie locale la coche tout de suite
  function tick(boxEl) {
    if (!editable() || kept() || dirty) return;
    const start = Number(boxEl.closest('[data-line]')?.dataset.line);
    const task = taskLines(text).find((line) => line.start === start);
    if (!task) return;
    projectActions.tickCardTask(cardId, { index: task.index, text: task.text, checked: !task.checked });
  }

  // Quitter la saisie : enregistrement, puis le texte mis en forme
  function leave() {
    if (input.hidden) return;
    save();
    input.hidden = true;
    tools.el.hidden = true;
    drawView();
  }
  input.addEventListener('blur', (event) => {
    if (tools.el.contains(event.relatedTarget)) return;
    leave();
  });
  input.addEventListener('input', () => {
    text = input.value;
    fitInput();
    changed();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // Échap : fin de la saisie (sans fermer la fenêtre de la carte)
    event.preventDefault();
    event.stopPropagation();
    input.blur();
  });

  // --- Barre de mise en forme (pendant la saisie) ---
  const tools = noteToolbar(pick);
  tools.el.classList.add(pc ? 'note-tools--top' : 'note-tools--dock');
  tools.el.hidden = true;
  if (pc) box.prepend(tools.el);
  tools.el.addEventListener('focusout', (event) => {
    if (event.relatedTarget === input || tools.el.contains(event.relatedTarget)) return;
    leave();
  });
  let chosen = null;
  let chosenLost = 0;
  const onSelection = () => {
    if (!input.hidden) {
      drawPressed();
      return;
    }
    const range = chosenRange(view);
    if (range) {
      chosen = range;
      chosenLost = 0;
    } else if (chosen && !chosenLost) chosenLost = Date.now();
  };
  document.addEventListener('selectionchange', onSelection);
  onLeave(() => document.removeEventListener('selectionchange', onSelection));
  for (const type of ['keyup', 'click', 'select']) input.addEventListener(type, () => drawPressed());
  const chosenNow = () => chosenRange(view) ?? (chosen && (!chosenLost || Date.now() - chosenLost < KEEP_CHOSEN_MS) ? chosen : null);
  function drawPressed() {
    if (tools.el.hidden) return;
    const at = input.selectionStart;
    tools.setActive(at === undefined || at === null ? new Set() : formatsAt(input.value, at));
  }
  function pick(kind) {
    if (!editable() || input.hidden) return;
    const range = [input.selectionStart, input.selectionEnd];
    chosen = null;
    if (kind === 'link') {
      openLink(range);
      return;
    }
    let source = input.value;
    if (LINE_KINDS.includes(kind) && range[0] === source.length && source !== '' && !source.endsWith('\n')) {
      source += '\n';
      range[0] = source.length;
      range[1] = source.length;
    }
    const out = applyFormat(source, range[0], range[1], kind);
    text = out.text;
    input.value = text;
    fitInput();
    if (document.activeElement !== input) input.focus({ preventScroll: true });
    input.setSelectionRange(out.start, out.end);
    changed();
    drawPressed();
  }
  // « Insérer un lien » sur la sélection, ou dans le lien déjà là
  function openLink(range) {
    const source = input.value;
    let [start, end] = range;
    let label = source.slice(start, end).includes('\n') ? '' : source.slice(start, end);
    let address = '';
    const around = linkAround(source, start, end);
    if (around) [start, end, label, address] = [around.start, around.end, around.text, around.href];
    openLinkSheet({
      label,
      address,
      onInsert: (linkText, linkAddress) => {
        if (!editable()) return;
        const current = input.hidden ? text : input.value;
        const [a, b] = current === source ? [start, end] : [current.length, current.length];
        const pad = a === b && a === current.length && current && !/\s$/.test(current) ? ' ' : '';
        const out = insertLink(current.slice(0, a) + pad + current.slice(a), a + pad.length, b + pad.length, linkText, linkAddress);
        if (!out) return;
        text = out.text;
        if (!input.hidden) {
          input.value = text;
          fitInput();
        }
        drawView();
        changed();
      },
    });
  }

  // --- Enregistrement automatique ---
  function changed() {
    if (!editable()) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  }
  async function save() {
    clearTimeout(timer);
    if (!dirty || saving) return;
    dirty = false;
    saving = true;
    try {
      const outcome = await projectActions.saveCardDescription(cardId, { description: input.hidden ? text : input.value, baseVersion: base });
      if (outcome === 'queued') base = getCard()?.descriptionVersion ?? base;
      if (outcome === 'conflict') openConflict();
    } finally {
      saving = false;
      if (dirty) changed();
    }
  }
  const saveNow = () => {
    if (dirty) save();
  };
  const onHidden = () => {
    if (document.visibilityState === 'hidden') saveNow();
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', saveNow);
  onLeave(() => {
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', saveNow);
    saveNow();
  });

  // --- Conflit : la feuille du choix ---
  function openConflict() {
    const card = getCard();
    const mine = kept();
    if (!card || !mine || sheetShown) return;
    sheetShown = true;
    const otherName = mine.byName ?? card.descriptionByName ?? '';
    const other = mine.byId ? mine.byId !== app.user?.id : !card.descriptionByMe;
    const choice = (iconName, title, sub, onPick) => h('button', { class: 'row', type: 'button', onClick: onPick },
      h('span', { class: 'row__icon' }, icon(iconName)),
      h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, title), h('span', { class: 'row__sub' }, sub)),
      icon('chev-r', 'icon--sm'));
    const done = () => {
      sheetShown = false;
      reload();
    };
    const sheet = openSheet({
      title: other ? t('projets.conflit.titre.autre', { name: otherName }) : t('projets.conflit.titre.moi'),
      sub: t('projets.conflit.texte'),
      content: [
        h('div', { class: 'group conflict' },
          choice('user', t('projets.conflit.mienne'), t('projets.conflit.mienne.texte'), async () => {
            sheet.close();
            await projectActions.keepMyCardDescription(cardId);
            done();
          }),
          choice('undo', t('projets.conflit.leur'), t('projets.conflit.leur.texte'), async () => {
            sheet.close();
            const ok = await confirmDialog({
              title: t('projets.conflit.leur.question'),
              text: t('projets.conflit.leur.confirmation'),
              confirmLabel: t('projets.conflit.leur.confirmer'),
              focusCancel: true,
            });
            sheetShown = false;
            if (!ok) return;
            projectActions.takeTheirCardDescription(cardId);
            reload();
          }),
          choice('copy', t('projets.conflit.deux'), t('projets.conflit.deux.texte'), async () => {
            sheet.close();
            await projectActions.keepBothCardDescriptions(cardId, versionHeading(app.user?.displayName, mine.at));
            done();
          })),
        h('button', { class: 'btn btn--ghost btn--block', type: 'button', onClick: () => {
          sheetShown = false;
          sheet.close();
        } }, t('projets.conflit.plusTard')),
      ],
    });
  }

  // Reprend la description de la carte (après un choix, ou une
  // modification arrivée sans frappe en cours)
  function reload() {
    const card = getCard();
    if (!card) return;
    base = card.descriptionVersion;
    text = kept()?.description ?? card.description ?? '';
    if (!input.hidden) {
      input.value = text;
      fitInput();
    }
    drawView();
  }

  // Changement de données (synchronisation, temps réel, case cochée)
  function draw() {
    const card = getCard();
    if (!card) return;
    if (kept()) {
      drawView();
      return;
    }
    // Quelqu'un (ou une case cochée) a changé la description : sans frappe
    // en cours, elle se met à jour sous mes yeux ; en pleine frappe, le
    // choix se fera au prochain enregistrement
    if (card.descriptionVersion !== base && !saving && !dirty && input.hidden) reload();
    else drawView();
  }
  onLeave(onDataChange(() => {
    if (kept() && !sheetShown) openConflict();
  }));
  draw();
  if (kept()) queueMicrotask(openConflict);

  return { el, tools, draw, editing: () => !input.hidden };
}
