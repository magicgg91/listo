// Écran « Administration » (maquettes administration-1 à 6), réservé aux Admin
// (le serveur le vérifie à chaque requête). Deux onglets :
// - Comptes : liste, création, rôle, réinitialisation du mot de passe,
//   désactivation de la 2FA, désactivation / réactivation, suppression d'un
//   compte jamais utilisé ;
// - Courses, avec trois choix :
//   - Magasins, Rayons : ajout, renommage, désactivation / réactivation,
//     suppression d'un élément jamais utilisé ;
//   - Articles : la mémoire commune des articles saisis dans les listes de
//     courses (autocomplétion, rayon habituel) ; corriger un nom dans toutes
//     les listes de courses, changer son rayon habituel, ou le retirer des
//     suggestions. (Son identifiant interne reste « noms », comme les
//     routes /api/admin/names.)
// Aucune de ces vues ne montre le contenu d'une liste (son nom, ses membres,
// ses éléments) : les articles enregistrés viennent avec de simples compteurs.

import { h, icon, iconButton, field, passwordInput, errorNote, avatar, replace, multiBadge, LABEL_INPUT } from '../dom.js';
import { get, post, patch, del, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { compareNames } from '../sorting.js';
import { activeOnly } from '../store.js';
import { app, refreshData, providerName } from '../app.js';
import { openSheet, confirmDialog, toast } from '../ui.js';
import { defaultDisplayName, savedNameSub, renameImpactText, renameDoneText } from '../format.js';
import { itemWords, countItems } from '../words.js';
import { t } from '../i18n.js';

// Mot des listes de courses (words.js) : « article », « articles »
const ITEM = itemWords(true);

// Deux onglets : Comptes, Courses (les catégories de liste ont disparu,
// remplacées par les types fixes de public/js/list-types.js ; l'ancienne
// adresse #/administration/categories mène à « Comptes »). « Courses » regroupe trois
// choix (magasins, rayons et articles ne concernent que les listes de
// courses), chacun avec son adresse d'avant (#/administration/magasins,
// /rayons, /noms) : un lien ou un rafraîchissement retombe sur le bon choix.
// Libellés lus au moment de l'affichage (get), dans la langue choisie
const SHOPPING = [
  { key: 'magasins', get label() { return t('administration.magasins'); }, api: 'stores', get placeholder() { return t('administration.magasins.nouveau'); } },
  { key: 'rayons', get label() { return t('administration.rayons'); }, api: 'aisles', get placeholder() { return t('administration.rayons.nouveau'); } },
  { key: 'noms', get label() { return ITEM.many.charAt(0).toUpperCase() + ITEM.many.slice(1); } },
];
const TABS = [
  { key: 'comptes', get label() { return t('administration.onglets.comptes'); } },
  { key: 'courses', get label() { return t('administration.onglets.courses'); } },
];

// Dernier choix de « Courses », retrouvé en revenant sur l'onglet pendant la
// session (oublié à la fermeture de l'application)
let lastShopping = SHOPPING[0].key;

// Barre d'onglets (même composant pour les onglets et les choix de
// « Courses », ce dernier en plus petit) : choisi = souligné épais ET texte
// plus foncé (jamais la couleur seule). Chaque onglet change d'adresse :
// c'est une navigation (<nav>, aria-current="page"), pas des onglets au sens
// des lecteurs d'écran (role="tab" promettait les flèches, décision du
// 15 novembre 2026)
function tabBar(entries, current, label, extraClass = '') {
  return h('nav', { class: `tabs${extraClass}`, 'aria-label': label },
    entries.map((t) => h('button', {
      class: 'tab',
      type: 'button',
      'aria-current': t.key === current ? 'page' : null,
      onClick: () => navigate('admin', { tab: t.target ?? t.key }, { replace: true }),
    }, t.label)));
}

export function renderAdmin(tabKey, onLeave) {
  // « courses » seul : le dernier choix ; un choix de « Courses » : retenu
  if (tabKey === 'courses') tabKey = lastShopping;
  const shopping = SHOPPING.find((t) => t.key === tabKey);
  if (shopping) lastShopping = shopping.key;
  const tab = shopping ?? TABS.find((t) => t.key === tabKey);
  if (!tab) {
    // Adresse inconnue (dont l'ancienne #/administration/categories) :
    // « Comptes ». Renvoi fait juste après ce dessin, sinon l'écran vide
    // rendu ici remplacerait celui de « Comptes ».
    queueMicrotask(() => navigate('admin', { tab: 'comptes' }, { replace: true }));
    return h('div', { class: 'screen' });
  }

  const tabs = tabBar(TABS.map((t) => (t.key === 'courses' ? { ...t, target: lastShopping } : t)), shopping ? 'courses' : tab.key, t('administration.rubriques'));
  const choices = shopping ? tabBar(SHOPPING, shopping.key, t('administration.onglets.courses'), ' tabs--sub') : null;

  // Barre trop large pour l'écran (elle défile de côté) : l'onglet actif est
  // ramené en vue une fois l'écran affiché
  requestAnimationFrame(() => tabs.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));

  const panel = h('div', { class: 'body admin-list' });
  const footer = h('div', { class: 'footer', hidden: tab.key !== 'comptes' });
  let alive = true;
  onLeave(() => {
    alive = false;
  });
  const load = () => {
    if (tab.key === 'comptes') return loadUsers(panel, footer, () => alive);
    if (tab.key === 'noms') return loadNames(panel, () => alive);
    return loadReferences(tab, panel, () => alive);
  };
  // Hors ligne : l'administration demande le serveur, elle est indisponible
  // (elle se charge d'elle-même au retour du réseau)
  const reload = () => {
    if (navigator.onLine) {
      load();
      return;
    }
    footer.hidden = true;
    replace(panel, h('div', { class: 'empty' },
      h('div', { class: 'empty__icon' }, icon('cloud-off', 'icon--lg')),
      h('h2', { class: 'empty__title' }, t('administration.horsLigne.titre')),
      h('p', { class: 'empty__text' }, t('administration.horsLigne.texte'))));
  };
  const onOnline = () => {
    if (alive) {
      footer.hidden = tab.key !== 'comptes';
      load();
    }
  };
  window.addEventListener('online', onOnline);
  onLeave(() => window.removeEventListener('online', onOnline));
  reload();

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('administration.retour'), () => goBack('settings')),
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, t('administration.titre')))),
    tabs, choices, panel, footer);
}

