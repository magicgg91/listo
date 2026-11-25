// Écran « Notifications » (#/reglages/notifications), ouvert depuis
// Réglages. Pas de maquette : composants du kit (.group, .toggle-row,
// .switch, .note, .btn), comme « Nouveautés » dans Mon compte.
//
// Étape 1 (socle) : « Cet appareil ».
// - Interrupteur « Recevoir les notifications sur cet appareil ». La demande
//   d'autorisation du navigateur ne se fait QU'après un appui sur cet
//   interrupteur, jamais à l'ouverture de l'écran ni au chargement.
// - Sous l'interrupteur, l'état expliqué en clair (.note, role="status") :
//   fonction coupée sur le serveur, navigateur incompatible, iPhone ou iPad
//   pas encore ouvert depuis l'écran d'accueil, autorisation refusée,
//   hors ligne, activées.
// - « Envoyer une notification test » (activées seulement).
// - En bas : ce que voient les services de notification (Apple, Google,
//   Mozilla, Microsoft).
//
// Étape 2 : réglages du COMPTE (tous ses appareils), en ligne seulement ;
// depuis l'étape 4 du cadrage (page Notifications), « Notifications
// reçues » est toujours là, même sans LISTO_PUSH : ces catégories filtrent
// aussi la page Notifications (mêmes réglages, décision du 23 novembre
// 2026) ; « Contenu » seulement avec LISTO_PUSH (il ne touche que l'écran
// verrouillé du téléphone : la page montre toujours le détail) :
// - « Notifications reçues » : Modifications (toujours celles des autres :
//   jamais les siennes), Envies, Partage,
//   Échéances (étape 3 : résumé quotidien des tâches, vers 8 h) ;
// - « Contenu » : « Afficher le détail dans la notification » (désactivé au
//   départ ; sinon « Léa a modifié « Courses » », sans le nom des éléments).
// Mêmes interrupteurs que « Nouveautés » (role="switch", aria-checked, titre
// et description reliés) ; « Couper les notifications » est dans le menu ⋮ de
// chaque liste (list-actions.js).
// Textes posés avec textContent (h()) ; aucun curseur mis tout seul.
//
// Regroupement du 10 novembre 2026 (décision du propriétaire) : un seul
// écran, sur téléphone et ordinateur, en deux parties :
// - « Dans l'application » : les Nouveautés (pastilles et halo), auparavant
//   dans « Mon compte » ; marchent hors ligne (file d'attente) et même si
//   les notifications sont coupées sur le serveur ;
// - « Sur cet appareil » : les notifications push (interrupteur, état, test),
//   puis « Notifications reçues » et « Contenu », qui valent pour tous les
//   appareils du compte.
// En bas, un rappel : les deux réglages par liste sont dans le menu ⋮.

import { h, icon, replace } from '../dom.js';
import { errorMessage } from '../api.js';
import { goBack } from '../router.js';
import { app, onDataChange, shownFeatures } from '../app.js';
import * as actions from '../actions.js';
import { toast } from '../ui.js';
import { topbar } from './settings.js';
import { deviceState, enablePush, disablePush, sendTestPush, loadPushState, savePushSettings, PushSetupError } from '../push.js';
import { t } from '../i18n.js';

// Les textes sont lus par t() au moment de l'affichage (jamais au chargement
// du module : la langue n'est pas encore choisie), d'où des fonctions.

// Explication de chaque état (icône, texte, ton d'alerte)
export const stateNotes = () => ({
  'server-off': ['bell', t('notifications.etat.serveurCoupe')],
  unsupported: ['alert', t('notifications.etat.incompatible')],
  'ios-install': ['alert', t('notifications.etat.iphone')],
  denied: ['alert', t('notifications.etat.refusees'), true],
  offline: ['cloud-off', t('notifications.etat.horsLigne')],
  on: ['check', t('notifications.etat.activees')],
  off: null,
});
// Catégories qui ne concernent que les listes : cachées pour un compte qui
// ne les utilise pas (un invité sans « Listes », docs/cadrage-comptes.md,
// étape 3 ; sa valeur est gardée)
export const LIST_ONLY_KINDS = ['wishes'];
// Réglages du compte : [clé, titre, description]
export const kindRows = () => [
  ['changes', t('notifications.sujet.modifications'), t('notifications.sujet.modifications.detail')],
  ['wishes', t('notifications.sujet.envies'), t('notifications.sujet.envies.detail')],
  ['sharing', t('notifications.sujet.partage'), t('notifications.sujet.partage.detail')],
  ['due', t('notifications.sujet.echeances'), t('notifications.sujet.echeances.detail')],
];
export const detailRow = () => ['detail', t('notifications.contenu.detail'), t('notifications.contenu.detail.texte')];
export const accountNote = () => t('notifications.compte.note');
export const perListNote = () => t('notifications.parListe.note');
export const privacyNote = () => t('notifications.confidentialite');

