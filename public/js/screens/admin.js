// Écran « Administration » (maquettes administration-1 à 6), réservé aux Admin
// (le serveur le vérifie à chaque requête). Deux onglets :
// - Comptes : liste, création, rôle, réinitialisation du mot de passe,
//   désactivation de la 2FA, désactivation / réactivation, suppression d'un
//   compte jamais utilisé, et « Connexion » (LISTO_OIDC=on : « Mot de passe
//   ou … » ou « … seulement », … étant le nom du fournisseur d'identité) ;
// - Courses, avec trois choix :
//   - Magasins, Rayons : ajout, renommage, désactivation / réactivation,
//     suppression d'un élément jamais utilisé ; les rayons sont groupés
//     par magasin (« Tous les magasins » d'abord, puis chaque magasin
//     simple), se créent dans un magasin choisi et changent de magasin
//     (rayons propres à un magasin, 21 novembre 2026, public/js/aisles.js) ;
//   - Articles : la mémoire commune des articles saisis dans les listes de
//     courses (autocomplétion, rayon habituel) ; corriger un nom dans toutes
//     les listes de courses, changer son rayon habituel, ou le retirer des
//     suggestions. (Son identifiant interne reste « noms », comme les
//     routes /api/admin/names.)
// - Étiquettes (24 novembre 2026, maquette p2) : les étiquettes des notes,
//   communes à tout le foyer, avec leur nombre de notes ; renommer et
//   changer la couleur (une feuille : nom et palette), supprimer (avec
//   confirmation : retirée des notes, sans toucher aux notes). Toujours
//   là, même si l'Admin a coupé les notes pour lui (Réglages › Fonctions).
// Aucune de ces vues ne montre le contenu d'une liste (son nom, ses membres,
// ses éléments) ni d'une note : les articles enregistrés et les étiquettes
// viennent avec de simples compteurs.

import { h, icon, iconButton, field, passwordInput, errorNote, avatar, replace, multiBadge, LABEL_INPUT } from '../dom.js';
import { get, post, put, patch, del, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { compareNames } from '../sorting.js';
import { activeOnly } from '../store.js';
import { app, refreshData, providerName } from '../app.js';
import { openSheet, confirmDialog, toast, onPc } from '../ui.js';
import { ROLES, permissionsFor, defaultAllowed } from '../access.js';
import { defaultDisplayName, savedNameSub, renameImpactText, renameDoneText } from '../format.js';
import { itemWords, countItems } from '../words.js';
import { t, compareText } from '../i18n.js';
import { labelChip, labelPalette } from './note-labels.js';
import { cleanLabelName, labelNameProblem, sortLabels, LABEL_NAME_MAX } from '../labels.js';

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
  { key: 'etiquettes', get label() { return t('administration.onglets.etiquettes'); } },
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

// accountId : compte choisi (#/administration/comptes/<id>) ; sur
// ordinateur, sa page s'ouvre à droite de la liste des comptes
export function renderAdmin(tabKey, onLeave, { accountId = null } = {}) {
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
  // Ordinateur, onglet « Comptes » : « 6 comptes · 2 invités » sous le titre
  // (maquette design/comptes pc-admin-comptes-1) ; rien sur le téléphone
  const sub = onPc() && tab.key === 'comptes' ? h('p', { class: 'topbar__sub' }) : null;
  let alive = true;
  onLeave(() => {
    alive = false;
  });
  const load = () => {
    if (tab.key === 'comptes') return loadUsers(panel, footer, () => alive, { selectedId: accountId === null ? null : Number(accountId), sub });
    if (tab.key === 'etiquettes') return loadLabels(panel, () => alive);
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
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, t('administration.titre')), sub)),
    tabs, choices, panel, footer);
}

const loadingText = () => h('p', { class: 'empty muted', role: 'status' }, t('administration.chargement'));
const errorBlock = (err, retry) => h('div', { class: 'empty' },
  h('p', { class: 'empty__text' }, errorMessage(err)),
  h('button', { class: 'btn btn--secondary', type: 'button', onClick: retry }, t('administration.reessayer')));

// Choix du rôle « Utilisateur | Invité | Admin » (même composant que le
// thème, .segmented ; docs/cadrage-comptes.md, décisions du 25 novembre
// 2026). Le rôle choisi est en relief et s'annonce par aria-checked. Un
// choix impossible est désactivé (pâli ET expliqué par la phrase dessous) :
// « Admin » pour un invité, « Invité » pour un Admin (on passe d'abord par
// « Utilisateur »), tout pour son propre compte. onPick(rôle) reçoit le
// rôle touché ; il renvoie une promesse : faux = choix refusé ou annulé, le
// choix revient au rôle d'avant.
const ROLE_LABELS = { user: 'administration.role.utilisateur', guest: 'administration.role.invite', admin: 'administration.role.admin' };
function roleChoice(role, onPick, { label = t('administration.role'), disabled = () => false } = {}) {
  let current = role;
  const options = ROLES.map((value) => {
    const option = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', disabled: disabled(value) }, t(ROLE_LABELS[value]));
    option.dataset.value = value;
    option.addEventListener('click', async () => {
      if (value === current) return;
      const before = current;
      current = value;
      paint();
      if ((await onPick(value)) === false) {
        current = before;
        paint();
      }
    });
    return option;
  });
  const paint = () => {
    for (const option of options) option.setAttribute('aria-checked', String(option.dataset.value === current));
  };
  paint();
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label }, options);
}

// Phrase sous le choix du rôle : ce que veut dire le rôle
const roleHint = (role) => t({ user: 'administration.role.utilisateur.aide', guest: 'administration.role.invite.aide', admin: 'administration.role.admin.aide' }[role]);

// Mention « Discret » d'un invité (Administration seulement) : l'œil barré
// ET le mot, jamais l'icône seule (kit 16.48, .chip--discreet)
const discreetChip = () => h('span', { class: 'chip chip--discreet' }, icon('eye-off'), t('administration.discret'));

