// Page publique d'une liste (lien /p/<jeton>, étape 10) : lecture seule,
// sans compte. Maquettes page-publique-1 et 2, page-publique-mot-de-passe-1
// à 3, page-publique-expiree-1.
//
// - Une seule requête par affichage : à l'ouverture et au bouton
//   « Actualiser ». Pas de temps réel, pas de rafraîchissement automatique.
// - Lien protégé : la saisie du mot de passe ne montre rien de la liste.
// - Tout le texte est placé avec textContent (via dom.js), jamais innerHTML.
// - Cette page n'enregistre pas de service worker et ne garde rien sur le
//   téléphone.
// - Toucher un article ouvre sa fiche en lecture seule (tous ses détails,
//   reçus avec la liste) : aucune requête de plus, aucun champ de saisie.

import { h, icon, replace, passwordInput } from './dom.js';
import { dateTimeLabel, dueChip, priorityChip, todayKey, publicItemDetails } from './format.js';
import { itemWords, countItems, doneZoneWords } from './words.js';

const root = document.getElementById('app');
const token = location.pathname.split('/')[2] ?? '';
const apiUrl = (path = '') => `/api/public/${encodeURIComponent(token)}${path}`;

const TOO_MANY = "Trop d'essais, réessayez plus tard.";

// « article » (liste de courses) ou « élément » (autre liste) : déduit du
// regroupement envoyé par le serveur (« none » = pas une liste de courses)
let words = itemWords(true);
// Regroupement de la liste affichée : « aisle », « store » ou « none »
let grouping = 'aisle';

// Message plein écran (lien invalide, réseau…) : balisage .empty du kit
function message(iconName, title, text) {
  replace(root, h('div', { class: 'empty' },
    h('span', { class: 'empty__icon' }, icon(iconName, 'icon--lg')),
    h('h1', { class: 'empty__title' }, title),
    h('p', { class: 'empty__text' }, text)));
}

const showInvalid = () => message('link-off', 'Lien expiré ou inexistant', "Ce lien n'est plus valide. Demander un nouveau lien à la personne qui l'a envoyé.");
const showNetwork = () => message('cloud-off', 'Liste indisponible', 'Impossible de joindre Listo. Vérifiez la connexion, puis rechargez la page.');

// Charge la liste (une requête) et affiche le résultat
async function load() {
  let res;
  try {
    res = await fetch(apiUrl(), { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    showNetwork();
    return;
  }
  if (res.status === 200) return showList(await res.json());
  if (res.status === 401) return showGate();
  if (res.status === 429) return message('clock', 'Trop d\'essais', TOO_MANY);
  return showInvalid(); // lien inconnu, expiré, arrêté… : toujours le même message
}

// --- Saisie du mot de passe (page-publique-mot-de-passe-1 à 3) ---
function showGate() {
  const { wrap, input } = passwordInput({ class: 'input input--mono', id: 'mot-de-passe', autocomplete: 'off', required: true, maxlength: '200' });
  const fieldError = h('p', { class: 'field__error', id: 'mot-de-passe-erreur', role: 'alert', hidden: true });
  const blocked = h('p', { class: 'note note--danger', role: 'alert', hidden: true }, icon('clock', 'icon--sm'), h('span', {}, TOO_MANY));
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Ouvrir');
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'mot-de-passe' }, 'Mot de passe'), wrap, fieldError),
    blocked,
    submit);

  const block = () => {
    fieldError.hidden = true;
    input.removeAttribute('aria-invalid');
    input.value = '';
    blocked.hidden = false;
    for (const el of [input, submit, ...wrap.querySelectorAll('button')]) el.disabled = true;
  };

  // Erreur sous le champ, reliée au champ, sans y mettre le curseur
  const showError = (message) => {
    replace(fieldError, icon('alert', 'icon--xs'), message);
    fieldError.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'mot-de-passe-erreur');
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value) return showError('Saisir le mot de passe.');
    submit.disabled = true;
    let res;
    try {
      res = await fetch(apiUrl('/acces'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.value }),
      });
    } catch {
      submit.disabled = false;
      showError('Impossible de joindre Listo. Réessayez.');
      return;
    }
    if (res.status === 200) return load();
    if (res.status === 429) return block();
    if (res.status === 401) {
      submit.disabled = false;
      showError('Mot de passe incorrect');
      return;
    }
    showInvalid();
  });

  replace(root, h('div', { class: 'gate' },
    h('div', { class: 'gate__head' },
      h('span', { class: 'empty__icon' }, icon('lock', 'icon--lg')),
      h('h1', { class: 'empty__title' }, 'Liste protégée'),
      h('p', { class: 'empty__text' }, 'Saisir le mot de passe reçu avec le lien.')),
    form));
  // Pas de curseur automatique : le clavier s'ouvre quand on touche le champ
}