export function renderNotifications(onLeave = () => {}) {
  let current = { state: 'loading' };
  let busy = false;

  const toggle = h('button', {
    class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', disabled: true,
    'aria-labelledby': 'notif-appareil-titre', 'aria-describedby': 'notif-appareil-aide',
  });
  const note = h('div', { class: 'stack', role: 'status' });
  const testButton = h('button', { class: 'btn btn--secondary btn--block', type: 'button', hidden: true }, icon('bell', 'icon--sm'), t('notifications.test.bouton'));

  function paint() {
    const { state } = current;
    const on = state === 'on';
    toggle.setAttribute('aria-checked', String(on));
    toggle.disabled = busy || !['on', 'off'].includes(state);
    testButton.hidden = !on;
    testButton.disabled = busy;
    const spec = stateNotes()[state];
    // Échec de l'inscription du navigateur : l'explication reste affichée
    // sous l'interrupteur (zone lue par les lecteurs d'écran) jusqu'au
    // prochain essai
    if (current.failure) {
      replace(note, h('p', { class: 'note note--danger' }, icon('alert', 'icon--sm'), h('span', {}, current.failure)));
    } else if (spec) {
      const [iconName, text, danger] = spec;
      replace(note, h('p', { class: danger ? 'note note--danger' : 'note' }, icon(iconName, 'icon--sm'), h('span', {}, text)));
    } else replace(note);
  }

  // --- Réglages du compte (catégories, détail) ---
  let settings = null;
  // Listes non utilisées : ni « Envies », ni le rappel des réglages d'une
  // liste, ni « Signaler les éléments cochés » (newsSwitches)
  const listsUsed = shownFeatures().lists;
  const switches = [...kindRows().filter(([key]) => listsUsed || !LIST_ONLY_KINDS.includes(key)), detailRow()].map(([key, label, help]) => {
    const toggle = h('button', {
      class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', disabled: true,
      'aria-labelledby': `notif-${key}-titre`, 'aria-describedby': `notif-${key}-aide`,
    });
    toggle.addEventListener('click', async () => {
      if (!settings || toggle.disabled) return;
      toggle.disabled = true;
      try {
        settings = await savePushSettings({ [key]: !settings[key] });
      } catch (error) {
        toast(errorMessage(error));
      }
      paintSettings();
    });
    const row = h('div', { class: 'toggle-row' },
      h('div', { class: 'grow' },
        h('span', { class: 'row__title', id: `notif-${key}-titre` }, label),
        h('span', { class: 'row__sub', id: `notif-${key}-aide` }, help)),
      toggle);
    return { key, toggle, row };
  });
  const accountPart = h('div', {},
    h('h2', { class: 'section-title' }, t('notifications.recues.titre')),
    h('div', { class: 'group list-options' }, switches.filter((s) => s.key !== 'detail').map((s) => s.row)),
    h('h2', { class: 'section-title detail-part', hidden: !app.user.push }, t('notifications.contenu.titre')),
    h('div', { class: 'group list-options detail-part', hidden: !app.user.push }, switches.filter((s) => s.key === 'detail').map((s) => s.row)),
    h('div', { class: 'group-after' }, h('p', { class: 'muted' }, accountNote())));
  // Catégories : toujours (elles filtrent aussi la page Notifications,
  // étape 4) ; « Contenu » (le détail sur l'écran verrouillé) : seulement
  // avec les notifications push sur le serveur
  const detailPart = accountPart.querySelectorAll('.detail-part');
  function paintSettings() {
    for (const el of detailPart) el.hidden = !app.user.push;
    for (const { key, toggle } of switches) {
      toggle.setAttribute('aria-checked', String(Boolean(settings?.[key])));
      toggle.disabled = !settings || !navigator.onLine;
    }
  }

  async function load() {
    const [state, server] = await Promise.all([deviceState(app.user), loadPushState(app.user)]);
    current = state;
    settings = server?.settings ?? null;
    paint();
    paintSettings();
  }

  toggle.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    current = { ...current, failure: null }; // nouvel essai : l'ancienne explication s'efface
    paint();
    try {
      if (current.state === 'on') {
        await disablePush();
        current = { ...current, state: 'off' };
        toast(t('notifications.appareil.desactivees'));
      } else {
        // Seul endroit où le navigateur demande l'autorisation
        const state = await enablePush(app.user, current.publicKey);
        current = { ...current, state };
        if (state === 'on') toast(t('notifications.appareil.activees'));
      }
    } catch (error) {
      if (!(error instanceof PushSetupError)) toast(errorMessage(error));
      current = await deviceState(app.user);
      if (error instanceof PushSetupError) current = { ...current, failure: error.message };
    } finally {
      busy = false;
      paint();
    }
  });

  testButton.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    paint();
    try {
      await sendTestPush();
      toast(t('notifications.test.envoyee'));
    } catch (error) {
      toast(errorMessage(error));
      current = await deviceState(app.user);
    } finally {
      busy = false;
      paint();
    }
  });

  // Réseau retrouvé ou perdu : l'état est relu
  const reload = () => load();
  window.addEventListener('online', reload);
  window.addEventListener('offline', reload);
  onLeave(() => {
    window.removeEventListener('online', reload);
    window.removeEventListener('offline', reload);
  });
  load();

  return h('div', { class: 'screen' },
    topbar(t('notifications.titre'), () => goBack('settings')),
    h('div', { class: 'body' },
      h('h2', { class: 'section-title' }, t('notifications.application.titre')),
      newsSwitches(onLeave),
      h('h2', { class: 'section-title' }, t('notifications.appareil.titre')),
      h('div', { class: 'group list-options' },
        h('div', { class: 'toggle-row' },
          h('div', { class: 'grow' },
            h('span', { class: 'row__title', id: 'notif-appareil-titre' }, t('notifications.appareil.recevoir')),
            h('span', { class: 'row__sub', id: 'notif-appareil-aide' }, t('notifications.appareil.recevoir.detail'))),
          toggle)),
      // Sous la carte : état expliqué, notification test, confidentialité
      h('div', { class: 'stack group-after' }, note, testButton, h('p', { class: 'muted' }, privacyNote())),
      accountPart,
      // Réglages d'une seule liste : dans son menu ⋮ (list-actions.js)
      listsUsed ? h('div', { class: 'group-after' }, h('p', { class: 'muted' }, perListNote())) : null));
}