const loadingText = () => h('p', { class: 'empty muted', role: 'status' }, t('administration.chargement'));
const errorBlock = (err, retry) => h('div', { class: 'empty' },
  h('p', { class: 'empty__text' }, errorMessage(err)),
  h('button', { class: 'btn btn--secondary', type: 'button', onClick: retry }, t('administration.reessayer')));

// Segmenté « Utilisateur / Admin » (même composant que le thème)
function roleSwitch(role, onChange, { disabled = false } = {}) {
  const options = [['user', t('administration.role.utilisateur')], ['admin', t('administration.role.admin')]].map(([value, label]) => {
    const option = h('button', {
      class: 'segmented__opt',
      type: 'button',
      role: 'radio',
      'aria-checked': String(role === value),
      disabled,
    }, label);
    option.addEventListener('click', () => {
      for (const o of options) o.setAttribute('aria-checked', String(o === option));
      onChange(value);
    });
    return option;
  });
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': t('administration.role') }, options);
}

// ======================= Comptes =======================

const userSub = (user) => [
  user.role === 'admin' ? t('administration.role.admin') : t('administration.role.utilisateur'),
  user.active ? (user.totpEnabled ? t('administration.compte.deuxFacteurs.active') : t('administration.compte.deuxFacteurs.desactive')) : t('administration.compte.desactive'),
  user.authelia ? providerName() : null,
].filter(Boolean).join(' · ');

async function loadUsers(panel, footer, alive) {
  replace(panel, loadingText());
  const reload = () => loadUsers(panel, footer, alive);
  let users;
  let accountRequests = [];
  let localLogin = true;
  try {
    ({ users, accountRequests = [], localLogin = true } = await get('/api/admin/users'));
  } catch (err) {
    if (alive()) replace(panel, errorBlock(err, reload));
    return;
  }
  if (!alive()) return;
  // Pastille de Réglages › Administration : le nombre à jour
  if (app.user) app.user.accountRequests = accountRequests.length;
  users.sort((a, b) => compareNames(a.displayName, b.displayName));
  // Demandes de compte (connexion avec le fournisseur d'identité) : en premier, quand il y en a
  const requests = accountRequests.length
    ? [h('p', { class: 'section-title' }, t('administration.demande.titre', { count: accountRequests.length })),
      h('div', { class: 'group' }, accountRequests.map((request) => h('div', { class: 'row' },
        avatar(request.displayName),
        h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, request.displayName), h('span', { class: 'row__sub' }, t('administration.demande.detail', { username: request.username, provider: providerName() }))),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => refuseRequest(request, reload) }, t('administration.demande.refuser')),
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => openAcceptSheet(request, reload) }, t('administration.demande.accepter'))))),
      h('p', { class: 'section-title' }, t('administration.onglets.comptes'))]
    : [];
  replace(panel, ...requests, h('div', { class: 'group' }, users.map((user, i) => h('div', { class: `row${user.active ? '' : ' is-off'}` },
    avatar(user.displayName, { second: i > 0 }),
    h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, user.displayName), h('span', { class: 'row__sub' }, userSub(user))),
    user.active ? null : h('span', { class: 'chip' }, t('administration.compte.desactive.puce')),
    iconButton('more', t('administration.compte.gerer', { name: user.displayName }), () => openUserSheet(user, reload, { localLogin }))))));
  replace(footer, h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => openNewUserSheet(reload, { localLogin }) }, icon('plus'), t('administration.compte.ajouter')));
}

