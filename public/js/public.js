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
// - Liste d'envies : souhaits, prix, « Ouvrir le lien » (vérifié encore ici :
//   http ou https seulement, nouvel onglet, rel="noopener noreferrer
//   nofollow").
// - Liste d'envies, visiteur (le serveur envoie canReserve) : par souhait,
//   « Réserver » (libre), « Participer » (réservé, ouvert à d'autres),
//   « Réservé » sans bouton (fermé), « Je participe » et « Annuler » (le
//   mien). Le prénom est demandé une fois, puis gardé sur cet appareil pour
//   ce lien (seule donnée gardée par cette page). Après une action, la liste
//   est relue et une phrase est annoncée (role="status") ; elle est relue
//   aussi au retour au premier plan. Le bénéficiaire reconnu par sa session
//   ne reçoit ni état ni bouton.

import { h, icon, replace, passwordInput } from './dom.js';
import { prepareAnnouncer, announce as speak } from './announce.js';
import { dateTimeLabel, dueChip, priorityChip, todayKey, publicItemDetails } from './format.js';
import { itemWords, wordKind, byKind, countItems, doneZoneWords } from './words.js';
import { typeLabel, typeIcon, isWishList } from './list-types.js';
import { cleanLink, formatPrice } from './wishes.js';
import { setLocale, setCurrency, resolveLocale, t, formatTime } from './i18n.js';
import { repeatChip, repeatSentence } from './repeat.js';

const root = document.getElementById('app');
prepareAnnouncer();
const token = location.pathname.split('/')[2] ?? '';
const apiUrl = (path = '') => `/api/public/${encodeURIComponent(token)}${path}`;

const tooMany = () => t('lienpublic.tropEssais.texte');
// Prénom du visiteur, gardé sur cet appareil pour ce lien seulement
const NAME_KEY = `listo_prenom_${token}`;
const NAME_MAX = 40;
let canReserve = false;
let announcement = null; // phrase à annoncer au prochain affichage

// « article » (liste de courses) ou « élément » (autre liste) : déduit du
// regroupement envoyé par le serveur (« none » = pas une liste de courses) ;
// textKind : sorte de liste des phrases entières (byKind, words.js)
let words = itemWords(true);
let textKind = wordKind(true);
// Regroupement de la liste affichée : « aisle », « store » ou « none »
let grouping = 'aisle';
// Type de la liste affichée (« shopping », « tasks » ou « wishes »)
let listType = 'shopping';

// Message plein écran (lien invalide, réseau…) : balisage .empty du kit
function message(iconName, title, text) {
  replace(root, h('div', { class: 'empty' },
    h('span', { class: 'empty__icon' }, icon(iconName, 'icon--lg')),
    h('h1', { class: 'empty__title' }, title),
    h('p', { class: 'empty__text' }, text)));
}

const showInvalid = () => message('link-off', t('lienpublic.invalide'), t('lienpublic.invalide.texte'));
const showNetwork = () => message('cloud-off', t('lienpublic.reseau'), t('lienpublic.reseau.texte'));

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
  if (res.status === 429) return message('clock', t('lienpublic.tropEssais'), tooMany());
  return showInvalid(); // lien inconnu, expiré, arrêté… : toujours le même message
}

// --- Saisie du mot de passe (page-publique-mot-de-passe-1 à 3) ---
function showGate() {
  const { wrap, input } = passwordInput({ class: 'input input--mono', id: 'mot-de-passe', autocomplete: 'off', required: true, maxlength: '200' });
  const fieldError = h('p', { class: 'field__error', id: 'mot-de-passe-erreur', hidden: true });
  const blocked = h('p', { class: 'note note--danger', hidden: true }, icon('clock', 'icon--sm'), h('span', {}, tooMany()));
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('lienpublic.ouvrir'));
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'mot-de-passe' }, t('lienpublic.motDePasse')), wrap, fieldError),
    blocked,
    submit);

  const block = () => {
    fieldError.hidden = true;
    input.removeAttribute('aria-invalid');
    input.value = '';
    blocked.hidden = false;
    speak(tooMany(), { urgent: true });
    for (const el of [input, submit, ...wrap.querySelectorAll('button')]) el.disabled = true;
  };

  // Erreur sous le champ, reliée au champ, sans y mettre le curseur
  const showError = (message) => {
    replace(fieldError, icon('alert', 'icon--xs'), message);
    fieldError.hidden = false;
    speak(message, { urgent: true });
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'mot-de-passe-erreur');
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value) return showError(t('lienpublic.motDePasse.manquant'));
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
      showError(t('lienpublic.injoignable'));
      return;
    }
    if (res.status === 200) return load();
    if (res.status === 429) return block();
    if (res.status === 401) {
      submit.disabled = false;
      showError(t('lienpublic.motDePasse.incorrect'));
      return;
    }
    showInvalid();
  });

  replace(root, h('div', { class: 'gate' },
    h('div', { class: 'gate__head' },
      h('span', { class: 'empty__icon' }, icon('lock', 'icon--lg')),
      h('h1', { class: 'empty__title' }, t('lienpublic.protegee')),
      h('p', { class: 'empty__text' }, t('lienpublic.protegee.texte'))),
    form));
  // Pas de curseur automatique : le clavier s'ouvre quand on touche le champ
}