// ======================= Comptes =======================

const roleWord = (role) => t(ROLE_LABELS[role] ?? ROLE_LABELS.user);
// Marque « … seulement » d'un compte (« SSO seulement » : connexion avec le
// fournisseur d'identité seulement), quand la connexion par mot de passe
// existe sur le serveur (sinon tout le monde l'est : rien à signaler)
const ssoMark = (user, localLogin) => (user.ssoOnly && localLogin ? t('administration.connexion.seulement', { provider: providerName() }) : null);
// État d'un compte : 2FA (ou « compte désactivé »), fournisseur d'identité
// (« … seulement » à la place du simple nom quand il est choisi)
const stateParts = (user, localLogin = true) => [
  user.active ? (user.totpEnabled ? t('administration.compte.deuxFacteurs.active') : t('administration.compte.deuxFacteurs.desactive')) : t('administration.compte.desactive'),
  ssoMark(user, localLogin) ?? (user.authelia ? providerName() : null),
];
// Fonctions autorisées, en quelques mots, sur la ligne d'un compte
// (maquette design/comptes admin-comptes-1) : pour un invité, ce qui lui
// est ouvert (« Projets », « Listes, Projets », « aucune fonction ») ; pour
// un Utilisateur, ce que l'Admin lui a retiré (« sans projets ») ; rien
// pour un Admin, ni pour un Utilisateur qui a tout.
const GUEST_ACCESS = {
  'notes,projects': 'administration.acces.notesProjets', notes: 'administration.acces.notes', projects: 'administration.acces.projets', '': 'administration.acces.aucune',
  lists: 'administration.acces.listes', 'lists,notes': 'administration.acces.listesNotes', 'lists,projects': 'administration.acces.listesProjets', 'lists,notes,projects': 'administration.acces.listesNotesProjets',
};
const USER_ACCESS = { 'notes,projects': 'administration.acces.sansNotesProjets', notes: 'administration.acces.sansNotes', projects: 'administration.acces.sansProjets' };
function accessPart(user) {
  if (user.role === 'admin' || !user.allowed) return null;
  if (user.role === 'guest') return t(GUEST_ACCESS[['lists', 'notes', 'projects'].filter((name) => user.allowed[name]).join(',')]);
  const missing = ['notes', 'projects'].filter((name) => !user.allowed[name]).join(',');
  return missing ? t(USER_ACCESS[missing]) : null;
}
// Ligne d'un compte : « Invité · Projets », « Utilisateur · sans projets »,
// sinon « Utilisateur · 2FA désactivée » ; un compte désactivé le dit
// toujours (ses fonctions sont sur sa page) ; « … seulement » toujours dit
const userSub = (user, localLogin = true) => {
  const access = user.active ? accessPart(user) : null;
  return [roleWord(user.role), ...(access ? [access, ssoMark(user, localLogin)] : stateParts(user, localLogin))].filter(Boolean).join(' · ');
};

// Comptes rangés : Admin et Utilisateurs d'abord, puis les invités (sous le
// titre « Invités »), chaque groupe par prénom
function accountGroups(users) {
  const sorted = [...users].sort((a, b) => compareNames(a.displayName, b.displayName));
  return { family: sorted.filter((u) => u.role !== 'guest'), guests: sorted.filter((u) => u.role === 'guest') };
}

// Charge les comptes ; selectedId : compte dont la page est ouverte à côté
// de la liste (ordinateur), ou null
async function loadUsers(panel, footer, alive, { selectedId = null, sub = null } = {}) {
  replace(panel, loadingText());
  const reload = () => loadUsers(panel, footer, alive, { selectedId, sub });
  let users;
  let accountRequests = [];
  let localLogin = true;
  let oidc = false;
  try {
    ({ users, accountRequests = [], localLogin = true, oidc = false } = await get('/api/admin/users'));
  } catch (err) {
    if (alive()) replace(panel, errorBlock(err, reload));
    return;
  }
  if (!alive()) return;
  // Pastille de Réglages › Administration : le nombre à jour
  if (app.user) app.user.accountRequests = accountRequests.length;
  const { family, guests } = accountGroups(users);
  if (sub) sub.textContent = guests.length ? `${t('administration.comptes.nombre', { count: users.length })} · ${t('administration.invites.nombre', { count: guests.length })}` : t('administration.comptes.nombre', { count: users.length });
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
  const addButton = (block) => h('button', { class: `btn btn--primary${block ? ' btn--block' : ''}`, type: 'button', onClick: () => openNewUserSheet(reload, { localLogin, oidc }) }, icon('plus'), t('administration.compte.ajouter'));

  // Ordinateur (kit 16.50, maquette pc-admin-comptes-1) : la liste à gauche,
  // la page du compte choisi à droite ; « Ajouter un compte » sous la liste
  if (onPc()) {
    footer.hidden = true;
    const line = (user, i) => h('button', {
      class: `row${user.active ? '' : ' is-off'}`, type: 'button', 'aria-current': user.id === selectedId ? 'true' : null,
      onClick: () => navigate('adminAccount', { id: user.id }, { replace: true }),
    },
    avatar(user.displayName, { second: i > 0 || user.role === 'guest' }),
    h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, user.displayName), h('span', { class: 'row__sub' }, userSub(user, localLogin))),
    user.role === 'guest' ? discreetChip() : null,
    user.active ? null : h('span', { class: 'chip' }, t('administration.compte.desactive.puce')),
    icon('chev-r'));
    const selected = users.find((u) => u.id === selectedId) ?? null;
    replace(panel, ...requests, h('div', { class: 'acct-split' },
      h('div', { class: 'acct-split__list' },
        h('div', { class: 'group' }, family.map(line)),
        guests.length ? [h('h2', { class: 'section-title' }, t('administration.invites.titre')), h('div', { class: 'group' }, guests.map((u) => line(u, 1)))] : null,
        addButton(true)),
      h('div', { class: 'acct-split__page' },
        selected ? accountPage(selected, { localLogin, oidc, reload, pc: true })
          : h('p', { class: 'empty muted' }, t('administration.compte.choisir')))));
    return;
  }

  // Téléphone (maquette admin-comptes-1) : ⋮ ouvre la page du compte
  const line = (user, i) => h('div', { class: `row${user.active ? '' : ' is-off'}` },
    avatar(user.displayName, { second: i > 0 || user.role === 'guest' }),
    h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, user.displayName), h('span', { class: 'row__sub' }, userSub(user, localLogin))),
    user.role === 'guest' ? discreetChip() : null,
    user.active ? null : h('span', { class: 'chip' }, t('administration.compte.desactive.puce')),
    iconButton('more', t('administration.compte.gerer', { name: user.displayName }), () => navigate('adminAccount', { id: user.id })));
  replace(panel, ...requests,
    h('div', { class: 'group' }, family.map(line)),
    guests.length ? [h('h2', { class: 'section-title' }, t('administration.invites.titre')), h('div', { class: 'group' }, guests.map((u) => line(u, 1)))] : null);
  replace(footer, addButton(true));
}