// Feuille d'un compte (administration-2)
// localLogin : connexion par mot de passe possible sur ce serveur ; coupée
// (LISTO_LOCAL_LOGIN=off), « Réinitialiser le mot de passe » n'a plus de sens
function openUserSheet(user, reload, { localLogin = true } = {}) {
  const self = user.id === app.user.id;
  const error = errorNote();
  const run = async (action, message) => {
    error.show('');
    try {
      await action();
      sheet.close();
      if (message) toast(message, { low: true });
      reload();
    } catch (err) {
      error.show(errorMessage(err));
    }
  };

  const actions = [];
  if (!self) {
    if (localLogin) {
      actions.push(h('button', { class: 'row row--menu', type: 'button', onClick: () => { sheet.close(); setTimeout(() => openResetSheet(user, reload), 0); } },
        icon('reset'), h('span', { class: 'row__title' }, t('administration.motDePasse.reinitialiser.titre'))));
    }
    if (user.totpEnabled) {
      actions.push(h('button', {
        class: 'row row--menu',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({ title: t('administration.compte.deuxFacteurs.question'), text: t('administration.compte.deuxFacteurs.texte', { name: user.displayName }), confirmLabel: t('administration.compte.desactiver') });
          if (ok) run(() => del(`/api/admin/users/${user.id}/2fa`), t('administration.compte.deuxFacteurs.desactivee'));
        },
      }, icon('shield'), h('span', { class: 'row__title' }, t('administration.compte.deuxFacteurs.desactiver'))));
    }
    actions.push(user.active
      ? h('button', {
        class: 'row row--menu menu__item--danger',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({ title: t('administration.compte.desactiver.question'), text: t('administration.compte.desactiver.texte', { name: user.displayName }), confirmLabel: t('administration.compte.desactiver') });
          if (ok) run(() => patch(`/api/admin/users/${user.id}`, { active: false }), t('administration.compte.desactive.fait'));
        },
      }, icon('power'), h('span', { class: 'row__title' }, t('administration.compte.desactiver.titre')))
      : h('button', { class: 'row row--menu', type: 'button', onClick: () => run(() => patch(`/api/admin/users/${user.id}`, { active: true }), t('administration.compte.reactive')) },
        icon('power'), h('span', { class: 'row__title' }, t('administration.compte.reactiver'))));
    if (!user.inUse) {
      actions.push(h('button', {
        class: 'row row--menu menu__item--danger',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({ title: t('administration.compte.supprimer.question'), text: t('administration.compte.supprimer.texte', { name: user.displayName }), confirmLabel: t('administration.supprimer') });
          if (ok) run(() => del(`/api/admin/users/${user.id}`), t('administration.compte.supprime'));
        },
      }, icon('trash'), h('span', { class: 'row__title' }, t('administration.compte.supprimer'))));
    }
  }

  // Relié au fournisseur d'identité : « Délier le compte … » (… : son nom ;
  // un compte recréé chez le fournisseur avec le même identifiant pourra de
  // nouveau ouvrir ce compte Listo)
  if (user.authelia) {
    actions.push(h('button', {
      class: 'row row--menu',
      type: 'button',
      onClick: async () => {
        const ok = await confirmDialog({ title: t('administration.compte.delier.question', { provider: providerName() }), text: t('administration.compte.delier.texte', { provider: providerName(), username: user.username, name: user.displayName }), confirmLabel: t('administration.compte.delier') });
        if (ok) run(() => del(`/api/admin/users/${user.id}/authelia`), t('administration.compte.delie', { provider: providerName() }));
      },
    }, icon('link-off'), h('span', { class: 'row__title' }, t('administration.compte.delier.titre', { provider: providerName() }))));
  }

  const sheet = openSheet({
    title: user.displayName,
    sub: userSub(user),
    content: [
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('administration.role')),
        roleSwitch(user.role, (role) => run(() => patch(`/api/admin/users/${user.id}`, { role }), role === 'admin' ? t('administration.compte.role.admin') : t('administration.compte.role.utilisateur')), { disabled: self }),
        self ? h('span', { class: 'field__hint' }, t('administration.compte.role.soiMeme')) : null),
      actions.length ? h('div', { class: 'group' }, actions) : h('p', { class: 'muted' }, t('administration.compte.soiMeme')),
      error.note,
    ],
  });
}