// --- La liste en lecture seule (page-publique-1 et 2) ---
function showList(data) {
  const { list, groups, done = [], expiresAt } = data;
  // Liste d'envies : monnaie des prix (LISTO_CURRENCY), donnée avec la liste
  setCurrency(list.currency);
  listType = list.type;
  canReserve = Boolean(list.canReserve);
  // Liste d'envies : « souhait » ; sinon déduit du regroupement, comme avant
  words = isWishList(list) ? itemWords(list) : itemWords(list.grouping !== 'none');
  textKind = isWishList(list) ? wordKind(list) : wordKind(list.grouping !== 'none');
  grouping = list.grouping;
  document.title = `${list.name} · Listo`;
  // « 09:05 » en français, « 9:05 AM » en anglais
  const time = formatTime(new Date(), { twoDigits: true });

  const refresh = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('sync', 'icon--sm'), t('lienpublic.actualiser'));
  refresh.addEventListener('click', () => {
    refresh.disabled = true;
    load();
  });

  const count = (group) => h('span', { class: 'aisle__count', 'aria-label': t('lienpublic.groupe.restants', { many: words.many }) }, String(group.items.filter((i) => !i.checked).length));
  const header = (group) => {
    if (list.grouping === 'store') return h('h2', { class: 'aisle' }, h('span', { class: 'aisle__name' }, icon('store', 'icon--xs'), group.name ?? t('lienpublic.sansMagasin')), count(group));
    if (list.grouping === 'aisle') return h('h2', { class: 'aisle' }, group.name ?? t('lienpublic.sansRayon'), count(group));
    return null;
  };

  // Zone des articles cochés (« Dans le panier » / « Terminés »), en lecture
  // seule : un titre fixe (ni repli ni action), puis les lignes barrées, du
  // plus récemment coché au plus ancien (ordre donné par le serveur)
  const shopping = list.grouping !== 'none';
  const kind = isWishList(list) ? list : shopping; // « Reçus » pour une liste d'envies
  const zone = doneZoneWords(kind);
  const doneZone = done.length
    ? h('section', { class: 'cart' },
      h('div', { class: 'cart__head' }, h('div', { class: 'cart__bar' },
        h('h2', { class: 'cart__toggle', 'aria-label': `${zone.title}, ${countItems(done.length, kind)}` },
          h('span', {}, `${zone.title} · `, h('span', { class: 'cart__count' }, String(done.length)))))),
      // Article coché : son rayon (ou son magasin) est envoyé avec lui
      h('ul', {}, done.flatMap((item) => withSubtasks(item, item.aisle ?? item.store ?? null))))
    : null;

  const content = groups.length || done.length
    ? [...groups.map((group) => h('section', {}, header(group), h('ul', {}, group.items.flatMap((item) => withSubtasks(item, group.name))))), doneZone]
    : h('div', { class: 'empty' },
      h('span', { class: 'empty__icon' }, icon(typeIcon(list.type), 'icon--lg')),
      h('h2', { class: 'empty__title' }, t('lienpublic.vide')));

  replace(root, h('div', { class: 'screen' },
    h('p', { class: 'readonly-banner' }, icon('eye', 'icon--sm'), t('lienpublic.lectureSeule')),
    h('header', { class: 'public-head' },
      h('div', { class: 'public-head__main' },
        h('h1', { class: 'public-head__title' }, list.name),
        list.store
          ? h('p', { class: 'public-head__sub' }, icon('store', 'icon--xs'), list.store)
          // Liste d'envies : « Pour Léa » (le prénom de la personne à qui elle est destinée)
          : h('p', { class: 'public-head__sub' }, icon(typeIcon(list.type), 'icon--xs'), isWishList(list) && list.forName ? t('lienpublic.pour', { name: list.forName }) : typeLabel(list.type)),
        h('p', { class: 'public-head__sub' }, icon('sync', 'icon--xs'), t('lienpublic.misAJour', { time }))),
      refresh),
    h('div', { class: `scroll${shopping ? '' : ' scroll--flat'}` }, content),
    h('footer', { class: 'public-foot' }, icon('clock', 'icon--sm'),
      expiresAt ? t('lienpublic.expire', { date: dateTimeLabel(expiresAt) }) : t('lienpublic.sansExpiration'))));
  if (announcement) {
    announce(announcement);
    announcement = null;
  }
}