// Page d'un compte (téléphone) : #/administration/comptes/<id> (maquettes
// admin-compte-1 et admin-compte-2). Elle remplace l'ancienne feuille.
export function renderAdminAccount(id, onLeave) {
  const body = h('div', { class: 'body body--flush' });
  const title = h('h1', { class: 'topbar__title' }, t('administration.titre'));
  let alive = true;
  onLeave(() => {
    alive = false;
  });
  const load = async () => {
    replace(body, loadingText());
    let users;
    let localLogin = true;
    let oidc = false;
    try {
      ({ users, localLogin = true, oidc = false } = await get('/api/admin/users'));
    } catch (err) {
      if (alive) replace(body, errorBlock(err, load));
      return;
    }
    if (!alive) return;
    const user = users.find((u) => String(u.id) === String(id));
    if (!user) {
      replace(body, h('div', { class: 'empty' }, h('p', { class: 'empty__text' }, t('administration.compte.introuvable'))));
      return;
    }
    title.textContent = t('administration.compte.titre', { name: user.displayName });
    document.title = `${title.textContent} · Listo`;
    replace(body, accountPage(user, { localLogin, oidc, reload: load, pc: false }));
  };
  if (navigator.onLine) load();
  else replace(body, h('div', { class: 'empty' }, h('p', { class: 'empty__text' }, t('administration.horsLigne.texte'))));
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('administration.compte.retour'), () => goBack('admin', { tab: 'comptes' })),
      h('div', { class: 'topbar__main' }, title)),
    body);
}

// Le contenu de la page d'un compte (téléphone et ordinateur) : en tête le
// nom, l'identifiant, la 2FA (et « Discret » pour un invité) ; le rôle ;
// les fonctions autorisées (étape 2 du cadrage ; maquettes admin-compte-1
// et 2) ; la connexion (LISTO_OIDC=on) ; puis la sécurité (mot de passe,
// double authentification, délier, désactiver, supprimer). Aucun nom de
// liste, de note, de projet ni de personne : l'Admin n'a aucun droit sur le
// contenu des autres.
function accountPage(user, { localLogin = true, oidc = false, reload, pc = false }) {
  const self = user.id === app.user.id;
  const error = errorNote();
  const run = async (action, message) => {
    error.show('');
    try {
      await action();
      if (message) toast(message, { low: true });
      reload();
      return true;
    } catch (err) {
      error.show(errorMessage(err));
      return false;
    }
  };

  // En tête : pastille, nom, « identifiant · 2FA … »
  const head = h('div', { class: 'card acct-card' },
    avatar(user.displayName, { second: true, large: true }),
    h('span', { class: 'grow' }, h('span', { class: 'row__title' }, user.displayName),
      h('span', { class: 'row__sub' }, [user.username, ...stateParts(user, localLogin)].filter(Boolean).join(' · '))),
    user.role === 'guest' ? discreetChip() : null,
    user.active ? null : h('span', { class: 'chip' }, t('administration.compte.desactive.puce')));

  // Rôle : Admin ↔ Invité jamais directement ; son propre rôle, jamais
  const hint = h('p', { class: 'field__hint' }, self ? t('administration.compte.role.soiMeme') : roleHint(user.role));
  const pick = async (role) => {
    const ok = await confirmRole(user, role);
    if (!ok) return false;
    return run(() => patch(`/api/admin/users/${user.id}`, { role }), t({ user: 'administration.compte.role.utilisateur', guest: 'administration.compte.role.invite', admin: 'administration.compte.role.admin' }[role]));
  };
  const roleBlock = [
    h('h2', { class: 'section-title' }, t('administration.role')),
    h('div', { class: 'acct-field' },
      roleChoice(user.role, pick, {
        label: t('administration.role.de', { name: user.displayName }),
        disabled: (value) => self || (user.role === 'guest' && value === 'admin') || (user.role === 'admin' && value === 'guest'),
      }),
      hint),
  ];

  // Fonctions autorisées : chaque interrupteur envoie tout de suite (un
  // retrait demande confirmation) ; un Admin a tout (une phrase)
  const allowedBlock = [
    h('h2', { class: 'section-title' }, t('administration.fonctions')),
    user.role === 'admin'
      ? h('p', { class: 'page-intro' }, t('administration.fonctions.admin'))
      : [h('p', { class: 'page-intro' }, t(user.role === 'guest' ? 'administration.fonctions.aide.invite' : 'administration.fonctions.aide.utilisateur')),
        allowedSwitches(user.role, user.allowed, async (name, value) => {
          if (!value && !(await confirmRemoval(user, name))) return false;
          return run(() => patch(`/api/admin/users/${user.id}`, { allowed: { [name]: value } }), t('administration.fonctions.enregistrees', { name: user.displayName }));
        }, { idPrefix: `compte-${user.id}`, self })],
  ];

  const loginBlock = oidc ? loginSection(user, { localLogin, self, run }) : null;
  const actions = securityActions(user, { localLogin, reload, run });
  const security = [
    h('h2', { class: 'section-title' }, t('administration.compte.securite')),
    actions.length ? h('div', { class: 'group' }, actions) : h('p', { class: 'page-intro' }, t('administration.compte.soiMeme')),
  ];
  return pc
    ? [head, error.note, h('div', { class: 'acct-split__cols' }, h('div', {}, roleBlock, allowedBlock), h('div', {}, loginBlock, security))]
    : [head, error.note, roleBlock, allowedBlock, loginBlock, security];
}

