// Écrans de connexion (maquettes connexion-1 à 4) :
// - création du premier Admin (tout premier lancement) ;
// - identifiant + mot de passe ;
// - code à 6 chiffres de la double authentification, ou code de secours ;
// - changement de mot de passe imposé par l'Admin (pas de maquette : mêmes
//   composants que les autres écrans de connexion).

import { h, icon, iconButton, field, passwordInput, errorNote, replace } from '../dom.js';
import { post, get, errorMessage, ApiError } from '../api.js';
import { app, loggedIn, logOut } from '../app.js';
import { defaultDisplayName } from '../format.js';

const MIN_PASSWORD = 10;

// En-tête d'accueil : logo, grand titre, phrase d'explication
function brandHead(title, text, { logo = true } = {}) {
  return h('div', { class: 'welcome__head' },
    logo ? h('div', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('logo')) : null,
    h('h1', { class: 'display' }, title),
    h('p', { class: 'muted' }, text));
}

// Mise en page commune : contenu qui défile + bouton principal en bas
function screen({ top, content, submitLabel, onSubmit }) {
  const button = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, submitLabel);
  const form = h('form', { novalidate: true },
    top ?? null,
    h('div', { class: 'body' }, h('div', { class: `welcome${top ? ' welcome--top' : ''}` }, content)),
    h('div', { class: 'footer' }, button));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    try {
      await onSubmit();
    } finally {
      button.disabled = false;
    }
  });
  return h('div', { class: 'screen' }, form);
}

// Vérifie le mot de passe et sa confirmation ; affiche l'erreur sous le champ
function checkNewPassword(password, confirmation, passwordField, confirmField) {
  passwordField.setError(null);
  confirmField.setError(null);
  if ([...password].length < MIN_PASSWORD) {
    passwordField.setError(`Au moins ${MIN_PASSWORD} caractères`);
    return false;
  }
  if (password !== confirmation) {
    confirmField.setError('Les deux mots de passe ne correspondent pas');
    return false;
  }
  return true;
}

// --- Écran de connexion (avec ses étapes) ---

export function renderLogin({ setupNeeded }) {
  const container = h('div', { class: 'screen' });
  const show = (step, info) => replace(container, step(show, info));
  show(setupNeeded ? setupStep : passwordStep);
  return container;
}

