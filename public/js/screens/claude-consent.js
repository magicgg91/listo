// Écran « Autoriser un assistant IA » (#/autoriser/<id>), étape A de
// docs/mcp-cadrage.md. L'assistant IA (Claude, par exemple) a ouvert
// /oauth/authorize dans le navigateur ; le serveur a vérifié la demande,
// puis renvoyé ici. La personne, connectée (sinon l'écran de connexion
// passe d'abord, avec la 2FA), voit :
// - qui demande l'accès et où la réponse sera envoyée (hôte de retour bien
//   visible : « claude.ai », un autre site, ou une application sur cet
//   ordinateur), avec un avertissement ferme : vérifier le site, refuser si
//   l'on n'a pas lancé la connexion soi-même (tout assistant IA peut
//   demander l'accès : seul cet écran décide) ;
// - l'accès : « Lecture seule » (présélectionnée) ou « Lecture et écriture »
//   (choix volontaire, seulement si l'application le demande, avec un
//   avertissement) ;
// - les listes : « Toutes mes listes » (par défaut) ou une sélection ;
// - son mot de passe (et un code 2FA), redemandés à chaque autorisation.
// « Autoriser » et « Refuser » passent par l'API (POST, même origine) ; le
// serveur répond avec l'adresse de retour vers l'assistant, où l'on va ensuite.
// Aucun curseur mis tout seul ; tout le texte venu du serveur passe par
// textContent (h()).

import { h, icon, field, passwordInput, errorNote, replace } from '../dom.js';
import { get, post, errorMessage, ApiError } from '../api.js';
import { row } from './settings.js';
import { providerName } from '../app.js';
import { listIcon } from '../list-icons.js';
import { t } from '../i18n.js';

const enc = encodeURIComponent;

// Ce que l'assistant IA pourra faire, pour chacun des deux niveaux d'accord (écran
// d'autorisation ; mêmes niveaux que server/oauth.js)
export const SCOPE_TEXTS = {
  get read() { return t('claude.autoriser.lecture.texte'); },
  get write() { return t('claude.autoriser.ecriture.texte'); },
};
// Avertissement du niveau « Lecture et écriture »
export const editWarningText = () => t('claude.autoriser.ecriture.avertissement');

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

// Avertissement sous « qui demande » : application de l'ordinateur, ou site
// (nommé : celui qui recevra la réponse), toujours affiché
function warning(request) {
  const text = request.redirect.local ? t('claude.autoriser.local') : t('claude.autoriser.site', { host: request.redirect.host });
  return h('div', { class: 'note note--danger' }, icon('alert'), h('p', {}, text));
}

function topbar() {
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, t('claude.autoriser.titre'))));
}

export function renderClaudeConsent(id) {
  const container = h('div', { class: 'screen' }, topbar(), h('div', { class: 'body' }, h('p', { class: 'muted' }, t('claude.chargement'))));
  get(`/api/oauth/demandes/${enc(id)}`).then(
    (data) => replace(container, consentForm(id, data)),
    (err) => {
      const expired = err instanceof ApiError && err.status === 404;
      replace(container, topbar(), h('div', { class: 'body' },
        expired ? message(t('claude.autoriser.expiree'), t('claude.autoriser.expiree.texte'))
          : message(t('claude.autoriser.impossible'), errorMessage(err))));
    });
  return container;
}

// Session ouverte avec le fournisseur d'identité, pas encore reconfirmée : le fournisseur d'identité doit
// redemander la connexion avant tout choix (le retour recharge la page :
// les choix faits avant seraient perdus). « Refuser » reste possible.
function confirmFirst(id, request, failed) {
  const error = errorNote();
  if (failed) error.show(t('claude.autoriser.fournisseur.echec', { provider: providerName() }));
  const deny = h('button', { class: 'btn btn--secondary btn--block', type: 'button' }, t('claude.autoriser.refuser'));
  deny.addEventListener('click', async () => {
    deny.disabled = true;
    try {
      const { redirect } = await post(`/api/oauth/demandes/${enc(id)}/refus`);
      location.assign(redirect);
    } catch (err) {
      deny.disabled = false;
      error.show(errorMessage(err));
    }
  });
  return h('div', { class: 'screen' },
    topbar(),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      h('p', {}, t('claude.autoriser.intro')),
      h('div', { class: 'note' }, icon('alert'), h('p', {}, t('claude.autoriser.attention'))),
      h('div', { class: 'card card--clip' }, row({ iconName: 'shield', title: request.app.host, sub: request.app.name ? t('claude.autoriser.nomSeul', { name: request.app.name }) : t('claude.autoriser.application') })),
      warning(request),
      h('p', {}, t('claude.autoriser.fournisseur.texte', { provider: providerName() })),
      error.note)),
    h('div', { class: 'footer' },
      h('a', { class: 'btn btn--primary btn--block', href: `/oidc/connexion?confirmer=${enc(id)}` }, icon('shield'), t('claude.autoriser.fournisseur.confirmer', { provider: providerName() })), // « Confirmer avec … »
      deny));
}