// Message temporaire en bas de l'écran, lu par les lecteurs d'écran (par la
// zone d'annonce de js/announce.js, plus fiable qu'un message qui apparaît)
function announce(text) {
  root.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast' }, h('span', { class: 'toast__text' }, text));
  root.append(el);
  speak(text);
  setTimeout(() => el.remove(), 4000);
}

// --- Réserver ou participer (liste d'envies, visiteur) ---
function storedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

// Prénom demandé une fois (fenêtre du bas, sans curseur mis tout seul) ;
// renvoie une promesse : le prénom, ou null si la fenêtre est fermée
function askName() {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { class: 'input', id: 'prenom', type: 'text', maxlength: String(NAME_MAX), autocomplete: 'given-name', autocapitalize: 'words', enterkeyhint: 'done' });
    const error = h('p', { class: 'field__error', id: 'prenom-erreur', hidden: true });
    const form = h('form', { class: 'stack', novalidate: true },
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'prenom' }, t('lienpublic.prenom')), input, error,
        h('p', { class: 'field__hint' }, t('lienpublic.prenom.aide'))),
      h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('lienpublic.continuer')));
    let close = () => {};
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = input.value.replace(/\s+/g, ' ').trim();
      if (!name || [...name].length > NAME_MAX) {
        replace(error, icon('alert', 'icon--xs'), t('lienpublic.prenom.erreur', { max: NAME_MAX }));
        error.hidden = false;
        speak(t('lienpublic.prenom.erreur', { max: NAME_MAX }), { urgent: true });
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', 'prenom-erreur');
        return;
      }
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        // stockage indisponible : le prénom sera redemandé la prochaine fois
      }
      done = true;
      close();
      resolve(name);
    });
    const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'prenom-titre' },
      h('div', { class: 'sheet__grab', 'aria-hidden': 'true' }),
      h('div', { class: 'sheet__head' },
        h('h2', { class: 'sheet__title', id: 'prenom-titre' }, t('lienpublic.prenom.titre')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('lienpublic.fermer'), onClick: () => close() }, icon('close'))),
      form);
    close = openLayer(panel, h('div', { class: 'scrim' }), () => {
      if (!done) resolve(null);
    });
  });
}

// Envoie une action (réserver/participer : POST ; annuler : DELETE), puis
// relit la liste et annonce le résultat. Aucune information sur les autres
// participants n'est jamais reçue ni affichée.
async function visitorAction(item, method) {
  let body;
  if (method === 'POST') {
    const name = storedName() || await askName();
    if (!name) return;
    body = JSON.stringify({ firstName: name });
  }
  let res;
  try {
    res = await fetch(apiUrl(`/souhaits/${encodeURIComponent(item.id)}`), {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body,
    });
  } catch {
    announce(t('lienpublic.injoignable'));
    return;
  }
  if (res.status === 200) {
    announcement = method === 'POST'
      ? (item.reservation === 'open' ? t('lienpublic.annonce.participe', { name: item.name }) : t('lienpublic.annonce.reserve', { name: item.name }))
      : t('lienpublic.annonce.neParticipePlus', { name: item.name });
  } else if (res.status === 401) {
    return showGate();
  } else {
    const data = await res.json().catch(() => ({}));
    // Prénom refusé par le serveur : il sera redemandé
    if (res.status === 400) {
      try {
        localStorage.removeItem(NAME_KEY);
      } catch {
        // rien à faire
      }
    }
    announcement = typeof data.error === 'string' ? data.error : t('lienpublic.annonce.impossible');
  }
  load();
}

