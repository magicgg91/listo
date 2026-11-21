// Écran « Assistants IA » (#/reglages/assistants, autrefois « Connexions
// Claude », #/reglages/claude), étape D de docs/mcp-cadrage.md. Ouvert
// depuis Mon compte, seulement si l'accès des assistants IA est activé sur
// le serveur (app.user.claudeUrl).
// - en haut : une phrase d'explication, l'adresse à saisir dans l'assistant IA (avec
//   « Copier ») et un lien vers l'aide ;
// - puis les connexions actives du compte : application (hôte, et nom
//   « non vérifié » s'il est donné par l'application elle-même), où va la
//   réponse, droit (« Lecture seule » ou « Lecture et écriture »), listes,
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
import { t } from '../i18n.js';

// Niveau d'accord de chaque connexion (mêmes niveaux que server/oauth.js)
export const ACCESS_LABELS = { get read() { return t('claude.acces.lecture'); }, get write() { return t('claude.acces.ecriture'); } };

// Nom de l'application, comme sur l'écran « Autoriser Claude »
function appName(connection) {
  if (!connection.app.name) return null;
  return t('claude.application.nom', { name: connection.app.name, detail: connection.app.nameFromApp ? t('claude.application.nonVerifie') : t('claude.application.fourni') });
}

// Titre court d'une connexion (confirmation, aria-label)
const titleOf = (connection) => (connection.redirect.local ? t('claude.connexions.titreLocal', { host: connection.app.host }) : connection.app.host);

async function copyAddress(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast(t('claude.connexions.copiee'), { low: true });
  } catch {
    toast(t('claude.connexions.copieImpossible'));
  }
}

export function renderClaudeConnections() {
  const url = app.user?.claudeUrl ?? '';
  const list = h('div', {}, h('p', { class: 'muted' }, t('claude.chargement')));
  const screen = h('div', { class: 'screen claude-connections' },
    topbar(t('claude.connexions.titre'), () => goBack('account')),
    h('div', { class: 'body' },
      h('p', { class: 'claude-connections__intro' }, t('claude.connexions.intro')),
      h('h2', { class: 'section-title' }, t('claude.connexions.adresse')),
      h('div', { class: 'group' },
        // L'adresse sur sa propre ligne (elle peut être longue), puis « Copier »
        h('div', { class: 'claude-connections__address' },
          h('p', { class: 'row__sub' }, t('claude.connexions.adresse.detail')),
          h('p', { class: 'claude-connections__url' }, url),
          h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: () => copyAddress(url) }, icon('copy', 'icon--sm'), t('claude.connexions.copier'))),
        h('button', { class: 'row', type: 'button', onClick: () => navigate('helpSection', { section: 'claude' }) },
          h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon('book')),
          h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, t('claude.connexions.aide')), h('span', { class: 'row__sub' }, t('claude.connexions.aide.detail'))),
          icon('chev-r'))),
      list));
  load(list);
  return screen;
}

// Connexions du compte (relues après chaque déconnexion)
async function load(container) {
  if (!navigator.onLine) {
    replace(container, emptyState(t('claude.connexions.reseau'), t('claude.connexions.reseau.texte')));
    return;
  }
  try {
    const { connections } = await get('/api/me/claude');
    replace(container, connectionsView(container, connections));
  } catch (err) {
    replace(container, emptyState(t('claude.connexions.indisponibles'), errorMessage(err)));
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
    return [h('h2', { class: 'section-title' }, t('claude.connexions.section')),
      emptyState(t('claude.connexions.aucune'), t('claude.connexions.aucune.texte'))];
  }
  const disconnectOne = async (connection) => {
    const ok = await confirmDialog({
      title: t('claude.connexions.deconnecter.question', { name: titleOf(connection) }),
      text: t('claude.connexions.deconnecter.texte'),
      confirmLabel: t('claude.connexions.deconnecter'),
    });
    if (!ok) return;
    try {
      await del(`/api/me/claude/${encodeURIComponent(connection.id)}`);
      toast(t('claude.connexions.deconnectee'), { low: true });
    } catch (err) {
      toast(errorMessage(err));
    }
    load(container);
  };
  const disconnectAll = async () => {
    const ok = await confirmDialog({
      title: t('claude.connexions.tout.question'),
      text: t('claude.connexions.tout.texte'),
      confirmLabel: t('claude.connexions.tout'),
    });
    if (!ok) return;
    try {
      await del('/api/me/claude');
      toast(t('claude.connexions.tout.fait'), { low: true });
    } catch (err) {
      toast(errorMessage(err));
    }
    load(container);
  };

  return [
    h('h2', { class: 'section-title' }, t('claude.connexions.section.nombre', { count: connections.length })),
    h('div', { class: 'group' }, connections.map((connection) => connectionRow(connection, disconnectOne))),
    h('div', { class: 'claude-connections__all' },
      h('button', { class: 'btn btn--danger btn--block', type: 'button', onClick: disconnectAll }, t('claude.connexions.tout'))),
  ];
}

// Une connexion : application, retour, droit, listes, dates, « Déconnecter »
function connectionRow(connection, onDisconnect) {
  const name = appName(connection);
  const lists = connection.allLists ? t('claude.toutesMesListes')
    : connection.lists.length ? namesList(connection.lists) : t('claude.connexions.aucuneListe');
  const used = connection.lastUsedAt ? relativeTime(connection.lastUsedAt) : t('claude.connexions.jamais');
  return h('div', { class: 'row' },
    h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon('shield')),
    h('span', { class: 'row__body' },
      h('span', { class: 'row__title' }, connection.app.host),
      name ? h('span', { class: 'row__sub' }, name) : null,
      h('span', { class: 'row__sub' }, t('claude.connexions.reponse', { host: connection.redirect.local ? t('claude.local') : connection.redirect.host })),
      h('span', { class: 'claude-connections__chips' },
        h('span', { class: `chip${connection.access === 'read' ? '' : ' chip--accent'}` }, ACCESS_LABELS[connection.access] ?? ACCESS_LABELS.read)),
      h('span', { class: 'row__sub' }, t('claude.connexions.listes', { lists })),
      h('span', { class: 'row__sub' }, t('claude.connexions.date', { date: dateTimeLabel(connection.createdAt) })),
      h('span', { class: 'row__sub' }, t('claude.connexions.utilisation', { used })),
      h('button', {
        class: 'btn btn--danger-outline btn--sm claude-connections__button',
        type: 'button',
        'aria-label': t('claude.connexions.deconnecter.nom', { name: titleOf(connection) }),
        onClick: () => onDisconnect(connection),
      }, t('claude.connexions.deconnecter'))));
}
