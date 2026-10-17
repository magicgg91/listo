// Écrans « Réglages » (maquettes reglages-1 à 5) :
// - réglages : compte, sécurité, thème, administration (Admin), déconnexion ;
// - changement de mot de passe ;
// - activation de la double authentification (QR code, puis codes de
//   secours affichés une seule fois) ;
// - désactivation de la double authentification (pas de maquette : mêmes
//   composants ; le mot de passe et un code sont demandés).

import { h, icon, iconButton, field, passwordInput, errorNote, avatar, replace } from '../dom.js';
import { post, get, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { applyTheme, savedTheme } from '../theme.js';
import { app, logOut, resetLocalCopy, pendingCount } from '../app.js';
import { toast, confirmDialog } from '../ui.js';

const MIN_PASSWORD = 10;

// Adresses du projet sur GitHub (bloc « À propos ») : définies ici seulement
export const GITHUB = {
  owner: 'magicgg91',
  ownerUrl: 'https://github.com/magicgg91',
  repoUrl: 'https://github.com/magicgg91/listo',
};
const commitUrl = (commit) => `${GITHUB.repoUrl}/commit/${commit}`;

// Dernière version connue, gardée sur ce téléphone pour l'afficher hors
// ligne (ce n'est pas un secret : le commit du code installé)
const VERSION_KEY = 'listo-version';
const isCommit = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

// Barre de titre avec retour
function topbar(title, onBack) {
  return h('header', { class: 'topbar' },
    iconButton('chev-l', 'Retour', onBack),
    h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, title)));
}

// Ligne de réglage (icône, titre, sous-titre, élément de fin). Avec href :
// lien vers un autre site, ouvert dans un nouvel onglet, sans transmettre
// d'information à ce site (noopener, noreferrer).
function row({ iconName, title, sub, end, onClick, href }) {
  if (href) {
    return h('a', { class: 'row', href, target: '_blank', rel: 'noopener noreferrer' },
      h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon(iconName)),
      h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, title), sub ? h('span', { class: 'row__sub' }, sub) : null),
      icon('chev-r'));
  }
  const tag = onClick ? 'button' : 'div';
  return h(tag, { class: 'row', type: onClick ? 'button' : null, onClick },
    h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon(iconName)),
    h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, title), sub ? h('span', { class: 'row__sub' }, sub) : null),
    end ?? (onClick ? icon('chev-r') : null));
}

// --- Réglages ---

export function renderSettings() {
  const user = app.user;
  const isAdmin = user.role === 'admin';

  // Interrupteur de thème : écrit simplement data-theme sur <html>
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

  const logout = h('button', {
    class: 'btn btn--secondary btn--block',
    type: 'button',
    onClick: () => logOut(),
  }, icon('logout', 'icon--sm'), 'Se déconnecter');

  return h('div', { class: 'screen' },
    topbar('Réglages', () => goBack('lists')),
    h('div', { class: 'body' },
      h('div', { class: 'card account' },
        avatar(user.displayName, { large: true }),
        h('div', { class: 'grow' }, h('p', { class: 'row__title' }, user.displayName), h('p', { class: 'row__sub' }, 'Compte connecté')),
        isAdmin ? h('span', { class: 'chip chip--strong' }, icon('shield', 'icon--xs'), 'Admin') : h('span', { class: 'chip' }, 'Utilisateur')),
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
        row({ iconName: 'sync', title: 'Réinitialiser les données de ce téléphone', sub: 'Recharger les listes depuis le serveur', onClick: resetPhone })),
      isAdmin ? [
        h('h2', { class: 'section-title' }, 'Administration'),
        h('div', { class: 'group' },
          row({ iconName: 'shield', title: 'Administration', sub: 'Comptes, catégories, magasins, rayons', onClick: () => navigate('admin', { tab: 'comptes' }) })),
      ] : null,
      h('h2', { class: 'section-title' }, 'À propos'),
      aboutGroup()),
    h('div', { class: 'footer' }, logout));
}

