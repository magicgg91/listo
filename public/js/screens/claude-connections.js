// Écran « Connexions Claude » (#/reglages/claude), étape D de
// docs/mcp-cadrage.md. Ouvert depuis Mon compte, seulement si l'accès depuis
// Claude est activé sur le serveur (app.user.claudeUrl).
// - en haut : une phrase d'explication, l'adresse à saisir dans Claude (avec
//   « Copier ») et un lien vers l'aide ;
// - puis les connexions actives du compte : application (hôte, et nom
//   « non vérifié » s'il est donné par l'application elle-même), où va la
//   réponse, droit (« Lecture seule » ou « Lecture et ajout »), listes,
//   date de connexion, dernière utilisation ; « Déconnecter » pour chacune,
//   « Tout déconnecter » en bas, toujours avec confirmation, sans mot de
//   passe (déconnecter est une mesure de sécurité, toujours permise).
// Composants du kit seulement (.row, .group, .chip, .btn, .empty, fenêtre
// de confirmation) ; texte posé avec textContent (h()) ; aucun curseur mis
// tout seul.

import { h, icon, replace } from '../dom.js';
import { get, del, errorMessage } from '../api.js';
import { app } from '../app.js';
import { navigate, goBack } from '../router.js';
import { confirmDialog, toast } from '../ui.js';
import { topbar } from './settings.js';
import { relativeTime, dateTimeLabel, namesList } from '../format.js';

// Nom de l'application, comme sur l'écran « Autoriser Claude »
function appName(connection) {
  if (!connection.app.name) return null;
  return `« ${connection.app.name} » (${connection.app.nameFromApp ? 'nom donné par l\'application, non vérifié' : 'nom fourni par l\'application'})`;
}

// Titre court d'une connexion (confirmation, aria-label)
const titleOf = (connection) => (connection.redirect.local ? `${connection.app.host} (cet ordinateur)` : connection.app.host);

async function copyAddress(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Adresse copiée', { low: true });
  } catch {
    toast('Copie impossible : sélectionnez l\'adresse à la main.');
  }
}

export function renderClaudeConnections() {
  const url = app.user?.claudeUrl ?? '';
  const list = h('div', {}, h('p', { class: 'muted' }, 'Chargement…'));
  const screen = h('div', { class: 'screen claude-connections' },
    topbar('Connexions Claude', () => goBack('account')),
    h('div', { class: 'body' },
      h('p', { class: 'claude-connections__intro' }, 'Claude (claude.ai, l\'application mobile, Claude Desktop, Claude Code) peut lire vos listes et, si vous l\'avez autorisé, y ajouter des éléments et les cocher, au nom de votre compte. Chaque connexion que vous avez autorisée apparaît ici.'),
      h('h2', { class: 'section-title' }, 'Adresse à saisir dans Claude'),
      h('div', { class: 'group' },
        // L'adresse sur sa propre ligne (elle peut être longue), puis « Copier »
        h('div', { class: 'claude-connections__address' },
          h('p', { class: 'row__sub' }, 'À ajouter comme connecteur personnalisé dans Claude :'),
          h('p', { class: 'claude-connections__url' }, url),
          h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: () => copyAddress(url) }, icon('copy', 'icon--sm'), 'Copier l\'adresse')),
        h('button', { class: 'row', type: 'button', onClick: () => navigate('help') },
          h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon('book')),
          h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, 'Utiliser Listo avec Claude'), h('span', { class: 'row__sub' }, 'Aide : se connecter, ce que Claude peut faire')),
          icon('chev-r'))),
      list));
  load(list);
  return screen;
}

// Connexions du compte (relues après chaque déconnexion)
async function load(container) {
  if (!navigator.onLine) {
    replace(container, emptyState('Connexion nécessaire', 'Il faut du réseau pour voir et déconnecter les connexions Claude.'));
    return;
  }
  try {
    const { connections } = await get('/api/me/claude');
    replace(container, connectionsView(container, connections));
  } catch (err) {
    replace(container, emptyState('Connexions indisponibles', errorMessage(err)));
  }
}

