// Écrans « Réglages » (maquettes reglages-1 à 5) :
// - réglages : carte du compte (ouvre « Mon compte », voir account.js),
//   administration (Admin), notifications (voir notifications.js), aide (voir help.js), à propos, déconnexion ;
// - changement de mot de passe ;
// - activation de la double authentification (QR code, puis codes de
//   secours affichés une seule fois) ;
// - désactivation de la double authentification (pas de maquette : mêmes
//   composants ; le mot de passe et un code sont demandés).

import { h, icon, iconButton, field, passwordInput, errorNote, avatar, replace } from '../dom.js';
import { post, get, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { app, logOut } from '../app.js';
import { aboutVersion } from '../format.js';
import { toast, onPc } from '../ui.js';
import { singleKeysOn, setSingleKeys, openShortcuts } from '../shortcuts.js';

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

// Barre de titre avec retour (aussi utilisée par account.js)
export function topbar(title, onBack) {
  return h('header', { class: 'topbar' },
    iconButton('chev-l', 'Retour', onBack),
    h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, title)));
}

// Ligne de réglage (icône, titre, sous-titre, élément de fin), aussi
// utilisée par account.js
export function row({ iconName, title, sub, end, onClick }) {
  const tag = onClick ? 'button' : 'div';
  return h(tag, { class: 'row', type: onClick ? 'button' : null, onClick },
    h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon(iconName)),
    h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, title), sub ? h('span', { class: 'row__sub' }, sub) : null),
    end ?? (onClick ? icon('chev-r') : null));
}

// --- Réglages ---

// Pastille du rôle : « Admin » ou « Utilisateur » (aussi utilisée par account.js)
export function roleChip(user) {
  return user.role === 'admin'
    ? h('span', { class: 'chip chip--strong' }, icon('shield', 'icon--xs'), 'Admin')
    : h('span', { class: 'chip' }, 'Utilisateur');
}

export function renderSettings() {
  if (onPc()) return renderSettingsPc();
  const user = app.user;
  const isAdmin = user.role === 'admin';

  const logout = h('button', {
    class: 'btn btn--secondary btn--block',
    type: 'button',
    onClick: () => logOut(),
  }, icon('logout', 'icon--sm'), 'Se déconnecter');

  return h('div', { class: 'screen' },
    topbar('Réglages', () => goBack('lists')),
    h('div', { class: 'body' },
      // Carte du compte : un bouton sur toute sa surface, qui ouvre « Mon
      // compte » (sécurité, apparence, ce téléphone)
      h('button', {
        class: 'card account account--link',
        type: 'button',
        'aria-label': `Mon compte : ${user.displayName}`,
        onClick: () => navigate('account'),
      },
      avatar(user.displayName, { large: true }),
      h('span', { class: 'grow' }, h('span', { class: 'row__title' }, user.displayName), h('span', { class: 'row__sub' }, 'Mon compte')),
      roleChip(user),
      icon('chev-r')),
      isAdmin ? [
        h('h2', { class: 'section-title' }, 'Administration'),
        h('div', { class: 'group' },
          row({ iconName: 'shield', title: 'Administration', sub: 'Comptes, courses', onClick: () => navigate('admin', { tab: 'comptes' }) })),
      ] : null,
      // Notifications push : cet appareil (notifications.js)
      h('h2', { class: 'section-title' }, 'Notifications'),
      h('div', { class: 'group' }, notificationsRow()),
      // Corbeille : mes listes supprimées, à restaurer pendant 30 jours (trash.js)
      h('h2', { class: 'section-title' }, 'Listes'),
      h('div', { class: 'group' }, row({ iconName: 'trash', title: 'Corbeille des listes', sub: 'Restaurer une liste supprimée (30 jours)', onClick: () => navigate('trash') })),
      // Aide : mode d'emploi, selon le rôle (help.js, help-content.js)
      h('h2', { class: 'section-title' }, 'Aide'),
      h('div', { class: 'group' }, row({ iconName: 'book', title: 'Aide', sub: 'Mode d\'emploi de Listo', onClick: () => navigate('help') })),
      h('h2', { class: 'section-title' }, 'À propos'),
      aboutGroup(isAdmin)),
    h('div', { class: 'footer' }, logout));
}