// Bloc « À propos » : version installée, développeur, projet. La version
// arrive du serveur (GET /api/about) sans bloquer l'écran ; hors ligne, la
// dernière version connue sur ce téléphone, sinon « Indisponible hors ligne ».
function aboutGroup() {
  // commit : 40 caractères hexadécimaux, ou 'non précisé' (développement),
  // ou null (inconnu : hors ligne, ou pas encore reçu)
  const versionRow = (commit, waiting) => {
    if (isCommit(commit)) return row({ iconName: 'logo', title: `Version : ${commit.slice(0, 7)}`, sub: 'Voir cette version sur GitHub', href: commitUrl(commit) });
    if (commit === 'non précisé') return row({ iconName: 'logo', title: 'Version : développement' });
    return row({ iconName: 'logo', title: waiting ? 'Version : …' : 'Version : indisponible hors ligne' });
  };
  let known = null;
  try {
    known = localStorage.getItem(VERSION_KEY);
  } catch {
    // stockage indisponible (navigation privée…) : sans importance
  }
  if (!isCommit(known)) known = null;
  let current = versionRow(known, navigator.onLine);
  const show = (commit, waiting = false) => {
    const next = versionRow(commit, waiting);
    current.replaceWith(next);
    current = next;
  };
  get('/api/about').then(({ commit }) => {
    show(commit);
    try {
      if (isCommit(commit)) localStorage.setItem(VERSION_KEY, commit);
    } catch {
      // sans importance
    }
  }, () => show(known)); // pas de réseau : dernière version connue, sinon « indisponible »

  return h('div', { class: 'group' },
    current,
    row({ iconName: 'pencil', title: 'Développeur', sub: GITHUB.owner, href: GITHUB.ownerUrl }),
    row({ iconName: 'link', title: 'Projet', sub: 'Listo sur GitHub', href: GITHUB.repoUrl }));
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

// --- Mot de passe (reglages-5) ---

export function renderPassword() {
  const current = passwordInput({ autocomplete: 'current-password' });
  const next = passwordInput({ autocomplete: 'new-password' });
  const confirmation = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Répétez le nouveau mot de passe' });
  const currentField = field('Mot de passe actuel', current.wrap);
  const nextField = field('Nouveau mot de passe', next.wrap, { hint: `Au moins ${MIN_PASSWORD} caractères` });
  const confirmField = field('Confirmation', confirmation);
  const error = errorNote();
  const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Enregistrer');

  const form = h('form', { novalidate: true },
    topbar('Mot de passe', () => goBack('settings')),
    h('div', { class: 'body' }, h('div', { class: 'form-body' }, currentField.field, nextField.field, confirmField.field, error.note)),
    h('div', { class: 'footer' }, save));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    for (const f of [currentField, nextField, confirmField]) f.setError(null);
    if (!current.input.value) return currentField.setError('Saisissez votre mot de passe actuel');
    if ([...next.input.value].length < MIN_PASSWORD) return nextField.setError(`Au moins ${MIN_PASSWORD} caractères`);
    if (next.input.value !== confirmation.value) return confirmField.setError('Les deux mots de passe ne correspondent pas');
    save.disabled = true;
    try {
      await post('/api/me/password', { currentPassword: current.input.value, newPassword: next.input.value });
      toast('Mot de passe modifié. Vos autres appareils sont déconnectés.', { low: true });
      goBack('settings');
    } catch (err) {
      error.show(errorMessage(err));
      save.disabled = false;
    }
    return undefined;
  });
  return h('div', { class: 'screen' }, form);
}

// --- Double authentification ---

export function renderTwoFactor() {
  return app.user.totpEnabled ? disableScreen() : enableScreen();
}

// Activation, étape 1 (reglages-3) : QR code, clé à recopier, premier code
function enableScreen() {
  const container = h('div', { class: 'screen' });
  replace(container, topbar('Double authentification', () => goBack('settings')),
    h('p', { class: 'empty muted', role: 'status' }, 'Préparation…'));

  post('/api/me/2fa/enable')
    .then(({ secret }) => replace(container, enableForm(secret)))
    .catch((err) => replace(container, topbar('Double authentification', () => goBack('settings')),
      h('div', { class: 'empty' }, h('p', { class: 'empty__text' }, errorMessage(err)))));
  return container;
}