// Connexion : identifiant + mot de passe (connexion-1)
function passwordStep(show, info = {}) {
  const username = h('input', { class: 'input', type: 'text', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', value: info.username ?? '' });
  const password = passwordInput({ autocomplete: 'current-password' });
  const error = errorNote();
  if (info.message) error.show(info.message);

  return screen({
    content: [
      brandHead('Listo', 'Connectez-vous pour retrouver vos listes.'),
      h('div', { class: 'welcome__fields' },
        field('Identifiant', username).field,
        field('Mot de passe', password.wrap).field,
        error.note),
    ],
    submitLabel: 'Se connecter',
    async onSubmit() {
      error.show('');
      if (!username.value.trim() || !password.input.value) {
        error.show("Saisissez votre identifiant et votre mot de passe.");
        return;
      }
      try {
        const result = await post('/api/login', { username: username.value.trim(), password: password.input.value }, { auth: false });
        if (result.twoFactorRequired) show(codeStep, { username: username.value.trim() });
        else loggedIn(result.user);
      } catch (err) {
        error.show(errorMessage(err));
        password.input.select();
      }
    },
  });
}

// Code à 6 chiffres (connexion-2) ou code de secours (connexion-3)
function codeStep(show, info) {
  const recovery = Boolean(info.recovery);
  const code = recovery
    ? h('input', { class: 'input input--mono', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' })
    : h('input', { class: 'input input--code', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '7', placeholder: '······' });
  const codeField = field(recovery ? 'Code de secours' : 'Code à 6 chiffres', code,
    recovery ? { hint: "Chaque code ne fonctionne qu'une seule fois." } : {});
  const error = errorNote();

  const back = h('header', { class: 'topbar' },
    iconButton('chev-l', 'Retour', () => show(passwordStep, { username: info.username })));
  const switchMode = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    onClick: () => show(codeStep, { ...info, recovery: !recovery }),
  }, recovery ? "Utiliser le code de l'application" : 'Utiliser un code de secours');

  return screen({
    top: back,
    content: [
      brandHead(recovery ? 'Code de secours' : 'Vérification en deux étapes',
        recovery ? "Saisissez l'un de vos codes de secours pour vous connecter."
          : "Saisissez le code à 6 chiffres affiché par votre application d'authentification.", { logo: false }),
      h('div', { class: 'welcome__fields' }, codeField.field, error.note),
      switchMode,
    ],
    submitLabel: 'Vérifier',
    async onSubmit() {
      error.show('');
      const value = code.value.trim();
      if (!value) {
        error.show(recovery ? 'Saisissez un code de secours.' : 'Saisissez le code à 6 chiffres.');
        return;
      }
      try {
        const result = await post('/api/login/2fa', { code: value }, { auth: false });
        loggedIn(result.user);
      } catch (err) {
        // Connexion en attente expirée (plus de 5 minutes) : on recommence
        if (err instanceof ApiError && err.status === 401 && /expirée/.test(err.message)) {
          show(passwordStep, { username: info.username, message: err.message });
          return;
        }
        error.show(errorMessage(err));
        code.select();
      }
    },
  });
}

// Création du premier Admin (connexion-4)
function setupStep(show) {
  const username = h('input', { class: 'input', type: 'text', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' });
  const password = passwordInput({ autocomplete: 'new-password' });
  const confirmation = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const code = h('input', { class: 'input input--mono', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const usernameField = field('Identifiant', username, { hint: '2 à 50 caractères : lettres sans accent, chiffres, . _ -' });
  const passwordField = field('Mot de passe', password.wrap, { hint: `Au moins ${MIN_PASSWORD} caractères` });
  const confirmField = field('Confirmation du mot de passe', confirmation);
  const codeField = field('Code de démarrage', code, { hint: 'Code indiqué au démarrage du serveur (docker logs listo).' });
  const error = errorNote();

  return screen({
    content: [
      brandHead('Bienvenue sur Listo', 'Créez le compte Admin pour démarrer.'),
      h('div', { class: 'welcome__fields' }, usernameField.field, passwordField.field, confirmField.field, codeField.field, error.note),
    ],
    submitLabel: 'Créer le compte Admin',
    async onSubmit() {
      error.show('');
      usernameField.setError(null);
      codeField.setError(null);
      if (!/^[A-Za-z0-9._-]{2,50}$/.test(username.value.trim())) {
        usernameField.setError('Identifiant invalide');
        return;
      }
      if (!checkNewPassword(password.input.value, confirmation.value, passwordField, confirmField)) return;
      if (!code.value.trim()) {
        codeField.setError('Saisissez le code de démarrage');
        return;
      }
      try {
        const result = await post('/api/setup', { username: username.value.trim(), displayName: defaultDisplayName(username.value), password: password.input.value, code: code.value }, { auth: false });
        loggedIn(result.user);
      } catch (err) {
        // Un compte existe déjà (créé entre-temps) : retour à la connexion
        if (err instanceof ApiError && err.status === 403 && /déjà configuré/.test(err.message)) {
          app.setupNeeded = false;
          show(passwordStep, { message: 'Listo est déjà configuré : connectez-vous.' });
          return;
        }
        error.show(errorMessage(err));
      }
    },
  });
}

// --- Changement de mot de passe imposé par l'Admin ---

export function renderForcedChange() {
  const current = passwordInput({ autocomplete: 'current-password' });
  const next = passwordInput({ autocomplete: 'new-password' });
  const confirmation = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Répétez le nouveau mot de passe' });
  const currentField = field('Mot de passe provisoire', current.wrap, { hint: "Celui que l'Admin vous a donné." });
  const nextField = field('Nouveau mot de passe', next.wrap, { hint: `Au moins ${MIN_PASSWORD} caractères` });
  const confirmField = field('Confirmation', confirmation);
  const error = errorNote();

  const logout = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    onClick: () => logOut(),
  }, 'Se déconnecter');

  return screen({
    content: [
      brandHead('Nouveau mot de passe', "Votre mot de passe a été choisi par l'Admin. Choisissez-en un nouveau pour continuer."),
      h('div', { class: 'welcome__fields' }, currentField.field, nextField.field, confirmField.field, error.note),
      logout,
    ],
    submitLabel: 'Enregistrer',
    async onSubmit() {
      error.show('');
      if (!checkNewPassword(next.input.value, confirmation.value, nextField, confirmField)) return;
      if (next.input.value === current.input.value) {
        nextField.setError("Choisissez un mot de passe différent de celui donné par l'Admin");
        return;
      }
      try {
        await post('/api/me/password', { currentPassword: current.input.value, newPassword: next.input.value });
        const { user } = await get('/api/me');
        loggedIn(user);
      } catch (err) {
        error.show(errorMessage(err));
      }
    },
  });
}
