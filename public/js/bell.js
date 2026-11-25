// Cloche des notifications (étape 4 du cadrage, 23 novembre 2026) : un
// bouton-icône qui ouvre la page Notifications, avec le nombre de non lues
// en pastille (« 9+ » au-delà de 9 ; muette pour les lecteurs d'écran : le
// nombre est dans le nom lu, « Notifications, 3 non lues »).
//
// Elle est dans l'en-tête de l'Accueil (home.js). Quand l'Accueil est coupé
// (Réglages › Accueil, home-tiles.js), elle passe dans la barre du haut de
// « Échéances », « Listes » et « Notes » (téléphone et ordinateur), avant
// leurs autres boutons : topBell. Elle y suit le réglage et le nombre de non
// lues sans que l'écran soit refait.

import { h, icon } from './dom.js';
import { navigate } from './router.js';
import { app, onDataChange, shownFeatures } from './app.js';
import { inboxUnread } from './store.js';
import { firstScreen } from './home-tiles.js';
import { t } from './i18n.js';

// Texte de la pastille
export function bellBadgeText(count) {
  return count > 9 ? '9+' : String(count);
}

// La cloche : { el, paint } ; paint() la remet à jour (nombre de non lues)
export function bell() {
  const button = h('button', { class: 'icon-btn icon-btn--badge', type: 'button', onClick: () => navigate('inbox') }, icon('bell'));
  const paint = () => {
    const count = app.data.inbox?.loaded ? inboxUnread(app.data) : 0;
    button.setAttribute('aria-label', count ? t('inbox.cloche.nonLues', { count }) : t('inbox.cloche'));
    button.querySelector('.icon-btn__badge')?.remove();
    if (count) button.append(h('span', { class: 'icon-btn__badge', 'aria-hidden': 'true' }, bellBadgeText(count)));
  };
  paint();
  return { el: button, paint };
}

// Cloche de la barre du haut d'« Échéances », « Listes » et « Notes » :
// seulement quand l'Accueil est coupé (sinon elle est sur l'Accueil) ;
// cachée (hidden : ni vue, ni Tab, ni lecteur d'écran) dans le cas
// contraire. onLeave : désabonnement en quittant l'écran.
export function topBell(onLeave) {
  const notifications = bell();
  const paint = () => {
    notifications.el.hidden = firstScreen(app.data.home, shownFeatures()) === 'home';
    notifications.paint();
  };
  paint();
  onLeave(onDataChange(paint));
  return notifications.el;
}