// --- La liste en lecture seule (page-publique-1 et 2) ---
function showList(data) {
  const { list, groups, done = [], expiresAt } = data;
  words = itemWords(list.grouping !== 'none');
  grouping = list.grouping;
  document.title = `${list.name} · Listo`;
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const refresh = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('sync', 'icon--sm'), 'Actualiser');
  refresh.addEventListener('click', () => {
    refresh.disabled = true;
    load();
  });

  const count = (group) => h('span', { class: 'aisle__count', 'aria-label': `${words.many} restants` }, String(group.items.filter((i) => !i.checked).length));
  const header = (group) => {
    if (list.grouping === 'store') return h('h2', { class: 'aisle' }, h('span', { class: 'aisle__name' }, icon('store', 'icon--xs'), group.name ?? 'Sans magasin'), count(group));
    if (list.grouping === 'aisle') return h('h2', { class: 'aisle' }, group.name ?? 'Sans rayon', count(group));
    return null;
  };

  // Zone des articles cochés (« Dans le panier » / « Terminés »), en lecture
  // seule : un titre fixe (ni repli ni action), puis les lignes barrées, du
  // plus récemment coché au plus ancien (ordre donné par le serveur)
  const shopping = list.grouping !== 'none';
  const zone = doneZoneWords(shopping);
  const doneZone = done.length
    ? h('section', { class: 'cart' },
      h('div', { class: 'cart__head' }, h('div', { class: 'cart__bar' },
        h('h2', { class: 'cart__toggle', 'aria-label': `${zone.title}, ${countItems(done.length, shopping)}` },
          h('span', {}, `${zone.title} · `, h('span', { class: 'cart__count' }, String(done.length)))))),
      // Article coché : son rayon (ou son magasin) est envoyé avec lui
      h('ul', {}, done.map((item) => itemRow(item, item.aisle ?? item.store ?? null))))
    : null;

  const content = groups.length || done.length
    ? [...groups.map((group) => h('section', {}, header(group), h('ul', {}, group.items.map((item) => itemRow(item, group.name))))), doneZone]
    : h('div', { class: 'empty' },
      h('span', { class: 'empty__icon' }, icon(list.grouping === 'none' ? 'tasks' : 'cart', 'icon--lg')),
      h('h2', { class: 'empty__title' }, 'Cette liste est vide'));

  replace(root, h('div', { class: 'screen' },
    h('p', { class: 'readonly-banner' }, icon('eye', 'icon--sm'), 'Lecture seule'),
    h('header', { class: 'public-head' },
      h('div', { class: 'public-head__main' },
        h('h1', { class: 'public-head__title' }, list.name),
        list.store
          ? h('p', { class: 'public-head__sub' }, icon('store', 'icon--xs'), list.store)
          : h('p', { class: 'public-head__sub' }, icon(list.grouping === 'none' ? 'tasks' : 'cart', 'icon--xs'), list.category),
        h('p', { class: 'public-head__sub' }, icon('sync', 'icon--xs'), `Mis à jour à ${time}`)),
      refresh),
    h('div', { class: `scroll${shopping ? '' : ' scroll--flat'}` }, content),
    h('footer', { class: 'public-foot' }, icon('clock', 'icon--sm'),
      expiresAt ? `Ce lien expire le ${dateTimeLabel(expiresAt)}` : "Ce lien n'a pas de date d'expiration")));
}