// Choix « Mot de passe ou … | … seulement » (… : le nom du fournisseur
// d'identité, LISTO_OIDC_NAME ; « SSO » par défaut). Même composant que le
// choix du rôle (.segmented) : le choix en relief s'annonce par
// aria-checked ; désactivé (pâli ET expliqué par la phrase dessous) quand le
// choix n'est pas possible. onPick(ssoOnly) renvoie faux (ou une promesse
// de faux) si le choix est refusé ou annulé : le choix revient.
function loginChoice(ssoOnly, onPick, { label, disabled = false }) {
  let current = ssoOnly;
  const provider = providerName();
  const options = [false, true].map((value) => {
    const option = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', disabled }, value ? t('administration.connexion.seulement', { provider }) : t('administration.connexion.lesDeux', { provider }));
    option.dataset.value = String(value);
    option.addEventListener('click', async () => {
      if (value === current) return;
      const before = current;
      current = value;
      paint();
      if ((await onPick(value)) === false) {
        current = before;
        paint();
      }
    });
    return option;
  });
  const paint = () => {
    for (const option of options) option.setAttribute('aria-checked', String(option.dataset.value === String(current)));
  };
  paint();
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label }, options);
}

// Section « Connexion » de la page d'un compte (LISTO_OIDC=on, décision du
// 25 novembre 2026). « … seulement » : ni connexion ni session par mot de
// passe, ni mot de passe ni double authentification Listo ; le serveur le
// vérifie (passwordLoginAllowed). Choix désactivé, avec sa raison :
// connexion par mot de passe désactivée sur le serveur (tout le monde est
// déjà « … seulement »), son propre compte, ou le dernier Admin qui se
// connecte par mot de passe (il le garde si le fournisseur est en panne).
function loginSection(user, { localLogin, self, run }) {
  const provider = providerName();
  const name = user.displayName;
  const hint = h('p', { class: 'field__hint' });
  let linkNote = null;
  const reason = !localLogin ? t('administration.connexion.serveur', { provider })
    : self ? t('administration.connexion.soiMeme')
      : user.lastPasswordAdmin ? t('administration.connexion.dernierAdmin', { name, provider })
        : null;
  const describeChoice = (ssoOnly) => {
    hint.textContent = reason ?? t(ssoOnly ? 'administration.connexion.seulement.aide' : 'administration.connexion.lesDeux.aide', { name, provider });
  };
  describeChoice(user.ssoOnly);
  // Jamais relié au fournisseur : il entrera par le même identifiant
  // (encadré d'information, sous le choix)
  if ((user.ssoOnly || !localLogin) && !user.authelia) {
    linkNote = h('div', { class: 'acct-field' }, h('div', { class: 'note' }, icon('link'), h('p', {}, t('administration.connexion.jamaisRelie', { name, provider, username: user.username }))));
  }
  const pick = async (ssoOnly) => {
    if (ssoOnly) {
      const ok = await confirmDialog({ title: t('administration.connexion.question', { provider, name }), text: t('administration.connexion.texte', { name, provider }), confirmLabel: t('administration.connexion.seulement', { provider }), danger: false });
      if (!ok) return false;
    }
    describeChoice(ssoOnly);
    const done = await run(() => put(`/api/admin/users/${user.id}/login`, { ssoOnly }), t('administration.connexion.enregistree', { name }));
    if (!done) describeChoice(!ssoOnly);
    return done;
  };
  return [
    h('h2', { class: 'section-title' }, t('administration.connexion')),
    h('div', { class: 'acct-field' },
      loginChoice(!localLogin || user.ssoOnly, pick, { label: t('administration.connexion.de', { name }), disabled: Boolean(reason) }),
      hint),
    linkNote,
  ];
}