function enableForm(secret) {
  // Clé en groupes de 4 lettres, plus facile à recopier
  const grouped = secret.match(/.{1,4}/g).join(' ');
  const code = h('input', { class: 'input input--code', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '7', placeholder: '······' });
  const codeField = field('Code à 6 chiffres', code);
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Vérifier et activer');

  const copy = iconButton('copy', 'Copier la clé', async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast('Clé copiée');
    } catch {
      toast('Copie impossible : recopiez la clé à la main.');
    }
  });

  const form = h('form', { novalidate: true },
    topbar('Double authentification', () => goBack('settings')),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      h('p', { class: 'step' }, 'Étape 1 sur 2'),
      h('p', {}, "Scannez ce QR code avec votre application d'authentification."),
      h('div', { class: 'center' }, h('div', { class: 'qr' },
        // L'image vient du serveur (même adresse) : la CSP reste stricte
        h('img', { src: `/api/me/2fa/qr.png?v=${Date.now()}`, alt: 'QR code à scanner avec votre application', width: '160', height: '160' }))),
      h('div', { class: 'card secret-key' },
        h('div', { class: 'grow' }, h('p', { class: 'field__hint' }, 'Ou saisissez cette clé'), h('p', { class: 'secret-key__value' }, grouped)),
        copy),
      codeField.field,
      error.note)),
    h('div', { class: 'footer' }, submit));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    const value = code.value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(value)) {
      codeField.setError('Saisissez les 6 chiffres affichés par votre application');
      return;
    }
    codeField.setError(null);
    submit.disabled = true;
    try {
      const { recoveryCodes } = await post('/api/me/2fa/verify', { code: value });
      app.user.totpEnabled = true;
      replace(form.parentElement, recoveryScreen(recoveryCodes));
    } catch (err) {
      error.show(errorMessage(err), code);
      submit.disabled = false;
    }
  });
  return form;
}

// Activation, étape 2 (reglages-4) : codes de secours, affichés une seule fois
function recoveryScreen(codes) {
  const finish = () => navigate('settings', {}, { replace: true });
  const copy = h('button', {
    class: 'btn btn--secondary btn--block',
    type: 'button',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(codes.join('\n'));
        toast('Codes copiés');
      } catch {
        toast('Copie impossible : notez les codes à la main.');
      }
    },
  }, icon('copy', 'icon--sm'), 'Copier les codes');

  return [
    h('header', { class: 'topbar' },
      iconButton('chev-l', 'Retour aux réglages', finish),
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, 'Codes de secours'))),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      h('p', { class: 'step' }, 'Étape 2 sur 2'),
      h('div', { class: 'note' }, icon('alert'),
        h('p', {}, "Ces codes ne seront plus affichés. Conservez-les dans un endroit sûr : chacun ne fonctionne qu'une fois.")),
      h('div', { class: 'codes' }, codes.map((c) => h('p', { class: 'code' }, c.toUpperCase()))),
      copy)),
    h('div', { class: 'footer' }, h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: finish }, "J'ai conservé mes codes")),
  ];
}

// Désactivation : mot de passe + code (de l'application ou de secours)
function disableScreen() {
  const password = passwordInput({ autocomplete: 'current-password' });
  const code = h('input', { class: 'input input--mono', type: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: 'false' });
  const passwordField = field('Mot de passe', password.wrap);
  const codeField = field('Code', code, { hint: "Code à 6 chiffres de l'application, ou l'un de vos codes de secours." });
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--danger btn--block', type: 'submit' }, 'Désactiver la double authentification');

  const form = h('form', { novalidate: true },
    topbar('Double authentification', () => goBack('settings')),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      h('div', { class: 'note' }, icon('shield'),
        h('p', {}, 'La double authentification est activée : un code à 6 chiffres est demandé à chaque connexion.')),
      h('p', { class: 'muted' }, 'Pour la désactiver, confirmez avec votre mot de passe et un code.'),
      passwordField.field, codeField.field, error.note)),
    h('div', { class: 'footer' }, submit));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    if (!password.input.value || !code.value.trim()) {
      error.show('Saisissez votre mot de passe et un code.');
      return;
    }
    submit.disabled = true;
    try {
      await post('/api/me/2fa/disable', { password: password.input.value, code: code.value.trim() });
      app.user = (await get('/api/me')).user;
      toast('Double authentification désactivée', { low: true });
      navigate('settings', {}, { replace: true });
    } catch (err) {
      error.show(errorMessage(err));
      submit.disabled = false;
    }
  });
  return h('div', { class: 'screen' }, form);
}
