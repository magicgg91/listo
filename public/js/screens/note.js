// Écran d'une note (#/notes/<id>, et #/notes/nouvelle pour une note pas
// encore enregistrée ; étape 2 du cadrage, maquettes design/accueil-notes
// note-1 et note-2, sans catégories : abandonnées le 23 novembre 2026).
// Sur ordinateur, la note ouverte est seule dans la colonne, comme une
// liste ouverte (décision du 24 novembre 2026) : « Retour aux notes » à
// gauche de sa barre, Échap y ramène aussi (shortcuts.js).
//
// - Titre puis texte, sans cadre. Aucun curseur mis tout seul à l'ouverture
//   d'une note existante ; pour une nouvelle note (« + », « Nouvelle note »,
//   touche N), le curseur va dans le texte : le geste a pour but d'écrire.
// - Mise en forme (24 novembre 2026, public/js/note-format.js) : le texte
//   garde ses marques (« **gras** », « - [ ] tâche »…), visibles pendant la
//   saisie (un champ de texte simple). Hors saisie, il est affiché mis en
//   forme, élément par élément (renderNoteText : textContent, jamais de
//   HTML), avec ses liens http et https (nouvel onglet, rel="noopener
//   noreferrer"). Toucher une case la coche ou la décoche (propriétaire et
//   « Peut modifier ») : la ligne change dans le texte, qui s'enregistre
//   comme une frappe. Toucher le texte ailleurs que sur un lien ou une case
//   (ou Entrée au clavier) passe en saisie : le champ de texte prend sa
//   place, curseur à l'endroit touché (geste fait pour écrire). Quitter le
//   champ réaffiche le texte mis en forme.
// - Barre de mise en forme (screens/note-toolbar.js), pour qui peut
//   modifier la note : téléphone, en bas de l'écran, toujours là, et posée
//   sur le clavier quand il est ouvert (la hauteur de l'application suit le
//   clavier : app-height.js, data-fit-keyboard) ; ordinateur, en haut du
//   texte. Un bouton agit sur la sélection du champ pendant la saisie, ou
//   sur le texte choisi dans l'affichage mis en forme (sans clavier : les
//   positions du texte sont sur les éléments affichés). Sans rien de
//   choisi hors saisie, il passe en saisie à la fin du texte et s'y
//   applique (geste fait pour écrire). Le changement s'enregistre comme une
//   frappe (même chemin : version, file hors ligne, conflits).
// - Enregistrement automatique : une seconde après la dernière frappe, en
//   quittant l'écran, et quand l'application passe en arrière-plan. Mention
//   « Enregistré », « Enregistrement… », « Hors ligne · enregistrée sur ce
//   téléphone », ou « À vérifier ».
// - Deux enregistrements sur la même version (deux appareils ; deux
//   personnes à l'étape 3) : jamais d'écrasement (server/notes.js). Une
//   modification arrivée pendant que j'écris : bandeau. Un enregistrement
//   refusé : la feuille du choix (Garder la mienne, Prendre la leur, Garder
//   les deux, Décider plus tard) ; mon texte reste sur ce téléphone.
// - Note partagée (étape 3) : bouton « Partager » (propriétaire) ou
//   « Personnes » (les autres) dans la barre, avec les pastilles des
//   personnes (téléphone : icône et pastilles, le mot dans le nom lu ;
//   ordinateur : le mot écrit). Il ouvre le choix « Partager » (personnes
//   ou lien temporaire, share-panel.js, 24 novembre 2026) ou, pour les
//   autres, la liste des personnes en lecture. « Lecture seule » : titre et texte non
//   modifiables (les liens restent cliquables), épingle permise ; la note se
//   met à jour en direct. Ouvrir une note la marque « lue » (Nouveautés),
//   sur tous mes appareils. Bas de la note : « Modifiée par Léa · il y a
//   5 min ».
// - Étiquettes (24 novembre 2026, screens/note-labels.js) : sous le titre,
//   les étiquettes de la note et « + Étiquette » (propriétaire et « Peut
//   modifier » ; « Lecture seule » : les étiquettes seulement). Une note
//   sans étiquette n'a pas cette rangée : la première se pose par le menu ⋮,
//   « Étiquettes ».

