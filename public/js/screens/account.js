// Écran « Mon compte » (ouvert depuis la carte du compte, en haut des
// Réglages) : identité, puis les blocs Sécurité (mot de passe, double
// authentification), Apparence (thème), Langue (dès qu'une deuxième langue
// est complète, voir public/js/i18n.js), Assistants IA (si l'accès est activé), Ce
// téléphone (réinitialisation), et tout en bas « Se déconnecter » (déplacé
// des Réglages, où il était fixé au-dessus du bandeau du bas : décision du
// propriétaire du 11 novembre 2026 ; il défile avec le reste). Les réglages des Nouveautés sont dans
// Réglages › Notifications, partie « Dans l'application » (décision du
// propriétaire du 10 novembre 2026).
// Ces blocs étaient auparavant dans les Réglages : mêmes écrans, mêmes
// confirmations, mêmes actions, simplement déplacés. Ouvert à tous les
// comptes connectés ; chaque action reste vérifiée par le serveur.

import { h, icon, avatar } from '../dom.js';
import { navigate, goBack } from '../router.js';
import { applyTheme, savedTheme } from '../theme.js';
import { app, resetLocalCopy, pendingCount, logOut, providerName, applyLanguage, allowedNow } from '../app.js';
import { put, errorMessage } from '../api.js';
import { t, getLocale, READY_LOCALES, LOCALE_NAMES } from '../i18n.js';
import { toast, confirmDialog, onPc } from '../ui.js';
import { topbar, row, roleChip } from './settings.js';

export function renderAccount(onLeave = () => {}) {
  const user = app.user;
  // Nom du fournisseur d'identité (LISTO_OIDC_NAME), « SSO » par défaut
  const provider = providerName();

  // Interrupteur de thème : écrit simplement data-theme sur <html> (effet
  // immédiat, choix mémorisé sur ce téléphone, voir theme.js)
  const themes = [['light', 'sun', t('compte.theme.clair')], ['dark', 'moon', t('compte.theme.sombre')], ['auto', 'auto', t('compte.theme.auto')]];
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
      title: t('compte.deuxFacteurs.titre'),
      sub: t('compte.deuxFacteurs.active.detail'),
      end: h('span', { class: 'chip chip--strong' }, icon('check', 'icon--xs'), t('compte.deuxFacteurs.active')),
      onClick: () => navigate('twoFactor'),
    })
    : row({ iconName: 'shield', title: t('compte.deuxFacteurs.titre'), sub: t('compte.deuxFacteurs.desactivee'), onClick: () => navigate('twoFactor') });

  return h('div', { class: 'screen' },
    topbar(t('compte.titre'), () => goBack('settings')),
    h('div', { class: 'body' },
      h('div', { class: 'card account' },
        avatar(user.displayName, { large: true }),
        h('div', { class: 'grow' }, h('p', { class: 'row__title' }, user.displayName), h('p', { class: 'row__sub' }, user.username ? t('compte.identifiant', { username: user.username }) : t('compte.connecte'))),
        roleChip(user)),
      h('h2', { class: 'section-title' }, t('compte.securite')),
      // Session ouverte avec le fournisseur d'identité (« Connecté avec … »), ou
      // compte « … seulement » (choisi par l'Admin : passwordLogin faux) : le
      // mot de passe et la double authentification se gèrent chez le
      // fournisseur d'identité (le serveur refuse aussi de les changer) ;
      // sinon, comme avant
      user.loginMethod === 'oidc' || user.passwordLogin === false
        ? h('div', { class: 'group' },
          row({ iconName: 'shield', title: t('compte.fournisseur.connecte', { provider }), sub: t('compte.fournisseur.detail', { provider }) }))
        : h('div', { class: 'group' },
          row({ iconName: 'lock', title: t('compte.motDePasse.titre'), sub: t('compte.motDePasse.detail'), onClick: () => navigate('password') }),
          twoFactorRow),
      h('h2', { class: 'section-title' }, t('compte.apparence')),
      h('div', { class: 'group group--pad' }, h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': t('compte.theme') }, options)),
      languageBlock(),
      // Accès des assistants IA : seulement s'il est activé sur le serveur,
      // et autorisé à ce compte par l'Admin (case « Assistants IA »,
      // docs/cadrage-comptes.md, étape 2 ; relue à chaque synchronisation)
      user.claudeUrl && allowedNow().mcp ? [
        h('h2', { class: 'section-title' }, t('compte.claude')),
        h('div', { class: 'group' },
          row({ iconName: 'link', title: t('compte.claude.connexions'), sub: t('compte.claude.connexions.detail'), onClick: () => navigate('claudeConnections') })),
      ] : null,
      // Données gardées sur ce téléphone : remise à zéro si elles semblent
      // abîmées (tout est rechargé depuis le serveur). Sur ordinateur, « Cet
      // appareil » (décision du propriétaire du 10 novembre 2026) ; le
      // téléphone garde « Ce téléphone ».
      h('h2', { class: 'section-title' }, device().section),
      h('div', { class: 'group' },
        row({ iconName: 'sync', title: device().reset, sub: t('compte.appareil.reinitialiser.detail'), onClick: resetPhone })),
      // Se déconnecter : tout en bas, à part du reste
      h('div', { class: 'account__logout' },
        h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: () => confirmLogOut() }, icon('logout', 'icon--sm'), t('compte.deconnexion')))));
}

