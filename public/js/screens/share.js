// Feuille « Partager par lien » (maquettes partage-lien-1 à 7), ouverte
// depuis le menu d'une liste par son propriétaire.
//
// États : aucun lien (choix de la durée, mot de passe ou non, « Créer le
// lien ») ; lien actif (adresse, copie, expiration, mot de passe montré une
// seule fois puis masqué, nouveau mot de passe, retrait, changement de durée,
// arrêt). Tout passe par le serveur : sans réseau, la feuille est grisée
// avec « Indisponible hors ligne ».

import { refreshData } from '../app.js';
import { get, put, del, errorMessage, NetworkError } from '../api.js';
import { h, icon, replace, field } from '../dom.js';
import { openSheet, confirmDialog, toast } from '../ui.js';
import { dateTimeLabel, timeLeftLabel } from '../format.js';
import { hasPublicLink } from './lists.js';

const DURATIONS = [
  { label: '1 heure', hours: 1 },
  { label: '24 heures', hours: 24 },
  { label: '7 jours', hours: 7 * 24 },
  { label: '30 jours', hours: 30 * 24 },
  { label: 'Personnalisée', hours: 'custom' },
  { label: 'Illimitée', hours: null },
];
const DEFAULT_HOURS = 24;
const MAX_HOURS = 365 * 24;
const OFFLINE_TEXT = 'Indisponible hors ligne. Reconnectez-vous pour créer ou arrêter un lien.';

// Choix de la durée (grille de six boutons + durée personnalisée).
// Renvoie { element, value } ; value() donne le nombre d'heures, null pour
// « illimitée », ou undefined si la durée personnalisée est invalide.
function durationPicker({ disabled }) {
  let chosen = DEFAULT_HOURS;
  let unit = 'days';
  const number = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '1', step: '1', value: '3', 'aria-label': 'Nombre', disabled });
  const units = [['hours', 'Heures'], ['days', 'Jours']].map(([value, label]) => {
    const option = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', disabled }, label);
    option.addEventListener('click', () => {
      unit = value;
      paint();
    });
    return { value, option };
  });
  const custom = field('Durée personnalisée', h('div', { class: 'duration-custom' },
    number, h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Unité' }, units.map((u) => u.option))));
  const options = DURATIONS.map((duration) => {
    const option = h('button', { class: 'duration__opt', type: 'button', role: 'radio', disabled });
    option.addEventListener('click', () => {
      chosen = duration.hours;
      paint();
    });
    return { duration, option };
  });

  function paint() {
    for (const { duration, option } of options) {
      const on = duration.hours === chosen;
      option.setAttribute('aria-checked', String(on));
      replace(option, on ? icon('check', 'icon--sm') : null, duration.label);
    }
    for (const u of units) u.option.setAttribute('aria-checked', String(u.value === unit));
    custom.field.hidden = chosen !== 'custom';
    custom.setError(null);
  }
  paint();

  return {
    element: [
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Durée de validité'),
        h('div', { class: 'duration', role: 'radiogroup', 'aria-label': 'Durée de validité' }, options.map((o) => o.option))),
      custom.field,
    ],
    value() {
      if (chosen !== 'custom') return chosen;
      const count = Number(number.value);
      const hours = unit === 'days' ? count * 24 : count;
      if (!Number.isInteger(count) || count < 1 || hours > MAX_HOURS) {
        custom.setError(unit === 'days' ? 'Entre 1 et 365 jours.' : `Entre 1 et ${MAX_HOURS} heures.`);
        return undefined;
      }
      return hours;
    },
  };
}

// Copie un texte ; message si le navigateur refuse (adresse non HTTPS…)
async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast('Copie impossible : sélectionnez le texte et copiez-le à la main.');
  }
}

// Dernier état connu du lien de chaque liste (sans mot de passe), pour
// montrer la feuille grisée si le réseau disparaît. Gardé en mémoire
// seulement, le temps de la visite.
const lastKnown = new Map();

