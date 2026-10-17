// Écran « Administration » (maquettes administration-1 à 6), réservé aux Admin
// (le serveur le vérifie à chaque requête). Quatre onglets :
// - Comptes : liste, création, rôle, réinitialisation du mot de passe,
//   désactivation de la 2FA, désactivation / réactivation, suppression d'un
//   compte jamais utilisé ;
// - Catégories, Magasins, Rayons : ajout, renommage, désactivation /
//   réactivation, suppression d'un élément jamais utilisé.
// Aucune de ces vues ne montre le contenu des listes.

import { h, icon, iconButton, field, passwordInput, errorNote, avatar, replace } from '../dom.js';
import { get, post, patch, del, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { compareNames } from '../sorting.js';
import { app, refreshData } from '../app.js';
import { openSheet, confirmDialog, toast } from '../ui.js';
import { defaultDisplayName } from '../format.js';

const TABS = [
  { key: 'comptes', label: 'Comptes' },
  { key: 'categories', label: 'Catégories', api: 'categories', placeholder: 'Nouvelle catégorie', feminine: true },
  { key: 'magasins', label: 'Magasins', api: 'stores', placeholder: 'Nouveau magasin' },
  { key: 'rayons', label: 'Rayons', api: 'aisles', placeholder: 'Nouveau rayon' },
];

export function renderAdmin(tabKey, onLeave) {
  const tab = TABS.find((t) => t.key === tabKey);
  if (!tab) {
    navigate('admin', { tab: 'comptes' }, { replace: true });
    return h('div', { class: 'screen' });
  }

  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Rubriques' },
    TABS.map((t) => h('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      'aria-selected': String(t.key === tab.key),
      onClick: () => navigate('admin', { tab: t.key }, { replace: true }),
    }, t.label)));

  const panel = h('div', { class: 'body admin-list', role: 'tabpanel' });
  const footer = h('div', { class: 'footer', hidden: tab.key !== 'comptes' });
  let alive = true;
  onLeave(() => {
    alive = false;
  });
  const reload = () => (tab.key === 'comptes' ? loadUsers(panel, footer, () => alive) : loadReferences(tab, panel, () => alive));
  reload();

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', 'Retour aux réglages', () => goBack('settings')),
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, 'Administration'))),
    tabs, panel, footer);
}

const loadingText = () => h('p', { class: 'empty muted', role: 'status' }, 'Chargement…');
const errorBlock = (err, retry) => h('div', { class: 'empty' },
  h('p', { class: 'empty__text' }, errorMessage(err)),
  h('button', { class: 'btn btn--secondary', type: 'button', onClick: retry }, 'Réessayer'));

// Segmenté « Utilisateur / Admin » (même composant que le thème)
function roleSwitch(role, onChange, { disabled = false } = {}) {
  const options = [['user', 'Utilisateur'], ['admin', 'Admin']].map(([value, label]) => {
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
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Rôle' }, options);
}

// ======================= Comptes =======================

const userSub = (user) => [
  user.role === 'admin' ? 'Admin' : 'Utilisateur',
  user.active ? (user.totpEnabled ? '2FA activé' : '2FA désactivé') : 'compte désactivé',
].join(' · ');

async function loadUsers(panel, footer, alive) {
  replace(panel, loadingText());
  const reload = () => loadUsers(panel, footer, alive);
  let users;
  try {
    ({ users } = await get('/api/admin/users'));
  } catch (err) {
    if (alive()) replace(panel, errorBlock(err, reload));
    return;
  }
  if (!alive()) return;
  users.sort((a, b) => compareNames(a.displayName, b.displayName));
  replace(panel, h('div', { class: 'group' }, users.map((user, i) => h('div', { class: `row${user.active ? '' : ' is-off'}` },
    avatar(user.displayName, { second: i > 0 }),
    h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, user.displayName), h('span', { class: 'row__sub' }, userSub(user))),
    user.active ? null : h('span', { class: 'chip' }, 'Désactivé'),
    iconButton('more', `Gérer le compte de ${user.displayName}`, () => openUserSheet(user, reload))))));
  replace(footer, h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => openNewUserSheet(reload) }, icon('plus'), 'Ajouter un compte'));
}

