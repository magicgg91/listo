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
import { app } from '../app.js';
import { aboutVersion } from '../format.js';
import { toast, onPc } from '../ui.js';
import { singleKeysOn, setSingleKeys, openShortcuts } from '../shortcuts.js';
import { t } from '../i18n.js';

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
// onBack absent : pas de bouton Retour (écran du bandeau du bas)
export function topbar(title, onBack = null) {
  return h('header', { class: onBack ? 'topbar' : 'topbar topbar--plain' },
    onBack ? iconButton('chev-l', t('reglages.retour'), onBack) : null,
    h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, title)));
}

// Ligne de réglage (icône, titre, sous-titre, élément de fin), aussi
// utilisée par account.js
// Nombre de demandes de compte en attente (Admin), ou rien
function requestsBadge(count) {
  if (!count) return null;
  const label = t('reglages.demandesCompte', { count });
  return h('span', { class: 'news-badge', role: 'img', 'aria-label': label, title: label }, String(count));
}

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
    ? h('span', { class: 'chip chip--strong' }, icon('shield', 'icon--xs'), t('reglages.role.admin'))
    : h('span', { class: 'chip' }, t('reglages.role.utilisateur'));
}

export function renderSettings() {
  if (onPc()) return renderSettingsPc();
  const user = app.user;
  const isAdmin = user.role === 'admin';

  // Rangement allégé (décision du propriétaire du 11 novembre 2026) : la
  // carte du compte, puis deux blocs seulement, « Général » et
  // « Informations », aux lignes courtes (icône et nom, sans phrase
  // dessous) ; « À propos » est une ligne qui ouvre sa propre page.
  return h('div', { class: 'screen' },
    // Écran du bandeau du bas (tabbar.js) : pas de bouton Retour
    topbar(t('reglages.titre')),
    h('div', { class: 'body' },
      // Carte du compte : un bouton sur toute sa surface, qui ouvre « Mon
      // compte » (sécurité, apparence, ce téléphone, déconnexion)
      h('button', {
        class: 'card account account--link',
        type: 'button',
        'aria-label': t('reglages.compte.lien', { name: user.displayName }),
        onClick: () => navigate('account'),
      },
      avatar(user.displayName, { large: true }),
      h('span', { class: 'grow' }, h('span', { class: 'row__title' }, user.displayName), h('span', { class: 'row__sub' }, t('reglages.compte'))),
      roleChip(user),
      icon('chev-r')),
      h('h2', { class: 'section-title' }, t('reglages.general')),
      h('div', { class: 'group' }, generalRows(isAdmin)),
      h('h2', { class: 'section-title' }, t('reglages.informations')),
      h('div', { class: 'group' }, helpRow(), aboutRow(isAdmin))));
}

// « Général » (téléphone et ordinateur) : notifications (notifications.js),
// corbeille des listes (trash.js), administration (compte Admin seulement)
function generalRows(isAdmin) {
  return [
    notificationsRow(),
    row({ iconName: 'trash', title: t('reglages.corbeille'), onClick: () => navigate('trash') }),
    // Pastille : demandes de compte en attente (connexion avec le fournisseur d'identité)
    isAdmin ? row({ iconName: 'shield', title: t('reglages.administration'), end: app.user.accountRequests ? [requestsBadge(app.user.accountRequests), icon('chev-r')] : undefined, onClick: () => navigate('admin', { tab: 'comptes' }) }) : null,
  ];
}

// Aide : mode d'emploi, selon le rôle (help.js, help-content.js)
const helpRow = () => row({ iconName: 'book', title: t('reglages.aide'), onClick: () => navigate('help') });