// « Se déconnecter » : sur le téléphone, une confirmation d'abord (décision
// du propriétaire du 11 novembre 2026 : pour revenir, il faut retaper son
// mot de passe). S'il reste des modifications pas encore envoyées, logOut
// pose sa propre question, plus précise : une seule fenêtre dans les deux
// cas. Sur ordinateur, pas de confirmation (comme avant).
async function confirmLogOut() {
  if (!onPc() && !pendingCount()) {
    const ok = await confirmDialog({
      title: t('compte.deconnexion.question'),
      text: t('compte.deconnexion.texte'),
      confirmLabel: t('compte.deconnexion'),
      cancelLabel: t('compte.deconnexion.rester'),
      focusCancel: true,
    });
    if (!ok) return;
  }
  await logOut();
}

// Nom de l'appareil dans les textes : « ce téléphone » ou, sur ordinateur,
// « cet appareil »
function device() {
  return onPc()
    ? { section: t('compte.appareil.pc'), reset: t('compte.appareil.pc.reinitialiser'), question: t('compte.appareil.pc.reinitialiser.question'), text: t('compte.appareil.pc.reinitialiser.texte') }
    : { section: t('compte.appareil.telephone'), reset: t('compte.appareil.telephone.reinitialiser'), question: t('compte.appareil.telephone.reinitialiser.question'), text: t('compte.appareil.telephone.reinitialiser.texte') };
}

// Remise à zéro de la copie locale (avec confirmation). Les modifications
// pas encore envoyées sont gardées : elles repartiront ensuite.
async function resetPhone() {
  if (!navigator.onLine) {
    toast(t('compte.appareil.horsLigne'));
    return;
  }
  const waiting = pendingCount();
  const ok = await confirmDialog({
    title: device().question,
    text: [device().text, waiting ? t('compte.appareil.reinitialiser.enAttente', { count: waiting }) : null].filter(Boolean).join(' '),
    confirmLabel: t('compte.appareil.reinitialiser'),
    danger: false,
  });
  if (!ok) return;
  await resetLocalCopy();
  toast(t('compte.appareil.recharge'), { low: true });
}

// Langue (Mon compte) : « Automatique » (langue du navigateur, sinon celle de
// l'installation) ou une langue complète. Le choix est enregistré sur le
// compte (même langue sur tous ses appareils). Si la langue affichée change,
// l'application se recharge pour réafficher tous les textes. Rien tant
// qu'une seule langue est complète.
function languageBlock() {
  if (READY_LOCALES.length < 2) return null;
  const choices = [[null, t('compte.langue.auto')], ...READY_LOCALES.map((locale) => [locale, LOCALE_NAMES[locale]])];
  const buttons = choices.map(([locale, label]) => h('button', {
    class: 'segmented__opt',
    type: 'button',
    role: 'radio',
    // Nom d'une langue écrit dans cette langue : lu avec la bonne prononciation
    ...(locale ? { lang: locale } : {}),
    'aria-checked': String((app.user.locale ?? null) === locale),
    onClick: async () => {
      if ((app.user.locale ?? null) === locale) return;
      try {
        await put('/api/me/locale', { locale });
      } catch (error) {
        toast(errorMessage(error));
        return;
      }
      app.user.locale = locale;
      buttons.forEach((button, i) => button.setAttribute('aria-checked', String(choices[i][0] === locale)));
      const before = getLocale();
      if (applyLanguage() !== before) location.reload();
      else toast(t('compte.langue.enregistree'), { low: true });
    },
  }, label));
  return [
    h('h2', { class: 'section-title' }, t('compte.langue.titre')),
    h('div', { class: 'group group--pad' }, h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': t('compte.langue.titre') }, buttons)),
  ];
}