function emptyState(title, text) {
  return h('div', { class: 'empty' },
    h('span', { class: 'empty__icon' }, icon('link', 'icon--lg')),
    h('p', { class: 'empty__title' }, title),
    h('p', { class: 'empty__text' }, text));
}

function connectionsView(container, connections) {
  if (!connections.length) {
    return [h('h2', { class: 'section-title' }, 'Connexions'),
      emptyState('Aucune connexion', 'Ajoutez Listo dans Claude avec l\'adresse ci-dessus, puis autorisez-le.')];
  }
  const disconnectOne = async (connection) => {
    const ok = await confirmDialog({
      title: `Déconnecter ${titleOf(connection)} ?`,
      text: 'Claude ne pourra plus lire ni modifier vos listes avec cette connexion. Pour le reconnecter, il faudra l\'autoriser de nouveau.',
      confirmLabel: 'Déconnecter',
    });
    if (!ok) return;
    try {
      await del(`/api/me/claude/${encodeURIComponent(connection.id)}`);
      toast('Connexion déconnectée', { low: true });
    } catch (err) {
      toast(errorMessage(err));
    }
    load(container);
  };
  const disconnectAll = async () => {
    const ok = await confirmDialog({
      title: 'Tout déconnecter ?',
      text: 'Toutes vos connexions Claude sont coupées tout de suite. Pour reconnecter Claude, il faudra l\'autoriser de nouveau.',
      confirmLabel: 'Tout déconnecter',
    });
    if (!ok) return;
    try {
      await del('/api/me/claude');
      toast('Toutes les connexions sont déconnectées', { low: true });
    } catch (err) {
      toast(errorMessage(err));
    }
    load(container);
  };

  return [
    h('h2', { class: 'section-title' }, `Connexions (${connections.length})`),
    h('div', { class: 'group' }, connections.map((connection) => connectionRow(connection, disconnectOne))),
    h('div', { class: 'claude-connections__all' },
      h('button', { class: 'btn btn--danger btn--block', type: 'button', onClick: disconnectAll }, 'Tout déconnecter')),
  ];
}

// Une connexion : application, retour, droit, listes, dates, « Déconnecter »
function connectionRow(connection, onDisconnect) {
  const name = appName(connection);
  const lists = connection.allLists ? 'Toutes mes listes'
    : connection.lists.length ? namesList(connection.lists) : 'Aucune liste (supprimées ou quittées)';
  const used = connection.lastUsedAt ? relativeTime(connection.lastUsedAt) : 'jamais';
  return h('div', { class: 'row' },
    h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon('shield')),
    h('span', { class: 'row__body' },
      h('span', { class: 'row__title' }, connection.app.host),
      name ? h('span', { class: 'row__sub' }, name) : null,
      h('span', { class: 'row__sub' }, `Réponse envoyée à : ${connection.redirect.local ? 'une application sur cet ordinateur (localhost)' : connection.redirect.host}`),
      h('span', { class: 'claude-connections__chips' },
        h('span', { class: `chip${connection.access === 'write' ? ' chip--accent' : ''}` }, connection.access === 'write' ? 'Lecture et ajout' : 'Lecture seule')),
      h('span', { class: 'row__sub' }, `Listes : ${lists}`),
      h('span', { class: 'row__sub' }, `Connectée le ${dateTimeLabel(connection.createdAt)}`),
      h('span', { class: 'row__sub' }, `Dernière utilisation : ${used}`),
      h('button', {
        class: 'btn btn--danger-outline btn--sm claude-connections__button',
        type: 'button',
        'aria-label': `Déconnecter ${titleOf(connection)}`,
        onClick: () => onDisconnect(connection),
      }, 'Déconnecter')));
}