// Ligne d'état et bouton d'un souhait (visiteur) : texte ET bouton, 44 px
function reservationPart(item) {
  if (!canReserve || item.checked || !item.id) return null;
  const action = (label, method, kind = 'btn--secondary') => h('button', {
    class: `btn ${kind} btn--sm`, type: 'button', 'aria-label': t('lienpublic.action.libelle', { label, name: item.name }), onClick: () => visitorAction(item, method),
  }, label);
  if (item.mine) return h('div', { class: 'item__reserve' }, h('span', { class: 'chip chip--accent' }, icon('gift', 'icon--xs'), t('lienpublic.jeParticipe')), action(t('lienpublic.annuler'), 'DELETE'));
  if (item.reservation === 'open') return h('div', { class: 'item__reserve' }, h('span', { class: 'chip' }, icon('gift', 'icon--xs'), t('lienpublic.reserveOuvert')), action(t('lienpublic.participer'), 'POST', 'btn--primary'));
  if (item.reservation === 'reserved') return h('div', { class: 'item__reserve' }, h('span', { class: 'chip' }, icon('gift', 'icon--xs'), t('lienpublic.reserve')));
  return h('div', { class: 'item__reserve' }, action(t('lienpublic.reserver'), 'POST', 'btn--primary'));
}

// Retour au premier plan : la liste est relue (pas de temps réel)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && canReserve && !layers.length) load();
});

// Priorité et échéance (listes autres que les courses : le serveur ne les
// envoie que pour elles, et chacune seulement si elle est activée pour la
// liste), mêmes pastilles que l'application, en lecture
// seule. « Aujourd'hui » : date de l'appareil du visiteur.
function metaRow(item) {
  const chips = [];
  const priority = priorityChip(item.priority);
  if (priority) chips.push(h('span', { class: `chip${item.priority === 'high' ? ' chip--accent' : ''}` }, icon(priority.icon, 'icon--xs'), h('span', { class: 'visually-hidden' }, `${t('lienpublic.pastille.priorite')} `), priority.text));
  // Liste d'envies : le prix indicatif
  const price = formatPrice(item.priceCents);
  if (price) chips.push(h('span', { class: 'chip' }, icon('euro', 'icon--xs'), h('span', { class: 'visually-hidden' }, `${t('lienpublic.pastille.prix')} `), price));
  const due = dueChip(item.dueDate ?? null, item.checked, todayKey(), item.dueTime ?? null);
  if (due) {
    const tone = due.state === 'late' ? ' chip--late' : due.state === 'today' ? ' chip--accent' : '';
    chips.push(h('span', { class: `chip${tone}` }, icon(due.state === 'late' ? 'alert' : 'calendar', 'icon--xs'), h('span', { class: 'visually-hidden' }, `${t('lienpublic.pastille.echeance')} `), due.text));
    if (item.repeat) chips.push(h('span', { class: 'chip' }, icon('repeat', 'icon--xs'), h('span', { class: 'visually-hidden' }, `${t('lienpublic.pastille.repetition')} `), repeatChip(item.repeat)));
  }
  return chips.length ? h('span', { class: 'item__meta' }, chips) : null;
}

// Ligne d'un article : case non interactive (cochée = barrée aussi) ; le
// reste de la ligne est un bouton qui ouvre la fiche (même balisage que la
// fiche à consulter de l'application). place : nom du rayon (ou du magasin
// dans une liste « multi »), ou null pour « Sans rayon » / « Sans magasin ».
function itemRow(item, place, extraSpoken = '') {
  // Vignette de la ligne : gardée pour la fiche (copie sans nouvelle requête)
  const thumb = item.photo ? h('img', { class: 'photo', src: item.photo, alt: '', loading: 'lazy', decoding: 'async' }) : null;
  return h('li', { class: `item${item.checked ? ' is-done' : ''}${canReserve && !item.checked ? ' item--reserve' : ''}` },
    h('span', { class: `check check--static${item.checked ? ' is-on' : ''}`, role: 'img', 'aria-label': listType === 'wishes' ? (item.checked ? t('lienpublic.recu') : t('lienpublic.pasEncoreRecu')) : item.checked ? t('lienpublic.coche') : t('lienpublic.nonCoche') },
      h('span', { class: 'check__box' }, item.checked ? icon('check') : null)),
    h('button', { class: 'item__body', type: 'button', 'aria-label': `${t('lienpublic.voir', { name: item.name })}${spokenMeta(item)}${extraSpoken}`, onClick: () => showItem(item, place, thumb) },
      h('span', { class: 'item__text' },
        h('span', { class: 'item__name' }, item.name),
        item.note ? h('span', { class: 'item__note' }, item.note) : null,
        metaRow(item)),
      item.quantity ? h('span', { class: 'item__qty' }, item.quantity) : null),
    thumb ? h('button', { class: 'item__photo', type: 'button', 'aria-label': t('lienpublic.photo.agrandir', { name: item.name }), onClick: () => showPhoto(item) }, thumb) : null,
    reservationPart(item));
}