// Les interrupteurs « Fonctions autorisées » (page d'un compte, « Nouveau
// compte », demande acceptée ; kit 16.49, .toggle-row et .toggle-row--sub) :
// Listes (invité seulement, en premier, maquette admin-compte-1 : un
// Utilisateur les a toujours), Notes, Projets, « Peut créer ses propres
// projets » (décalé dessous, désactivé quand Projets est décoché),
// Assistants IA (access.js, permissionsFor). role : rôle du compte (les phrases
// d'un invité disent « les projets qu'on lui partage ») ; allowed : les
// cases ; onToggle(nom, valeur) : faux = refusé ou annulé, l'interrupteur
// revient. Textes posés avec textContent (h()).
const PERMISSION_TEXT = {
  lists: { title: 'administration.fonctions.listes', user: 'administration.fonctions.listes.detail.invite', guest: 'administration.fonctions.listes.detail.invite' },
  notes: { title: 'administration.fonctions.notes', user: 'administration.fonctions.notes.detail', guest: 'administration.fonctions.notes.detail.invite' },
  projects: { title: 'administration.fonctions.projets', user: 'administration.fonctions.projets.detail', guest: 'administration.fonctions.projets.detail.invite' },
  projectsCreate: { title: 'administration.fonctions.creer', user: 'administration.fonctions.creer.detail', guest: 'administration.fonctions.creer.detail' },
  mcp: { title: 'administration.fonctions.ia', user: 'administration.fonctions.ia.detail', guest: 'administration.fonctions.ia.detail' },
};
function allowedSwitches(role, allowed, onToggle, { idPrefix, self = false } = {}) {
  const values = { ...defaultAllowed(role), ...(allowed ?? {}) };
  const switches = new Map();
  const paint = () => {
    for (const [name, button] of switches) {
      button.setAttribute('aria-checked', String(values[name]));
      // « Peut créer ses propres projets » n'a de sens qu'avec Projets
      if (name === 'projectsCreate') button.disabled = self || !values.projects;
    }
  };
  const rowOf = (name) => {
    const text = PERMISSION_TEXT[name];
    const id = `${idPrefix}-${name}`;
    const button = h('button', {
      class: 'switch', type: 'button', role: 'switch', disabled: self,
      'aria-labelledby': `${id}-titre`, 'aria-describedby': `${id}-aide`, 'data-key': name,
      onClick: async () => {
        const before = values[name];
        values[name] = !before;
        paint();
        if ((await onToggle(name, values[name])) === false) {
          values[name] = before;
          paint();
        }
      },
    });
    switches.set(name, button);
    return h('div', { class: `toggle-row${name === 'projectsCreate' ? ' toggle-row--sub' : ''}` },
      h('div', { class: 'grow' },
        h('span', { class: 'row__title', id: `${id}-titre` }, t(text.title)),
        h('span', { class: 'row__sub', id: `${id}-aide` }, t(role === 'guest' ? text.guest : text.user))),
      button);
  };
  const group = h('div', { class: 'group list-options' }, permissionsFor(role).map(rowOf));
  paint();
  return group;
}

// Retirer une fonction (cadrage 4.8) : confirmation qui dit ce qui
// disparaît de SES écrans (rien n'est effacé ; aucun nombre ni nom : l'Admin
// ne voit pas le contenu des autres). « Peut créer ses propres projets »
// se retire sans question (ses projets restent à lui).
const REMOVAL = {
  lists: ['administration.fonctions.retirer.listes.question', 'administration.fonctions.retirer.listes.texte'],
  notes: ['administration.fonctions.retirer.notes.question', 'administration.fonctions.retirer.notes.texte'],
  projects: ['administration.fonctions.retirer.projets.question', 'administration.fonctions.retirer.projets.texte'],
  mcp: ['administration.fonctions.retirer.ia.question', 'administration.fonctions.retirer.ia.texte'],
};
function confirmRemoval(user, name) {
  const keys = REMOVAL[name];
  if (!keys) return true;
  return confirmDialog({ title: t(keys[0], { name: user.displayName }), text: t(keys[1], { name: user.displayName }), confirmLabel: t('administration.fonctions.retirer') });
}

// Confirmation d'un changement de rôle (cadrage 6.1) : Utilisateur ↔
// Invité disent ce qui change (discret, ou de nouveau visible) ; les autres
// changements, comme avant, sans question. Renvoie vrai pour continuer.
async function confirmRole(user, role) {
  const name = user.displayName;
  if (role === 'guest') {
    return confirmDialog({ title: t('administration.compte.versInvite.question', { name }), text: [t('administration.compte.versInvite.texte', { name }), ...keptLines(user)], confirmLabel: t('administration.compte.versInvite') });
  }
  if (user.role === 'guest' && role === 'user') {
    return confirmDialog({ title: t('administration.compte.versUtilisateur.question', { name }), text: t('administration.compte.versUtilisateur.texte', { name }), confirmLabel: t('administration.compte.versUtilisateur') });
  }
  return true;
}

// Ce que garde un Utilisateur qui devient invité (décision du propriétaire
// du 25 novembre 2026 : ses cases et ses interrupteurs ne changent pas ;
// l'Admin décoche ensuite) : une ligne par fonction autorisée, avec, pour
// Notes et Projets, si elle est allumée
function keptLines(user) {
  const allowed = user.allowed ?? {};
  const used = user.used ?? {};
  const lines = [
    // (un Utilisateur a toujours les Listes : il les garde, allumées)
    t('administration.compte.versInvite.listes'),
    allowed.notes ? t(used.notes ? 'administration.compte.versInvite.notes.activees' : 'administration.compte.versInvite.notes.desactivees') : null,
    allowed.projects ? t(used.projects ? 'administration.compte.versInvite.projets.actives' : 'administration.compte.versInvite.projets.desactives') : null,
    allowed.projects && allowed.projectsCreate ? t('administration.compte.versInvite.creer') : null,
    allowed.mcp ? t('administration.compte.versInvite.ia') : null,
  ].filter(Boolean);
  return [t(lines.length ? 'administration.compte.versInvite.garde' : 'administration.compte.versInvite.rien', { name: user.displayName }), ...lines];
}

// Actions de sécurité d'un compte (pas le sien : son mot de passe et sa 2FA
// se gèrent dans ses réglages). localLogin : connexion par mot de passe
// possible sur ce serveur ; désactivée (LISTO_LOCAL_LOGIN=off), ou compte
// « … seulement » (user.passwordLogin faux, même règle que le serveur),
// « Réinitialiser le mot de passe » n'a plus de sens.
function securityActions(user, { localLogin, reload, run }) {
  const self = user.id === app.user.id;
  const actions = [];
  if (!self) {
    if (localLogin && user.passwordLogin !== false) {
      actions.push(h('button', { class: 'row row--menu', type: 'button', onClick: () => openResetSheet(user, reload) },
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

  if (!self) {
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
          if (ok && await run(() => del(`/api/admin/users/${user.id}`), t('administration.compte.supprime'))) navigate('admin', { tab: 'comptes' }, { replace: true });
        },
      }, icon('trash'), h('span', { class: 'row__title' }, t('administration.compte.supprimer'))));
    }
  }
  return actions;
}

