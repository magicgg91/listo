// Écran « Mon compte » : la carte du compte des Réglages l'ouvre ; il reçoit
// les blocs Sécurité, Apparence et Ce téléphone, qui ne sont plus dans les
// Réglages ; retours d'écran vers « Mon compte ». Le fonctionnement réel
// (clics, thème, réinitialisation, clavier, hors ligne) est vérifié dans un
// vrai navigateur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchRoute, pathFor } from '../public/js/router.js';
import fr from '../public/js/i18n/fr.js';

const read = (file) => fs.readFileSync(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
const settings = read('screens/settings.js');
const account = read('screens/account.js');
// Corps d'une fonction (de sa déclaration à son accolade fermante)
const body = (source, name) => {
  const start = source.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}\n', start) + 2);
};

test('« Mon compte » a sa propre adresse : un rechargement le rouvre', () => {
  assert.deepEqual(matchRoute('#/reglages/compte'), { name: 'account', params: {} });
  assert.equal(pathFor('account'), '#/reglages/compte');
  assert.match(read('app.js'), /case 'account': mount\(\(onLeave\) => renderAccount\(onLeave\)\); break;/);
});

test('Réglages : la carte du compte est un bouton qui ouvre « Mon compte »', () => {
  const screen = body(settings, 'renderSettings');
  assert.match(screen, /h\('button', \{\s*class: 'card account account--link',\s*type: 'button',\s*'aria-label': t\('reglages\.compte\.lien', \{ name: user\.displayName \}\),\s*onClick: \(\) => navigate\('account'\),/);
  assert.equal(fr['reglages.compte.lien'], 'Mon compte : {name}');
  assert.ok(screen.includes("icon('chev-r')"), 'chevron');
  assert.ok(screen.includes('roleChip(user)'), 'badge Admin / Utilisateur');
  // Sécurité, Apparence et Ce téléphone ne sont plus dans les Réglages
  for (const gone of ["'Sécurité'", "'Apparence'", "'Ce téléphone'", 'Mot de passe', 'Double authentification', 'Réinitialiser', 'segmented', 'applyTheme']) {
    assert.equal(screen.includes(gone), false, gone);
  }
  // Ce qui reste : Administration (Admin), À propos ; « Se déconnecter » est
  // passé en bas de « Mon compte » (11 novembre 2026), ni footer ni bouton ici
  assert.ok(screen.indexOf("t('reglages.general')") >= 0);
  assert.ok(screen.indexOf("t('reglages.general')") < screen.indexOf("t('reglages.informations')"));
  assert.equal(fr['reglages.general'], 'Général');
  assert.equal(fr['reglages.informations'], 'Informations');
  assert.match(screen, /helpRow\(\), aboutRow\(isAdmin\)/);
  assert.equal(settings.includes("'Se déconnecter'"), false);
  assert.equal(screen.includes("class: 'footer'"), false);
});

test('« Mon compte » : identité, puis Sécurité, Apparence, Ce téléphone, dans cet ordre', () => {
  const screen = body(account, 'renderAccount');
  // Textes sortis du code (étape 2 des langues) : leurs noms, et leur texte français
  const order = ["topbar(t('compte.titre')", 'roleChip(user)', "t('compte.securite')", "title: t('compte.motDePasse.titre')", 'twoFactorRow)', "t('compte.apparence')", "'aria-label': t('compte.theme')", 'device().section', 'title: device().reset', "t('compte.deconnexion')"];
  assert.equal(fr['compte.titre'], 'Mon compte');
  assert.equal(fr['compte.securite'], 'Sécurité');
  assert.equal(fr['compte.motDePasse.titre'], 'Mot de passe');
  assert.equal(fr['compte.apparence'], 'Apparence');
  assert.equal(fr['compte.theme'], 'Thème');
  assert.equal(fr['compte.deconnexion'], 'Se déconnecter');
  const view = screen.slice(screen.indexOf("return h('div', { class: 'screen' }"));
  const positions = order.map((text) => view.indexOf(text));
  for (const [i, text] of order.entries()) assert.ok(positions[i] >= 0, text);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'ordre');
  assert.ok(screen.includes("goBack('settings')"), 'retour vers Réglages');
  // Thème : écrit data-theme et se mémorise (theme.js), effet immédiat
  assert.match(account, /onClick: \(\) => \{\s*applyTheme\(value\);/);
  // Réinitialisation : même garde hors ligne, même confirmation, file gardée
  assert.ok(account.includes("toast(t('compte.appareil.horsLigne'))"));
  assert.equal(fr['compte.appareil.horsLigne'], 'Indisponible hors ligne : il faut du réseau pour tout recharger.');
  assert.match(account, /confirmDialog\(\{\s*title: device\(\)\.question,/);
  // Téléphone : « Ce téléphone » ; ordinateur : « Cet appareil » (décision du 10 novembre 2026)
  assert.match(account, /: \{ section: t\('compte\.appareil\.telephone'\), reset: t\('compte\.appareil\.telephone\.reinitialiser'\), question: t\('compte\.appareil\.telephone\.reinitialiser\.question'\), text: t\('compte\.appareil\.telephone\.reinitialiser\.texte'\) \};/);
  assert.equal(fr['compte.appareil.telephone'], 'Ce téléphone');
  assert.equal(fr['compte.appareil.telephone.reinitialiser'], 'Réinitialiser les données de ce téléphone');
  assert.equal(fr['compte.appareil.telephone.reinitialiser.question'], 'Réinitialiser les données de ce téléphone ?');
  assert.equal(fr['compte.appareil.telephone.reinitialiser.texte'], 'Les listes gardées sur ce téléphone seront rechargées depuis le serveur.');
  assert.ok(account.includes('pendingCount()') && account.includes('await resetLocalCopy()'));
});

test('mot de passe et double authentification reviennent sur « Mon compte », jamais sur Réglages', () => {
  assert.ok(body(settings, 'renderPassword').includes("topbar(t('reglages.motDePasse.titre'), () => goBack('account'))"));
  assert.equal(fr['reglages.motDePasse.titre'], 'Mot de passe');
  assert.ok(settings.includes("topbar(t('reglages.deuxFacteurs.titre'), () => goBack('account'))"));
  assert.equal(fr['reglages.deuxFacteurs.titre'], 'Double authentification');
  // (sauf la page « À propos », ouverte depuis les Réglages : retour vers eux)
  assert.equal(/goBack\('settings'\)|navigate\('settings'/.test(settings.replace(body(settings, 'renderSettings'), '').replace(body(settings, 'renderAbout'), '')), false);
  assert.match(body(settings, 'renderAbout'), /topbar\(t\('reglages\.aPropos\.titre'\), \(\) => goBack\('settings'\)\)/);
  assert.equal(fr['reglages.aPropos.titre'], 'À propos');
  assert.match(settings, /const finish = \(\) => navigate\('account', \{\}, \{ replace: true \}\);/);
});

test('« Nouveautés » : dans Réglages › Notifications (partie « Dans l\'application »), plus dans Mon compte ; description seule sous le titre', () => {
  // Regroupement du 10 novembre 2026 : plus de section « Nouveautés » dans Mon compte (téléphone compris)
  assert.doesNotMatch(account, /newsSwitches|'Nouveautés'|setNewsSettings/);
  const screen = fs.readFileSync(new URL('../public/js/screens/notifications.js', import.meta.url), 'utf8');
  assert.match(screen, /h\('h2', \{ class: 'section-title' \}, t\('notifications\.application\.titre'\)\),\s*newsSwitches\(onLeave\),\s*h\('h2', \{ class: 'section-title' \}, t\('notifications\.appareil\.titre'\)\),/);
  assert.equal(fr['notifications.application.titre'], 'Dans l\'application');
  assert.equal(fr['notifications.appareil.titre'], 'Sur cet appareil');
  const start = screen.indexOf('function newsSwitches(');
  const block = screen.slice(start, screen.indexOf('\n}\n', start) + 2);
  // Plus d'« Activé · » / « Désactivé · » : l'interrupteur montre déjà l'état
  for (const gone of ['Activé', 'Désactivé', "'aria-label'"]) assert.equal(block.includes(gone), false, gone);
  assert.ok(block.includes("t('notifications.nouveautes.detail')"));
  assert.equal(fr['notifications.nouveautes.detail'], 'Ce que les autres ont ajouté ou modifié depuis votre dernière visite.');
  assert.ok(block.includes("['checks', t('notifications.nouveautes.cochees'), t('notifications.nouveautes.cochees.detail')],"));
  assert.equal(fr['notifications.nouveautes.cochees'], 'Signaler les éléments cochés');
  assert.equal(fr['notifications.nouveautes.cochees.detail'], 'Ce que les autres cochent ou décochent.');
  // Vrai interrupteur : nom = titre de la ligne, description reliée, état dans aria-checked
  assert.match(block, /h\('button', \{ class: 'switch', type: 'button', role: 'switch', 'aria-labelledby': titleId, 'aria-describedby': helpId \}\)/);
  assert.match(block, /h\('span', \{ class: 'row__title', id: titleId \}, label\), h\('span', \{ class: 'row__sub', id: helpId \}, help\)/);
  assert.match(block, /toggle\.setAttribute\('aria-checked', String\(Boolean\(app\.data\.news\?\.\[key\]\)\)\);/);
  // Le texte de la ligne ne change plus quand on bascule
  assert.equal(block.includes('textContent'), false);
});

test('« Se déconnecter » : en bas de « Mon compte » ; confirmation sur le téléphone (sauf si logOut pose déjà sa question), pas sur ordinateur', () => {
  assert.match(account, /h\('div', \{ class: 'account__logout' \},\s*h\('button', \{ class: 'btn btn--secondary btn--block', type: 'button', onClick: \(\) => confirmLogOut\(\) \}, icon\('logout', 'icon--sm'\), t\('compte\.deconnexion'\)\)\)/);
  assert.match(account, /if \(!onPc\(\) && !pendingCount\(\)\) \{\s*const ok = await confirmDialog\(\{\s*title: t\('compte\.deconnexion\.question'\),/);
  assert.equal(fr['compte.deconnexion.question'], 'Se déconnecter ?');
  assert.match(account, /cancelLabel: t\('compte\.deconnexion\.rester'\),\s*focusCancel: true,/);
  assert.equal(fr['compte.deconnexion.rester'], 'Rester connecté');
  assert.match(account, /if \(!ok\) return;\s*\}\s*await logOut\(\);/);
});

test('« À propos » : une ligne des Réglages (version à droite) qui ouvre sa page #/reglages/a-propos, avec le même bloc qu\'avant', () => {
  assert.deepEqual(matchRoute('#/reglages/a-propos'), { name: 'about', params: {} });
  assert.equal(pathFor('about'), '#/reglages/a-propos');
  assert.match(read('app.js'), /case 'about': mount\(\(\) => renderAbout\(\)\); break;/);
  const about = body(settings, 'renderAbout');
  assert.match(about, /h\('div', \{ class: 'body' \}, aboutGroup\(isAdmin\)\)/);
  const inner = (name) => settings.slice(settings.indexOf(`function ${name}(`), settings.indexOf('\n}\n', settings.indexOf(`function ${name}(`)) + 2);
  const line = inner('aboutRow');
  assert.match(line, /return row\(\{ iconName: 'help', title: t\('reglages\.aPropos\.titre'\), end: h\('span', \{ class: 'row__end' \}, value, icon\('chev-r'\)\), onClick: \(\) => navigate\('about'\) \}\);/);
  assert.match(line, /line\.update \? h\('span', \{ class: 'chip chip--accent' \}, t\('reglages\.miseAJour'\)\) : line\.version\.commit \? t\('reglages\.version', \{ version: line\.version\.text \}\) : null/);
  assert.equal(fr['reglages.miseAJour'], 'Mise à jour');
  assert.equal(fr['reglages.version'], 'Version {version}');
  // Lignes courtes : plus aucune phrase sous les lignes des Réglages (téléphone)
  assert.doesNotMatch(inner('generalRows'), /sub:/);
});