// --- Réglages sur ordinateur (design/maquettes/pc-A, capture 08a) ---
// Le même rangement que sur le téléphone (décision du propriétaire du
// 10 novembre 2026 : le téléphone fait référence), en cartes : Compte (ouvre
// « Mon compte », où sont le thème et « Connexions Claude », comme sur le
// téléphone), Clavier (« Raccourcis à une touche », propre à l'ordinateur),
// Administration (compte Admin seulement), Notifications, Listes (corbeille),
// Aide (et « Raccourcis clavier »), À propos, puis « Se déconnecter ».
function renderSettingsPc() {
  const user = app.user;
  const isAdmin = user.role === 'admin';
  const section = (title, ...content) => h('section', { class: 'pc-settings__section' }, h('h2', { class: 'pc-settings__title' }, title), content);
  return h('div', { class: 'screen' },
    h('header', { class: 'pc-head' }, h('div', { class: 'pc-head__main' },
      h('h1', { class: 'pc-head__title' }, 'Réglages'),
      h('p', { class: 'pc-head__sub' }, isAdmin ? 'Compte Admin' : 'Mon compte'))),
    h('div', { class: 'scroll' }, h('div', { class: 'pc-settings' },
      section('Compte', h('div', { class: 'group' }, h('button', {
        class: 'row', type: 'button', 'aria-label': `Mon compte : ${user.displayName}`, onClick: () => navigate('account'),
      },
      avatar(user.displayName),
      h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, user.displayName), h('span', { class: 'row__sub' }, 'Mon compte : mot de passe, double authentification, thème, nouveautés')),
      roleChip(user), icon('chev-r')))),
      section('Clavier', h('div', { class: 'group' }, keysRow())),
      isAdmin ? section('Administration',
        h('p', { class: 'pc-settings__hint' }, 'Visible seulement pour les comptes Admin.'),
        h('div', { class: 'group' }, row({ iconName: 'shield', title: 'Administration', sub: 'Comptes, courses', onClick: () => navigate('admin', { tab: 'comptes' }) }))) : null,
      section('Notifications', h('div', { class: 'group' }, notificationsRow())),
      section('Listes', h('div', { class: 'group' }, row({ iconName: 'trash', title: 'Corbeille des listes', sub: 'Restaurer une liste supprimée (30 jours)', onClick: () => navigate('trash') }))),
      section('Aide', h('div', { class: 'group' },
        row({ iconName: 'book', title: 'Guide d\'utilisation', sub: 'Mode d\'emploi de Listo', onClick: () => navigate('help') }),
        row({ iconName: 'keyboard', title: 'Raccourcis clavier', sub: 'Touche ?', onClick: () => openShortcuts() }))),
      section('À propos', aboutGroup(isAdmin)),
      h('div', {}, h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => logOut() }, icon('logout', 'icon--sm'), 'Se déconnecter')))));
}

// Ligne « Notifications » (téléphone et ordinateur) : ouvre l'écran des
// notifications de cet appareil (notifications.js)
function notificationsRow() {
  return row({ iconName: 'bell', title: 'Notifications', sub: app.user.push ? 'Recevoir les notifications sur cet appareil' : 'Désactivées sur ce serveur', onClick: () => navigate('notifications') });
}