// Réinitialisation du mot de passe d'un compte
function openResetSheet(user, reload) {
  const password = passwordInput({ autocomplete: 'new-password' });
  const passwordField = field(t('administration.motDePasse.provisoire'), password.wrap, { hint: t('administration.motDePasse.reinitialiser.aide', { name: user.displayName }) });
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('administration.motDePasse.reinitialiser'));
  const form = h('form', { class: 'stack', novalidate: true }, passwordField.field, error.note, submit);
  const sheet = openSheet({ title: t('administration.motDePasse.reinitialiser.titre'), sub: user.displayName, content: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if ([...password.input.value].length < 10) {
      passwordField.setError(t('administration.motDePasse.court'));
      return;
    }
    submit.disabled = true;
    try {
      await post(`/api/admin/users/${user.id}/password`, { password: password.input.value });
      sheet.close();
      toast(t('administration.motDePasse.reinitialise'), { low: true });
      reload();
    } catch (err) {
      error.show(errorMessage(err));
      submit.disabled = false;
    }
  });
}

// Demande de compte (connexion avec le fournisseur d'identité) : accepter, avec
// l'identifiant et le nom proposés, que l'Admin peut corriger ; le compte
// est relié à ce compte chez le fournisseur d'identité (pas de mot de passe Listo)
function openAcceptSheet(request, reload) {
  const username = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: request.username });
  const displayName = h('input', { class: 'input', type: 'text', autocomplete: 'off', maxlength: '100', value: request.displayName });
  let role = 'user';
  const usernameField = field(t('administration.identifiant'), username, { hint: t('administration.identifiant.aide') });
  const nameField = field(t('administration.nomAffiche'), displayName);
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('administration.compte.creer'));
  const form = h('form', { class: 'stack', novalidate: true },
    h('p', { class: 'muted' }, t('administration.demande.fournisseur', { provider: providerName() })),
    usernameField.field, nameField.field,
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('administration.role')), roleSwitch(role, (value) => { role = value; })),
    error.note, submit);
  const sheet = openSheet({ title: t('administration.demande.accepter.titre'), sub: request.displayName, content: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    usernameField.setError(null);
    nameField.setError(null);
    if (!/^[A-Za-z0-9._-]{2,50}$/.test(username.value.trim())) return usernameField.setError(t('administration.identifiant.invalide'));
    if (!displayName.value.trim()) return nameField.setError(t('administration.nomAffiche.obligatoire'));
    submit.disabled = true;
    try {
      await post(`/api/admin/account-requests/${request.id}/accept`, { username: username.value.trim(), displayName: displayName.value.trim(), role });
      sheet.close();
      toast(t('administration.compte.cree'), { low: true });
      reload();
    } catch (err) {
      error.show(errorMessage(err));
      submit.disabled = false;
    }
    return undefined;
  });
}

// Demande de compte refusée (gardée 30 jours : une nouvelle connexion ne la refait pas)
async function refuseRequest(request, reload) {
  const ok = await confirmDialog({ title: t('administration.demande.refuser.question'), text: t('administration.demande.refuser.texte', { name: request.displayName, username: request.username }), confirmLabel: t('administration.demande.refuser') });
  if (!ok) return;
  try {
    await post(`/api/admin/account-requests/${request.id}/refuse`);
    toast(t('administration.demande.refusee'), { low: true });
    reload();
  } catch (err) {
    toast(errorMessage(err));
  }
}

// Nouveau compte (administration-3)
// Connexion par mot de passe coupée (localLogin faux) : pas de mot de passe
// provisoire, la personne entrera avec le fournisseur d'identité (même identifiant)
function openNewUserSheet(reload, { localLogin = true } = {}) {
  const username = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const displayName = h('input', { class: 'input', type: 'text', autocomplete: 'off', maxlength: '100' });
  const password = passwordInput({ autocomplete: 'new-password' });
  let role = 'user';
  const usernameField = field(t('administration.identifiant'), username, { hint: t('administration.identifiant.aide') });
  const nameField = field(t('administration.nomAffiche.facultatif'), displayName);
  const passwordField = field(t('administration.motDePasse.provisoire'), password.wrap, { hint: t('administration.motDePasse.provisoire.aide') });
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('administration.compte.creer'));
  const form = h('form', { class: 'stack', novalidate: true },
    usernameField.field, nameField.field,
    localLogin ? passwordField.field : h('p', { class: 'muted' }, t('administration.nouveauCompte.fournisseur', { provider: providerName() })),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('administration.role')), roleSwitch(role, (value) => { role = value; })),
    error.note, submit);
  const sheet = openSheet({ title: t('administration.nouveauCompte.titre'), content: form });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    usernameField.setError(null);
    passwordField.setError(null);
    if (!/^[A-Za-z0-9._-]{2,50}$/.test(username.value.trim())) return usernameField.setError(t('administration.identifiant.invalide'));
    if (localLogin && [...password.input.value].length < 10) return passwordField.setError(t('administration.motDePasse.court'));
    submit.disabled = true;
    try {
      await post('/api/admin/users', { username: username.value.trim(), displayName: displayName.value.trim() || defaultDisplayName(username.value), password: localLogin ? password.input.value : undefined, role });
      sheet.close();
      toast(t('administration.compte.cree'), { low: true });
      reload();
    } catch (err) {
      error.show(errorMessage(err));
      submit.disabled = false;
    }
    return undefined;
  });
}