// Feuille d'un compte (administration-2)
function openUserSheet(user, reload) {
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
    actions.push(h('button', { class: 'row row--menu', type: 'button', onClick: () => { sheet.close(); setTimeout(() => openResetSheet(user, reload), 0); } },
      icon('reset'), h('span', { class: 'row__title' }, 'Réinitialiser le mot de passe')));
    if (user.totpEnabled) {
      actions.push(h('button', {
        class: 'row row--menu',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({ title: 'Désactiver la double authentification ?', text: `${user.displayName} pourra se connecter avec son seul mot de passe, puis réactiver la 2FA dans ses réglages.`, confirmLabel: 'Désactiver' });
          if (ok) run(() => del(`/api/admin/users/${user.id}/2fa`), 'Double authentification désactivée');
        },
      }, icon('shield'), h('span', { class: 'row__title' }, 'Désactiver la double authentification')));
    }
    actions.push(user.active
      ? h('button', {
        class: 'row row--menu menu__item--danger',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({ title: 'Désactiver le compte ?', text: `${user.displayName} sera déconnecté tout de suite et ne pourra plus se connecter. Ses listes sont conservées.`, confirmLabel: 'Désactiver' });
          if (ok) run(() => patch(`/api/admin/users/${user.id}`, { active: false }), 'Compte désactivé');
        },
      }, icon('power'), h('span', { class: 'row__title' }, 'Désactiver le compte'))
      : h('button', { class: 'row row--menu', type: 'button', onClick: () => run(() => patch(`/api/admin/users/${user.id}`, { active: true }), 'Compte réactivé') },
        icon('power'), h('span', { class: 'row__title' }, 'Réactiver le compte')));
    if (!user.inUse) {
      actions.push(h('button', {
        class: 'row row--menu menu__item--danger',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({ title: 'Supprimer le compte ?', text: `Le compte de ${user.displayName} n'a jamais servi : il sera supprimé définitivement.`, confirmLabel: 'Supprimer' });
          if (ok) run(() => del(`/api/admin/users/${user.id}`), 'Compte supprimé');
        },
      }, icon('trash'), h('span', { class: 'row__title' }, 'Supprimer le compte')));
    }
  }

  const sheet = openSheet({
    title: user.displayName,
    sub: userSub(user),
    content: [
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Rôle'),
        roleSwitch(user.role, (role) => run(() => patch(`/api/admin/users/${user.id}`, { role }), role === 'admin' ? 'Rôle Admin donné' : 'Rôle Utilisateur donné'), { disabled: self }),
        self ? h('span', { class: 'field__hint' }, 'Vous ne pouvez pas changer votre propre rôle.') : null),
      actions.length ? h('div', { class: 'group' }, actions) : h('p', { class: 'muted' }, 'Votre mot de passe et votre 2FA se gèrent dans vos réglages.'),
      error.note,
    ],
  });
}

// Réinitialisation du mot de passe d'un compte
function openResetSheet(user, reload) {
  const password = passwordInput({ autocomplete: 'new-password' });
  const passwordField = field('Mot de passe provisoire', password.wrap, { hint: `${user.displayName} devra le changer à sa prochaine connexion. Toutes ses sessions sont fermées.` });
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Réinitialiser');
  const form = h('form', { class: 'stack', novalidate: true }, passwordField.field, error.note, submit);
  const sheet = openSheet({ title: 'Réinitialiser le mot de passe', sub: user.displayName, content: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if ([...password.input.value].length < 10) {
      passwordField.setError('Au moins 10 caractères');
      return;
    }
    submit.disabled = true;
    try {
      await post(`/api/admin/users/${user.id}/password`, { password: password.input.value });
      sheet.close();
      toast('Mot de passe réinitialisé', { low: true });
      reload();
    } catch (err) {
      error.show(errorMessage(err));
      submit.disabled = false;
    }
  });
}

// Nouveau compte (administration-3)
function openNewUserSheet(reload) {
  const username = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const displayName = h('input', { class: 'input', type: 'text', autocomplete: 'off', maxlength: '100' });
  const password = passwordInput({ autocomplete: 'new-password' });
  let role = 'user';
  const usernameField = field('Identifiant', username, { hint: '2 à 50 caractères : lettres sans accent, chiffres, . _ -' });
  const nameField = field('Nom affiché (facultatif)', displayName);
  const passwordField = field('Mot de passe provisoire', password.wrap, { hint: 'À changer par la personne à sa première connexion.' });
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Créer le compte');
  const form = h('form', { class: 'stack', novalidate: true },
    usernameField.field, nameField.field, passwordField.field,
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Rôle'), roleSwitch(role, (value) => { role = value; })),
    error.note, submit);
  const sheet = openSheet({ title: 'Nouveau compte', content: form });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    usernameField.setError(null);
    passwordField.setError(null);
    if (!/^[A-Za-z0-9._-]{2,50}$/.test(username.value.trim())) return usernameField.setError('Identifiant invalide');
    if ([...password.input.value].length < 10) return passwordField.setError('Au moins 10 caractères');
    submit.disabled = true;
    try {
      await post('/api/admin/users', { username: username.value.trim(), displayName: displayName.value.trim() || defaultDisplayName(username.value), password: password.input.value, role });
      sheet.close();
      toast('Compte créé', { low: true });
      reload();
    } catch (err) {
      error.show(errorMessage(err));
      submit.disabled = false;
    }
    return undefined;
  });
}