// Champ « Fonctions autorisées » d'un compte à créer (maquette
// nouveau-compte-1) : les interrupteurs, cochés selon le rôle choisi
// (Utilisateur : tous ; Invité : aucun) ; rien pour un Admin (il a tout).
// Renvoie { field, setRole(rôle), value() }.
function allowedField(idPrefix) {
  let role = 'user';
  let values = defaultAllowed(role);
  const slot = h('div', { class: 'acct-allowed' });
  const hint = h('span', { class: 'field__hint' });
  const field = h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('administration.fonctions')), slot, hint);
  const draw = () => {
    field.hidden = role === 'admin';
    hint.textContent = t(role === 'guest' ? 'administration.fonctions.nouveau.aide.invite' : 'administration.fonctions.nouveau.aide.utilisateur');
    const switches = allowedSwitches(role, values, (name, value) => {
      values[name] = value;
      return true;
    }, { idPrefix });
    replace(slot, switches);
  };
  draw();
  return {
    field,
    setRole(value) {
      role = value;
      values = defaultAllowed(role);
      draw();
    },
    // (seulement les cases de ce rôle : « Listes » pour un invité)
    value: () => (role === 'admin' ? undefined : Object.fromEntries(permissionsFor(role).map((name) => [name, values[name]]))),
  };
}

// Champ « Rôle » d'un compte à créer (nouveau compte, demande acceptée) :
// le choix « Utilisateur | Invité | Admin » et sa phrase, qui suit le choix
function roleField(role, onChange, label = t('administration.role')) {
  const hint = h('span', { class: 'field__hint' }, roleHint(role));
  return h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('administration.role')),
    roleChoice(role, (value) => {
      hint.textContent = roleHint(value);
      onChange(value);
      return true;
    }, { label }),
    hint);
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
  const access = allowedField(`demande-${request.id}`);
  const usernameField = field(t('administration.identifiant'), username, { hint: t('administration.identifiant.aide') });
  const nameField = field(t('administration.nomAffiche'), displayName);
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('administration.compte.creer'));
  const form = h('form', { class: 'stack', novalidate: true },
    h('p', { class: 'muted' }, t('administration.demande.fournisseur', { provider: providerName() })),
    usernameField.field, nameField.field,
    roleField(role, (value) => { role = value; access.setRole(value); }),
    access.field,
    error.note, submit);
  const sheet = openSheet({ title: t('administration.demande.accepter.titre'), sub: request.displayName, content: form, scroll: true });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    usernameField.setError(null);
    nameField.setError(null);
    if (!/^[A-Za-z0-9._-]{2,50}$/.test(username.value.trim())) return usernameField.setError(t('administration.identifiant.invalide'));
    if (!displayName.value.trim()) return nameField.setError(t('administration.nomAffiche.obligatoire'));
    submit.disabled = true;
    try {
      await post(`/api/admin/account-requests/${request.id}/accept`, { username: username.value.trim(), displayName: displayName.value.trim(), role, allowed: access.value() });
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
// Connexion par mot de passe désactivée (localLogin faux), ou « … seulement »
// choisi (LISTO_OIDC=on : choix « Connexion », « Mot de passe ou … » au
// départ, invité compris) : pas de mot de passe provisoire, la personne
// entrera avec le fournisseur d'identité (même identifiant)
function openNewUserSheet(reload, { localLogin = true, oidc = false } = {}) {
  const username = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const displayName = h('input', { class: 'input', type: 'text', autocomplete: 'off', maxlength: '100' });
  const password = passwordInput({ autocomplete: 'new-password' });
  let role = 'user';
  const access = allowedField('nouveau-compte');
  const usernameField = field(t('administration.identifiant'), username, { hint: t('administration.identifiant.aide') });
  const nameField = field(t('administration.nomAffiche.facultatif'), displayName);
  const passwordField = field(t('administration.motDePasse.provisoire'), password.wrap, { hint: t('administration.motDePasse.provisoire.aide') });
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('administration.compte.creer'));
  // « Connexion » (LISTO_OIDC=on, connexion par mot de passe permise) :
  // « … seulement » retire le mot de passe provisoire (sa phrase dit
  // comment la personne entrera)
  const provider = providerName();
  let ssoOnly = false;
  const providerNote = h('p', { class: 'muted' }, t('administration.nouveauCompte.fournisseur', { provider }));
  const loginHint = h('span', { class: 'field__hint' });
  const showLogin = () => {
    passwordField.field.hidden = !localLogin || ssoOnly;
    // (la phrase du choix le dit déjà quand le choix est là)
    providerNote.hidden = localLogin;
    loginHint.textContent = t(ssoOnly ? 'administration.connexion.nouveau.seulement.aide' : 'administration.connexion.nouveau.lesDeux.aide', { provider });
  };
  const loginField = oidc && localLogin
    ? h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('administration.connexion')),
      loginChoice(false, (value) => { ssoOnly = value; showLogin(); return true; }, { label: t('administration.connexion') }),
      loginHint)
    : null;
  showLogin();
  // Le rôle d'abord (maquette nouveau-compte-1), ses fonctions autorisées,
  // puis l'identifiant, le nom, la connexion et le mot de passe provisoire
  const form = h('form', { class: 'stack', novalidate: true },
    roleField(role, (value) => { role = value; access.setRole(value); }, t('administration.role.nouveau')),
    access.field,
    usernameField.field, nameField.field,
    loginField,
    passwordField.field, providerNote,
    error.note, submit);
  const sheet = openSheet({ title: t('administration.nouveauCompte.titre'), content: form, scroll: true });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    usernameField.setError(null);
    passwordField.setError(null);
    if (!/^[A-Za-z0-9._-]{2,50}$/.test(username.value.trim())) return usernameField.setError(t('administration.identifiant.invalide'));
    const withPassword = localLogin && !ssoOnly;
    if (withPassword && [...password.input.value].length < 10) return passwordField.setError(t('administration.motDePasse.court'));
    submit.disabled = true;
    try {
      await post('/api/admin/users', { username: username.value.trim(), displayName: displayName.value.trim() || defaultDisplayName(username.value), password: withPassword ? password.input.value : undefined, role, allowed: access.value(), ...(loginField ? { ssoOnly } : {}) });
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
  let response;
  try {
    response = await get(`/api/admin/${tab.api}`);
    ({ items } = response);
  } catch (err) {
    if (alive()) replace(panel, errorBlock(err, reload));
    return;
  }
  if (!alive()) return;

  const isStores = tab.api === 'stores';
  if (tab.api === 'aisles') {
    drawAisles(tab, panel, { items, stores: response.stores ?? [] }, reload);
    return;
  }

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

// ---- Rayons, groupés par magasin ----
//
// « Tous les magasins » (rayons communs) d'abord, puis chaque magasin simple
// qui a des rayons, par ordre alphabétique ; dans chaque groupe, les rayons
// par ordre alphabétique. L'ajout demande le magasin (par défaut « Tous les
// magasins ») ; chaque rayon peut changer de magasin. Sans aucun magasin
// simple, le choix du magasin n'apparaît pas (tout est commun).
function drawAisles(tab, panel, { items, stores }, reload) {
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const placeName = (storeId) => (storeId === null ? t('administration.rayons.tousMagasins') : storeById.get(storeId)?.name ?? t('administration.rayons.tousMagasins'));

  // Ajout : nom, puis magasin du nouveau rayon
  let place = null;
  const input = h('input', { class: 'input', ...LABEL_INPUT, maxlength: '100', placeholder: tab.placeholder, 'aria-label': tab.placeholder });
  const addButton = h('button', { class: 'btn btn--primary btn--add', type: 'submit' }, t('administration.ajouter'));
  const placeLabel = h('span', { class: 'input__value' });
  const showPlace = () => replace(placeLabel, icon('store', 'icon--sm'), placeName(place));
  showPlace();
  const placeButton = h('button', {
    class: 'input input--select',
    type: 'button',
    'aria-label': t('administration.rayons.magasin.choisir', { store: placeName(place) }),
    onClick: async () => {
      const chosen = await pickAislePlace({ title: t('administration.rayons.magasin'), stores, current: place, confirmLabel: t('administration.rayons.magasin.valider') });
      if (chosen === undefined) return;
      place = chosen;
      showPlace();
      placeButton.setAttribute('aria-label', t('administration.rayons.magasin.choisir', { store: placeName(place) }));
    },
  }, placeLabel, icon('chev-d'));
  const addForm = stores.length
    ? h('form', { class: 'add-block', novalidate: true },
      h('div', { class: 'add-block__row' }, h('label', { class: 'grow' }, input), addButton),
      placeButton)
    : h('form', { class: 'add-inline add-inline--flush', novalidate: true }, h('label', { class: 'grow' }, input), addButton);
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    try {
      await post('/api/admin/aisles', { name, storeId: place });
      toast(place === null ? t('administration.ajoute', { name }) : t('administration.rayons.ajoute', { name, store: placeName(place) }), { low: true });
      afterChange(reload);
    } catch (err) {
      toast(errorMessage(err), { low: true });
    }
  });

  if (!items.length) {
    replace(panel, addForm, h('p', { class: 'muted empty__text' }, t('administration.vide')));
    return;
  }
  // Groupes : rayons communs, puis magasins (ordre donné par le serveur)
  const groups = [null, ...stores.map((store) => store.id)]
    .map((storeId) => ({ storeId, aisles: items.filter((item) => (item.storeId ?? null) === storeId) }))
    .filter((group) => group.aisles.length);
  // Rayon d'un magasin inconnu (ne devrait pas arriver) : avec les communs
  const known = new Set([null, ...stores.map((store) => store.id)]);
  const strays = items.filter((item) => !known.has(item.storeId ?? null));
  if (strays.length) {
    const common = groups.find((group) => group.storeId === null);
    if (common) common.aisles.push(...strays);
    else groups.unshift({ storeId: null, aisles: strays });
  }
  // Sans magasin simple, tout est commun : un seul groupe, sans titre
  replace(panel, addForm, groups.map((group) => [
    stores.length ? h('h2', { class: 'section-title' }, placeName(group.storeId),
      group.storeId !== null && storeById.get(group.storeId)?.active === false ? ` ${t('administration.magasins.desactive')}` : null) : null,
    h('div', { class: 'group' }, group.aisles.map((aisle) => manageRow(tab, aisle, reload, {
      // Changer de magasin : seulement s'il y a un autre endroit où aller
      extra: stores.length || aisle.storeId !== null
        ? iconButton('store', t('administration.rayons.deplacer', { name: aisle.name }), () => moveAisle(aisle, stores, placeName, reload))
        : null,
    }))),
  ]));
}