export function openShareSheet(list) {
  const url = `/api/lists/${encodeURIComponent(list.id)}/share`;
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Chargement…'));
  let share = lastKnown.get(list.id) ?? null; // état du lien selon le serveur
  let loaded = lastKnown.has(list.id);         // état déjà reçu du serveur
  let password = null;     // mot de passe tout juste créé : montré une seule fois
  let editingDuration = false;
  let busy = false;
  let closed = false;

  const onOnline = () => load();
  const onOffline = () => draw();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  const { close } = openSheet({
    title: 'Partager par lien',
    content: body,
    scroll: true,
    onClose: () => {
      closed = true;
      password = null; // le mot de passe n'est gardé nulle part
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    },
  });

  async function load() {
    if (!navigator.onLine) return draw();
    try {
      share = (await get(url)).share;
      loaded = true;
      lastKnown.set(list.id, share);
    } catch (error) {
      if (!(error instanceof NetworkError)) {
        toast(errorMessage(error));
        close();
        return;
      }
    }
    draw();
  }

  // Envoie une demande au serveur, puis redessine la feuille
  async function act(request, { done } = {}) {
    if (busy) return;
    busy = true;
    draw();
    try {
      const result = await request();
      share = result.share;
      password = result.share?.password ?? null;
      lastKnown.set(list.id, share && { ...share, password: undefined });
      editingDuration = false;
      if (done) toast(done);
      refreshData({ quiet: true }); // icône « lien » de Mes listes
    } catch (error) {
      toast(errorMessage(error));
      if (error.status === 404) close(); // liste supprimée entre-temps
    } finally {
      busy = false;
      draw();
    }
  }

  function draw() {
    if (closed) return;
    const offline = !navigator.onLine;
    if (!loaded && !offline) return; // chargement en cours
    // Hors ligne sans état connu, mais la liste a un lien : on le dit seulement
    if (!loaded && hasPublicLink(list)) {
      replace(body, offlineNote(), h('p', { class: 'muted' }, 'Un lien public est actif pour cette liste.'));
      return;
    }
    replace(body, share ? activeView(offline) : createView(offline));
  }

  const offlineNote = () => h('p', { class: 'note', role: 'status' }, icon('cloud-off', 'icon--sm'), h('span', {}, OFFLINE_TEXT));

  // --- Aucun lien : création (partage-lien-1, 2 et 7) ---
  function createView(offline) {
    const off = offline || busy;
    const picker = durationPicker({ disabled: off });
    let protect = false;
    const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': 'Protéger par mot de passe', disabled: off });
    toggle.addEventListener('click', () => {
      protect = !protect;
      toggle.setAttribute('aria-checked', String(protect));
    });
    const create = h('button', { class: 'btn btn--primary btn--block', type: 'button', disabled: off }, icon('link', 'icon--sm'), 'Créer le lien');
    create.addEventListener('click', () => {
      const durationHours = picker.value();
      if (durationHours === undefined) return;
      act(() => put(url, { durationHours, protect }), { done: 'Lien créé' });
    });
    return [
      offline ? offlineNote() : h('p', { class: 'muted' }, 'Toute personne avec le lien voit la liste en lecture seule, sans compte.'),
      picker.element,
      h('div', { class: 'card' }, h('div', { class: 'row' },
        h('span', { class: 'row__icon' }, icon('lock', 'icon--sm')),
        h('div', { class: 'row__body' },
          h('span', { class: 'row__title' }, 'Protéger par mot de passe'),
          h('span', { class: 'row__sub' }, '16 caractères, créé par Listo')),
        toggle)),
      create,
    ];
  }

  // --- Lien actif (partage-lien-3, 4 et 5) ---
  function activeView(offline) {
    const off = offline || busy;
    const shown = share.url.replace(/^https?:\/\//, '');
    const button = (iconName, label, onClick, kind = 'btn--secondary') => {
      const el = h('button', { class: `btn ${kind} btn--block`, type: 'button', disabled: off }, icon(iconName, 'icon--sm'), label);
      el.addEventListener('click', onClick);
      return el;
    };

    const expiry = share.expiresAt
      ? h('p', { class: 'expiry' }, icon('clock', 'icon--sm'), h('span', {},
        h('span', { class: 'expiry__title' }, `Expire le ${dateTimeLabel(share.expiresAt)}`),
        h('span', { class: 'expiry__sub' }, timeLeftLabel(share.expiresAt))))
      : h('p', { class: 'expiry' }, icon('clock', 'icon--sm'), h('span', {},
        h('span', { class: 'expiry__title' }, "Sans date d'expiration"),
        h('span', { class: 'expiry__sub' }, "Valable jusqu'à l'arrêt du partage")));

    // Changer la durée : la grille s'ouvre sous l'expiration
    let durationPart;
    if (editingDuration) {
      const picker = durationPicker({ disabled: off });
      durationPart = [
        picker.element,
        h('div', { class: 'dialog__actions' },
          button('close', 'Annuler', () => {
            editingDuration = false;
            draw();
          }),
          button('check', 'Enregistrer', () => {
            const durationHours = picker.value();
            if (durationHours === undefined) return;
            act(() => put(url, { durationHours }), { done: 'Durée changée' });
          }, 'btn--primary')),
      ];
    } else {
      durationPart = button('clock', 'Changer la durée', () => {
        editingDuration = true;
        draw();
      });
    }

    // Mot de passe : montré une seule fois, puis masqué
    let passwordPart;
    if (share.protected) {
      const value = password
        ? h('div', { class: 'secret__row' },
          h('span', { class: 'secret__value', translate: 'no' }, password),
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => copy(password, 'Mot de passe copié') }, icon('copy', 'icon--sm'), 'Copier'))
        : h('div', { class: 'secret__row' },
          h('span', { class: 'secret__value secret__value--masked', role: 'img', 'aria-label': 'Mot de passe masqué' }, '••••••••••••••••'));
      passwordPart = [
        h('div', { class: 'secret' }, h('p', { class: 'secret__label' }, icon('lock', 'icon--xs'), 'Mot de passe'), value),
        password ? h('p', { class: 'note', role: 'status' }, icon('alert', 'icon--sm'), h('span', {}, 'Ce mot de passe ne sera plus affiché.')) : null,
        button('reset', 'Nouveau mot de passe', async () => {
          const ok = await confirmDialog({
            title: 'Nouveau mot de passe ?',
            text: "L'ancien ne marchera plus : il faudra donner le nouveau aux personnes qui ont le lien.",
            confirmLabel: 'Créer',
            danger: false,
          });
          if (ok) act(() => put(url, { password: 'new' }));
        }),
        button('lock', 'Retirer le mot de passe', async () => {
          const ok = await confirmDialog({
            title: 'Retirer le mot de passe ?',
            text: 'Toute personne avec le lien pourra voir la liste.',
            confirmLabel: 'Retirer',
          });
          if (ok) act(() => put(url, { password: 'none' }), { done: 'Mot de passe retiré' });
        }),
      ];
    } else {
      passwordPart = [
        h('p', { class: 'note', role: 'status' }, icon('eye', 'icon--sm'), h('span', {}, 'Toute personne avec ce lien peut voir la liste.')),
        button('lock', 'Ajouter un mot de passe', () => act(() => put(url, { password: 'new' }))),
      ];
    }

    return [
      offline ? offlineNote() : null,
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Lien'),
        h('div', { class: 'link-box' }, icon('link', 'icon--sm'), h('span', { class: 'link-box__url', translate: 'no' }, shown))),
      h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => copy(share.url, 'Lien copié') }, icon('copy', 'icon--sm'), 'Copier le lien'),
      expiry,
      durationPart,
      passwordPart,
      button('link-off', 'Arrêter le partage', async () => {
        const ok = await confirmDialog({
          title: 'Arrêter le partage ?',
          text: 'Le lien ne fonctionnera plus. Vous pourrez en créer un nouveau.',
          confirmLabel: 'Arrêter',
        });
        if (ok) act(() => del(url), { done: 'Partage arrêté' });
      }, 'btn--danger-outline'),
    ];
  }

  load(); // tout est prêt : premier affichage
}
