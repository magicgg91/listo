// Écran « Administration » (maquettes administration-1 à 6), réservé aux Admin
// (le serveur le vérifie à chaque requête). Quatre onglets :
// - Comptes : liste, création, rôle, réinitialisation du mot de passe,
//   désactivation de la 2FA, désactivation / réactivation, suppression d'un
//   compte jamais utilisé ;
// - Catégories, Magasins, Rayons : ajout, renommage, désactivation /
//   réactivation, suppression d'un élément jamais utilisé ;
// - Noms enregistrés : l'historique commun des noms d'articles saisis dans
//   les listes de courses (autocomplétion, rayon habituel) ; corriger un nom
//   dans toutes les listes de courses, ou le retirer des suggestions.
// Aucune de ces vues ne montre le contenu d'une liste (son nom, ses membres,
// ses éléments) : les noms enregistrés viennent avec de simples compteurs.

import { h, icon, iconButton, field, passwordInput, errorNote, avatar, replace, multiBadge } from '../dom.js';
import { get, post, patch, del, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { compareNames } from '../sorting.js';
import { app, refreshData } from '../app.js';
import { openSheet, confirmDialog, toast } from '../ui.js';
import { defaultDisplayName, savedNameSub, renameImpactText, renameDoneText } from '../format.js';
import { itemWords } from '../words.js';

const TABS = [
  { key: 'comptes', label: 'Comptes' },
  { key: 'categories', label: 'Catégories', api: 'categories', placeholder: 'Nouvelle catégorie', feminine: true },
  { key: 'magasins', label: 'Magasins', api: 'stores', placeholder: 'Nouveau magasin' },
  { key: 'rayons', label: 'Rayons', api: 'aisles', placeholder: 'Nouveau rayon' },
  { key: 'noms', label: 'Noms', title: 'Noms enregistrés' },
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
      // Libellé court à l'écran ; nom complet pour les lecteurs d'écran
      'aria-label': t.title ?? null,
      onClick: () => navigate('admin', { tab: t.key }, { replace: true }),
    }, t.label)));

  const panel = h('div', { class: 'body admin-list', role: 'tabpanel' });
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
      h('h2', { class: 'empty__title' }, 'Indisponible hors ligne'),
      h('p', { class: 'empty__text' }, "L'administration a besoin du réseau. Elle s'affichera dès son retour.")));
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

  const isStores = tab.api === 'stores';

  // Ajout (add-inline ; pour un magasin, add-block avec le choix Simple / Multi)
  const input = h('input', { class: 'input', type: 'text', maxlength: '100', placeholder: tab.placeholder, 'aria-label': tab.placeholder });
  const addButton = h('button', { class: 'btn btn--primary btn--add', type: 'submit' }, 'Ajouter');
  let isMulti = false;
  let addForm;
  if (isStores) {
    const hint = h('p', { class: 'field__hint', hidden: true }, 'Un magasin multi regroupe plusieurs magasins : les articles sont classés par magasin, sans rayons.');
    const kinds = segmented('Type de magasin', [['simple', 'store', 'Simple'], ['multi', 'layers', 'Multi']], 'simple', (value) => {
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
      toast(`« ${name} » ajouté${tab.feminine ? 'e' : ''}`, { low: true });
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
  replace(panel, addForm, items.length ? h('div', { class: 'group' }, rows) : h('p', { class: 'muted empty__text' }, 'Aucun élément pour le moment.'));
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
  const toggle = iconButton('chev-d', `Magasins regroupés de ${store.name}`, () => {
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
      tick, h('span', { class: 'grow' }, simple.name, simple.active ? null : h('span', { class: 'muted' }, ' (désactivé)')));
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
      icon('trash', 'icon--sm'), 'Supprimer ce magasin'));
  replace(detail,
    h('p', { class: 'manage-detail__title' }, 'Magasins regroupés'),
    ticks.length ? ticks : h('p', { class: 'manage-detail__note' }, 'Ajoutez d\'abord des magasins simples.'),
    h('p', { class: 'manage-detail__note' }, 'Les articles sans magasin passent en dernier, sous « Sans magasin ».'),
    removeButton);

  return [manageRow(tab, store, reload, { extra: toggle, canDelete: false }), detail];
}

// Après une modification : liste rechargée, et données de l'appli à jour
// (catégories, magasins et rayons proposés dans les listes)
function afterChange(reload) {
  reload();
  refreshData({ quiet: true });
}

const stateLabel = (tab, item) => {
  const word = item.active ? (tab.feminine ? 'Active' : 'Actif') : (tab.feminine ? 'Désactivée' : 'Désactivé');
  if (item.isShopping) return `${word} · avec magasins et rayons`;
  if (item.isMulti) return `${item.storeIds.length} magasin${item.storeIds.length > 1 ? 's' : ''} · ${word}`;
  if (item.isMulti === false) return `Simple · ${word}`;
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
      iconButton('pencil', `Modifier ${item.name}`, () => (tab.api === 'categories' ? openCategorySheet(item, reload) : showEdit())),
      canDelete ? iconButton('trash', `Supprimer ${item.name}`, () => removeReference(tab, item, reload)) : null,
      extra,
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

// Supprime un élément jamais utilisé, après confirmation
async function removeReference(tab, item, reload) {
  const ok = await confirmDialog({ title: `Supprimer « ${item.name} » ?`, text: "Cet élément n'a jamais servi : il sera supprimé définitivement.", confirmLabel: 'Supprimer' });
  if (!ok) return;
  try {
    await del(`/api/admin/${tab.api}/${item.id}`);
    toast(`« ${item.name} » supprimé${tab.feminine ? 'e' : ''}`, { low: true });
    afterChange(reload);
  } catch (err) {
    toast(errorMessage(err), { low: true });
  }
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

// ================= Noms enregistrés =================
//
// L'historique commun des noms d'articles saisis dans les listes de courses
// (les autres listes ne mémorisent rien), une ligne par nom (les lignes par
// magasin sont regroupées par le serveur), 50 noms par morceau.
// Seulement des noms et des compteurs : jamais une liste ni ses membres.

// Recherche et tri gardés d'un rechargement à l'autre (après une correction)
const namesView = { query: '', sort: 'name' };

async function loadNames(panel, alive) {
  const reload = () => loadNames(panel, alive);
  const input = h('input', {
    class: 'input', type: 'search', maxlength: '100', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Rechercher un nom', 'aria-label': 'Rechercher un nom', value: namesView.query,
  });
  const sorting = segmented('Trier', [['name', null, 'Par nom'], ['uses', null, 'Par utilisation']], namesView.sort, (value) => {
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
      replace(results, h('p', { class: 'muted empty__text' }, namesView.query ? 'Aucun nom ne correspond à cette recherche.' : 'Aucun nom enregistré pour le moment.'));
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
      const button = h('button', { class: 'btn btn--secondary btn--block', type: 'button' }, `Afficher plus (${p.total - shown} restants)`);
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
    replace(results, h('p', { class: 'section-title' }, `${page.total} nom${page.total > 1 ? 's' : ''}`), group, more);
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
// (renommage sur place, puis confirmation chiffrée) et « Retirer des suggestions »
function nameRow(entry, reload) {
  const rowEl = h('div', { class: 'manage' });
  const showView = () => {
    rowEl.classList.remove('is-editing');
    replace(rowEl,
      h('div', { class: 'grow' },
        h('p', { class: 'manage__name' }, entry.name),
        h('p', { class: 'manage__sub' }, savedNameSub(entry))),
      iconButton('pencil', `Corriger ${entry.name}`, showEdit),
      iconButton('trash', `Retirer ${entry.name} des suggestions`, () => removeName(entry, reload)));
  };

  const showEdit = () => {
    const input = h('input', { class: 'input', type: 'text', maxlength: '100', value: entry.name, 'aria-label': `Nom corrigé pour ${entry.name}` });
    const form = h('form', { class: 'manage__edit grow', novalidate: true }, input,
      h('button', { class: 'btn btn--primary btn--icon btn--edit', type: 'submit', 'aria-label': 'Corriger le nom' }, icon('check')),
      iconButton('close', 'Annuler', showView));
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
        const ok = await confirmDialog({ title: 'Corriger ce nom ?', text: renameImpactText(impact), confirmLabel: 'Corriger', danger: false });
        if (!ok) {
          input.focus();
          return;
        }
        const done = await post('/api/admin/names/rename', { from: entry.key, to: name });
        toast(renameDoneText(done), { low: true });
        afterNameChange(reload);
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

// Retire un nom des suggestions (l'historique seulement), après confirmation
async function removeName(entry, reload) {
  const ok = await confirmDialog({
    title: `Retirer « ${entry.name} » des suggestions ?`,
    text: `Il ne sera plus proposé pendant la saisie d'un ${itemWords(true).one}. Les listes ne changent pas. S'il est saisi de nouveau dans une liste de courses, il sera de nouveau enregistré.`,
    confirmLabel: 'Retirer',
  });
  if (!ok) return;
  try {
    await post('/api/admin/names/remove', { from: entry.key });
    toast(`« ${entry.name} » retiré des suggestions`, { low: true });
    afterNameChange(reload);
  } catch (err) {
    toast(errorMessage(err), { low: true });
  }
}