// ============ Magasins, rayons ============

async function loadReferences(tab, panel, alive) {
  replace(panel, loadingText());
  const reload = () => loadReferences(tab, panel, alive);
  let items;
  try {
    ({ items } = await get(`/api/admin/${tab.api}`));
  } catch (err) {
    if (alive()) replace(panel, errorBlock(err, reload));
    return;
  }
  if (!alive()) return;

  const isStores = tab.api === 'stores';

  // Ajout (add-inline ; pour un magasin, add-block avec le choix Simple / Multi)
  const input = h('input', { class: 'input', ...LABEL_INPUT, maxlength: '100', placeholder: tab.placeholder, 'aria-label': tab.placeholder });
  const addButton = h('button', { class: 'btn btn--primary btn--add', type: 'submit' }, t('administration.ajouter'));
  let isMulti = false;
  let addForm;
  if (isStores) {
    const hint = h('p', { class: 'field__hint', hidden: true }, t('administration.magasins.multi.aide'));
    const kinds = segmented(t('administration.magasins.type'), [['simple', 'store', t('administration.magasins.type.simple')], ['multi', 'layers', t('administration.magasins.type.multi')]], 'simple', (value) => {
      isMulti = value === 'multi';
      hint.hidden = !isMulti;
    });
    addForm = h('form', { class: 'add-block', novalidate: true },
      h('div', { class: 'add-block__row' }, h('label', { class: 'grow' }, input), addButton),
      kinds, hint);
  } else {
    addForm = h('form', { class: 'add-inline add-inline--flush', novalidate: true }, h('label', { class: 'grow' }, input), addButton);
  }
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    try {
      await post(`/api/admin/${tab.api}`, isStores ? { name, isMulti } : { name });
      toast(tab.feminine ? t('administration.ajoutee', { name }) : t('administration.ajoute', { name }), { low: true });
      afterChange(reload);
    } catch (err) {
      toast(errorMessage(err), { low: true });
    }
  });

  let rows;
  if (isStores) {
    // Magasins simples puis « multi » ; dans chaque groupe, les actifs d'abord
    const sorted = [...items].sort((a, b) => Number(a.isMulti) - Number(b.isMulti) || Number(b.active) - Number(a.active) || compareNames(a.name, b.name));
    const simples = items.filter((item) => !item.isMulti).sort((a, b) => compareNames(a.name, b.name));
    rows = sorted.flatMap((item) => storeRows(tab, item, simples, reload));
  } else {
    rows = items.map((item) => manageRow(tab, item, reload));
  }
  replace(panel, addForm, items.length ? h('div', { class: 'group' }, rows) : h('p', { class: 'muted empty__text' }, t('administration.vide')));
}

// Segmenté à choix unique (icône + libellé), comme pour le thème
function segmented(label, choices, current, onChange) {
  const options = choices.map(([value, iconName, text]) => {
    const option = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', 'aria-checked': String(value === current) },
      iconName ? icon(iconName, 'icon--sm') : null, text);
    option.addEventListener('click', () => {
      for (const o of options) o.setAttribute('aria-checked', String(o === option));
      onChange(value);
    });
    return option;
  });
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label }, options);
}

// Magasins « multi » dont le détail est ouvert (gardés d'un rechargement à l'autre)
const openedMulti = new Set();

