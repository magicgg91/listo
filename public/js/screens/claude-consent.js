// Écran « Autoriser Claude » (#/autoriser/<id>), étape A de
// docs/mcp-cadrage.md. Claude a ouvert /oauth/authorize dans le navigateur ;
// le serveur a vérifié la demande, puis renvoyé ici. La personne, connectée
// (sinon l'écran de connexion passe d'abord, avec la 2FA), voit :
// - qui demande l'accès et où la réponse sera envoyée (hôte de retour bien
//   visible : « claude.ai », ou une application sur cet ordinateur) ;
// - l'accès : « Lecture seule » (présélectionnée) ou « Lecture et ajout »
//   (choix volontaire) ;
// - les listes : « Toutes mes listes » (par défaut) ou une sélection ;
// - son mot de passe (et un code 2FA), redemandés à chaque autorisation.
// « Autoriser » et « Refuser » passent par l'API (POST, même origine) ; le
// serveur répond avec l'adresse de retour vers Claude, où l'on va ensuite.
// Aucun curseur mis tout seul ; tout le texte venu du serveur passe par
// textContent (h()).

import { h, icon, field, passwordInput, errorNote, replace } from '../dom.js';
import { get, post, errorMessage, ApiError } from '../api.js';
import { row } from './settings.js';
import { listIcon } from '../list-icons.js';

const enc = encodeURIComponent;

// Choix exclusif du kit (.radio-row dans une carte) : rond plein ET texte
// en gras sur le choix actif (jamais la couleur seule). Une ligne par choix :
// les libellés tiennent même sur un petit téléphone.
function radioGroup(labelId, options, initial, onChange) {
  let current = initial;
  const buttons = options.map(([value, label]) => {
    const button = h('button', { class: 'radio-row', type: 'button', role: 'radio', onClick: () => {
      current = value;
      paint();
      onChange(value);
    } }, h('span', { class: 'radio' }), label);
    button.dataset.value = value;
    return button;
  });
  const paint = () => {
    for (const button of buttons) {
      const on = button.dataset.value === current;
      button.setAttribute('aria-checked', String(on));
      button.classList.toggle('is-on', on);
      button.firstChild.classList.toggle('is-on', on);
    }
  };
  paint();
  return h('div', { class: 'card card--clip', role: 'radiogroup', 'aria-labelledby': labelId }, buttons);
}

// Ligne de liste à cocher (.tick-row du kit, comme le partage d'une liste)
function listTick(list, chosen) {
  const button = h('button', { class: 'tick-row', type: 'button', role: 'checkbox' });
  const paint = () => {
    const on = chosen.has(list.id);
    button.setAttribute('aria-checked', String(on));
    replace(button,
      h('span', { class: `tick${on ? ' is-on' : ''}` }, on ? icon('check') : null),
      icon(listIcon({ icon: list.icon, type: list.type })),
      h('span', { class: 'grow' }, list.name));
  };
  button.addEventListener('click', () => {
    if (chosen.has(list.id)) chosen.delete(list.id);
    else chosen.add(list.id);
    paint();
  });
  paint();
  return button;
}

// Message plein écran (demande expirée, Listo injoignable…)
function message(title, text) {
  return h('div', { class: 'empty' },
    h('span', { class: 'empty__icon' }, icon('alert', 'icon--lg')),
    h('p', { class: 'empty__title' }, title),
    h('p', { class: 'empty__text' }, text));
}

function topbar() {
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, 'Autoriser Claude')));
}

export function renderClaudeConsent(id) {
  const container = h('div', { class: 'screen' }, topbar(), h('div', { class: 'body' }, h('p', { class: 'muted' }, 'Chargement…')));
  get(`/api/oauth/demandes/${enc(id)}`).then(
    (data) => replace(container, consentForm(id, data)),
    (err) => {
      const expired = err instanceof ApiError && err.status === 404;
      replace(container, topbar(), h('div', { class: 'body' },
        expired ? message('Demande introuvable ou expirée', 'Relancez la connexion depuis Claude.')
          : message('Demande impossible à afficher', errorMessage(err))));
    });
  return container;
}