// Ligne « À propos » : ouvre la page « À propos » ; à droite, la version
// installée (dernière connue sur cet appareil, puis celle du serveur) ou,
// pour l'Admin, « Mise à jour » quand une nouvelle version existe
function aboutRow(isAdmin) {
  const value = h('span', { class: 'row__value' });
  let commit = null;
  try {
    commit = localStorage.getItem(VERSION_KEY);
  } catch {
    // stockage indisponible : sans importance
  }
  let result = null;
  const paint = () => {
    const line = aboutVersion({ commit: isCommit(commit) ? commit : null, isAdmin, result, online: navigator.onLine });
    replace(value, line.update ? h('span', { class: 'chip chip--accent' }, t('reglages.miseAJour')) : line.version.commit ? t('reglages.version', { version: line.version.text }) : null);
  };
  paint();
  get('/api/about').then((about) => {
    commit = about.commit;
    try {
      if (isCommit(commit)) localStorage.setItem(VERSION_KEY, commit);
    } catch {
      // sans importance
    }
    paint();
  }, () => {});
  if (isAdmin && navigator.onLine) get('/api/admin/update-check').then((answer) => { result = answer; paint(); }, () => {});
  return row({ iconName: 'help', title: t('reglages.aPropos.titre'), end: h('span', { class: 'row__end' }, value, icon('chev-r')), onClick: () => navigate('about') });
}

// Page « À propos » (#/reglages/a-propos, téléphone et ordinateur) : ce
// qui était en bas des Réglages, sans changement : version (et, pour
// l'Admin, la vérification de mise à jour), le projet sur GitHub, les
// données du mode scan
export function renderAbout() {
  const isAdmin = app.user.role === 'admin';
  return h('div', { class: 'screen' },
    topbar(t('reglages.aPropos.titre'), () => goBack('settings')),
    h('div', { class: 'body' }, aboutGroup(isAdmin)));
}

// --- Réglages sur ordinateur (design/maquettes/pc-A, capture 08a) ---
// Le même rangement que sur le téléphone (décision du propriétaire du
// 10 novembre 2026 : le téléphone fait référence), en cartes : Compte (ouvre
// « Mon compte », où sont le thème, « Assistants IA » et « Se
// déconnecter », comme sur le téléphone), Général (« Raccourcis à une
// touche », propre à l'ordinateur, puis les mêmes lignes que le téléphone),
// Informations (Aide, « Raccourcis clavier », À propos).
function renderSettingsPc() {
  const user = app.user;
  const isAdmin = user.role === 'admin';
  const section = (title, ...content) => h('section', { class: 'pc-settings__section' }, h('h2', { class: 'pc-settings__title' }, title), content);
  return h('div', { class: 'screen' },
    h('header', { class: 'pc-head' }, h('div', { class: 'pc-head__main' },
      h('h1', { class: 'pc-head__title' }, t('reglages.titre')),
      h('p', { class: 'pc-head__sub' }, isAdmin ? t('reglages.pc.compteAdmin') : t('reglages.compte')))),
    h('div', { class: 'scroll' }, h('div', { class: 'pc-settings' },
      section(t('reglages.pc.compte'), h('div', { class: 'group' }, h('button', {
        class: 'row', type: 'button', 'aria-label': t('reglages.compte.lien', { name: user.displayName }), onClick: () => navigate('account'),
      },
      avatar(user.displayName),
      h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, user.displayName), h('span', { class: 'row__sub' }, t('reglages.pc.compte.detail'))),
      roleChip(user), icon('chev-r')))),
      section(t('reglages.general'), h('div', { class: 'group' }, keysRow(), generalRows(isAdmin))),
      section(t('reglages.informations'), h('div', { class: 'group' },
        helpRow(),
        row({ iconName: 'keyboard', title: t('reglages.pc.raccourcis'), sub: t('reglages.pc.raccourcis.detail'), onClick: () => openShortcuts() }),
        aboutRow(isAdmin))))));
}