// Interrupteur « Raccourcis à une touche » (ordinateur) : désactivés, il ne
// reste que les flèches, Entrée et les raccourcis avec Ctrl (utile avec une
// commande vocale, qui pourrait taper une lettre par erreur)
export function keysRow() {
  const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(singleKeysOn()), 'aria-labelledby': 'reglage-touches', 'aria-describedby': 'reglage-touches-aide' });
  toggle.addEventListener('click', () => {
    const on = toggle.getAttribute('aria-checked') !== 'true';
    setSingleKeys(on);
    toggle.setAttribute('aria-checked', String(on));
    toast(on ? 'Raccourcis à une touche activés' : 'Raccourcis à une touche désactivés');
  });
  return h('div', { class: 'row' },
    h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon('keyboard')),
    h('span', { class: 'row__body' },
      h('span', { class: 'row__title', id: 'reglage-touches' }, 'Raccourcis à une touche'),
      h('span', { class: 'row__sub', id: 'reglage-touches-aide' }, 'Désactivez-les si vous utilisez une commande vocale. Sur cet appareil seulement.')),
    toggle);
}

// Bloc « À propos » : une carte en deux zones séparées par un trait fin :
// 1. « Version et mise à jour » : version installée (lien vers le commit sur
//    GitHub) ; pour l'Admin, état de la mise à jour (pastille) et bouton.
//    La version arrive du serveur (GET /api/about) sans bloquer l'écran ; hors
//    ligne, la dernière version connue sur ce téléphone.
// 2. « Développeur et projet » : deux liens côte à côte.
// 3. Mode scan activé : mention de la source des noms de produits (licence
//    ODbL d'Open Food Facts).
// Ce qui s'affiche dans chaque cas est calculé par aboutVersion (format.js).
function aboutGroup(isAdmin) {
  return h('div', { class: 'group' }, versionRow(isAdmin), projectRow(),
    app.user?.productLookup !== false ? dataRow() : null);
}

// Zone 3 : « Données : Open Food Facts » (noms des produits scannés)
function dataRow() {
  return h('div', { class: 'row' }, h('span', { class: 'row__body' },
    h('span', { class: 'row__title' }, 'Mode scan'),
    h('span', { class: 'row__sub' }, 'Données : Open Food Facts (licence ODbL)')));
}

// Lien vers un autre site, ouvert dans un nouvel onglet, sans transmettre
// d'information à ce site (noopener, noreferrer). Zone tactile de 44 px.
const outLink = (attrs, ...children) => h('a', { target: '_blank', rel: 'noopener noreferrer', ...attrs }, ...children);