import { h, icon, iconButton, replace, avatar } from '../dom.js';
import { navigate, goBack } from '../router.js';
import { dateTimeLabel, relativeTime, namesList } from '../format.js';
import { app, onDataChange, isDesktop } from '../app.js';
import { openMenu, openSheet, confirmDialog, toast, onSyncChange, currentSyncState, offlineBanner } from '../ui.js';
import { uuid } from '../api.js';
import { noteTitle, NOTE_TITLE_MAX, NOTE_BODY_MAX } from '../notes.js';
import { renderNoteText, sourceOffset, domPoint, applyFormat, formatsAt, insertLink, linkAround, toggleTask, LINE_KINDS } from '../note-format.js';
import * as actions from '../actions.js';
import { t } from '../i18n.js';
import { noteMenuItems, titleOf } from './notes.js';
import { canEditNote, isNoteOwner, notePeople } from '../store.js';
import { openNoteShare } from './share-panel.js';
import { noteLabelsSlot, drawNoteLabels } from './note-labels.js';
import { noteToolbar, openLinkSheet } from './note-toolbar.js';

const SAVE_DELAY_MS = 1000;

// Écran d'une note (noteId null : nouvelle note), sur le téléphone comme
// sur l'ordinateur
export function renderNote(noteId, onLeave) {
  return noteEditor(noteId, onLeave, { pc: isDesktop() });
}

// Position du curseur dans le texte (marques comprises), à l'endroit
// touché du texte affiché, ou la fin du texte si le navigateur ne sait pas
// le dire
function offsetAt(view, event, length) {
  const point = document.caretPositionFromPoint?.(event.clientX, event.clientY);
  const range = point ? null : document.caretRangeFromPoint?.(event.clientX, event.clientY);
  const node = point?.offsetNode ?? range?.startContainer;
  const offset = point?.offset ?? range?.startOffset;
  if (!node || !view.contains(node)) return length;
  return Math.min(length, sourceOffset(node, offset) ?? length);
}