// Priorité et échéance (listes autres que les courses : le serveur ne les
// envoie que pour elles, et chacune seulement si elle est activée pour la
// liste), mêmes pastilles que l'application, en lecture
// seule. « Aujourd'hui » : date de l'appareil du visiteur.
function metaRow(item) {
  const chips = [];
  const priority = priorityChip(item.priority);
  if (priority) chips.push(h('span', { class: `chip${item.priority === 'high' ? ' chip--accent' : ''}` }, icon(priority.icon, 'icon--xs'), h('span', { class: 'visually-hidden' }, 'Priorité '), priority.text));
  const due = dueChip(item.dueDate ?? null, item.checked, todayKey());
  if (due) {
    const tone = due.state === 'late' ? ' chip--late' : due.state === 'today' ? ' chip--accent' : '';
    chips.push(h('span', { class: `chip${tone}` }, icon(due.state === 'late' ? 'alert' : 'calendar', 'icon--xs'), h('span', { class: 'visually-hidden' }, 'Échéance : '), due.text));
  }
  return chips.length ? h('span', { class: 'item__meta' }, chips) : null;
}

// Ligne d'un article : case non interactive (cochée = barrée aussi) ; le
// reste de la ligne est un bouton qui ouvre la fiche (même balisage que la
// fiche à consulter de l'application). place : nom du rayon (ou du magasin
// dans une liste « multi »), ou null pour « Sans rayon » / « Sans magasin ».
function itemRow(item, place) {
  // Vignette de la ligne : gardée pour la fiche (copie sans nouvelle requête)
  const thumb = item.photo ? h('img', { class: 'photo', src: item.photo, alt: '', loading: 'lazy', decoding: 'async' }) : null;
  return h('li', { class: `item${item.checked ? ' is-done' : ''}` },
    h('span', { class: `check check--static${item.checked ? ' is-on' : ''}`, role: 'img', 'aria-label': item.checked ? 'Coché' : 'Non coché' },
      h('span', { class: 'check__box' }, item.checked ? icon('check') : null)),
    h('button', { class: 'item__body', type: 'button', 'aria-label': `Voir ${item.name}${spokenMeta(item)}`, onClick: () => showItem(item, place, thumb) },
      h('span', { class: 'item__text' },
        h('span', { class: 'item__name' }, item.name),
        item.note ? h('span', { class: 'item__note' }, item.note) : null,
        metaRow(item)),
      item.quantity ? h('span', { class: 'item__qty' }, item.quantity) : null),
    thumb ? h('button', { class: 'item__photo', type: 'button', 'aria-label': `Agrandir la photo de ${item.name}`, onClick: () => showPhoto(item) }, thumb) : null);
}

// Copie de la vignette déjà affichée sur la ligne, dessinée dans un canvas :
// la fiche montre la photo sans la redemander au serveur (elle n'est jamais
// gardée par le navigateur : no-store). Vignette pas encore chargée : la
// photo est demandée normalement, par l'adresse du lien.
function photoCopy(item, thumb) {
  if (thumb?.complete && thumb.naturalWidth) {
    const canvas = h('canvas', { class: 'photo', width: String(thumb.naturalWidth), height: String(thumb.naturalHeight), 'aria-hidden': 'true' });
    canvas.getContext('2d').drawImage(thumb, 0, 0);
    return canvas;
  }
  return h('img', { class: 'photo', src: item.photo, alt: '' });
}

// Priorité et échéance lues avec le nom de la ligne (lecteurs d'écran), comme
// dans l'application
function spokenMeta(item) {
  const spoken = [];
  const priority = priorityChip(item.priority);
  if (priority) spoken.push(priority.label.toLowerCase());
  const due = dueChip(item.dueDate ?? null, item.checked, todayKey());
  if (due) spoken.push(due.label.toLowerCase());
  return spoken.length ? `, ${spoken.join(', ')}` : '';
}