// Un magasin : sa ligne, et pour un « multi » le détail repliable des
// magasins qu'il regroupe (administration-magasins-1 et 2)
function storeRows(tab, store, simples, reload) {
  if (!store.isMulti) return [manageRow(tab, store, reload)];

  const detail = h('div', { class: 'manage-detail', id: `regroupes-${store.id}`, hidden: !openedMulti.has(store.id) });
  const toggle = iconButton('chev-d', t('administration.magasins.regroupes.voir', { name: store.name }), () => {
    const open = detail.hidden;
    detail.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) openedMulti.add(store.id);
    else openedMulti.delete(store.id);
  });
  toggle.setAttribute('aria-expanded', String(!detail.hidden));
  toggle.setAttribute('aria-controls', detail.id);

  // Cases à cocher : chaque changement est enregistré tout de suite
  const chosen = new Set(store.storeIds);
  const ticks = simples.map((simple) => {
    const tick = h('span', { class: `tick${chosen.has(simple.id) ? ' is-on' : ''}` }, chosen.has(simple.id) ? icon('check') : null);
    const rowEl = h('button', { class: 'tick-row', type: 'button', role: 'checkbox', 'aria-checked': String(chosen.has(simple.id)) },
      tick, h('span', { class: 'grow' }, simple.name, simple.active ? null : h('span', { class: 'muted' }, ` ${t('administration.magasins.desactive')}`)));
    rowEl.addEventListener('click', async () => {
      const on = !chosen.has(simple.id);
      if (on) chosen.add(simple.id);
      else chosen.delete(simple.id);
      rowEl.disabled = true;
      try {
        await patch(`/api/admin/stores/${store.id}`, { storeIds: [...chosen] });
        afterChange(reload);
      } catch (err) {
        if (on) chosen.delete(simple.id);
        else chosen.add(simple.id);
        rowEl.disabled = false;
        toast(errorMessage(err), { low: true });
      }
    });
    return rowEl;
  });
  // Un « multi » jamais utilisé se supprime depuis son détail (la ligne n'a
  // pas la place pour une corbeille en plus)
  const removeButton = store.inUse ? null : h('div', { class: 'manage-detail__note' },
    h('button', { class: 'btn btn--danger-outline btn--sm', type: 'button', onClick: () => removeReference(tab, store, reload) },
      icon('trash', 'icon--sm'), t('administration.magasins.supprimer')));
  replace(detail,
    h('p', { class: 'manage-detail__title' }, t('administration.magasins.regroupes')),
    ticks.length ? ticks : h('p', { class: 'manage-detail__note' }, t('administration.magasins.aucunSimple')),
    h('p', { class: 'manage-detail__note' }, t('administration.magasins.sansMagasin')),
    removeButton);

  return [manageRow(tab, store, reload, { extra: toggle, canDelete: false }), detail];
}

// Après une modification : liste rechargée, et données de l'appli à jour
// (magasins et rayons proposés dans les listes)
function afterChange(reload) {
  reload();
  refreshData({ quiet: true });
}

const stateLabel = (tab, item) => {
  const word = item.active ? (tab.feminine ? t('administration.etat.active') : t('administration.etat.actif')) : (tab.feminine ? t('administration.etat.desactivee') : t('administration.etat.desactive'));
  if (item.isMulti) return t('administration.etat.multi', { count: item.storeIds.length, state: word });
  if (item.isMulti === false) return t('administration.etat.simple', { state: word });
  return word;
};


// Ligne d'un élément : nom, état, renommer, interrupteur, supprimer (si jamais
// utilisé). extra : bouton ajouté avant l'interrupteur (détail d'un « multi »).
function manageRow(tab, item, reload, { extra = null, canDelete = !item.inUse } = {}) {
  const rowEl = h('div', { class: `manage${item.active ? '' : ' is-off'}` });
  const showView = () => {
    rowEl.classList.remove('is-editing');
    replace(rowEl,
      h('div', { class: 'grow' },
        h('p', { class: 'manage__name' }, item.name, item.isMulti ? [' ', multiBadge()] : null),
        h('p', { class: 'manage__sub' }, stateLabel(tab, item))),
      iconButton('pencil', t('administration.modifier', { name: item.name }), showEdit),
      canDelete ? iconButton('trash', t('administration.supprimer.element', { name: item.name }), () => removeReference(tab, item, reload)) : null,
      extra,
      h('button', {
        class: 'switch',
        type: 'button',
        role: 'switch',
        'aria-checked': String(item.active),
        'aria-label': item.active
          ? (tab.feminine ? t('administration.interrupteur.active', { name: item.name }) : t('administration.interrupteur.actif', { name: item.name }))
          : (tab.feminine ? t('administration.interrupteur.desactivee', { name: item.name }) : t('administration.interrupteur.desactive', { name: item.name })),
        onClick: async () => {
          try {
            await patch(`/api/admin/${tab.api}/${item.id}`, { active: !item.active });
            afterChange(reload);
          } catch (err) {
            toast(errorMessage(err), { low: true });
          }
        },
      }));
  };

  // Renommage sur place (administration-6)
  const showEdit = () => {
    const input = h('input', { class: 'input', ...LABEL_INPUT, maxlength: '100', value: item.name, 'aria-label': t('administration.renommer', { label: item.name }) });
    const form = h('form', { class: 'manage__edit grow', novalidate: true }, input,
      h('button', { class: 'btn btn--primary btn--icon btn--edit', type: 'submit', 'aria-label': t('administration.renommer.enregistrer') }, icon('check')),
      iconButton('close', t('administration.annuler'), showView));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name || name === item.name) {
        showView();
        return;
      }
      try {
        await patch(`/api/admin/${tab.api}/${item.id}`, { name });
        afterChange(reload);
      } catch (err) {
        toast(errorMessage(err), { low: true });
        input.setAttribute('aria-invalid', 'true'); // signalé, sans curseur
      }
    });
    // Le champ apparaît sans curseur : on le touche pour taper
    rowEl.classList.add('is-editing');
    replace(rowEl, form);
  };

  showView();
  return rowEl;
}

