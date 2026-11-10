// Notifications push, côté téléphone : service worker (affichage toujours,
// adresse de Listo seulement, clic), demande d'autorisation seulement après
// un appui, écran Réglages › Notifications.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ORIGIN = 'https://listo.exemple.fr';

// Charge public/sw.js dans un bac à sable et rend ses écouteurs
function loadServiceWorker() {
  const listeners = {};
  const shown = [];
  const windows = [];
  const opened = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url) => { opened.push(url); },
      claim: async () => {},
    },
    skipWaiting: async () => {},
  };
  vm.runInNewContext(read('public/sw.js'), { self, URL, caches: {}, fetch: () => {}, Response, Request, setTimeout, console });
  // Déclenche un événement et attend ce qu'il a confié à waitUntil
  const fire = async (type, event) => {
    let work = null;
    listeners[type]({ ...event, waitUntil: (promise) => { work = promise; } });
    await work;
  };
  return { listeners, shown, windows, opened, fire };
}

const pushEvent = (payload) => ({ data: { json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload) } });

test('service worker : le message « Declarative Web Push » est affiché tel quel (titre, texte, tag, adresse)', async () => {
  const sw = loadServiceWorker();
  await sw.fire('push', pushEvent({ web_push: 8030, notification: { title: 'Léa a modifié « Courses »', body: '3 changements', tag: 'liste-1', navigate: `${ORIGIN}/#/listes/1`, lang: 'fr-FR' } }));
  assert.equal(sw.shown.length, 1);
  assert.equal(sw.shown[0].title, 'Léa a modifié « Courses »');
  assert.equal(sw.shown[0].options.body, '3 changements');
  assert.equal(sw.shown[0].options.tag, 'liste-1');
  assert.equal(sw.shown[0].options.data.url, `${ORIGIN}/#/listes/1`);
});

test('service worker : une notification TOUJOURS affichée (message illisible, vide ou d\'un autre format) ; jamais une adresse d\'un autre site', async () => {
  const sw = loadServiceWorker();
  await sw.fire('push', { data: { json: () => { throw new Error('pas du JSON'); } } });
  await sw.fire('push', { data: null });
  await sw.fire('push', pushEvent({ title: 'autre format' }));
  await sw.fire('push', pushEvent({ web_push: 8030, notification: { title: 'Piège', navigate: 'https://autre-site.example/' } }));
  await sw.fire('push', pushEvent({ web_push: 8030, notification: { title: 'Script', navigate: 'javascript:alert(1)' } }));
  assert.equal(sw.shown.length, 5, 'une notification par message');
  assert.deepEqual(sw.shown.slice(0, 3).map((n) => n.title), ['Listo', 'Listo', 'Listo']);
  for (const n of sw.shown) assert.ok(n.options.data.url.startsWith(`${ORIGIN}/`), n.options.data.url);
});