function consentForm(id, { request, account, twoFactor, lists, confirmWith = 'password', confirmed = false }) {
  const viaProvider = confirmWith === 'authelia';
  // Retour du fournisseur d'identité : #/autoriser/<demande>?authelia=confirme ou non-confirme
  const back = new URLSearchParams(String(location.hash).split('?')[1] ?? '').get('authelia');
  if (viaProvider && !confirmed) return confirmFirst(id, request, back === 'non-confirme');
  let scope = 'read';          // « Lecture seule » présélectionnée
  let allLists = true;         // « Toutes mes listes » par défaut
  const chosen = new Set();

  // Qui demande, et où va la réponse
  const local = request.redirect.local;
  // Nom de l'application : déclaré par l'application elle-même
  // (enregistrement automatique) → signalé comme non vérifié ; lu dans le
  // document d'identification publié sur le site de l'application (claude.ai)
  // → nom publié par le site de l'application
  const named = request.app.nameFromApp ? t('claude.application.nonVerifie') : t('claude.application.fourni');
  const appSub = request.app.name ? t('claude.application.nom', { name: request.app.name, detail: named }) : t('claude.autoriser.application');
  const who = h('div', { class: 'card card--clip' },
    row({ iconName: 'shield', title: request.app.host, sub: appSub }),
    row({ iconName: 'link', title: local ? t('claude.local') : request.redirect.host, sub: t('claude.autoriser.retour') }),
    row({ iconName: 'lock', title: account.displayName, sub: t('claude.autoriser.compte', { username: account.username }) }));

  // Accès : « Lecture et écriture » seulement si l'application l'a demandé ;
  // ce niveau est signalé : il demande de la confiance (editWarningText)
  const scopeHint = h('p', { class: 'field__hint', id: 'consent-scope-hint' });
  const editWarning = h('div', { class: 'note note--danger', id: 'consent-edit-warning', hidden: true }, icon('alert'), h('p', {}, editWarningText()));
  const paintScopeHint = () => {
    scopeHint.textContent = SCOPE_TEXTS[scope];
    editWarning.hidden = scope !== 'write';
  };
  paintScopeHint();
  const levels = [['read', t('claude.acces.lecture')], ['write', t('claude.acces.ecriture')]];
  const scopeField = h('div', { class: 'field' },
    h('span', { class: 'field__label', id: 'consent-scope' }, t('claude.autoriser.niveau')),
    request.write
      ? radioGroup('consent-scope', levels, scope, (value) => {
        scope = value;
        paintScopeHint();
      })
      : h('p', {}, t('claude.acces.lecture')),
    scopeHint,
    editWarning);

  // Listes : toutes, ou une sélection
  const picker = h('div', { class: 'card card--clip', hidden: true },
    lists.length ? lists.map((list) => listTick(list, chosen)) : h('p', { class: 'muted' }, t('claude.autoriser.aucuneListe')));
  const listsField = h('div', { class: 'field' },
    h('span', { class: 'field__label', id: 'consent-lists' }, t('claude.autoriser.listes')),
    radioGroup('consent-lists', [['all', t('claude.toutesMesListes')], ['some', t('claude.autoriser.certainesListes')]], 'all', (value) => {
      allLists = value === 'all';
      picker.hidden = allLists;
    }),
    picker);

  // Mot de passe (et code 2FA), redemandés à chaque nouvelle autorisation ;
  // pas avec le fournisseur d'identité (déjà reconfirmé chez le fournisseur d'identité, voir confirmFirst)
  const password = passwordInput({ autocomplete: 'current-password' });
  const passwordField = field(t('claude.autoriser.motDePasse'), password.wrap);
  const code = twoFactor && !viaProvider ? h('input', { class: 'input input--mono', type: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: 'false' }) : null;
  const codeField = code ? field(t('claude.autoriser.code'), code, { hint: t('claude.autoriser.code.aide') }) : null;
  const error = errorNote();

  const allow = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('claude.autoriser.autoriser'));
  const deny = h('button', { class: 'btn btn--secondary btn--block', type: 'button' }, t('claude.autoriser.refuser'));
  const busy = (on) => {
    allow.disabled = on;
    deny.disabled = on;
  };

  const form = h('form', { novalidate: true },
    topbar(),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      h('p', {}, t('claude.autoriser.intro')),
      h('div', { class: 'note' }, icon('alert'), h('p', {}, t('claude.autoriser.attention'))),
      who,
      warning(request),
      scopeField,
      listsField,
      viaProvider
        ? h('div', { class: 'note' }, icon('check'), h('p', {}, t('claude.autoriser.fournisseur.confirme', { provider: providerName() })))
        : [h('p', { class: 'muted' }, t('claude.autoriser.motDePasse.confirmer')), passwordField.field],
      codeField?.field ?? null,
      error.note)),
    // Juste au-dessus d'« Autoriser », toujours visible (barre du bas)
    h('div', { class: 'footer' },
      h('p', {}, t('claude.autoriser.question')),
      allow, deny));

  // Autoriser : vérifications sur le téléphone, puis le serveur décide
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (allow.disabled) return;
    error.show('');
    passwordField.setError(null);
    codeField?.setError(null);
    if (!allLists && !chosen.size) return error.show(t('claude.autoriser.choisirListe'));
    if (!viaProvider && !password.input.value) return passwordField.setError(t('claude.autoriser.motDePasse.manquant'));
    if (code && !code.value.trim()) return codeField.setError(t('claude.autoriser.code.manquant'));
    busy(true);
    try {
      const { redirect } = await post(`/api/oauth/demandes/${enc(id)}/accord`, {
        password: viaProvider ? undefined : password.input.value,
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

  // Refuser : l'assistant est prévenu (error=access_denied)
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
