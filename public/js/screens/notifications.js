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
// Étape 2 : réglages du COMPTE (tous ses appareils ; fonction activée sur le
// serveur seulement), en ligne seulement :
// - « Notifications reçues » : Modifications des autres, Envies, Partage,
//   Échéances (étape 3 : résumé quotidien des tâches, vers 8 h) ;
// - « Contenu » : « Afficher le détail dans la notification » (désactivé au
//   départ ; sinon « Léa a modifié « Courses » », sans le nom des éléments).
// Mêmes interrupteurs que « Nouveautés » (role="switch", aria-checked, titre
// et description reliés) ; « Silencer cette liste » est dans le menu ⋮ de
// chaque liste (list-actions.js).
// Textes posés avec textContent (h()) ; aucun curseur mis tout seul.

import { h, icon, replace } from '../dom.js';
import { errorMessage } from '../api.js';
import { goBack } from '../router.js';
import { app } from '../app.js';
import { toast } from '../ui.js';
import { topbar } from './settings.js';
import { deviceState, enablePush, disablePush, sendTestPush, loadPushState, savePushSettings } from '../push.js';

// Explication de chaque état (icône, texte, ton d'alerte)
export const STATE_NOTES = {
  'server-off': ['bell', 'Les notifications sont désactivées sur ce serveur Listo. La personne qui l\'administre peut les activer.'],
  unsupported: ['alert', 'Ce navigateur ne sait pas recevoir de notifications. Essayez avec un navigateur à jour.'],
  'ios-install': ['alert', 'Sur iPhone : ajoutez d\'abord Listo à l\'écran d\'accueil, puis ouvrez-le depuis son icône.'],
  denied: ['alert', 'Les notifications ont été refusées pour Listo sur cet appareil. Pour les rétablir, autorisez-les dans les réglages du navigateur ou du téléphone (notifications de ce site ou de l\'application Listo), puis revenez ici.', true],
  offline: ['cloud-off', 'Hors ligne : ce réglage demande une connexion.'],
  on: ['check', 'Activées sur cet appareil.'],
  off: null,
};
// Réglages du compte : [clé, titre, description]
export const KIND_ROWS = [
  ['changes', 'Modifications des autres', 'Ajouts, modifications et coches dans vos listes partagées, regroupés.'],
  ['wishes', 'Envies', 'Une réservation ou une participation à un cadeau, dans les listes d\'envies que vous voyez.'],
  ['sharing', 'Partage', 'On vous ajoute à une liste, ou votre droit change.'],
  ['due', 'Échéances', 'Chaque matin vers 8 h : les tâches à faire aujourd\'hui et celles en retard.'],
];
export const DETAIL_ROW = ['detail', 'Afficher le détail dans la notification', 'Le nom des éléments, par exemple « Ajouté : Lait, Pain ». Désactivé : seulement qui a modifié quelle liste.'];
export const ACCOUNT_NOTE = 'Ces réglages valent pour tous vos appareils.';
export const PRIVACY_NOTE = 'Le contenu des notifications est chiffré : seul votre appareil peut le lire. Le service de notification de votre appareil (Apple, Google, Mozilla ou Microsoft) voit seulement l\'heure, la taille du message et l\'appareil qui le reçoit.';

export function renderNotifications(onLeave = () => {}) {
  let current = { state: 'loading' };
  let busy = false;

  const toggle = h('button', {
    class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', disabled: true,
    'aria-labelledby': 'notif-appareil-titre', 'aria-describedby': 'notif-appareil-aide',
  });
  const note = h('div', { class: 'stack', role: 'status' });
  const testButton = h('button', { class: 'btn btn--secondary btn--block', type: 'button', hidden: true }, icon('bell', 'icon--sm'), 'Envoyer une notification test');

  function paint() {
    const { state } = current;
    const on = state === 'on';
    toggle.setAttribute('aria-checked', String(on));
    toggle.disabled = busy || !['on', 'off'].includes(state);
    testButton.hidden = !on;
    testButton.disabled = busy;
    const spec = STATE_NOTES[state];
    if (spec) {
      const [iconName, text, danger] = spec;
      replace(note, h('p', { class: danger ? 'note note--danger' : 'note' }, icon(iconName, 'icon--sm'), h('span', {}, text)));
    } else replace(note);
  }

  // --- Réglages du compte (catégories, détail) ---
  let settings = null;
  const switches = [...KIND_ROWS, DETAIL_ROW].map(([key, label, help]) => {
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
  const accountPart = h('div', { hidden: true },
    h('h2', { class: 'section-title' }, 'Notifications reçues'),
    h('div', { class: 'group list-options' }, switches.filter((s) => s.key !== 'detail').map((s) => s.row)),
    h('h2', { class: 'section-title' }, 'Contenu'),
    h('div', { class: 'group list-options' }, switches.filter((s) => s.key === 'detail').map((s) => s.row)),
    h('div', { class: 'group-after' }, h('p', { class: 'muted' }, ACCOUNT_NOTE)));
  function paintSettings() {
    accountPart.hidden = !app.user.push;
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
    paint();
    try {
      if (current.state === 'on') {
        await disablePush();
        current = { ...current, state: 'off' };
        toast('Notifications désactivées sur cet appareil');
      } else {
        // Seul endroit où le navigateur demande l'autorisation
        const state = await enablePush(app.user, current.publicKey);
        current = { ...current, state };
        if (state === 'on') toast('Notifications activées sur cet appareil');
      }
    } catch (error) {
      toast(errorMessage(error));
      current = await deviceState(app.user);
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
      toast('Notification test envoyée : elle arrive dans quelques secondes.');
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
    topbar('Notifications', () => goBack('settings')),
    h('div', { class: 'body' },
      h('h2', { class: 'section-title' }, 'Cet appareil'),
      h('div', { class: 'group list-options' },
        h('div', { class: 'toggle-row' },
          h('div', { class: 'grow' },
            h('span', { class: 'row__title', id: 'notif-appareil-titre' }, 'Recevoir les notifications sur cet appareil'),
            h('span', { class: 'row__sub', id: 'notif-appareil-aide' }, 'Sur ce téléphone ou cet ordinateur seulement.')),
          toggle)),
      // Sous la carte : état expliqué, notification test, confidentialité
      h('div', { class: 'stack group-after' }, note, testButton, h('p', { class: 'muted' }, PRIVACY_NOTE)),
      accountPart));
}
