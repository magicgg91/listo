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

import { h, icon, replace, passwordInput } from './dom.js';
import { dateTimeLabel, dueChip, priorityChip, todayKey } from './format.js';
import { itemWords, countItems, doneZoneWords } from './words.js';

const root = document.getElementById('app');
const token = location.pathname.split('/')[2] ?? '';
const apiUrl = (path = '') => `/api/public/${encodeURIComponent(token)}${path}`;

const TOO_MANY = "Trop d'essais, réessayez plus tard.";

// « article » (liste de courses) ou « élément » (autre liste) : déduit du
// regroupement envoyé par le serveur (« none » = pas une liste de courses)
let words = itemWords(true);

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
      h('ul', {}, done.map(itemRow)))
    : null;

  const content = groups.length || done.length
    ? [...groups.map((group) => h('section', {}, header(group), h('ul', {}, group.items.map(itemRow)))), doneZone]
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

// Ligne d'un article : case non interactive (cochée = barrée aussi)
function itemRow(item) {
  return h('li', { class: `item${item.checked ? ' is-done' : ''}` },
    h('span', { class: `check check--static${item.checked ? ' is-on' : ''}`, role: 'img', 'aria-label': item.checked ? 'Coché' : 'À acheter' },
      h('span', { class: 'check__box' }, item.checked ? icon('check') : null)),
    h('div', { class: 'item__body' },
      h('span', { class: 'item__text' },
        h('span', { class: 'item__name' }, item.name),
        item.note ? h('span', { class: 'item__note' }, item.note) : null,
        metaRow(item)),
      item.quantity ? h('span', { class: 'item__qty' }, item.quantity) : null),
    item.photo ? h('button', { class: 'item__photo', type: 'button', 'aria-label': `Agrandir la photo de ${item.name}`, onClick: () => showPhoto(item) },
      h('img', { class: 'photo', src: item.photo, alt: '', loading: 'lazy', decoding: 'async' })) : null);
}

// Photo en plein écran : bouton Fermer, touche Échap
function showPhoto(item) {
  const opener = document.activeElement;
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
    // Retour du focus à la vignette touchée (jamais à un champ de saisie)
    if (opener && !opener.matches?.('input, textarea')) opener.focus();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  const closeButton = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer la photo', onClick: close }, icon('close'));
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'photo-titre' },
    h('div', { class: 'lightbox__bar' }, h('h2', { class: 'lightbox__title', id: 'photo-titre' }, item.name), closeButton),
    h('div', { class: 'lightbox__stage' }, h('img', { class: 'lightbox__img', src: item.photo, alt: `Photo de l'${words.one} ${item.name}` })),
    h('div', { class: 'lightbox__foot' }, h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: close }, 'Fermer')));
  root.append(box);
  document.addEventListener('keydown', onKey);
  closeButton.focus();
}

load();