// Zone 1 : ligne du haut, « Version : 7025130 » à gauche et, pour l'Admin,
// à droite : « Vérifié il y a 15 min » (à jour : « À jour · il y a 15 min »)
// et bouton d'actualisation (texte et bouton toujours groupés) ; état
// éventuel devant (« Hors ligne », « Vérification impossible »). Nouvelle version : une
// seconde ligne avec la seule pastille « Nouvelle version : 9f8e7d6 » (lien
// vers ce commit). L'état vient du serveur, qui demande à GitHub (le
// téléphone ne contacte jamais GitHub). Rien ne s'installe tout seul.
function versionRow(isAdmin) {
  const title = h('span', { class: 'row__title about__version' });
  // Annoncé par les lecteurs d'écran quand il change (« À jour… »)
  const checked = h('span', { class: 'row__sub', role: 'status', hidden: true });
  // Pastille annoncée par les lecteurs d'écran quand elle change
  const state = h('span', { class: 'about__state', role: 'status' });
  const button = h('button', {
    class: 'icon-btn about__check',
    type: 'button',
    'aria-label': 'Vérifier maintenant',
    onClick: () => check(true),
  }, icon('sync'));
  const actions = h('span', { class: 'about__actions', hidden: true }, state, h('span', { class: 'about__checked' }, checked, button));
  // Ligne de la nouvelle version (absente sinon), annoncée elle aussi
  const update = h('span', { class: 'about__update', role: 'status' });
  const row = h('div', { class: 'row about' }, title, actions, update);

  // État de la ligne
  let commit = null;
  try {
    commit = localStorage.getItem(VERSION_KEY);
  } catch {
    // stockage indisponible (navigation privée…) : sans importance
  }
  if (!isCommit(commit)) commit = null;
  let result = null;
  let busy = false;

  const render = () => {
    const line = aboutVersion({ commit, isAdmin, result, busy, online: navigator.onLine });
    replace(title, 'Version : ', line.version.commit
      ? outLink({ class: 'about__link', href: commitUrl(line.version.commit), 'aria-label': `Version ${line.version.text} sur GitHub` }, line.version.text)
      : line.version.text);
    // Textes posés comme texte (replace), jamais comme HTML
    replace(checked, line.upToDate ? [h('span', { class: 'about__ok' }, 'À jour'), line.checked ? ` · ${line.checked}` : null] : line.checked);
    checked.hidden = !line.upToDate && !line.checked;
    replace(state, line.chip ? chipFor(line.chip) : null);
    state.hidden = !line.chip; // vide : ne prend aucune place sur la ligne
    replace(update, line.update ? chipFor(line.update) : null);
    update.hidden = !line.update;
    actions.hidden = !line.button;
    button.disabled = line.busy;
    button.classList.toggle('is-busy', line.busy);
  };

  // Vérification de mise à jour (Admin). force : « Vérifier maintenant »
  // (le serveur ne l'accepte qu'une fois par minute)
  const check = (force) => {
    if (busy || !isAdmin) return;
    if (!navigator.onLine) {
      render();
      return;
    }
    busy = true;
    render();
    get(`/api/admin/update-check${force ? '?force=1' : ''}`).then((answer) => {
      result = answer;
    }, () => {
      result = { state: 'indisponible' }; // réseau perdu entre-temps, ou refus
    }).finally(() => {
      busy = false;
      render();
    });
  };

  render();
  get('/api/about').then((about) => {
    commit = about.commit;
    try {
      if (isCommit(commit)) localStorage.setItem(VERSION_KEY, commit);
    } catch {
      // sans importance
    }
    render();
  }, () => render()); // pas de réseau : dernière version connue, sinon « indisponible »
  check(false);
  return row;
}

// Pastille d'état (.chip du kit) ; nouvelle version : toute la pastille est
// un lien vers ce commit sur GitHub
function chipFor({ tone, text, icon: iconName, commit, label }) {
  const content = [iconName ? icon(iconName, 'icon--xs') : null, text];
  const className = `chip chip--${tone}`;
  return commit
    ? outLink({ class: `${className} about__chip-link`, href: commitUrl(commit), 'aria-label': label }, content)
    : h('span', { class: className }, content);
}

// Zone 2 : développeur et projet, deux liens séparés par un trait fin
function projectRow() {
  return h('div', { class: 'row about-links' },
    outLink({ class: 'about-links__link', href: GITHUB.ownerUrl, 'aria-label': `Développeur : ${GITHUB.owner} sur GitHub` },
      icon('pencil', 'icon--sm'), GITHUB.owner),
    h('span', { class: 'about-links__sep', 'aria-hidden': 'true' }),
    outLink({ class: 'about-links__link', href: GITHUB.repoUrl, 'aria-label': 'Projet Listo sur GitHub' },
      icon('link', 'icon--sm'), 'Projet GitHub'));
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
    topbar('Mot de passe', () => goBack('account')),
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
      goBack('account');
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
  replace(container, topbar('Double authentification', () => goBack('account')),
    h('p', { class: 'empty muted', role: 'status' }, 'Préparation…'));

  post('/api/me/2fa/enable')
    .then(({ secret }) => replace(container, enableForm(secret)))
    .catch((err) => replace(container, topbar('Double authentification', () => goBack('account')),
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
    topbar('Double authentification', () => goBack('account')),
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
  const finish = () => navigate('account', {}, { replace: true });
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
    topbar('Double authentification', () => goBack('account')),
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
      navigate('account', {}, { replace: true });
    } catch (err) {
      error.show(errorMessage(err));
      submit.disabled = false;
    }
  });
  return h('div', { class: 'screen' }, form);
}
