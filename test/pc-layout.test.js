// Interface ordinateur, étape 1 (design/maquettes/pc-A, disposition A) :
// bascule à 1 024 px, menu de gauche, « Mes listes » et listes. Le
// téléphone ne doit pas changer : les styles ajoutés ne touchent que de
// nouveaux éléments ou ce qui est sous .app--pc. Vérifications sur le code
// (le rendu est vérifié dans Chromium, voir le résumé de l'étape).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Section 16.14 du kit (jusqu'à la section 16.15, navigation du bas du téléphone)
const kit = read('public/css/listo.css');
const section = kit.slice(kit.indexOf('/* 16.14 Interface ordinateur'), kit.indexOf('/* 16.15 Navigation du bas'));
const before = kit.slice(0, kit.indexOf('/* 16.14 Interface ordinateur')) + read('public/css/app.css');

test('kit : section 16.14 identique dans design/ et public/, sans couleur en dur ni partie des maquettes', () => {
  assert.ok(section.length > 1000, 'section 16.14 présente');
  assert.ok(read('design/listo.css').includes(section.trim()), 'même section dans design/listo.css');
  assert.doesNotMatch(section, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'couleurs du kit seulement');
  // Rien des planches de maquettes
  assert.doesNotMatch(section, /\.(is-hover|is-focus|is-selected|pc-yes|pc-no|pc--wide|pc--narrow|desk|shot|stage|schema|cmp|rz)\b/);
  // Aide : noms propres au PC (l'écran d'aide du téléphone garde .help)
  assert.doesNotMatch(section.replace(/\/\*[\s\S]*?\*\//g, ''), /(^|[\s,}])\.(help|toc|prose)(?![\w-])/m);
  assert.match(section, /\.pc-help \{/);
  assert.match(section, /\.pc-toc \{/);
  assert.match(section, /\.pc-prose \{/);
});

test('kit : le téléphone n\'est pas touché (classes existantes seulement sous .app--pc)', () => {
  // Classes déjà définies avant la section 16.14
  const existing = new Set([...before.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((m) => m[1]));
  // Règles de la section (hors commentaires), sélecteur par sélecteur
  const rules = section.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  for (const match of rules.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const head = match[1].trim();
    if (head.startsWith('@media')) continue;
    selectors.push(...head.replace(/^@media[^{]*\{/, '').split(','));
  }
  assert.ok(selectors.length > 80);
  for (const raw of selectors) {
    const selector = raw.trim();
    if (selector.startsWith('.app--pc')) continue;
    // L'élément stylé, ou un de ses parents dans le sélecteur, porte une
    // classe nouvelle (pc-…, keycap, item__actions…) : rien d'existant sur
    // le téléphone n'est concerné
    const classes = [...selector.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((m) => m[1]);
    assert.ok(classes.some((c) => !existing.has(c)), `« ${selector} » ne doit toucher qu'un élément nouveau, ou commencer par .app--pc`);
  }
});

test('bascule : app--pc à partir de 1 024 px, même écran redessiné, menu gardé d\'un écran à l\'autre', () => {
  const app = read('public/js/app.js');
  assert.match(app, /const desktop = window\.matchMedia\('\(min-width: 1024px\)'\);/);
  assert.match(app, /const markLayout = \(\) => root\.classList\.toggle\('app--pc', isDesktop\(\)\);/);
  assert.match(app, /desktop\.addEventListener\('change', \(\) => \{[^}]*closeOverlays\(\);\s*markLayout\(\);\s*show\(app\.route\);\s*\}\);/);
  // « Aller au contenu » en premier (lot 3 clavier, 15 novembre 2026), puis le menu et l'écran
  assert.match(app, /replace\(root, h\('div', \{ class: 'pc pc--a' \}, skipLink\(col\), pcSideFor\(app\.route\), h\('main', \{ class: 'pc-main' \}, col\)\)\);/);
  // Menu refait si le compte change (autre compte, nom, rôle), retiré hors connexion
  assert.match(app, /const owner = JSON\.stringify\(\[app\.user\?\.id, app\.user\?\.displayName, app\.user\?\.role\]\);/);
  assert.match(app, /dropPcSide\(\);\s*replace\(root, h\('div', \{ class: 'shell' \}/);
  // Plus de saut automatique vers la liste la plus récente sur ordinateur
  assert.doesNotMatch(read('public/js/screens/lists.js'), /recent\[0\]/);
  // Nouveau fichier gardé pour l'ouverture sans réseau
  assert.match(read('public/sw.js'), /'\/js\/screens\/pc-side\.js',/);
});

test('menu de gauche : liens réels, liste ouverte repérée, Admin seulement comme rôle de compte, aucun focus forcé', () => {
  const side = read('public/js/screens/pc-side.js');
  assert.match(side, /href: pathFor\('list', \{ id: list\.id \}\),\s*'aria-current': current \? 'page' : null,/);
  assert.match(side, /user\.role === 'admin' \? h\('span', \{ class: 'pc-user__role' \}, t\('navigation\.role\.admin'\)\) : null/);
  assert.equal(fr['navigation.role.admin'], 'Admin');
  assert.match(side, /'aria-label': t\('navigation\.recherche\.libelle'\)/);
  assert.equal(fr['navigation.recherche.libelle'], 'Rechercher une liste');
  // Compteur lu « 3 articles restants sur 8 », pas seulement « 3/8 »
  assert.match(side, /h\('span', \{ class: 'pc-nav__count', role: 'img', 'aria-label': text, title: text \}/);
  assert.doesNotMatch(side, /\.focus\(|innerHTML|\.style\b|style:/);
});

test('liste : actions de ligne seulement si modifiable ; « Réserver » seulement avec les réservations (jamais au bénéficiaire)', () => {
  const list = read('public/js/screens/list.js');
  // Ligne en lecture seule : ni crayon ni corbeille (seulement « Réserver » possible)
  assert.match(list, /\.\.\.itemContent\(item, meta, false\), extra, pc \? reserveButton\(item\) : null\), item, meta\);/);
  assert.match(list, /const slide = h\('div', \{ class: 'swipe__slide' \}, \.\.\.itemContent\(item, meta\), extra, pc \? rowActions\(item\) : null\);/);
  // Le serveur n'envoie jamais les réservations au bénéficiaire : sans elles, aucun bouton
  assert.match(list, /if \(!view\?\.reservations \|\| item\.checked \|\| view\.reservations\.get\(item\.id\)\?\.participants\.length\) return null;/);
  // Corbeille au survol : même suppression annulable que le glissement
  assert.match(list, /'aria-label': t\('liste\.supprimer\.nom', \{ name: item\.name \}\), 'aria-keyshortcuts': 'Delete', 'data-action': 'delete', 'data-pc-tip': t\('liste\.pc\.supprimer\.astuce'\), onClick: \(\) => deleteWithUndo\(item\) \}/);
  assert.equal(fr['liste.supprimer.nom'], 'Supprimer {name}');
  assert.equal(fr['liste.pc.supprimer.astuce'], 'Supprimer · Suppr');
  // « Partager » (propriétaire) ou « Personnes » (les autres) : le tiroir du partage
  assert.match(list, /list\.isOwner \? t\('liste\.pc\.partager'\) : t\('liste\.pc\.personnes'\), people\)\);/);
  assert.equal(fr['liste.pc.partager'], 'Partager');
  assert.equal(fr['liste.pc.personnes'], 'Personnes');
  // Bandeau du bénéficiaire : il ne voit jamais les réservations
  assert.match(list, /list\.isBeneficiary\s*\? \[icon\('eye-off', 'icon--sm'\), h\('span', \{\}, t\('liste\.envies\.beneficiaire'\)\)\]/);
  assert.equal(fr['liste.envies.beneficiaire'], 'Vous ne voyez jamais les réservations : la surprise reste entière.');
  assert.doesNotMatch(list, /innerHTML/);
});

test('liste : crayon et corbeille ont toujours leur place (le texte ne change pas de ligne au survol), l\'un au-dessus de l\'autre', () => {
  // Cachés par visibility (place gardée), jamais par display: none
  assert.match(kit, /^\.item__actions \{ display: flex; visibility: hidden; flex-direction: column;/m);
  // Deux boutons de 21 px : tiennent dans une ligne de 44 px (bordure de 1 px comprise)
  assert.match(kit, /^\.item__actions \.icon-btn \{ width: 21px; height: 21px;/m);
  // Couleurs au survol : crayon bleu, corbeille rouge
  assert.match(kit, /^\.item__actions \[data-action="edit"\]:hover \{ background: var\(--color-accent-soft\); color: var\(--color-accent-ink\); \}$/m);
  assert.match(kit, /^\.item__actions \[data-action="delete"\]:hover \{ background: var\(--color-danger-soft\); color: var\(--color-danger-ink\); \}$/m);
  // Écran tactile : côte à côte, 44 px, toujours visibles
  assert.match(kit, /@media \(pointer: coarse\) \{\n  \.item__actions \{ visibility: visible; flex-direction: row; gap: 2px; \}\n  \.item__actions \.icon-btn \{ width: 44px; height: 44px; \}/);
  assert.match(kit, /^\.item:hover \.item__actions, \.item:focus-within \.item__actions \{ visibility: visible; \}$/m);
  assert.doesNotMatch(kit, /\.item__actions \{[^}]*display: none/);
  // Info-bulles à gauche, dans la ligne (dessous, la ligne suivante les recouvrait)
  assert.match(kit, /^  \.app--pc \.item__actions \[data-pc-tip\]::after \{ top: auto; right: calc\(100% \+ 6px\); \}$/m);
  assert.match(kit, /^  \.app--pc \.item__actions \[data-action="edit"\]::after \{ top: 0; \}$/m);
  assert.match(kit, /^  \.app--pc \.item__actions \[data-action="delete"\]::after \{ bottom: 0; \}$/m);
  const tips = (css) => css.match(/^  \.app--pc \.item__actions[^\n]*$/gm);
  assert.deepEqual(tips(read('design/listo.css')), tips(kit));
  // Kit de design et copie de l'application identiques sur ce point
  const block = (css) => css.slice(css.indexOf('/* Actions d\'une ligne'), css.indexOf('/* Souhait libre : bouton'));
  assert.ok(block(kit).length > 200);
  assert.equal(block(read('design/listo.css')), block(kit));
});

test('recherche ordinateur : champ toujours visible, Échap vide puis quitte, jamais de curseur mis tout seul', () => {
  const row = read('public/js/search-row.js');
  assert.match(row, /if \(toggled\) close\(\);\s*else if \(input\.value !== ''\) clear\(\);\s*else releaseFocus\(\);/);
  // Ordinateur : pas de rangée cachée, le champ est posé dans l'en-tête
  assert.match(row, /const bar = toggled \? h\('div', \{ class: 'searchbar', id: barId, hidden: true \}, field\) : null;/);
  // Le seul .focus() : téléphone, juste après la loupe (open() n'existe que si toggled)
  assert.equal(row.match(/\.focus\(/g).length, 1);
  assert.match(row, /function open\(\) \{\s*if \(!toggled \|\| isOpen\) return;[\s\S]*?input\.focus\(\);\s*\}/);
  assert.match(read('public/js/screens/list.js'), /docked: pc,/);
  assert.match(read('public/js/screens/lists.js'), /createSearchRow\(content, \{ label: t\('listes\.recherche\.libelle'\), onChange: \(\) => draw\(\), docked: true \}\);/);
  assert.equal(fr['listes.recherche.libelle'], 'Rechercher une liste');
});

test('icônes de l\'interface ordinateur : dans les deux sprites, sans doublon', () => {
  const app = read('public/index.html');
  const kitSprite = read('design/icons-sprite.html');
  for (const name of ['help', 'users', 'user', 'flag', 'ext-link', 'plug', 'keyboard', 'bookmark', 'tag', 'menu-lines', 'undo', 'calendar', 'book']) {
    const symbol = new RegExp(`<symbol id="i-${name}" [^\\n]*?</symbol>`);
    const inApp = app.match(symbol)?.[0];
    assert.ok(inApp, `i-${name} dans public/index.html`);
    assert.equal(kitSprite.match(symbol)?.[0], inApp, `i-${name} identique dans design/icons-sprite.html`);
    assert.equal(app.split(`id="i-${name}"`).length, 2, `i-${name} une seule fois`);
  }
});

// --- Étape 2 : tiroir, fenêtres centrées, partage ---

test('fenêtres de l\'ordinateur : tiroir ou fenêtre centrée, role dialog et aria-modal, titre relié, reste de la page inerte, Échap à la fenêtre du dessus', () => {
  const ui = read('public/js/ui.js');
  // Posées sur toute l'application, et le reste inerte tant qu'une fenêtre est ouverte
  assert.match(ui, /const target = pc && onPc\(\) \? pcLayer : host;/);
  assert.match(ui, /if \(onLayer\) \{\s*pcOpen\+\+;\s*setPcInert\(true\);\s*\}/);
  assert.match(ui, /if \(!pcOpen\) setPcInert\(false\);/);
  assert.match(ui, /if \(on\) rest\.setAttribute\('inert', ''\);\s*else rest\.removeAttribute\('inert'\);/);
  assert.match(ui, /panel\.setAttribute\('role', role\);\s*panel\.setAttribute\('aria-modal', 'true'\);/);
  // Tiroir (fiche, partage) ou fenêtre centrée (confirmations, choix, création), titre relié
  assert.match(ui, /class: `pc-panel \$\{pc === 'drawer' \? 'pc-drawer' : `pc-modal\$\{size \? ` pc-modal--\$\{size\}` : ''\}`\}`,\s*'aria-labelledby': titleId,/);
  assert.match(ui, /class: pc \? 'pc-panel pc-modal pc-modal--sm' : 'dialog', 'aria-labelledby': titleId, 'aria-describedby': textId/);
  // Seule la fenêtre du dessus répond à Échap ; focus rendu à l'élément d'origine
  assert.match(ui, /if \(event\.key === 'Escape' && onLayer && target\.lastElementChild !== panel\) return;/);
  assert.match(ui, /if \(opener\?\.isConnected && !isTextField\(opener\)\) opener\.focus\(\);/);
  // Passage sous 1 024 px : fenêtres refermées avant de redessiner
  assert.match(read('public/js/app.js'), /closeOverlays\(\);\s*markLayout\(\);\s*show\(app\.route\);/);
  // Le téléphone garde ses feuilles : rien de tout cela sans .app--pc
  assert.match(ui, /export const onPc = \(\) => Boolean\(pcLayer\?\.classList\.contains\('app--pc'\)\);/);
  assert.match(ui, /if \(onPc\(\)\) \{\s*return overlay\(/);
});

test('fiche d\'un article (ordinateur) : tiroir, deux colonnes, pied Supprimer / Annuler / Enregistrer, confirmation avant d\'abandonner des changements', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /pc: 'drawer',\s*footer: pc \? \[remove, h\('span', \{ class: 'grow' \}\), h\('button', \{ class: 'btn btn--secondary', type: 'button', onClick: \(\) => sheet\.close\(\) \}, t\('liste\.fiche\.annuler'\)\), save\] : null,/);
  // « Annuler » fermer sans enregistrer (anglais : Cancel), distinct de
  // l'annulation d'une action (anglais : Undo)
  assert.equal(fr['liste.fiche.annuler'], 'Annuler');
  assert.equal(en['liste.fiche.annuler'], 'Cancel');
  assert.equal(en['liste.annuler'], 'Undo');
  assert.match(list, /beforeClose: pc \? async \(\) => !dirty\(\) \|\| confirmDialog\(\{\s*title: t\('liste\.fiche\.abandonner\.question'\),/);
  assert.equal(fr['liste.fiche.abandonner.question'], 'Abandonner les modifications ?');
  assert.match(list, /focusCancel: true,\s*\}\) : null,/);
  assert.match(list, /const dirtyNote = h\('p', \{ class: 'pc-meta' \}, t\('liste\.fiche\.nonEnregistre'\)\);/);
  assert.equal(fr['liste.fiche.nonEnregistre'], 'Modifications non enregistrées');
  // Enregistrer et supprimer ferment sans demander
  assert.match(list, /await actions\.updateItem\(item, changes\);\s*sheet\.forceClose\(\);/);
  // Fiche à consulter (lecture seule) : tiroir aussi, sans bouton qui écrit
  assert.match(list, /pc: 'drawer', \/\/ ordinateur : tiroir à droite, comme la fiche à modifier/);
});

test('partage (ordinateur) : le propriétaire gère personnes et lien ; les autres voient les personnes, sans gestion ni lien public', () => {
  const panel = read('public/js/screens/share-panel.js');
  // Gestion (choix du droit, retrait, ajout, lien) : propriétaire seulement
  assert.match(panel, /const owner = Boolean\(start\.isOwner\);/);
  assert.match(panel, /else if \(!owner\) right = h\('span', \{ class: 'pc-meta' \}, levelLabel\(person\.access\)\);/);
  assert.match(panel, /if \(owner\) \{\s*const candidates/);
  assert.match(panel, /const link = owner \? linkPart\(start, \(\) => panel\.close\(\)\) : null;/);
  assert.match(panel, /title: owner \? t\('partage\.panneau\.titre'\) : t\('partage\.panneau\.personnes'\),/);
  assert.equal(fr['partage.panneau.titre'], 'Partager la liste');
  assert.equal(fr['partage.panneau.personnes'], 'Personnes');
  // Destinataire d'une liste d'envies : « Peut modifier », sans choix
  assert.match(panel, /else if \(beneficiary\(list, person\)\) right = h\('span', \{ class: 'chip' \}, t\('partage\.panneau\.destinataire'\)\);/);
  assert.equal(fr['partage.panneau.destinataire'], 'Destinataire · Peut modifier');
  // Même route que le formulaire, en ligne seulement ; jamais d'e-mail
  assert.match(panel, /await put\(`\/api\/lists\/\$\{encodeURIComponent\(listId\)\}\/members`, \{/);
  assert.doesNotMatch(panel.replace(/\/\/.*$/gm, ''), /mail|innerHTML|\.style\b/i);
  // Le lien public : le même contenu que la feuille du téléphone
  assert.match(read('public/js/screens/share.js'), /export function linkPart\(list, close\) \{/);
  assert.match(read('public/sw.js'), /'\/js\/screens\/share-panel\.js',/);
});

test('« Nouvelle liste » et « Modifier la liste » (ordinateur) : fenêtre centrée, adresse gardée, focus sur la fenêtre (jamais sur le champ)', () => {
  const form = read('public/js/screens/list-form.js');
  assert.match(form, /export function openListFormPanel\(listId\) \{/);
  assert.match(form, /pc: 'modal',\s*size: 'lg',\s*history: false,/);
  assert.match(form, /if \(location\.hash === hash\) goBack\(/);
  const app = read('public/js/app.js');
  assert.match(app, /case 'newList':\s*if \(isDesktop\(\)\) \{\s*if \(!mountedOnPc\) mount\(\(onLeave\) => renderLists\(onLeave\)\);\s*openListFormPanel\(null\);/);
  assert.match(read('public/js/router.js'), /export function openOverlay\(close, \{ push = true, back = null \} = \{\}\) \{/);
  // Aucun data-initial-focus dans la fenêtre : elle prend le focus sur elle-même
  assert.doesNotMatch(form.slice(form.indexOf('export function openListFormPanel'), form.indexOf('export function renderListForm')), /data-initial-focus|\.focus\(/);
});

// --- Étape 4 : Réglages, aide, états, guide ---

test('aide (ordinateur) : sommaire fixe à gauche (chapitre en cours repéré), recherche dans l\'en-tête, pas de boutons flottants ; téléphone inchangé', () => {
  const help = read('public/js/screens/help.js');
  assert.match(help, /const pc = onPc\(\);/);
  assert.match(help, /const opened = new Set\(pc \? GUIDE\.map\(\(c\) => c\.id\) : \[GUIDE\[0\]\.id\]\);/);
  assert.match(help, /if \(id === chapter\) link\.setAttribute\('aria-current', 'true'\);\s*else link\.removeAttribute\('aria-current'\);/);
  // Ordinateur : l'écran est rendu sans la pile de boutons flottants
  const pcBranch = help.slice(help.indexOf('if (pc) {\n    searchRow.hidden = false;'), help.indexOf("const screen = h('div', { class: 'screen help-screen' },"));
  assert.ok(pcBranch.length > 0);
  assert.doesNotMatch(pcBranch, /help-fabs/);
  assert.match(pcBranch, /h\('header', \{ class: 'pc-head' \}/);
  // Téléphone : les trois boutons flottants restent
  assert.match(help, /h\('div', \{ class: 'help-fabs' \}, topButton, searchButton, tocButton\)\);/);
  // Échap : sur ordinateur la recherche reste affichée
  assert.match(help, /else if \(pc\) releaseFocus\(\); \/\/ ordinateur : la recherche reste affichée/);
  assert.match(read('public/js/app.js'), /case 'help': mount\(\(\) => renderHelp\(\), \{ wide: true \}\); break;/);
});

test('Réglages (ordinateur) : même rangement que sur le téléphone ; carte « Clavier » (raccourcis) ; thème et Assistants IA dans Mon compte seulement', () => {
  const settings = read('public/js/screens/settings.js');
  assert.match(settings, /if \(onPc\(\)\) return renderSettingsPc\(\);/);
  const pc = settings.slice(settings.indexOf('function renderSettingsPc'), settings.indexOf('export function keysRow'));
  const code = settings.replace(/\/\/.*$/gm, ''); // sans les commentaires
  // Ordre des cartes (rangement allégé du 11 novembre 2026) : Compte,
  // Général (« Raccourcis à une touche » d'abord, puis les lignes du
  // téléphone), Informations (Aide, Raccourcis clavier, À propos)
  const order = [...pc.matchAll(/section\(t\('([^']+)'\)/g)].map((m) => fr[m[1]]);
  assert.deepEqual(order, ['Compte', 'Général', 'Informations']);
  assert.match(pc, /section\(t\('reglages\.general'\), h\('div', \{ class: 'group' \}, keysRow\(\), generalRows\(isAdmin\)\)\),/);
  assert.match(pc, /section\(t\('reglages\.informations'\), h\('div', \{ class: 'group' \},\s*helpRow\(\),\s*row\(\{ iconName: 'keyboard', title: t\('reglages\.pc\.raccourcis'\)/);
  assert.equal(fr['reglages.pc.raccourcis'], 'Raccourcis clavier');
  assert.match(pc, /aboutRow\(isAdmin\)/);
  // Mêmes lignes que le téléphone (une seule définition)
  const phone = code.slice(code.indexOf('export function renderSettings'), code.indexOf('function generalRows'));
  assert.match(phone, /h\('div', \{ class: 'group' \}, generalRows\(isAdmin\)\),/);
  assert.match(phone, /h\('div', \{ class: 'group' \}, helpRow\(\), aboutRow\(isAdmin\)\)/);
  // (pastille : demandes de compte en attente, connexion avec Authelia)
  assert.equal(fr['reglages.administration'], 'Administration');
  assert.match(settings, /isAdmin \? row\(\{ iconName: 'shield', title: t\('reglages\.administration'\), end: app\.user\.accountRequests \? \[requestsBadge\(app\.user\.accountRequests\), icon\('chev-r'\)\] : undefined, onClick: \(\) => navigate\('admin', \{ tab: 'comptes' \}\) \}\) : null,/);
  assert.doesNotMatch(settings, /Guide d\\'utilisation|Visible seulement pour les comptes Admin|pc-settings__hint/);
  // Plus de doublon : ni thème, ni Assistants IA (« Connexions Claude ») dans les Réglages (téléphone et ordinateur)
  assert.doesNotMatch(code, /Connexions Claude|Assistants IA|compte\.claude|claudeConnections|segmented|applyTheme|'Thème'|Apparence/);
  // Ils restent dans « Mon compte », le même écran sur téléphone et sur ordinateur
  const account = read('public/js/screens/account.js');
  assert.match(account, /h\('h2', \{ class: 'section-title' \}, t\('compte\.apparence'\)\),/);
  assert.match(account, /user\.claudeUrl \? \[\s*h\('h2', \{ class: 'section-title' \}, t\('compte\.claude'\)\),/);
  // Seule différence (décision du 10 novembre 2026) : « Cet appareil » sur ordinateur
  // Deux différences seulement : « Cet appareil », et la confirmation de
  // « Se déconnecter », sur le téléphone seulement (décision du 11 novembre 2026)
  assert.equal((account.match(/onPc\(\)/g) ?? []).length, 2);
  assert.match(account, /if \(!onPc\(\) && !pendingCount\(\)\) \{/);
  assert.match(account, /return onPc\(\)\s*\? \{ section: t\('compte\.appareil\.pc'\), reset: t\('compte\.appareil\.pc\.reinitialiser'\), question: t\('compte\.appareil\.pc\.reinitialiser\.question'\), text: t\('compte\.appareil\.pc\.reinitialiser\.texte'\) \}\s*: \{ section: t\('compte\.appareil\.telephone'\)/);
  // Téléphone : plus de section « Clavier » (rien de nouveau)
  assert.doesNotMatch(code.slice(code.indexOf('export function renderSettings'), code.indexOf('function renderSettingsPc')), /keysRow|Clavier/);
});

test('états (ordinateur) : bandeau « Hors ligne », « Réessayer » après une erreur, astuce dans une liste vide ; rien de cela sur téléphone', () => {
  const ui = read('public/js/ui.js');
  assert.match(ui, /export function offlineBanner\(\) \{/);
  assert.match(ui, /banner\.hidden = state !== 'off';/);
  assert.match(read('public/js/app.js'), /toast\(errorMessage\(error\), onPc\(\) \? \{ action: t\('application\.reessayer'\), onAction: \(\) => refreshData\(\{ full: true \}\) \} : \{\}\);/);
  assert.equal(fr['application.reessayer'], 'Réessayer');
  const list = read('public/js/screens/list.js');
  // Une phrase entière : la touche prend la place de {key}
  assert.match(list, /pc && canEdit && singleKeysOn\(\) \? h\('p', \{ class: 'empty__text' \}, \.\.\.t\('liste\.vide\.astuce'\)\.split\('\{key\}'\)\.flatMap\(\(part, i\) => \(i \? \[h\('kbd', \{ class: 'keycap' \}, 'A'\), part\] : \[part\]\)\)\)/);
  assert.equal(fr['liste.vide.astuce'], 'Astuce : appuyez sur {key} pour aller au champ d\'ajout.');
  assert.deepEqual(fr['liste.vide.astuce'].split('{key}'), ['Astuce : appuyez sur ', ' pour aller au champ d\'ajout.'], 'mêmes textes qu\'avant autour de la touche');
  // Le bandeau n'est posé que dans les écrans de l'ordinateur
  const phone = list.slice(list.lastIndexOf("  return h('div', { class: 'screen' },"));
  assert.doesNotMatch(phone, /offlineBanner/);
});

test('guide : section « Sur ordinateur » dans « Au quotidien » (disposition, panneaux, raccourcis, désactivation, Ctrl+Z)', async () => {
  const { GUIDE } = await import('../public/js/help-content.js');
  const quotidien = GUIDE.find((c) => c.id === 'quotidien');
  const section = quotidien.sections.find((s) => s.id === 'ordinateur');
  assert.ok(section);
  assert.equal(section.title, 'Sur ordinateur');
  const text = JSON.stringify(section.blocks);
  for (const words of ['1 024 pixels', 'panneau à droite', 'Raccourcis à une touche', 'Ctrl+Z', 'Modifié entre-temps', 'Ne s\'annulent pas', 'aucun raccourci ne réserve']) assert.ok(text.includes(words), words);
  const keys = section.blocks.find((b) => b.table).table.rows.map((r) => r[0]);
  assert.deepEqual(keys, ['?', 'N', '/', ',', 'Échap', '[ et ]', 'P', 'A', '↓ et ↑', 'Espace', 'Entrée', 'E', 'Suppr', 'Ctrl+Z', 'Ctrl+Entrée', 'S']);
  // Toujours 9 chapitres, dans l'ordre demandé (Notifications ajouté le 10 novembre 2026)
  assert.deepEqual(GUIDE.map((c) => c.id), ['presentation', 'possibilites', 'installation', 'comptes', 'quotidien', 'notifications', 'roles', 'claude', 'faq']);
});

test('photo agrandie : la zone de la photo a une hauteur définie, la photo tient dans la fenêtre sur un écran large (18 novembre 2026)', () => {
  const app = read('public/css/app.css');
  assert.match(app, /^\.lightbox__stage \{ grid-template-rows: minmax\(0, 1fr\); grid-template-columns: minmax\(0, 1fr\); \}$/m);
  // La règle de la photo elle-même (kit) reste : pas plus haute que la zone, sans déformation
  assert.match(read('public/css/listo.css'), /^\.lightbox__img \{[^}]*max-height: 100%;[^}]*object-fit: contain; \}$/m);
});