// Nouveautés (réglages du compte, valables sur tous mes appareils) :
// « Nouveautés » (activé par défaut : pastilles sur « Mes listes » et halo
// sur les éléments ajoutés ou modifiés par les autres) et « Signaler les
// éléments cochés » (désactivé par défaut ; libellé générique : il vaut pour
// toutes les listes). Celui-ci n'a d'effet que si « Nouveautés » est
// activé : sinon sa ligne est cachée (hidden : ni vue, ni Tab, ni lecteur
// d'écran), et sa valeur gardée revient avec elle. On ne fait que montrer ou
// cacher la ligne, sans redessiner la section : le focus reste sur
// l'interrupteur touché. Même interrupteur que les options
// d'une liste (.switch, role="switch") : l'état se voit à la position du
// bouton (jamais la couleur seule) et s'annonce par aria-checked ; sous le
// titre, seulement la description, qui ne change pas (reliée au bouton par
// aria-describedby). Passent par la file d'attente : hors ligne compris.
export function newsSwitches(onLeave) {
  const rows = [
    ['enabled', t('notifications.nouveautes.titre'), t('notifications.nouveautes.detail')],
    ['checks', t('notifications.nouveautes.cochees'), t('notifications.nouveautes.cochees.detail')],
  ].map(([key, label, help]) => {
    const titleId = `news-${key}-title`;
    const helpId = `news-${key}-help`;
    const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-labelledby': titleId, 'aria-describedby': helpId });
    const paint = () => {
      toggle.setAttribute('aria-checked', String(Boolean(app.data.news?.[key])));
      // « Signaler les éléments cochés » : des listes seulement
      if (key === 'checks') row.hidden = !app.data.news?.enabled || !shownFeatures().lists;
    };
    toggle.addEventListener('click', () => {
      actions.setNewsSettings({ [key]: !app.data.news?.[key] });
    });
    const row = h('div', { class: 'toggle-row' },
      h('div', { class: 'grow' }, h('span', { class: 'row__title', id: titleId }, label), h('span', { class: 'row__sub', id: helpId }, help)),
      toggle);
    return { row, paint };
  });
  const paintAll = () => rows.forEach((r) => r.paint());
  paintAll();
  onLeave(onDataChange(paintAll)); // changé sur un autre appareil : suit
  return h('div', { class: 'group list-options' }, rows.map((r) => r.row));
}