test('service worker : toucher la notification ouvre Listo sur le bon écran, ou y fait passer la fenêtre déjà ouverte', async () => {
  const sw = loadServiceWorker();
  let closed = false;
  const notification = { data: { url: `${ORIGIN}/#/listes/abc` }, close: () => { closed = true; } };
  await sw.fire('notificationclick', { notification });
  assert.ok(closed);
  assert.deepEqual(sw.opened, [`${ORIGIN}/#/listes/abc`]);
  // Fenêtre de Listo déjà ouverte : message (sans recharger) et premier plan
  const messages = [];
  let focused = false;
  sw.windows.push({ url: `${ORIGIN}/#/reglages`, postMessage: (m) => messages.push(m), focus: async () => { focused = true; } });
  await sw.fire('notificationclick', { notification: { data: { url: `${ORIGIN}/#/listes/abc` }, close: () => {} } });
  assert.equal(JSON.stringify(messages), JSON.stringify([{ type: 'listo-open', hash: '#/listes/abc' }]));
  assert.ok(focused);
  assert.equal(sw.opened.length, 1, 'pas de nouvelle fenêtre');
  // L'application n'accepte qu'une adresse d'écran de Listo
  assert.match(read('public/js/app.js'), /event\.data\?\.type === 'listo-open' \? event\.data\.hash : null;\s*if \(typeof hash === 'string' && \/\^#\\\/\[\\w\\-\/%\]\*\$\/\.test\(hash\)\) location\.hash = hash;/);
});

test('autorisation : demandée seulement par enablePush, appelé seulement par l\'appui sur l\'interrupteur ; jamais au chargement', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (rel.endsWith('.js')) files.push(rel);
    }
  };
  walk('public');
  const askers = files.filter((file) => /requestPermission\(/.test(read(file)));
  assert.deepEqual(askers, ['public/js/push.js']);
  const push = read('public/js/push.js');
  assert.equal(push.match(/requestPermission\(/g).length, 1);
  assert.match(push, /export async function enablePush\(user, publicKey\) \{\s*const permission = await Notification\.requestPermission\(\);/);
  // enablePush n'est appelé que dans l'écouteur « click » de l'interrupteur
  const users = files.filter((file) => file !== 'public/js/push.js' && /enablePush\(/.test(read(file)));
  assert.deepEqual(users, ['public/js/screens/notifications.js']);
  const screen = read('public/js/screens/notifications.js');
  assert.match(screen, /toggle\.addEventListener\('click', async \(\) => \{[\s\S]*?const state = await enablePush\(app\.user, current\.publicKey\);/);
  // Au démarrage : rien si l'autorisation n'est pas déjà accordée, ni pour un autre compte
  assert.match(push, /if \(!user\?\.push \|\| !browserSupportsPush\(\) \|\| Notification\.permission !== 'granted'\) return;\s*if \(readOwner\(\) !== String\(user\.id\)\) return;/);
  // Chaque message affiche une notification (exigé par Chrome et Safari)
  assert.match(push, /userVisibleOnly: true/);
});

test('écran Notifications : états expliqués en clair, interrupteur accessible, notification test, ligne des Réglages', () => {
  const screen = read('public/js/screens/notifications.js');
  assert.match(screen, /'Sur iPhone : ajoutez d\\'abord Listo à l\\'écran d\\'accueil, puis ouvrez-le depuis son icône\.'/);
  for (const state of ['server-off', 'unsupported', 'ios-install', 'denied', 'offline', 'on']) assert.match(screen, new RegExp(`'?${state}'?: \\[`));
  assert.match(screen, /class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', disabled: true,\s*'aria-labelledby': 'notif-appareil-titre', 'aria-describedby': 'notif-appareil-aide',/);
  assert.match(screen, /'Envoyer une notification test'/);
  assert.match(screen, /role: 'status'/);
  assert.doesNotMatch(screen, /innerHTML|\.focus\(/);
  const settings = read('public/js/screens/settings.js');
  assert.equal(settings.match(/notificationsRow\(\)/g).length, 3, 'téléphone, ordinateur, définition');
  assert.match(read('public/js/router.js'), /\{ name: 'notifications', path: '\/reglages\/notifications' \}/);
  const sw = read('public/sw.js');
  assert.match(sw, /'\/js\/push\.js',/);
  assert.match(sw, /'\/js\/screens\/notifications\.js',/);
  // Icône cloche : même tracé dans le kit et dans l'application
  const bell = (source) => source.match(/<symbol id="i-bell"[^\n]*<\/symbol>/)?.[0];
  assert.ok(bell(read('public/index.html')));
  assert.equal(bell(read('public/index.html')), bell(read('design/icons-sprite.html')));
});

test('étape 2 : réglages du compte (Modifications des autres, Envies, Partage, détail) et « Silencer cette liste » dans le menu', () => {
  const screen = read('public/js/screens/notifications.js');
  assert.match(screen, /\['changes', 'Modifications des autres', /);
  assert.match(screen, /\['wishes', 'Envies', /);
  assert.match(screen, /\['sharing', 'Partage', /);
  assert.match(screen, /\['detail', 'Afficher le détail dans la notification', /);
  assert.match(screen, /\['due', 'Échéances', 'Chaque matin vers 8 h : les tâches à faire aujourd\\'hui et celles en retard\.'\],/);
  assert.match(screen, /'Ces réglages valent pour tous vos appareils\.'/);
  // Interrupteurs accessibles ; inactifs hors ligne ou avant la lecture du serveur
  assert.match(screen, /class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', disabled: true,\s*'aria-labelledby': `notif-\$\{key\}-titre`, 'aria-describedby': `notif-\$\{key\}-aide`,/);
  assert.match(screen, /toggle\.disabled = !settings \|\| !navigator\.onLine;/);
  // Menu ⋮ : seulement si la fonction est activée sur le serveur
  const menu = read('public/js/screens/list-actions.js');
  assert.match(menu, /function pushMuteAction\(list\) \{\s*if \(!app\.user\?\.push\) return null;/);
  assert.match(menu, /label: 'Silencer cette liste'/);
  assert.match(menu, /label: 'Ne plus silencer cette liste'/);
  assert.match(read('public/sw.js'), /const VERSION = `v(7[6-9]|[89]\d)-/);
});