// Feuille de choix du magasin d'un rayon : « Tous les magasins », puis les
// magasins simples (un magasin désactivé reste proposé : l'Admin range ses
// rayons). Renvoie l'identifiant choisi, null (« Tous les magasins »), ou
// undefined si la feuille est fermée sans choisir.
function pickAislePlace({ title, sub, stores, current, confirmLabel }) {
  return new Promise((resolve) => {
    let selected = current;
    let result;
    const choices = [{ id: null, name: t('administration.rayons.tousMagasins') }, ...stores];
    const confirm = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, confirmLabel);
    const rows = choices.map((choice) => {
      const row = h('button', { class: 'radio-row', type: 'button', role: 'radio', 'aria-checked': 'false' },
        h('span', { class: 'radio' }),
        h('span', { class: 'grow' }, choice.name, choice.active === false ? h('span', { class: 'muted' }, ` ${t('administration.magasins.desactive')}`) : null));
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
    };
    paint();
    const sheet = openSheet({
      title,
      sub,
      content: [h('div', { class: 'card picker' }, h('div', { role: 'radiogroup', 'aria-label': t('administration.rayons.magasin') }, rows)), confirm],
      onClose: () => resolve(result),
    });
    confirm.addEventListener('click', () => {
      result = selected;
      sheet.close();
    });
  });
}