function consentForm(id, { request, account, twoFactor, lists }) {
  let scope = 'read';          // « Lecture seule » présélectionnée
  let allLists = true;         // « Toutes mes listes » par défaut
  const chosen = new Set();

  // Qui demande, et où va la réponse
  const local = request.redirect.local;
  // Nom de l'application : déclaré par l'application elle-même
  // (enregistrement automatique) → signalé comme non vérifié ; lu dans le
  // document d'identification publié sur claude.ai → nom fourni par l'application
  const named = request.app.nameFromApp ? 'nom donné par l\'application, non vérifié' : 'nom fourni par l\'application';
  const appSub = request.app.name ? `« ${request.app.name} » (${named})` : 'Application qui demande l\'accès';
  const who = h('div', { class: 'card card--clip' },
    row({ iconName: 'shield', title: request.app.host, sub: appSub }),
    row({ iconName: 'link', title: local ? 'une application sur cet ordinateur (localhost)' : request.redirect.host, sub: 'La réponse sera envoyée ici' }),
    row({ iconName: 'lock', title: account.displayName, sub: `Votre compte Listo (${account.username})` }));

  // Accès : la lecture et l'ajout seulement si l'application l'a demandé
  const scopeHint = h('p', { class: 'field__hint' });
  const paintScopeHint = () => {
    scopeHint.textContent = scope === 'write'
      ? 'Claude pourra lire vos listes, y ajouter des éléments et les cocher. Jamais supprimer ni partager.'
      : 'Claude pourra lire vos listes, sans rien y changer.';
  };
  paintScopeHint();
  const scopeField = h('div', { class: 'field' },
    h('span', { class: 'field__label', id: 'consent-scope' }, 'Accès'),
    request.write
      ? radioGroup('consent-scope', [['read', 'Lecture seule'], ['write', 'Lecture et ajout']], scope, (value) => {
        scope = value;
        paintScopeHint();
      })
      : h('p', {}, 'Lecture seule'),
    scopeHint);

  // Listes : toutes, ou une sélection
  const picker = h('div', { class: 'card card--clip', hidden: true },
    lists.length ? lists.map((list) => listTick(list, chosen)) : h('p', { class: 'muted' }, 'Vous n\'avez encore aucune liste.'));
  const listsField = h('div', { class: 'field' },
    h('span', { class: 'field__label', id: 'consent-lists' }, 'Listes'),
    radioGroup('consent-lists', [['all', 'Toutes mes listes'], ['some', 'Certaines listes']], 'all', (value) => {
      allLists = value === 'all';
      picker.hidden = allLists;
    }),
    picker);

  // Mot de passe (et code 2FA), redemandés à chaque nouvelle autorisation
  const password = passwordInput({ autocomplete: 'current-password' });
  const passwordField = field('Mot de passe', password.wrap);
  const code = twoFactor ? h('input', { class: 'input input--mono', type: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: 'false' }) : null;
  const codeField = code ? field('Code', code, { hint: "Code à 6 chiffres de l'application, ou l'un de vos codes de secours." }) : null;
  const error = errorNote();

  const allow = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Autoriser');
  const deny = h('button', { class: 'btn btn--secondary btn--block', type: 'button' }, 'Refuser');
  const busy = (on) => {
    allow.disabled = on;
    deny.disabled = on;
  };

  const form = h('form', { novalidate: true },
    topbar(),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      h('p', {}, 'Claude demande l\'accès à vos listes Listo. Il agira avec votre compte et vos droits, jamais plus.'),
      h('div', { class: 'note' }, icon('alert'), h('p', {}, 'Ne continuez que si vous venez de lancer la connexion depuis Claude.')),
      who,
      local ? h('div', { class: 'note note--danger' }, icon('alert'),
        h('p', {}, 'La réponse ira à une application installée sur cet ordinateur (par exemple Claude Code), pas à claude.ai. Refusez si vous ne l\'avez pas lancée vous-même.')) : null,
      scopeField,
      listsField,
      h('p', { class: 'muted' }, 'Confirmez avec votre mot de passe.'),
      passwordField.field,
      codeField?.field ?? null,
      error.note)),
    // Juste au-dessus d'« Autoriser », toujours visible (barre du bas)
    h('div', { class: 'footer' },
      h('p', {}, 'Vous venez de lancer cette connexion depuis Claude ? Si ce n\'est pas le cas, refusez.'),
      allow, deny));

  // Autoriser : vérifications sur le téléphone, puis le serveur décide
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (allow.disabled) return;
    error.show('');
    passwordField.setError(null);
    codeField?.setError(null);
    if (!allLists && !chosen.size) return error.show('Choisissez au moins une liste.');
    if (!password.input.value) return passwordField.setError('Saisissez votre mot de passe');
    if (code && !code.value.trim()) return codeField.setError('Saisissez un code');
    busy(true);
    try {
      const { redirect } = await post(`/api/oauth/demandes/${enc(id)}/accord`, {
        password: password.input.value,
        code: code ? code.value.trim() : undefined,
        scope,
        lists: allLists ? 'all' : [...chosen],
      });
      location.assign(redirect);
    } catch (err) {
      busy(false);
      error.show(errorMessage(err), password.input, code);
    }
    return undefined;
  });

  // Refuser : Claude est prévenu (error=access_denied)
  deny.addEventListener('click', async () => {
    if (deny.disabled) return;
    error.show('');
    busy(true);
    try {
      const { redirect } = await post(`/api/oauth/demandes/${enc(id)}/refus`);
      location.assign(redirect);
    } catch (err) {
      busy(false);
      error.show(errorMessage(err));
    }
  });

  return form;
}