// Ligne « Notifications » (téléphone et ordinateur) : ouvre l'écran des
// notifications de cet appareil (notifications.js)
function notificationsRow() {
  return row({ iconName: 'bell', title: t('reglages.notifications'), onClick: () => navigate('notifications') });
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
    toast(on ? t('reglages.touches.activees') : t('reglages.touches.desactivees'));
  });
  return h('div', { class: 'row' },
    h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon('keyboard')),
    h('span', { class: 'row__body' },
      h('span', { class: 'row__title', id: 'reglage-touches' }, t('reglages.touches.titre')),
      h('span', { class: 'row__sub', id: 'reglage-touches-aide' }, t('reglages.touches.detail'))),
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
    h('span', { class: 'row__title' }, t('reglages.aPropos.scan.titre')),
    h('span', { class: 'row__sub' }, t('reglages.aPropos.scan.detail'))));
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
    'aria-label': t('reglages.aPropos.verifier'),
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
    replace(title, `${t('reglages.aPropos.version')} `, line.version.commit
      ? outLink({ class: 'about__link', href: commitUrl(line.version.commit), 'aria-label': t('reglages.aPropos.version.lien', { version: line.version.text }) }, line.version.text)
      : line.version.text);
    // Textes posés comme texte (replace), jamais comme HTML
    replace(checked, line.upToDate ? [h('span', { class: 'about__ok' }, t('reglages.aPropos.aJour')), line.checked ? ` · ${line.checked}` : null] : line.checked);
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
    outLink({ class: 'about-links__link', href: GITHUB.ownerUrl, 'aria-label': t('reglages.aPropos.developpeur', { owner: GITHUB.owner }) },
      icon('pencil', 'icon--sm'), GITHUB.owner),
    h('span', { class: 'about-links__sep', 'aria-hidden': 'true' }),
    outLink({ class: 'about-links__link', href: GITHUB.repoUrl, 'aria-label': t('reglages.aPropos.projet.lien') },
      icon('link', 'icon--sm'), t('reglages.aPropos.projet')));
}

// --- Mot de passe (reglages-5) ---

export function renderPassword() {
  const current = passwordInput({ id: 'mot-de-passe-actuel', name: 'current-password', autocomplete: 'current-password', required: true });
  const next = passwordInput({ id: 'nouveau-mot-de-passe', name: 'new-password', autocomplete: 'new-password', required: true });
  const confirmation = h('input', { class: 'input', type: 'password', id: 'confirmation', name: 'confirm-password', autocomplete: 'new-password', required: true, placeholder: t('reglages.motDePasse.confirmation.exemple') });
  const currentField = field(t('reglages.motDePasse.actuel'), current.wrap);
  const nextField = field(t('reglages.motDePasse.nouveau'), next.wrap, { hint: t('reglages.motDePasse.longueur', { min: MIN_PASSWORD }) });
  const confirmField = field(t('reglages.motDePasse.confirmation'), confirmation);
  const error = errorNote();
  const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('reglages.enregistrer'));

  const form = h('form', { novalidate: true },
    topbar(t('reglages.motDePasse.titre'), () => goBack('account')),
    h('div', { class: 'body' }, h('div', { class: 'form-body' }, currentField.field, nextField.field, confirmField.field, error.note)),
    h('div', { class: 'footer' }, save));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    for (const f of [currentField, nextField, confirmField]) f.setError(null);
    if (!current.input.value) return currentField.setError(t('reglages.motDePasse.actuel.manquant'));
    if ([...next.input.value].length < MIN_PASSWORD) return nextField.setError(t('reglages.motDePasse.longueur', { min: MIN_PASSWORD }));
    if (next.input.value !== confirmation.value) return confirmField.setError(t('reglages.motDePasse.differents'));
    save.disabled = true;
    try {
      await post('/api/me/password', { currentPassword: current.input.value, newPassword: next.input.value });
      toast(t('reglages.motDePasse.modifie'), { low: true });
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
  replace(container, topbar(t('reglages.deuxFacteurs.titre'), () => goBack('account')),
    h('p', { class: 'empty muted', role: 'status' }, t('reglages.deuxFacteurs.preparation')));

  post('/api/me/2fa/enable')
    .then(({ secret }) => replace(container, enableForm(secret)))
    .catch((err) => replace(container, topbar(t('reglages.deuxFacteurs.titre'), () => goBack('account')),
      h('div', { class: 'empty' }, h('p', { class: 'empty__text' }, errorMessage(err)))));
  return container;
}

