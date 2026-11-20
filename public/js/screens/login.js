// Écrans de connexion (maquettes connexion-1 à 4) :
// - création du premier Admin (tout premier lancement) ;
// - identifiant + mot de passe ;
// - code à 6 chiffres de la double authentification, ou code de secours ;
// - changement de mot de passe imposé par l'Admin (pas de maquette : mêmes
//   composants que les autres écrans de connexion).
//
// Trousseau iCloud et gestionnaires de mots de passe : chaque champ a un id
// et un name fixes (username, password, new-password, one-time-code), en plus
// de autocomplete, et l'attribut required ; c'est ce qu'ils regardent pour
// proposer d'enregistrer, de mettre à jour ou de remplir le mot de passe.
// Les formulaires restent en novalidate : les messages sont ceux de Listo.
// L'identifiant n'est jamais corrigé automatiquement (autocorrect="off").

import { h, icon, iconButton, field, passwordInput, errorNote, replace } from '../dom.js';
import { announce } from '../announce.js';
import { post, get, errorMessage, ApiError } from '../api.js';
import { app, loggedIn, logOut, providerName } from '../app.js';
import { defaultDisplayName } from '../format.js';
import { t } from '../i18n.js';

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
    passwordField.setError(t('connexion.motDePasse.minimum', { min: MIN_PASSWORD }));
    return false;
  }
  if (password !== confirmation) {
    confirmField.setError(t('connexion.motDePasse.differents'));
    return false;
  }
  return true;
}

// --- Écran de connexion (avec ses étapes) ---

// Retour du fournisseur d'identité (server/oidc.js) : un mot-clé dans l'adresse
// (#/connexion?authelia=…), jamais un texte venu du fournisseur d'identité. Les demandes de
// compte sont des informations, pas des erreurs. Textes lus au moment de
// l'affichage (la langue est alors connue) ; name : nom du fournisseur.
function autheliaError(outcome, name) {
  switch (outcome) {
    case 'annulee': return t('connexion.oidc.annulee', { name });
    case 'erreur': return t('connexion.oidc.erreur', { name });
    case 'expiree': return t('connexion.oidc.expiree');
    case 'indisponible': return t('connexion.oidc.indisponible', { name });
    case 'refuse': return t('connexion.oidc.refuse', { name });
    case 'refusee': return t('connexion.oidc.refusee');
    case 'complet': return t('connexion.oidc.complet');
    default: return undefined;
  }
}
function autheliaNotice(outcome) {
  switch (outcome) {
    case 'demande': return t('connexion.oidc.demande');
    case 'attente': return t('connexion.oidc.attente');
    default: return undefined;
  }
}

// Lit (et retire de l'adresse) le résultat d'un retour du fournisseur d'identité
function autheliaOutcome() {
  const query = String(location.hash).split('?')[1] ?? '';
  const outcome = new URLSearchParams(query).get('authelia');
  if (outcome) history.replaceState(history.state, '', `${location.pathname}#/connexion`);
  return outcome;
}

// localLogin : identifiant et mot de passe proposés (sinon le fournisseur d'identité seul,
// LISTO_LOCAL_LOGIN=off) ; returnTo : écran demandé avant la connexion (seul
// « Autoriser Claude » est transmis au fournisseur d'identité, pour y revenir après)
export function renderLogin({ setupNeeded, oidc = null, localLogin = true, returnTo = null }) {
  const container = h('div', { class: 'screen' });
  const back = returnTo?.name === 'authorize' && returnTo.params?.id ? `autoriser/${returnTo.params.id}` : null;
  const show = (step, info) => replace(container, step(show, { oidc, localLogin: localLogin || !oidc, back, ...info }));
  const outcome = setupNeeded ? null : autheliaOutcome();
  const name = oidc?.name ?? providerName();
  if (outcome === 'code') show(codeStep, {}); // Le fournisseur d'identité sans double authentification : le code Listo
  else if (setupNeeded) show(setupStep);
  else show(passwordStep, {
    message: autheliaError(outcome, name),
    notice: autheliaNotice(outcome),
  });
  return container;
}