// ============ Catégories, magasins, rayons ============

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

  // Ajout (add-inline)
  const input = h('input', { class: 'input', type: 'text', maxlength: '100', placeholder: tab.placeholder, 'aria-label': tab.placeholder });
  const addForm = h('form', { class: 'add-inline add-inline--flush', novalidate: true },
    h('label', { class: 'grow' }, input),
    h('button', { class: 'btn btn--primary btn--add', type: 'submit' }, 'Ajouter'));
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    try {
      await post(`/api/admin/${tab.api}`, { name });
      toast(`« ${name} » ajouté${tab.feminine ? 'e' : ''}`, { low: true });
      afterChange(reload);
    } catch (err) {
      toast(errorMessage(err), { low: true });
    }
  });

  const rows = items.map((item) => manageRow(tab, item, reload));
  replace(panel, addForm, items.length ? h('div', { class: 'group' }, rows) : h('p', { class: 'muted empty__text' }, 'Aucun élément pour le moment.'));
}

// Après une modification : liste rechargée, et données de l'appli à jour
// (catégories, magasins et rayons proposés dans les listes)
function afterChange(reload) {
  reload();
  refreshData({ quiet: true });
}

const stateLabel = (tab, item) => {
  const word = item.active ? (tab.feminine ? 'Active' : 'Actif') : (tab.feminine ? 'Désactivée' : 'Désactivé');
  return item.isShopping ? `${word} · avec magasins et rayons` : word;
};

// Ligne d'un élément : nom, état, renommer, interrupteur, supprimer (si jamais utilisé)
function manageRow(tab, item, reload) {
  const rowEl = h('div', { class: `manage${item.active ? '' : ' is-off'}` });
  const showView = () => {
    rowEl.classList.remove('is-editing');
    replace(rowEl,
      h('div', { class: 'grow' }, h('p', { class: 'manage__name' }, item.name), h('p', { class: 'manage__sub' }, stateLabel(tab, item))),
      iconButton('pencil', `Modifier ${item.name}`, () => (tab.api === 'categories' ? openCategorySheet(item, reload) : showEdit())),
      item.inUse ? null : iconButton('trash', `Supprimer ${item.name}`, async () => {
        const ok = await confirmDialog({ title: `Supprimer « ${item.name} » ?`, text: "Cet élément n'a jamais servi : il sera supprimé définitivement.", confirmLabel: 'Supprimer' });
        if (!ok) return;
        try {
          await del(`/api/admin/${tab.api}/${item.id}`);
          toast(`« ${item.name} » supprimé${tab.feminine ? 'e' : ''}`, { low: true });
          afterChange(reload);
        } catch (err) {
          toast(errorMessage(err), { low: true });
        }
      }),
      h('button', {
        class: 'switch',
        type: 'button',
        role: 'switch',
        'aria-checked': String(item.active),
        'aria-label': `${item.name} ${item.active ? (tab.feminine ? 'active' : 'actif') : (tab.feminine ? 'désactivée' : 'désactivé')}`,
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
    const input = h('input', { class: 'input', type: 'text', maxlength: '100', value: item.name, 'aria-label': `Nouveau nom pour ${item.name}` });
    const form = h('form', { class: 'manage__edit grow', novalidate: true }, input,
      h('button', { class: 'btn btn--primary btn--icon btn--edit', type: 'submit', 'aria-label': 'Enregistrer le nouveau nom' }, icon('check')),
      iconButton('close', 'Annuler', showView));
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
        input.focus();
      }
    });
    rowEl.classList.add('is-editing');
    replace(rowEl, form);
    input.focus();
    input.select();
  };

  showView();
  return rowEl;
}

// Catégorie : nom et « liste de courses » (magasin et rayons)
function openCategorySheet(item, reload) {
  const name = h('input', { class: 'input', type: 'text', maxlength: '100', value: item.name });
  let shopping = item.isShopping;
  const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(shopping), 'aria-labelledby': 'shopping-label' });
  toggle.addEventListener('click', () => {
    shopping = !shopping;
    toggle.setAttribute('aria-checked', String(shopping));
  });
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Enregistrer');
  const form = h('form', { class: 'stack', novalidate: true },
    field('Nom', name).field,
    h('div', { class: 'card toggle-row' },
      h('div', { class: 'grow' },
        h('p', { class: 'row__title', id: 'shopping-label' }, 'Liste de courses'),
        h('p', { class: 'row__sub' }, 'Les listes de cette catégorie ont un magasin et classent leurs articles par rayon.')),
      toggle),
    error.note, submit);
  const sheet = openSheet({ title: 'Modifier la catégorie', content: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const changes = {};
    if (name.value.trim() !== item.name) changes.name = name.value.trim();
    if (shopping !== item.isShopping) changes.isShopping = shopping;
    if (!Object.keys(changes).length) {
      sheet.close();
      return;
    }
    submit.disabled = true;
    try {
      await patch(`/api/admin/categories/${item.id}`, changes);
      sheet.close();
      afterChange(reload);
    } catch (err) {
      error.show(errorMessage(err));
      submit.disabled = false;
    }
  });
}