// Texte choisi dans le texte affiché (sélection sans clavier) : [début,
// fin] dans le texte, marques comprises, ou null
function chosenRange(view) {
  const selection = document.getSelection?.();
  if (!selection || selection.isCollapsed || !view.contains(selection.anchorNode) || !view.contains(selection.focusNode)) return null;
  const a = sourceOffset(selection.anchorNode, selection.anchorOffset);
  const b = sourceOffset(selection.focusNode, selection.focusOffset);
  if (a === null || b === null || a === b) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

// L'éditeur (téléphone : tout l'écran ; ordinateur : toute la colonne)
function noteEditor(initialId, onLeave, { pc }) {
  let noteId = initialId;
  const isNew = !initialId;
  const note = () => (noteId ? app.data.notes.get(noteId) : null);
  const kept = () => (noteId ? app.data.noteConflicts.get(noteId) : null);
  const start = kept() ?? note();
  let base = note()?.version ?? 0;  // version sur laquelle le texte est écrit
  let dirty = false;                // frappes pas encore enregistrées
  let saving = false;
  let timer = null;
  let sheetShown = false;           // feuille du choix déjà montrée ici
  let body = start?.body ?? '';

  // --- Champs ---
  // Titre lu par les lecteurs d'écran (et titre de l'onglet) : celui de la note
  const heading = h('h1', { class: 'visually-hidden' });
  const titleInput = h('input', {
    class: 'note-edit__title', type: 'text', maxlength: String(NOTE_TITLE_MAX), autocomplete: 'off', enterkeyhint: 'next', 'data-fit-keyboard': '',
    'aria-label': t('notes.champ.titre'), placeholder: t('notes.champ.titre'), value: start?.title ?? '',
  });
  // Texte affiché (avec ses liens) ou champ de saisie
  const view = h('div', { class: 'note-edit__body', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('notes.champ.texte'), tabindex: '0' });
  const input = h('textarea', {
    class: 'note-edit__body note-edit__body--input', maxlength: String(NOTE_BODY_MAX), 'data-fit-keyboard': '',
    'aria-label': t('notes.champ.texte'), placeholder: t('notes.champ.texte.vide'), hidden: true,
  });
  const fitInput = () => {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  };
  // Lecture seule (droit « Lecture seule ») : ni saisie, ni enregistrement
  const readOnly = () => Boolean(note()) && !canEditNote(note());
  // Texte affiché, mis en forme élément par élément (textContent, jamais de
  // HTML). Redessiné seulement s'il a changé : un texte choisi (sélection)
  // reste choisi quand le reste de l'écran se met à jour.
  let drawn = null;
  const drawView = () => {
    const key = `${readOnly()}\n${body}`;
    if (key === drawn) return;
    drawn = key;
    if (!body) {
      replace(view, h('span', { class: 'note-edit__placeholder' }, t('notes.champ.texte.vide')));
      return;
    }
    replace(view, renderNoteText(body, { h, icon, editable: !readOnly() }));
  };
  // Passer en saisie, curseur à cet endroit (geste fait pour écrire).
  // Téléphone : avant d'ouvrir le clavier, l'endroit touché (y, position
  // à l'écran) est remonté dans le tiers haut de l'écran : le curseur est
  // alors au-dessus du clavier, l'iPhone ne fait pas remonter toute la page
  // et le haut de l'écran ne saute pas (essai sur iPhone, 23 novembre 2026)
  const edit = (at, y = null) => {
    if (!input.hidden || readOnly()) return;
    input.value = body;
    view.hidden = true;
    input.hidden = false;
    fitInput();
    if (!pc) {
      fields.classList.add('note-edit--writing');
      const target = window.innerHeight * 0.3;
      if (y !== null && y > target) scroll.scrollTop += y - target;
    }
    input.focus({ preventScroll: true });
    input.setSelectionRange(at, at);
  };
  view.addEventListener('click', (event) => {
    if (event.target.closest('a')) return; // un lien s'ouvre, sans passer en saisie
    const box = event.target.closest('.nf-task__box');
    if (box) {
      tick(box);
      return;
    }
    // Texte en train d'être choisi (sélection) : pas de saisie
    if (chosenRange(view)) return;
    edit(body ? offsetAt(view, event, body.length) : 0, event.clientY);
  });
  view.addEventListener('keydown', (event) => {
    if (event.target !== view) return; // une case ou un lien du texte : leur propre touche
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    edit(body.length);
  });

  // Une case touchée (propriétaire, « Peut modifier ») : « - [ ] » ↔
  // « - [x] » dans sa ligne, puis enregistrement comme une frappe. Le texte
  // garde sa longueur : la case est mise à jour sur place (le focus reste).
  function tick(box) {
    if (readOnly()) return;
    const line = box.closest('[data-line]');
    const next = toggleTask(body, Number(line?.dataset.line));
    if (next === body) return;
    body = next;
    drawn = `${readOnly()}\n${body}`;
    const on = box.getAttribute('aria-checked') !== 'true';
    box.setAttribute('aria-checked', String(on));
    box.classList.toggle('is-on', on);
    line.classList.toggle('is-done', on);
    replace(box, on ? icon('check') : null);
    changed();
  }

  // Quitter la saisie : enregistrement, puis le texte mis en forme
  const leave = () => {
    if (input.hidden) return;
    save();
    fields.classList.remove('note-edit--writing');
    view.hidden = false;
    input.hidden = true;
    drawView();
    drawPressed();
  };
  // Le champ perd le curseur vers la barre (Tab au clavier) : la saisie
  // continue, la barre agira sur la sélection du champ
  input.addEventListener('blur', (event) => {
    if (tools.el.contains(event.relatedTarget)) return;
    leave();
  });
  input.addEventListener('input', () => {
    body = input.value;
    fitInput();
    changed();
  });

  // --- Barre de mise en forme ---
  const tools = noteToolbar(pick);
  tools.el.classList.add(pc ? 'note-tools--top' : 'note-tools--dock');
  // Sortie de la barre au clavier vers autre chose que le texte : fin de la saisie
  tools.el.addEventListener('focusout', (event) => {
    if (event.relatedTarget === input || tools.el.contains(event.relatedTarget)) return;
    leave();
  });
  // Dernier texte choisi dans l'affichage : gardé un instant après sa
  // disparition (sur le téléphone, toucher un bouton peut l'effacer juste
  // avant que le bouton agisse)
  let chosen = null;
  let chosenLost = 0;
  const KEEP_CHOSEN_MS = 1000;
  const onSelection = () => {
    if (!input.hidden) {
      drawPressed();
      return;
    }
    const range = chosenRange(view);
    if (range) chosen = range;
    else if (chosen && !chosenLost) chosenLost = Date.now();
    if (range) chosenLost = 0;
    drawPressed();
  };
  document.addEventListener('selectionchange', onSelection);
  onLeave(() => document.removeEventListener('selectionchange', onSelection));
  for (const type of ['keyup', 'click', 'select']) input.addEventListener(type, () => drawPressed());

  // Texte choisi dans l'affichage, ou null
  const chosenNow = () => chosenRange(view) ?? (chosen && (!chosenLost || Date.now() - chosenLost < KEEP_CHOSEN_MS) ? chosen : null);

  // Boutons « enfoncés » : la mise en forme à l'endroit du curseur
  function drawPressed() {
    if (tools.el.hidden) return;
    const at = input.hidden ? chosenNow()?.[0] : input.selectionStart;
    tools.setActive(at === undefined || at === null ? new Set() : formatsAt(input.hidden ? body : input.value, at));
  }

  // Un bouton de la barre
  function pick(kind) {
    if (readOnly()) return;
    let typing = !input.hidden;
    let range = typing ? [input.selectionStart, input.selectionEnd] : chosenNow();
    chosen = null;
    if (kind === 'link') {
      openLink(range);
      return;
    }
    if (!typing && !range) {
      // Rien de choisi hors saisie : saisie à la fin du texte ; une marque
      // de ligne commence une nouvelle ligne
      edit(body.length);
      if (input.hidden) return;
      if (LINE_KINDS.includes(kind) && body !== '' && !body.endsWith('\n')) input.value += '\n';
      typing = true;
      range = [input.value.length, input.value.length];
    }
    const out = applyFormat(typing ? input.value : body, range[0], range[1], kind);
    body = out.text;
    if (typing) {
      input.value = body;
      fitInput();
      if (document.activeElement !== input) input.focus({ preventScroll: true });
      input.setSelectionRange(out.start, out.end);
    } else {
      drawView();
      // Le texte mis en forme reste choisi : on peut enchaîner un autre bouton
      selectInView(out.start, out.end);
    }
    changed();
    drawPressed();
  }

  // Choisit à nouveau, dans l'affichage, le texte [start, end] (après un
  // bouton de la barre hors saisie : le dessin a effacé la sélection)
  function selectInView(start, end) {
    if (end <= start) return;
    const a = domPoint(view, start, 'start');
    const b = domPoint(view, end, 'end');
    const selection = document.getSelection?.();
    if (!a || !b || !selection) return;
    const range = document.createRange();
    range.setStart(a[0], a[1]);
    range.setEnd(b[0], b[1]);
    selection.removeAllRanges();
    selection.addRange(range);
    chosen = [start, end];
    chosenLost = 0;
  }

  // « Insérer un lien » : sur la sélection (son texte prérempli), sinon à
  // la fin du texte ; dans un lien déjà là, ce lien (texte et adresse
  // préremplis)
  function openLink(range) {
    const source = input.hidden ? body : input.value;
    let [start, end] = range ?? [source.length, source.length];
    let label = source.slice(start, end).includes('\n') ? '' : source.slice(start, end);
    let address = '';
    // Dans un lien déjà là : il est remplacé en entier (jamais un lien dans un lien)
    const around = range ? linkAround(source, start, end) : null;
    if (around) [start, end, label, address] = [around.start, around.end, around.text, around.href];
    openLinkSheet({
      label,
      address,
      onInsert: (text, address) => {
        if (readOnly()) return;
        const current = input.hidden ? body : input.value;
        // Le texte a changé pendant que la feuille était ouverte : à la fin
        const [a, b] = current === source ? [start, end] : [current.length, current.length];
        const pad = a === b && a === current.length && current && !/\s$/.test(current) ? ' ' : '';
        const out = insertLink(current.slice(0, a) + pad + current.slice(a), a + pad.length, b + pad.length, text, address);
        if (!out) return;
        body = out.text;
        if (!input.hidden) {
          input.value = body;
          fitInput();
        }
        drawView();
        changed();
      },
    });
  }
  // Étiquettes de la note, sous le titre (cachées s'il n'y en a aucune)
  const labelsRow = noteLabelsSlot();
  titleInput.addEventListener('input', changed);
  titleInput.addEventListener('blur', () => save());

  // --- Enregistrement automatique ---
  function changed() {
    if (readOnly()) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
    drawStatus();
  }

  async function save() {
    clearTimeout(timer);
    if (!dirty || saving) return;
    const title = titleInput.value;
    const text = input.hidden ? body : input.value;
    dirty = false;
    saving = true;
    try {
      if (!noteId) {
        // Nouvelle note : créée au premier texte (rien n'est créé pour une page restée vide)
        if (!title.trim() && !text.trim()) return;
        noteId = uuid();
        await actions.createNote({ noteId, title, body: text });
        base = note()?.version ?? 1;
        return;
      }
      const outcome = await actions.saveNote(noteId, { title, body: text, baseVersion: base });
      if (outcome === 'queued') base = note()?.version ?? base;
      if (outcome === 'conflict') openConflict();
    } finally {
      saving = false;
      if (dirty) changed(); // frappes arrivées pendant l'enregistrement
      else draw();
    }
  }

  const saveNow = () => {
    if (dirty) save();
  };
  const onHidden = () => {
    if (document.visibilityState === 'hidden') saveNow();
    // Retour au premier plan : ce qui est arrivé entre-temps est lu
    else if (note() && !note().deletedAt) actions.markNoteSeen(noteId);
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', saveNow);
  onLeave(() => {
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', saveNow);
    saveNow();
  });

  // --- Mention d'état (pastille dans la barre du haut, comme « À jour »
  // ailleurs ; décision du 23 novembre 2026), bandeau, pied ---
  const status = h('p', { class: 'sync note-status', role: 'status', hidden: true });
  const banner = h('div', { class: 'note note-banner', role: 'alert', hidden: true });
  const foot = h('p', { class: 'note-foot' });

  // [classe, icône, texte court affiché, texte complet lu] ; sur le
  // téléphone la pastille montre le texte court (place de la barre du
  // haut), les lecteurs d'écran lisent la phrase complète
  function drawStatus() {
    let state;
    if (kept()) state = ['note-status--check', 'alert', t('notes.aVerifier'), t(pc ? 'notes.statut.aVerifier.pc' : 'notes.statut.aVerifier')];
    else if (readOnly()) state = ['', 'eye', t('notes.statut.lectureSeule'), t('notes.statut.lectureSeule')];
    else if (dirty || saving || (noteId && actions.notePending(noteId))) {
      state = currentSyncState() === 'off' && !dirty
        ? ['sync--off', 'cloud-off', t('notes.statut.horsLigne.court'), t(pc ? 'notes.statut.horsLigne.pc' : 'notes.statut.horsLigne')]
        : ['sync--busy', 'sync', t('notes.statut.enCours'), t('notes.statut.enCours')];
    } else if (noteId && note() && !note().deletedAt) state = ['sync--ok', 'check', t('notes.statut.enregistre'), t('notes.statut.enregistre')];
    // (note introuvable ou supprimée : aucune mention, seulement « Note introuvable »)
    else state = null;
    status.className = `sync note-status ${state?.[0] ?? ''}`.trim();
    status.hidden = !state;
    // Ordinateur : la phrase complète tient dans la barre de la note
    const shown = state ? (pc ? state[3] : state[2]) : '';
    replace(status, state ? [
      icon(state[1], 'icon--sm'),
      h('span', { class: 'sync__text', 'aria-hidden': shown === state[3] ? null : 'true' }, shown),
      shown === state[3] ? null : h('span', { class: 'visually-hidden' }, state[3]),
    ] : null);
  }

  // Qui a écrit la version actuelle : « Léa », ou moi (sur un autre appareil)
  const byOther = (n) => n.updatedBy !== null && n.updatedBy !== app.user?.id;

  function drawBanner(show) {
    const n = note();
    banner.hidden = !show || !n;
    if (banner.hidden) return;
    replace(banner, icon('users'), h('p', { class: 'note-banner__text' },
      h('strong', {}, byOther(n) ? t('notes.bandeau.autre', { name: n.updatedByName ?? '' }) : t('notes.bandeau.moi')),
      t('notes.bandeau.texte')));
  }

  function drawFoot() {
    const n = note();
    foot.hidden = !n;
    if (!n) return;
    foot.textContent = byOther(n)
      ? t('notes.pied.autre', { name: n.updatedByName ?? '', when: relativeTime(n.updatedAt) })
      : t('notes.pied.moi', { date: dateTimeLabel(n.updatedAt) });
  }

  // --- Barre : retour, menu (Épingler, Dupliquer, Supprimer) ; ordinateur : épingle ---
  // Retour : à l'écran précédent (les cartes des notes, d'où la note a été
  // ouverte), sinon à l'écran Notes
  const back = () => goBack('notes');
  const afterDelete = () => back();
  const menuButton = iconButton('more', t('notes.plusActions'), () => {
    const n = note();
    if (!n) return;
    // Menu nommé d'après la note (« Actions de Vacances »), comme celui de
    // sa carte : les libellés courts gardent leur contexte
    openMenu(noteMenuItems(n, { onDeleted: afterDelete, withPin: !pc, withPeople: false }), { label: t('notes.carte.actions', { name: titleOf(n) }), anchor: menuButton });
  });
  menuButton.setAttribute('aria-haspopup', 'menu');
  menuButton.setAttribute('aria-expanded', 'false');
  const pinButton = pc ? h('button', { class: 'icon-btn', type: 'button', onClick: () => {
    const n = note();
    if (n) actions.pinNote(n.id, !app.data.pinnedNotes.has(n.id));
  } }) : null;

  // « Partager » (propriétaire : le choix) ou « Personnes » (les autres, note partagée)
  const peopleButton = h('button', {
    class: `btn btn--sm btn--secondary note-people`, type: 'button', 'aria-haspopup': 'dialog', hidden: true,
    onClick: () => { if (note()) openNoteShare(noteId); },
  });
  function drawPeople(n) {
    const people = n ? notePeople(n) : [];
    const owner = Boolean(n) && isNoteOwner(n);
    peopleButton.hidden = !n || (!owner && !people.length);
    if (peopleButton.hidden) return;
    const names = namesList(people.map((m) => m.displayName));
    const word = owner ? t('notes.personnes.partager') : t('notes.personnes.voir');
    peopleButton.setAttribute('aria-label', owner
      ? (people.length ? t('notes.personnes.lu.partager', { names }) : t('notes.personnes.lu.partager.seul'))
      : t('notes.personnes.lu.voir', { names }));
    replace(peopleButton, icon('users', 'icon--sm'), pc ? word : null,
      people.length ? h('span', { class: 'avatars', 'aria-hidden': 'true' }, people.slice(0, 3).map((m, i) => avatar(m.displayName, { second: i > 0 }))) : null);
  }

  function drawBar() {
    const n = note();
    drawPeople(n);
    titleInput.readOnly = readOnly();
    view.setAttribute('role', readOnly() ? 'document' : 'textbox');
    if (readOnly()) view.removeAttribute('aria-multiline');
    else view.setAttribute('aria-multiline', 'true');
    menuButton.hidden = !n;
    // Barre de mise en forme : pour qui peut modifier la note (pas en
    // « Lecture seule », pas pour une note supprimée)
    tools.el.hidden = readOnly() || (!isNew && (!n || Boolean(n.deletedAt)));
    if (!pinButton) return;
    pinButton.hidden = !n;
    const pinned = Boolean(n) && app.data.pinnedNotes.has(n.id);
    pinButton.setAttribute('aria-pressed', String(pinned));
    pinButton.setAttribute('aria-label', pinned ? t('notes.menu.desepingler') : t('notes.menu.epingler'));
    replace(pinButton, icon(pinned ? 'pin' : 'pin-off'));
  }

  // --- Conflit : la feuille du choix ---
  function openConflict() {
    const n = note();
    const mine = kept();
    if (!n || !mine || sheetShown) return;
    sheetShown = true;
    // Qui a écrit la version qui a gagné : d'après le refus du serveur (gardé
    // avec mon texte), sinon d'après la note reçue
    const other = mine.byId ? mine.byId !== app.user?.id : byOther(n);
    const otherName = mine.byName ?? n.updatedByName ?? '';
    const copyName = t('format.copie', { name: noteTitle(mine) || t('notes.sansTitre') });
    const choice = (iconName, title, sub, onPick) => h('button', { class: 'row', type: 'button', onClick: onPick },
      h('span', { class: 'row__icon' }, icon(iconName)),
      h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, title), h('span', { class: 'row__sub' }, sub)),
      icon('chev-r', 'icon--sm'));
    const sheet = openSheet({
      title: other ? t('notes.conflit.titre.autre', { name: otherName }) : t('notes.conflit.titre.moi'),
      sub: t('notes.conflit.texte'),
      content: [
        h('div', { class: 'group conflict' },
          choice('user', t('notes.conflit.mienne'), t('notes.conflit.mienne.texte'), async () => {
            sheet.close();
            await actions.keepMyNote(noteId);
            base = note()?.version ?? base;
            sheetShown = false;
            draw();
          }),
          choice('undo', t('notes.conflit.leur'), t('notes.conflit.leur.texte'), async () => {
            sheet.close();
            const ok = await confirmDialog({
              title: t('notes.conflit.leur.question'),
              text: t('notes.conflit.leur.confirmation'),
              confirmLabel: t('notes.conflit.leur.confirmer'),
              focusCancel: true,
            });
            sheetShown = false;
            if (!ok) return;
            actions.takeTheirNote(noteId);
            reload();
          }),
          choice('copy', t('notes.conflit.deux'), t('notes.conflit.deux.texte', { name: copyName }), async () => {
            sheet.close();
            const copyId = await actions.keepBothNotes(noteId);
            sheetShown = false;
            reload();
            const copy = copyId ? app.data.notes.get(copyId) : null;
            if (copy) toast(t('notes.conflit.deux.fait', { name: titleOf(copy) }), { action: t('notes.ouvrir'), onAction: () => navigate('note', { id: copyId }) });
          })),
        h('button', { class: 'btn btn--ghost btn--block', type: 'button', onClick: () => sheet.close() }, t('notes.conflit.plusTard')),
      ],
    });
  }

  // Reprend le titre et le texte de la note (après « Prendre la leur »,
  // « Garder les deux », ou une modification arrivée sans frappe en cours)
  function reload() {
    const n = note();
    if (!n) return;
    base = n.version;
    titleInput.value = n.title;
    body = n.body;
    if (!input.hidden) {
      input.value = body;
      fitInput();
    }
    drawBanner(false);
    draw();
  }

  // --- Dessin et temps réel ---
  function draw() {
    const n = note();
    // Ouverte et à l'écran : lue (Nouveautés), sur tous mes appareils
    if (n && !n.deletedAt && document.visibilityState === 'visible') actions.markNoteSeen(n.id);
    heading.textContent = n ? titleOf(n) : t('notes.nouvelle');
    if (n) document.title = `${heading.textContent} · Listo`;
    drawNoteLabels(labelsRow, n);
    if (input.hidden) drawView();
    drawStatus();
    drawFoot();
    drawBar();
  }

  const gone = h('div', { class: 'empty' },
    h('h2', { class: 'empty__title' }, t('notes.introuvable.titre')),
    h('p', { class: 'empty__text' }, t('notes.introuvable.texte')),
    h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => navigate('notes', {}, { replace: true }) }, t('notes.retour')));
  // Ordinateur : la barre en haut du texte, sous le titre et les étiquettes
  const fields = h('div', { class: 'note-edit' }, titleInput, labelsRow, pc ? tools.el : null, view, input);
  const scroll = h('div', { class: 'scroll' }, fields);

  // Changement de données (synchronisation, temps réel, autre écran)
  const onData = () => {
    const n = note();
    if (noteId && (!n || n.deletedAt)) {
      // Note supprimée ou disparue (autre appareil) : plus rien à écrire ici
      if (!isNew || n) replace(scroll, gone);
      drawStatus();
      return;
    }
    if (kept()) {
      drawStatus();
      openConflict();
      return;
    }
    if (n && n.version !== base && !saving) {
      // Quelqu'un (ou un autre appareil) a enregistré : en pleine frappe,
      // le bandeau prévient (le choix se fera au prochain enregistrement) ;
      // sinon, la note se met à jour sous mes yeux
      if (dirty) drawBanner(true);
      else reload();
      return;
    }
    draw();
  };
  onLeave(onDataChange(onData));
  onLeave(onSyncChange(() => drawStatus()));

  if (noteId && !note()) {
    // Lien vers une note inconnue, supprimée, ou d'un autre : même réponse
    replace(scroll, gone);
  }
  draw();
  // Note « À vérifier » : le choix est proposé dès l'ouverture
  if (kept()) queueMicrotask(openConflict);
  // Nouvelle note : le curseur va dans le texte (geste fait pour écrire),
  // après la mise en place de l'écran
  if (isNew) queueMicrotask(() => edit(0));

  // Ordinateur : la note seule dans la colonne, comme une liste ouverte ;
  // barre : « Retour aux notes », la mention, Partager ou Personnes,
  // l'épingle et le menu ⋮ (plus de croix « Fermer »)
  if (pc) {
    const bar = h('div', { class: 'pc-note__bar' },
      iconButton('chev-l', t('notes.retour'), () => back(), 'pc-note__back'),
      status, h('span', { class: 'grow' }), peopleButton, pinButton, menuButton);
    return h('div', { class: 'screen pc-note' }, heading, bar, offlineBanner(), banner, scroll, foot);
  }
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('notes.retour'), () => back()),
      status,
      h('span', { class: 'grow' }),
      peopleButton,
      menuButton),
    heading,
    banner,
    scroll,
    foot,
    // Téléphone : la barre en bas de l'écran (sur le clavier quand il est ouvert)
    tools.el);
}
