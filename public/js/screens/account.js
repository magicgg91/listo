// Écran « Mon compte » (ouvert depuis la carte du compte, en haut des
// Réglages) : identité, puis les blocs Sécurité (mot de passe, double
// authentification), Apparence (thème) et Ce téléphone (réinitialisation).
// Ces blocs étaient auparavant dans les Réglages : mêmes écrans, mêmes
// confirmations, mêmes actions, simplement déplacés. Ouvert à tous les
// comptes connectés ; chaque action reste vérifiée par le serveur.

import { h, icon, avatar } from '../dom.js';
import { navigate, goBack } from '../router.js';
import { applyTheme, savedTheme } from '../theme.js';
import { app, resetLocalCopy, pendingCount } from '../app.js';
import { toast, confirmDialog } from '../ui.js';
import { topbar, row, roleChip } from './settings.js';

export function renderAccount() {
  const user = app.user;

  // Interrupteur de thème : écrit simplement data-theme sur <html> (effet
  // immédiat, choix mémorisé sur ce téléphone, voir theme.js)
  const themes = [['light', 'sun', 'Clair'], ['dark', 'moon', 'Sombre'], ['auto', 'auto', 'Auto']];
  const options = themes.map(([value, iconName, label]) => h('button', {
    class: 'segmented__opt',
    type: 'button',
    role: 'radio',
    'aria-checked': String(savedTheme() === value),
    onClick: () => {
      applyTheme(value);
      for (const option of options) option.setAttribute('aria-checked', String(option.dataset.value === value));
    },
  }, icon(iconName, 'icon--sm'), label));
  themes.forEach(([value], i) => { options[i].dataset.value = value; });

  const twoFactorRow = user.totpEnabled
    ? row({
      iconName: 'shield',
      title: 'Double authentification',
      sub: 'Code à 6 chiffres à chaque connexion',
      end: h('span', { class: 'chip chip--strong' }, icon('check', 'icon--xs'), 'Activée'),
      onClick: () => navigate('twoFactor'),
    })
    : row({ iconName: 'shield', title: 'Double authentification', sub: 'Désactivée', onClick: () => navigate('twoFactor') });

  return h('div', { class: 'screen' },
    topbar('Mon compte', () => goBack('settings')),
    h('div', { class: 'body' },
      h('div', { class: 'card account' },
        avatar(user.displayName, { large: true }),
        h('div', { class: 'grow' }, h('p', { class: 'row__title' }, user.displayName), h('p', { class: 'row__sub' }, user.username ? `Identifiant : ${user.username}` : 'Compte connecté')),
        roleChip(user)),
      h('h2', { class: 'section-title' }, 'Sécurité'),
      h('div', { class: 'group' },
        row({ iconName: 'lock', title: 'Mot de passe', sub: 'Modifier mon mot de passe', onClick: () => navigate('password') }),
        twoFactorRow),
      h('h2', { class: 'section-title' }, 'Apparence'),
      h('div', { class: 'group group--pad' }, h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Thème' }, options)),
      // Données gardées sur ce téléphone : remise à zéro si elles semblent
      // abîmées (tout est rechargé depuis le serveur)
      h('h2', { class: 'section-title' }, 'Ce téléphone'),
      h('div', { class: 'group' },
        row({ iconName: 'sync', title: 'Réinitialiser les données de ce téléphone', sub: 'Recharger les listes depuis le serveur', onClick: resetPhone }))));
}

// Remise à zéro de la copie locale (avec confirmation). Les modifications
// pas encore envoyées sont gardées : elles repartiront ensuite.
async function resetPhone() {
  if (!navigator.onLine) {
    toast('Indisponible hors ligne : il faut du réseau pour tout recharger.');
    return;
  }
  const waiting = pendingCount();
  const ok = await confirmDialog({
    title: 'Réinitialiser les données de ce téléphone ?',
    text: `Les listes gardées sur ce téléphone seront rechargées depuis le serveur.${waiting ? ` Les ${waiting} modification${waiting > 1 ? 's' : ''} en attente ${waiting > 1 ? 'sont gardées et seront envoyées' : 'est gardée et sera envoyée'}.` : ''}`,
    confirmLabel: 'Réinitialiser',
    danger: false,
  });
  if (!ok) return;
  await resetLocalCopy();
  toast('Données rechargées depuis le serveur', { low: true });
}