// Tâche principale (liste de tâches, option « Sous-tâches ») : sa ligne,
// puis ses sous-tâches juste en dessous, en retrait, toujours dépliées
// (lecture seule) ; le nombre de sous-tâches faites est dit avec la ligne.
function withSubtasks(item, place) {
  const children = Array.isArray(item.subtasks) ? item.subtasks : [];
  if (!children.length) return [itemRow(item, place)];
  const done = children.filter((child) => child.checked).length;
  return [
    itemRow(item, place, `, ${t('lienpublic.sousTaches.faites', { count: done, total: children.length })}`),
    h('li', { class: 'subtasks' }, h('ul', { class: 'subtasks__list', 'aria-label': t('lienpublic.sousTaches.de', { name: item.name }) }, children.map((child) => itemRow(child, place)))),
  ];
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
  const due = dueChip(item.dueDate ?? null, item.checked, todayKey(), item.dueTime ?? null);
  if (due) spoken.push(due.label.toLowerCase());
  if (due && item.repeat) spoken.push(t('lienpublic.repetition', { rule: repeatSentence(item.repeat).toLowerCase() }));
  const price = formatPrice(item.priceCents);
  if (price) spoken.push(price);
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
function openLayer(panel, scrim = null, onRemove = null) {
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
      onRemove?.();
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
  const rows = publicItemDetails(item, { grouping, place, type: listType }).map(value);
  // Liste d'envies : « Ouvrir le lien » (vérifié encore ici ; nouvel onglet,
  // sans « referrer », sans suivi)
  const safe = listType === 'wishes' ? cleanLink(item.link ?? '') : null;
  const linkButton = safe ? h('a', { class: 'btn btn--secondary btn--sm', href: safe, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('link', 'icon--sm'), t('lienpublic.fiche.lien')) : null;
  // La photo s'insère avant le rayon (ou le magasin), comme dans l'application
  const placeRows = grouping === 'none' ? 0 : 1;
  let close = () => {};
  // En-tête (titre, croix) fixe en haut de la feuille ; seul le contenu
  // défile, à l'intérieur de la feuille (.sheet__scroll), sans entraîner la
  // page derrière
  const panel = h('div', { class: 'sheet sheet--fixed-head', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fiche-titre' },
    h('div', { class: 'sheet__grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet__head' },
      h('h2', { class: 'sheet__title', id: 'fiche-titre' }, byKind(textKind, { shopping: t('lienpublic.fiche.titre.courses'), tasks: t('lienpublic.fiche.titre.taches'), wishes: t('lienpublic.fiche.titre.envies') })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('lienpublic.fermer'), onClick: () => close() }, icon('close'))),
    h('div', { class: 'stack sheet__scroll' },
      h('div', { class: 'note' }, icon('eye'), h('p', {}, byKind(textKind, { shopping: t('lienpublic.fiche.lectureSeule.courses'), tasks: t('lienpublic.fiche.lectureSeule.taches'), wishes: t('lienpublic.fiche.lectureSeule.envies') }))),
      rows.slice(0, rows.length - placeRows),
      linkButton,
      item.photo ? h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('lienpublic.fiche.photo')),
        h('div', { class: 'photo-block' },
          h('button', { class: 'photo-block__thumb', type: 'button', 'aria-label': t('lienpublic.photo.agrandir', { name: item.name }), onClick: () => showPhoto(item) },
            photoCopy(item, thumb)))) : null,
      rows.slice(rows.length - placeRows)));
  close = openLayer(panel, h('div', { class: 'scrim' }));
}

// Photo en plein écran : bouton Fermer, touche Échap, Retour du téléphone
function showPhoto(item) {
  let close = () => {};
  const panel = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'photo-titre' },
    h('div', { class: 'lightbox__bar' }, h('h2', { class: 'lightbox__title', id: 'photo-titre' }, item.name),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('lienpublic.photo.fermer'), 'data-initial-focus': true, onClick: () => close() }, icon('close'))),
    h('div', { class: 'lightbox__stage' }, h('img', { class: 'lightbox__img', src: item.photo, alt: byKind(textKind, { shopping: t('lienpublic.photo.alt.courses', { name: item.name }), tasks: t('lienpublic.photo.alt.taches', { name: item.name }), wishes: t('lienpublic.photo.alt.envies', { name: item.name }) }) })),
    h('div', { class: 'lightbox__foot' }, h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: () => close() }, t('lienpublic.fermer'))));
  close = openLayer(panel);
}

// Langue du visiteur (sans compte) : celle de son navigateur (une langue
// complète, sinon le français), posée avant tout affichage
document.documentElement.lang = setLocale(resolveLocale(navigator.languages?.length ? navigator.languages : [navigator.language]));
load();