function enableForm(secret) {
  // Clé en groupes de 4 lettres, plus facile à recopier
  const grouped = secret.match(/.{1,4}/g).join(' ');
  const code = h('input', { class: 'input input--code', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '7', placeholder: '······' });
  const codeField = field(t('reglages.deuxFacteurs.code'), code);
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('reglages.deuxFacteurs.activer'));

  const copy = iconButton('copy', t('reglages.deuxFacteurs.copierCle'), async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast(t('reglages.deuxFacteurs.cleCopiee'));
    } catch {
      toast(t('reglages.deuxFacteurs.copieImpossible'));
    }
  });

  const form = h('form', { novalidate: true },
    topbar(t('reglages.deuxFacteurs.titre'), () => goBack('account')),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      h('p', { class: 'step' }, t('reglages.deuxFacteurs.etape1')),
      h('p', {}, t('reglages.deuxFacteurs.scanner')),
      h('div', { class: 'center' }, h('div', { class: 'qr' },
        // L'image vient du serveur (même adresse) : la CSP reste stricte
        h('img', { src: `/api/me/2fa/qr.png?v=${Date.now()}`, alt: t('reglages.deuxFacteurs.qr'), width: '160', height: '160' }))),
      h('div', { class: 'card secret-key' },
        h('div', { class: 'grow' }, h('p', { class: 'field__hint' }, t('reglages.deuxFacteurs.cle')), h('p', { class: 'secret-key__value' }, grouped)),
        copy),
      codeField.field,
      error.note)),
    h('div', { class: 'footer' }, submit));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    const value = code.value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(value)) {
      codeField.setError(t('reglages.deuxFacteurs.code.manquant'));
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
        toast(t('reglages.secours.copies'));
      } catch {
        toast(t('reglages.secours.copieImpossible'));
      }
    },
  }, icon('copy', 'icon--sm'), t('reglages.secours.copier'));

  return [
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('reglages.secours.retour'), finish),
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, t('reglages.secours.titre')))),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      h('p', { class: 'step' }, t('reglages.secours.etape2')),
      h('div', { class: 'note' }, icon('alert'),
        h('p', {}, t('reglages.secours.avertissement'))),
      h('div', { class: 'codes' }, codes.map((c) => h('p', { class: 'code' }, c.toUpperCase()))),
      copy)),
    h('div', { class: 'footer' }, h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: finish }, t('reglages.secours.conserves'))),
  ];
}

// Désactivation : mot de passe + code (de l'application ou de secours)
function disableScreen() {
  const password = passwordInput({ autocomplete: 'current-password' });
  const code = h('input', { class: 'input input--mono', type: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: 'false' });
  const passwordField = field(t('reglages.desactivation.motDePasse'), password.wrap);
  const codeField = field(t('reglages.desactivation.code'), code, { hint: t('reglages.desactivation.code.aide') });
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--danger btn--block', type: 'submit' }, t('reglages.desactivation.bouton'));

  const form = h('form', { novalidate: true },
    topbar(t('reglages.deuxFacteurs.titre'), () => goBack('account')),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      h('div', { class: 'note' }, icon('shield'),
        h('p', {}, t('reglages.desactivation.active'))),
      h('p', { class: 'muted' }, t('reglages.desactivation.consigne')),
      passwordField.field, codeField.field, error.note)),
    h('div', { class: 'footer' }, submit));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    if (!password.input.value || !code.value.trim()) {
      error.show(t('reglages.desactivation.manquant'));
      return;
    }
    submit.disabled = true;
    try {
      await post('/api/me/2fa/disable', { password: password.input.value, code: code.value.trim() });
      app.user = (await get('/api/me')).user;
      toast(t('reglages.desactivation.faite'), { low: true });
      navigate('account', {}, { replace: true });
    } catch (err) {
      error.show(errorMessage(err));
      submit.disabled = false;
    }
  });
  return h('div', { class: 'screen' }, form);
}