// Bouton « Se connecter avec … » (LISTO_OIDC=on) : un lien vers
// /oidc/connexion, qui mène à la page de connexion du fournisseur d'identité
function autheliaButton(oidc, error, { primary = false, back = null } = {}) {
  return h('a', {
    class: `btn ${primary ? 'btn--primary' : 'btn--secondary'} btn--block`,
    href: back ? `/oidc/connexion?retour=${encodeURIComponent(back)}` : '/oidc/connexion',
    onClick: (event) => {
      if (navigator.onLine) return;
      event.preventDefault();
      error.show(t('connexion.oidc.horsLigne', { name: oidc.name }));
    },
  }, icon('shield'), t('connexion.oidc.bouton', { name: oidc.name }));
}

// Connexion : identifiant + mot de passe (connexion-1)
function passwordStep(show, info = {}) {
  const username = h('input', { class: 'input', type: 'text', id: 'identifiant', name: 'username', autocomplete: 'username', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', required: true, value: info.username ?? '' });
  const password = passwordInput({ id: 'mot-de-passe', name: 'password', autocomplete: 'current-password', required: true });
  const error = errorNote();
  if (info.message) error.show(info.message);
  // Information (demande de compte envoyée) : encadré neutre, annoncé
  const notice = info.notice ? h('div', { class: 'note' }, icon('clock'), h('p', {}, info.notice)) : null;
  if (info.notice) announce(info.notice);

  // Connexion par mot de passe coupée (LISTO_LOCAL_LOGIN=off) : le fournisseur d'identité
  // seulement, en bouton principal en bas (même place que « Se connecter »)
  if (!info.localLogin && info.oidc) {
    return h('div', { class: 'screen' },
      h('div', { class: 'body' }, h('div', { class: 'welcome' },
        brandHead('Listo', t('connexion.texte')),
        notice,
        error.note)),
      h('div', { class: 'footer' }, autheliaButton(info.oidc, error, { primary: true, back: info.back })));
  }

  return screen({
    content: [
      brandHead('Listo', t('connexion.texte')),
      notice,
      h('div', { class: 'welcome__fields' },
        field(t('connexion.identifiant'), username).field,
        field(t('connexion.motDePasse'), password.wrap).field,
        error.note),
      info.oidc ? autheliaButton(info.oidc, error, { back: info.back }) : null,
    ],
    submitLabel: t('connexion.seConnecter'),
    async onSubmit() {
      error.show('');
      if (!username.value.trim() || !password.input.value) {
        error.show(t('connexion.erreurVide'));
        return;
      }
      try {
        const result = await post('/api/login', { username: username.value.trim(), password: password.input.value }, { auth: false });
        if (result.twoFactorRequired) show(codeStep, { username: username.value.trim() });
        else loggedIn(result.user);
      } catch (err) {
        // Les deux champs sont signalés, sans y mettre le curseur
        error.show(errorMessage(err), username, password.input);
      }
    },
  });
}

// Code à 6 chiffres (connexion-2) ou code de secours (connexion-3)
function codeStep(show, info) {
  const recovery = Boolean(info.recovery);
  const code = recovery
    ? h('input', { class: 'input input--mono', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' })
    : h('input', { class: 'input input--code', type: 'text', id: 'code', name: 'one-time-code', inputmode: 'numeric', autocomplete: 'one-time-code', required: true, maxlength: '7', placeholder: '······' });
  const codeField = field(recovery ? t('connexion.code.secours') : t('connexion.code.sixChiffres'), code,
    recovery ? { hint: t('connexion.code.secours.aide') } : {});
  const error = errorNote();

  const back = h('header', { class: 'topbar' },
    iconButton('chev-l', t('connexion.code.retour'), () => show(passwordStep, { username: info.username })));
  const switchMode = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    onClick: () => show(codeStep, { ...info, recovery: !recovery }),
  }, recovery ? t('connexion.code.utiliserApplication') : t('connexion.code.utiliserSecours'));

  return screen({
    top: back,
    content: [
      brandHead(recovery ? t('connexion.code.secours') : t('connexion.code.titre'),
        recovery ? t('connexion.code.secours.texte')
          : t('connexion.code.texte'), { logo: false }),
      h('div', { class: 'welcome__fields' }, codeField.field, error.note),
      switchMode,
    ],
    submitLabel: t('connexion.code.verifier'),
    async onSubmit() {
      error.show('');
      const value = code.value.trim();
      if (!value) {
        error.show(recovery ? t('connexion.code.secours.erreurVide') : t('connexion.code.erreurVide'));
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
        error.show(errorMessage(err), code);
      }
    },
  });
}

// Création du premier Admin (connexion-4)
function setupStep(show) {
  const username = h('input', { class: 'input', type: 'text', id: 'identifiant', name: 'username', autocomplete: 'username', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', required: true });
  const password = passwordInput({ id: 'nouveau-mot-de-passe', name: 'new-password', autocomplete: 'new-password', required: true });
  const confirmation = h('input', { class: 'input', type: 'password', id: 'confirmation', name: 'confirm-password', autocomplete: 'new-password', required: true });
  const code = h('input', { class: 'input input--mono', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const usernameField = field(t('connexion.identifiant'), username, { hint: t('connexion.admin.identifiant.aide') });
  const passwordField = field(t('connexion.motDePasse'), password.wrap, { hint: t('connexion.motDePasse.minimum', { min: MIN_PASSWORD }) });
  const confirmField = field(t('connexion.admin.confirmation'), confirmation);
  const codeField = field(t('connexion.admin.code'), code, { hint: t('connexion.admin.code.aide') });
  const error = errorNote();

  return screen({
    content: [
      brandHead(t('connexion.admin.titre'), t('connexion.admin.texte')),
      h('div', { class: 'welcome__fields' }, usernameField.field, passwordField.field, confirmField.field, codeField.field, error.note),
    ],
    submitLabel: t('connexion.admin.creer'),
    async onSubmit() {
      error.show('');
      usernameField.setError(null);
      codeField.setError(null);
      if (!/^[A-Za-z0-9._-]{2,50}$/.test(username.value.trim())) {
        usernameField.setError(t('connexion.admin.identifiant.invalide'));
        return;
      }
      if (!checkNewPassword(password.input.value, confirmation.value, passwordField, confirmField)) return;
      if (!code.value.trim()) {
        codeField.setError(t('connexion.admin.code.erreurVide'));
        return;
      }
      try {
        const result = await post('/api/setup', { username: username.value.trim(), displayName: defaultDisplayName(username.value), password: password.input.value, code: code.value }, { auth: false });
        loggedIn(result.user);
      } catch (err) {
        // Un compte existe déjà (créé entre-temps) : retour à la connexion
        if (err instanceof ApiError && err.status === 403 && /déjà configuré/.test(err.message)) {
          app.setupNeeded = false;
          show(passwordStep, { message: t('connexion.admin.dejaConfigure') });
          return;
        }
        error.show(errorMessage(err));
      }
    },
  });
}

// --- Changement de mot de passe imposé par l'Admin ---

export function renderForcedChange() {
  const current = passwordInput({ id: 'mot-de-passe-actuel', name: 'current-password', autocomplete: 'current-password', required: true });
  const next = passwordInput({ id: 'nouveau-mot-de-passe', name: 'new-password', autocomplete: 'new-password', required: true });
  const confirmation = h('input', { class: 'input', type: 'password', id: 'confirmation', name: 'confirm-password', autocomplete: 'new-password', required: true, placeholder: t('connexion.impose.confirmation.exemple') });
  const currentField = field(t('connexion.impose.provisoire'), current.wrap, { hint: t('connexion.impose.provisoire.aide') });
  const nextField = field(t('connexion.impose.nouveau'), next.wrap, { hint: t('connexion.motDePasse.minimum', { min: MIN_PASSWORD }) });
  const confirmField = field(t('connexion.impose.confirmation'), confirmation);
  const error = errorNote();

  const logout = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    onClick: () => logOut(),
  }, t('connexion.impose.deconnexion'));

  return screen({
    content: [
      brandHead(t('connexion.impose.nouveau'), t('connexion.impose.texte')),
      h('div', { class: 'welcome__fields' }, currentField.field, nextField.field, confirmField.field, error.note),
      logout,
    ],
    submitLabel: t('connexion.impose.enregistrer'),
    async onSubmit() {
      error.show('');
      if (!checkNewPassword(next.input.value, confirmation.value, nextField, confirmField)) return;
      if (next.input.value === current.input.value) {
        nextField.setError(t('connexion.impose.different'));
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