// Supprime un élément jamais utilisé, après confirmation
async function removeReference(tab, item, reload) {
  const ok = await confirmDialog({ title: t('administration.supprimer.question', { name: item.name }), text: t('administration.supprimer.texte'), confirmLabel: t('administration.supprimer') });
  if (!ok) return;
  try {
    await del(`/api/admin/${tab.api}/${item.id}`);
    toast(tab.feminine ? t('administration.supprimee', { name: item.name }) : t('administration.supprime', { name: item.name }), { low: true });
    afterChange(reload);
  } catch (err) {
    toast(errorMessage(err), { low: true });
  }
}

// ================= Articles (mémoire des noms) =================
//
// L'historique commun des articles saisis dans les listes de courses (les
// autres listes ne mémorisent rien), une ligne par article (les lignes par
// magasin sont regroupées par le serveur), 50 articles par morceau.
// Seulement des noms et des compteurs : jamais une liste ni ses membres.

// Recherche et tri gardés d'un rechargement à l'autre (après une correction)
const namesView = { query: '', sort: 'name' };

async function loadNames(panel, alive) {
  const reload = () => loadNames(panel, alive);
  const input = h('input', {
    class: 'input', type: 'search', maxlength: '100', autocomplete: 'off', spellcheck: 'false',
    placeholder: t('administration.noms.rechercher'), 'aria-label': t('administration.noms.rechercher'), value: namesView.query,
  });
  const sorting = segmented(t('administration.noms.trier'), [['name', null, t('administration.noms.trier.nom')], ['uses', null, t('administration.noms.trier.utilisation')]], namesView.sort, (value) => {
    namesView.sort = value;
    showFirstPage();
  });
  const search = h('form', { class: 'add-block', role: 'search', novalidate: true },
    h('div', { class: 'add-block__row' }, h('label', { class: 'grow' }, input)), sorting);
  const results = h('div', { 'aria-live': 'polite' });
  replace(panel, search, results);

  // Une seule réponse compte : la plus récente (frappe rapide dans la recherche)
  let request = 0;
  async function fetchPage(offset) {
    const params = new URLSearchParams({ q: namesView.query, sort: namesView.sort, offset: String(offset) });
    return get(`/api/admin/names?${params}`);
  }

  async function showFirstPage() {
    const mine = ++request;
    replace(results, loadingText());
    let page;
    try {
      page = await fetchPage(0);
    } catch (err) {
      if (alive() && mine === request) replace(results, errorBlock(err, showFirstPage));
      return;
    }
    if (!alive() || mine !== request) return;
    if (!page.total) {
      replace(results, h('p', { class: 'muted empty__text' }, namesView.query ? t('administration.noms.aucunResultat') : t('administration.noms.vide')));
      return;
    }
    const group = h('div', { class: 'group' });
    const more = h('div', { class: 'add-inline' });
    let shown = 0;
    const addPage = (p) => {
      group.append(...p.names.map((entry) => nameRow(entry, reload)));
      shown += p.names.length;
      if (shown >= p.total) {
        replace(more);
        return;
      }
      const button = h('button', { class: 'btn btn--secondary btn--block', type: 'button' }, t('administration.noms.plus', { count: p.total - shown }));
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const next = await fetchPage(shown);
          if (alive() && mine === request) addPage(next);
        } catch (err) {
          button.disabled = false;
          toast(errorMessage(err), { low: true });
        }
      });
      replace(more, button);
    };
    replace(results, h('p', { class: 'section-title' }, countItems(page.total, true)), group, more);
    addPage(page);
  }

  // Recherche : relancée 300 ms après la dernière frappe
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      namesView.query = input.value.trim();
      showFirstPage();
    }, 300);
  });
  search.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    namesView.query = input.value.trim();
    showFirstPage();
  });

  showFirstPage();
}

// Après une correction ou un retrait : liste rechargée, et copie de ce
// téléphone rechargée en entier (suggestions et listes à jour)
function afterNameChange(reload) {
  reload();
  refreshData({ quiet: true, full: true });
}