// Changer le magasin d'un rayon. Le serveur refuse (avec le nombre de
// listes) quand des articles de listes d'un autre magasin, ou sans magasin,
// l'utilisent ; vers « Tous les magasins », c'est toujours possible si le
// nom est libre.
async function moveAisle(aisle, stores, placeName, reload) {
  const current = aisle.storeId ?? null;
  const chosen = await pickAislePlace({
    title: t('administration.rayons.deplacer.titre', { name: aisle.name }),
    sub: t('administration.rayons.deplacer.texte'),
    stores,
    current,
    confirmLabel: t('administration.rayons.deplacer.valider'),
  });
  if (chosen === undefined || chosen === current) return;
  try {
    await patch(`/api/admin/aisles/${aisle.id}`, { storeId: chosen });
    toast(t('administration.rayons.deplace', { name: aisle.name, store: placeName(chosen) }), { low: true });
    afterChange(reload);
  } catch (err) {
    toast(errorMessage(err));
  }
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
// générale et par magasin ; un rayon d'un magasin, suivi du nom de ce
// magasin, ne change que la ligne de ce magasin) ; les articles déjà dans
// les listes gardent le leur. Aucun champ de saisie, donc aucun clavier.
function chooseAisle(entry, reload) {
  const storeName = new Map(app.data.stores.map((store) => [store.id, store.name]));
  const aisleLabel = (aisle) => (aisle.storeId != null && storeName.has(aisle.storeId) ? t('administration.noms.rayon.magasin', { aisle: aisle.name, store: storeName.get(aisle.storeId) }) : aisle.name);
  const choices = [...activeOnly(app.data.aisles).map((aisle) => ({ id: aisle.id, name: aisleLabel(aisle) })), { id: null, name: t('administration.noms.aucunRayon') }];
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

// ================= Étiquettes des notes =================
//
// La réserve commune des étiquettes (server/labels.js) : chaque étiquette,
// le nombre de notes qui la portent (jamais lesquelles), le crayon (nom et
// couleur) et la corbeille. Rien ne se crée ici : les étiquettes se créent
// depuis une note.

async function loadLabels(panel, alive) {
  replace(panel, loadingText());
  const reload = () => loadLabels(panel, alive);
  let items;
  try {
    ({ items } = await get('/api/admin/labels'));
  } catch (err) {
    if (alive()) replace(panel, errorBlock(err, reload));
    return;
  }
  if (!alive()) return;
  const sorted = sortLabels(items, (a, b) => compareText(a, b, { sensitivity: 'base', numeric: true }));
  replace(panel,
    h('p', { class: 'page-intro' }, t('administration.etiquettes.intro')),
    sorted.length
      ? h('div', { class: 'group' }, sorted.map((label) => h('div', { class: 'label-row' },
        labelChip(label),
        h('span', { class: 'label-row__count' }, t('administration.etiquettes.notes', { count: label.notes })),
        iconButton('pencil', t('administration.modifier', { name: label.name }), () => openLabelSheet(label, reload)),
        iconButton('trash', t('administration.supprimer.element', { name: label.name }), () => removeLabel(label, reload), 'label-row__delete'))))
      : h('p', { class: 'muted empty__text' }, t('administration.etiquettes.vide')));
}

// Renommer et changer la couleur : une feuille avec le nom et la palette
// (le champ apparaît sans curseur : on le touche pour écrire)
function openLabelSheet(label, reload) {
  let color = label.color;
  const input = h('input', { class: 'input', ...LABEL_INPUT, maxlength: String(LABEL_NAME_MAX * 2), value: label.name });
  const nameField = field(t('administration.etiquettes.nom'), input, { hint: t('administration.etiquettes.nom.aide') });
  const palette = labelPalette(color, (value) => {
    color = value;
  }, { label: t('administration.etiquettes.couleur') });
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('administration.etiquettes.enregistrer'));
  const form = h('form', { class: 'stack', novalidate: true },
    nameField.field,
    h('div', { class: 'field' }, h('p', { class: 'field__label', 'aria-hidden': 'true' }, t('administration.etiquettes.couleur')), palette.element),
    error.note,
    submit);
  const sheet = openSheet({ title: t('administration.etiquettes.edition'), sub: label.name, content: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const problem = labelNameProblem(input.value);
    if (problem) {
      nameField.setError(t({ vide: 'administration.etiquettes.nom.vide', long: 'notes.etiquettes.nom.long', caractere: 'notes.etiquettes.nom.caractere' }[problem], { max: LABEL_NAME_MAX }));
      return;
    }
    nameField.setError('');
    const name = cleanLabelName(input.value);
    const change = {};
    if (name !== label.name) change.name = name;
    if (color !== label.color) change.color = color;
    if (!Object.keys(change).length) {
      sheet.close();
      return;
    }
    submit.disabled = true;
    try {
      await patch(`/api/admin/labels/${label.id}`, change);
      sheet.close();
      toast(t('administration.etiquettes.enregistree', { name }), { low: true });
      afterChange(reload);
    } catch (err) {
      error.show(errorMessage(err), input);
      submit.disabled = false;
    }
  });
}

// Supprimer (confirmation) : retirée de ses notes, sans toucher aux notes
async function removeLabel(label, reload) {
  const ok = await confirmDialog({
    title: t('administration.etiquettes.supprimer.question', { name: label.name }),
    text: label.notes ? t('administration.etiquettes.supprimer.texte', { count: label.notes }) : t('administration.etiquettes.supprimer.texte.aucune'),
    confirmLabel: t('administration.supprimer'),
    focusCancel: true,
  });
  if (!ok) return;
  try {
    await del(`/api/admin/labels/${label.id}`);
    toast(t('administration.etiquettes.supprimee', { name: label.name }), { low: true });
    afterChange(reload);
  } catch (err) {
    toast(errorMessage(err), { low: true });
  }
}