// --- Fenêtres (fiche d'un article, photo agrandie) ---
// Chaque fenêtre ajoute une étape à l'historique du navigateur : le bouton
// Retour du téléphone ferme celle du dessus. La croix, « Fermer », la touche
// Échap et le fond grisé reviennent aussi d'une étape. Le focus revient à
// l'élément touché (la ligne, la vignette) ; la touche Tab reste dans la
// fenêtre. Rien n'est envoyé au serveur.
const layers = [];
window.addEventListener('popstate', () => layers.pop()?.remove());

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// panel : la fenêtre ; scrim : fond grisé, ou null. Renvoie close().
function openLayer(panel, scrim = null) {
  const opener = document.activeElement;
  const onKey = (event) => {
    if (layers.at(-1) !== layer) return; // seule la fenêtre du dessus réagit
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = panel.contains(document.activeElement) && document.activeElement !== panel;
    if (event.shiftKey && (!inside || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  };
  const layer = {
    remove: () => {
      scrim?.remove();
      panel.remove();
      document.removeEventListener('keydown', onKey);
      // Retour du focus à l'élément touché (jamais à un champ de saisie)
      if (opener?.isConnected && !opener.matches?.('input, textarea')) opener.focus();
    },
  };
  const close = () => {
    if (layers.at(-1) === layer) history.back(); // popstate ferme la fenêtre
  };
  layers.push(layer);
  history.pushState({ listoFenetre: layers.length }, '');
  if (scrim) {
    scrim.addEventListener('click', close);
    root.append(scrim);
  }
  root.append(panel);
  document.addEventListener('keydown', onKey);
  // Focus sur le bouton de départ (data-initial-focus), sinon sur la fenêtre
  // elle-même : les lecteurs d'écran annoncent son titre
  panel.setAttribute('tabindex', '-1');
  const start = panel.querySelector('[data-initial-focus]');
  if (start) start.focus();
  else panel.focus();
  return close;
}

// Fiche d'un article en lecture seule : les mêmes informations que la fiche à
// consulter de l'application (aucun champ, aucun bouton qui écrit), plus son
// état coché en toutes lettres. Seulement ce que le serveur a envoyé :
// priorité et échéance si elles sont activées pour la liste, code-barres
// s'il existe. grouping : regroupement de la liste (« aisle », « store »,
// « none ») ; place : voir itemRow ; thumb : vignette de la ligne.
function showItem(item, place, thumb) {
  const value = ({ label, text }) => h('div', { class: 'field' }, h('span', { class: 'field__label' }, label), h('p', { class: 'field__value' }, text));
  const rows = publicItemDetails(item, { grouping, place }).map(value);
  // La photo s'insère avant le rayon (ou le magasin), comme dans l'application
  const placeRows = grouping === 'none' ? 0 : 1;
  let close = () => {};
  const panel = h('div', { class: 'sheet sheet--scroll', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fiche-titre' },
    h('div', { class: 'sheet__grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet__head' },
      h('h2', { class: 'sheet__title', id: 'fiche-titre' }, `Détail de l'${words.one}`),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', onClick: () => close() }, icon('close'))),
    h('div', { class: 'stack' },
      h('div', { class: 'note' }, icon('eye'), h('p', {}, `Liste en lecture seule : cet ${words.one} ne peut pas être modifié.`)),
      rows.slice(0, rows.length - placeRows),
      item.photo ? h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Photo'),
        h('div', { class: 'photo-block' },
          h('button', { class: 'photo-block__thumb', type: 'button', 'aria-label': `Agrandir la photo de ${item.name}`, onClick: () => showPhoto(item) },
            photoCopy(item, thumb)))) : null,
      rows.slice(rows.length - placeRows)));
  close = openLayer(panel, h('div', { class: 'scrim' }));
}

// Photo en plein écran : bouton Fermer, touche Échap, Retour du téléphone
function showPhoto(item) {
  let close = () => {};
  const panel = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'photo-titre' },
    h('div', { class: 'lightbox__bar' }, h('h2', { class: 'lightbox__title', id: 'photo-titre' }, item.name),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer la photo', 'data-initial-focus': true, onClick: () => close() }, icon('close'))),
    h('div', { class: 'lightbox__stage' }, h('img', { class: 'lightbox__img', src: item.photo, alt: `Photo de l'${words.one} ${item.name}` })),
    h('div', { class: 'lightbox__foot' }, h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: () => close() }, 'Fermer')));
  close = openLayer(panel);
}

load();