// Ligne d'un nom : nom affiché, rayon habituel et compteurs ; « Corriger »
// (renommage sur place, puis confirmation chiffrée), « Modifier le rayon »
// et « Retirer des suggestions »
function nameRow(entry, reload) {
  const rowEl = h('div', { class: 'manage' });
  const showView = () => {
    rowEl.classList.remove('is-editing');
    replace(rowEl,
      h('div', { class: 'grow' },
        h('p', { class: 'manage__name' }, entry.name),
        h('p', { class: 'manage__sub' }, savedNameSub(entry))),
      iconButton('pencil', t('administration.noms.corriger', { name: entry.name }), showEdit),
      iconButton('store', t('administration.noms.modifierRayon', { name: entry.name }), () => chooseAisle(entry, reload)),
      iconButton('trash', t('administration.noms.retirer', { name: entry.name }), () => removeName(entry, reload)));
  };

  const showEdit = () => {
    const input = h('input', { class: 'input', ...LABEL_INPUT, maxlength: '100', value: entry.name, 'aria-label': t('administration.noms.orthographe', { label: entry.name }) });
    const form = h('form', { class: 'manage__edit grow', novalidate: true }, input,
      h('button', { class: 'btn btn--primary btn--icon btn--edit', type: 'submit', 'aria-label': t('administration.noms.corriger.valider') }, icon('check')),
      iconButton('close', t('administration.annuler'), showView));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name || name === entry.name) {
        showView();
        return;
      }
      try {
        // Ce qui va changer, pour la confirmation (nombres seulement)
        const impact = await get(`/api/admin/names/impact?${new URLSearchParams({ from: entry.key, to: name })}`);
        if (impact.unchanged) {
          showView();
          return;
        }
        const ok = await confirmDialog({ title: t('administration.noms.corriger.question'), text: renameImpactText(impact), confirmLabel: t('administration.noms.corriger.bouton'), danger: false });
        if (!ok) return;
        const done = await post('/api/admin/names/rename', { from: entry.key, to: name });
        toast(renameDoneText(done), { low: true });
        afterNameChange(reload);
      } catch (err) {
        toast(errorMessage(err), { low: true });
        input.setAttribute('aria-invalid', 'true'); // signalé, sans curseur
      }
    });
    // Le champ apparaît sans curseur : on le touche pour taper
    rowEl.classList.add('is-editing');
    replace(rowEl, form);
  };

  showView();
  return rowEl;
}

// « Modifier le rayon » : feuille de choix (rayons actifs par ordre
// alphabétique, puis « Aucun rayon » ; l'actuel est coché), puis
// « Enregistrer ». Le rayon habituel change pour ce nom (toutes ses lignes,
// générale et par magasin) ; les articles déjà dans les listes gardent le
// leur. Aucun champ de saisie, donc aucun clavier.
function chooseAisle(entry, reload) {
  const choices = [...activeOnly(app.data.aisles).map((aisle) => ({ id: aisle.id, name: aisle.name })), { id: null, name: t('administration.noms.aucunRayon') }];
  // Rayon actuel : coché seulement s'il est encore proposé
  let selected = choices.some((c) => c.id === (entry.aisleId ?? null)) ? (entry.aisleId ?? null) : undefined;
  const save = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, t('administration.noms.enregistrer'));
  const rows = choices.map((choice) => {
    const row = h('button', { class: 'radio-row', type: 'button', role: 'radio', 'aria-checked': 'false' }, h('span', { class: 'radio' }), choice.name);
    row.dataset.id = String(choice.id);
    row.addEventListener('click', () => {
      selected = choice.id;
      paint();
    });
    return row;
  });
  const paint = () => {
    for (const row of rows) {
      const on = row.dataset.id === String(selected);
      row.classList.toggle('is-on', on);
      row.setAttribute('aria-checked', String(on));
      row.querySelector('.radio').classList.toggle('is-on', on);
      row.querySelector('.icon-end')?.remove();
      if (on) row.append(icon('check', 'icon-end'));
    }
    save.disabled = selected === undefined;
  };
  paint();
  const sheet = openSheet({
    title: t('administration.noms.rayon.titre', { name: entry.name }),
    content: [h('div', { class: 'card picker' }, h('div', { role: 'radiogroup', 'aria-label': t('administration.noms.rayon') }, rows)), save],
  });
  save.addEventListener('click', async () => {
    if (selected === (entry.aisleId ?? null)) {
      sheet.close();
      return;
    }
    save.disabled = true;
    try {
      const done = await post('/api/admin/names/aisle', { from: entry.key, aisleId: selected });
      sheet.close();
      toast(done.aisle ? t('administration.noms.rayon.fait', { name: entry.name, aisle: done.aisle }) : t('administration.noms.rayon.aucun', { name: entry.name }), { low: true });
      afterNameChange(reload);
    } catch (err) {
      save.disabled = false;
      toast(errorMessage(err), { low: true });
    }
  });
}

// Retire un nom des suggestions (l'historique seulement), après confirmation
async function removeName(entry, reload) {
  const ok = await confirmDialog({
    title: t('administration.noms.retirer.question', { name: entry.name }),
    text: t('administration.noms.retirer.texte'),
    confirmLabel: t('administration.noms.retirer.bouton'),
  });
  if (!ok) return;
  try {
    await post('/api/admin/names/remove', { from: entry.key });
    toast(t('administration.noms.retire', { name: entry.name }), { low: true });
    afterNameChange(reload);
  } catch (err) {
    toast(errorMessage(err), { low: true });
  }
}
