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
import { isWishList } from '../list-types.js';
import { t } from '../i18n.js';

// Liste d'envies : ce que voient les visiteurs, et l'avertissement sur le
// destinataire (partie B : les visiteurs voient quels souhaits sont réservés)
export const wishShareNote = () => t('partage.envies.note');
export const wishShareWarning = () => t('partage.envies.avertissement');

// Durées proposées (fonction : les textes sont lus dans la langue choisie)
const durations = () => [
  { label: t('partage.duree.uneHeure'), hours: 1 },
  { label: t('partage.duree.vingtQuatreHeures'), hours: 24 },
  { label: t('partage.duree.septJours'), hours: 7 * 24 },
  { label: t('partage.duree.trenteJours'), hours: 30 * 24 },
  { label: t('partage.duree.personnalisee'), hours: 'custom' },
  { label: t('partage.duree.illimitee'), hours: null },
];
const DEFAULT_HOURS = 24;
const MAX_HOURS = 365 * 24;
const offlineText = () => t('partage.horsLigne');

// Choix de la durée (grille de six boutons + durée personnalisée).
// Renvoie { element, value } ; value() donne le nombre d'heures, null pour
// « illimitée », ou undefined si la durée personnalisée est invalide.
function durationPicker({ disabled }) {
  let chosen = DEFAULT_HOURS;
  let unit = 'days';
  const number = h('input', { class: 'input', type: 'number', inputmode: 'numeric', autocomplete: 'off', min: '1', step: '1', value: '3', 'aria-label': t('partage.duree.nombre'), disabled });
  const units = [['hours', t('partage.duree.heures')], ['days', t('partage.duree.jours')]].map(([value, label]) => {
    const option = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', disabled }, label);
    option.addEventListener('click', () => {
      unit = value;
      paint();
    });
    return { value, option };
  });
  const custom = field(t('partage.duree.choixPersonnalise'), h('div', { class: 'duration-custom' },
    number, h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': t('partage.duree.unite') }, units.map((u) => u.option))));
  const options = durations().map((duration) => {
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
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('partage.duree.titre')),
        h('div', { class: 'duration', role: 'radiogroup', 'aria-label': t('partage.duree.titre') }, options.map((o) => o.option))),
      custom.field,
    ],
    value() {
      if (chosen !== 'custom') return chosen;
      const count = Number(number.value);
      const hours = unit === 'days' ? count * 24 : count;
      if (!Number.isInteger(count) || count < 1 || hours > MAX_HOURS) {
        custom.setError(unit === 'days' ? t('partage.duree.erreur.jours') : t('partage.duree.erreur.heures', { max: MAX_HOURS }));
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
    toast(t('partage.copie.impossible'));
  }
}

// Dernier état connu du lien de chaque liste (sans mot de passe), pour
// montrer la feuille grisée si le réseau disparaît. Gardé en mémoire
// seulement, le temps de la visite.
const lastKnown = new Map();

export function openShareSheet(list) {
  const part = linkPart(list, () => sheet.close());
  const sheet = openSheet({
    title: t('partage.feuille.titre'),
    content: part.body,
    scroll: true,
    onClose: part.dispose,
  });
  part.start();
}

// Contenu « lien public » (feuille du téléphone, ou section du panneau
// « Partager la liste » sur ordinateur). close() ferme la fenêtre qui le
// contient. Renvoie { body, start(), dispose() }.
export function linkPart(list, close) {
  const url = `/api/lists/${encodeURIComponent(list.id)}/share`;
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('partage.chargement')));
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
  const dispose = () => {
    closed = true;
    password = null; // le mot de passe n'est gardé nulle part
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };

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
      replace(body, offlineNote(), h('p', { class: 'muted' }, t('partage.lienActif')));
      return;
    }
    replace(body, share ? activeView(offline) : createView(offline));
  }

  const offlineNote = () => h('p', { class: 'note', role: 'status' }, icon('cloud-off', 'icon--sm'), h('span', {}, offlineText()));
  // Liste d'envies : la phrase d'information, puis l'avertissement sur le
  // destinataire qui ouvrirait le lien sans être connecté
  const wishNotes = () => (isWishList(list)
    ? [h('p', { class: 'note', id: 'share-wish-note' }, icon('gift', 'icon--sm'), h('span', {}, wishShareNote())),
      h('p', { class: 'note note--danger', id: 'share-wish-warning', role: 'note' }, icon('alert', 'icon--sm'), h('span', {}, wishShareWarning()))]
    : null);

  // --- Aucun lien : création (partage-lien-1, 2 et 7) ---
  function createView(offline) {
    const off = offline || busy;
    const picker = durationPicker({ disabled: off });
    let protect = false;
    const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': t('partage.protection'), disabled: off });
    toggle.addEventListener('click', () => {
      protect = !protect;
      toggle.setAttribute('aria-checked', String(protect));
    });
    const create = h('button', { class: 'btn btn--primary btn--block', type: 'button', disabled: off }, icon('link', 'icon--sm'), t('partage.creer'));
    create.addEventListener('click', () => {
      const durationHours = picker.value();
      if (durationHours === undefined) return;
      act(() => put(url, { durationHours, protect }), { done: t('partage.cree') });
    });
    return [
      offline ? offlineNote() : h('p', { class: 'muted' }, t('partage.creation.texte')),
      wishNotes(),
      picker.element,
      h('div', { class: 'card' }, h('div', { class: 'row' },
        h('span', { class: 'row__icon' }, icon('lock', 'icon--sm')),
        h('div', { class: 'row__body' },
          h('span', { class: 'row__title' }, t('partage.protection')),
          h('span', { class: 'row__sub' }, t('partage.protection.detail'))),
        toggle)),
      create,
    ];
  }

  // --- Lien actif (partage-lien-3, 4 et 5) ---
  function activeView(offline) {
    const off = offline || busy;
    const shown = share.url?.replace(/^https?:\/\//, '') ?? '';
    const button = (iconName, label, onClick, kind = 'btn--secondary') => {
      const el = h('button', { class: `btn ${kind} btn--block`, type: 'button', disabled: off }, icon(iconName, 'icon--sm'), label);
      el.addEventListener('click', onClick);
      return el;
    };

    const expiry = share.expiresAt
      ? h('p', { class: 'expiry' }, icon('clock', 'icon--sm'), h('span', {},
        h('span', { class: 'expiry__title' }, t('partage.expiration.date', { date: dateTimeLabel(share.expiresAt) })),
        h('span', { class: 'expiry__sub' }, timeLeftLabel(share.expiresAt))))
      : h('p', { class: 'expiry' }, icon('clock', 'icon--sm'), h('span', {},
        h('span', { class: 'expiry__title' }, t('partage.expiration.aucune')),
        h('span', { class: 'expiry__sub' }, t('partage.expiration.aucune.detail'))));

    // Changer la durée : la grille s'ouvre sous l'expiration
    let durationPart;
    if (editingDuration) {
      const picker = durationPicker({ disabled: off });
      durationPart = [
        picker.element,
        h('div', { class: 'dialog__actions' },
          button('close', t('partage.annuler'), () => {
            editingDuration = false;
            draw();
          }),
          button('check', t('partage.enregistrer'), () => {
            const durationHours = picker.value();
            if (durationHours === undefined) return;
            act(() => put(url, { durationHours }), { done: t('partage.duree.changee') });
          }, 'btn--primary')),
      ];
    } else {
      durationPart = button('clock', t('partage.duree.changer'), () => {
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
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => copy(password, t('partage.motDePasse.copie')) }, icon('copy', 'icon--sm'), t('partage.copier')))
        : h('div', { class: 'secret__row' },
          h('span', { class: 'secret__value secret__value--masked', role: 'img', 'aria-label': t('partage.motDePasse.masque') }, '••••••••••••••••'));
      passwordPart = [
        h('div', { class: 'secret' }, h('p', { class: 'secret__label' }, icon('lock', 'icon--xs'), t('partage.motDePasse')), value),
        password ? h('p', { class: 'note', role: 'status' }, icon('alert', 'icon--sm'), h('span', {}, t('partage.motDePasse.uneFois'))) : null,
        button('reset', t('partage.motDePasse.nouveau'), async () => {
          const ok = await confirmDialog({
            title: t('partage.motDePasse.nouveau.question'),
            text: t('partage.motDePasse.nouveau.texte'),
            confirmLabel: t('partage.motDePasse.nouveau.confirmer'),
            danger: false,
          });
          if (ok) act(() => put(url, { password: 'new' }));
        }),
        button('lock', t('partage.motDePasse.retirer'), async () => {
          const ok = await confirmDialog({
            title: t('partage.motDePasse.retirer.question'),
            text: t('partage.motDePasse.retirer.texte'),
            confirmLabel: t('partage.motDePasse.retirer.confirmer'),
          });
          if (ok) act(() => put(url, { password: 'none' }), { done: t('partage.motDePasse.retire') });
        }),
      ];
    } else {
      passwordPart = [
        h('p', { class: 'note', role: 'status' }, icon('eye', 'icon--sm'), h('span', {}, t('partage.sansMotDePasse'))),
        button('lock', t('partage.motDePasse.ajouter'), () => act(() => put(url, { password: 'new' }))),
      ];
    }

    return [
      offline ? offlineNote() : null,
      wishNotes(),
      // Adresse illisible (clé de Listo changée) : il faut recréer le lien
      share.url
        ? [h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('partage.lien')),
          h('div', { class: 'link-box' }, icon('link', 'icon--sm'), h('span', { class: 'link-box__url', translate: 'no' }, shown))),
        h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => copy(share.url, t('partage.lien.copie')) }, icon('copy', 'icon--sm'), t('partage.lien.copier'))]
        : h('p', { class: 'note note--danger', role: 'status' }, icon('alert', 'icon--sm'),
          h('span', {}, t('partage.lien.illisible'))),
      expiry,
      durationPart,
      passwordPart,
      button('link-off', t('partage.arreter'), async () => {
        const ok = await confirmDialog({
          title: t('partage.arreter.question'),
          text: t('partage.arreter.texte'),
          confirmLabel: t('partage.arreter.confirmer'),
        });
        if (ok) act(() => del(url), { done: t('partage.arrete') });
      }, 'btn--danger-outline'),
    ];
  }

  // load() : premier affichage, une fois la fenêtre ouverte
  return { body, start: () => load(), dispose };
}
