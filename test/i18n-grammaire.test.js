// Langues, étape 3 (20 novembre 2026) : la grammaire des textes, pour que
// l'anglais (étape 4) puisse s'écrire naturellement.
//
// - Pluriels : la règle de chaque langue (Intl.PluralRules ; en français, 0
//   et 1 au singulier, en anglais 1 seulement), jamais une ancienne règle du
//   code recopiée en formes exactes (« =0 », « =1 ») ; une forme exacte
//   seulement pour un vrai cas particulier (« le 1er »).
// - Phrases entières : aucun mot glissé dans une phrase toute faite quand
//   l'anglais l'écrirait autrement (« Modifier l'article », « Photo du
//   souhait » : une phrase par sorte de liste, words.js byKind).
// - Énumérations par Intl.ListFormat (formatList) : « Léa, Marc et Zoé » en
//   français (sans virgule avant « et »), « Léa, Marc, and Zoé » en anglais.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fr from '../public/js/i18n/fr.js';
import { formatList, translate, t } from '../public/js/i18n.js';
import { countItems, progressLabel, byKind, wordKind } from '../public/js/words.js';
import { namesList, newsBadgeLabel, savedNameSub, renameImpactText, renameDoneText } from '../public/js/format.js';
import { repeatSentence } from '../public/js/repeat.js';
import { wishForLabel } from '../public/js/wishes.js';
import { listsLabel, setTranslator } from '../public/js/search.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('formatList : énumération dans la grammaire de chaque langue', () => {
  assert.equal(formatList([]), '');
  assert.equal(formatList(['Léa']), 'Léa');
  assert.equal(formatList(['Léa', 'Marc']), 'Léa et Marc');
  assert.equal(formatList(['Léa', 'Marc', 'Zoé']), 'Léa, Marc et Zoé', 'français : pas de virgule avant « et »');
  assert.equal(formatList(['lundi', 'mardi', 'jeudi'], { locale: 'fr' }), 'lundi, mardi et jeudi');
  // Anglais américain (langue donnée : l'anglais n'est pas encore proposé)
  assert.equal(formatList(['Léa', 'Marc'], { locale: 'en' }), 'Léa and Marc');
  assert.equal(formatList(['Monday', 'Tuesday', 'Thursday'], { locale: 'en' }), 'Monday, Tuesday, and Thursday');
  assert.equal(formatList(['Léa', 'Marc', 'Zoé'], { type: 'disjunction' }), 'Léa, Marc ou Zoé');
  assert.equal(formatList(['Léa', 'Marc', 'Zoé'], { locale: 'en', type: 'disjunction' }), 'Léa, Marc, or Zoé');
  // Des nombres ou des noms : toujours du texte
  assert.equal(formatList(new Set([1, 2])), '1 et 2');
});

test('formatList : utilisé pour les jours, les prénoms et les notifications (plus de « et » assemblé par le code)', () => {
  assert.equal(repeatSentence('week:1,2,4'), 'Chaque lundi, mardi et jeudi');
  assert.equal(repeatSentence('week:1,3'), 'Chaque lundi et mercredi');
  assert.equal(repeatSentence('2week:5'), 'Toutes les 2 semaines, le vendredi');
  assert.equal(namesList(['Guillaume', 'Léa', 'Marie']), 'Guillaume, Léa et Marie');
  assert.equal(namesList(['Guillaume', 'Léa']), 'Guillaume et Léa');
  assert.equal(namesList(['Guillaume']), 'Guillaume');
  assert.equal(namesList([]), '');
  assert.match(read('public/js/repeat.js'), /const andList = \(words, locale = getLocale\(\)\) => formatList\(words, \{ locale \}\);/);
  const notify = read('server/notify.js');
  assert.match(notify, /formatList\(\[\.\.\.shown, translate\(locale, 'alertes\.noms\.autres', \{ count: rest \}\)\], \{ locale \}\)/);
  assert.match(notify, /if \(names\.length <= 3\) return formatList\(names, \{ locale \}\);/);
  // Plus aucun « {debut} et {fin} », « {first} et {second} » dans les dictionnaires
  for (const [key, value] of Object.entries(fr)) {
    for (const text of typeof value === 'object' ? Object.values(value) : [value]) {
      assert.doesNotMatch(text, /\} et \{|\{(debut|fin|first|second|third|last)\}/, `${key} : énumération assemblée`);
    }
  }
});

test('pluriels : la règle de la langue, formes exactes seulement pour un vrai cas particulier', () => {
  const exact = Object.entries(fr).filter(([, v]) => typeof v === 'object' && Object.keys(v).some((form) => form.startsWith('='))).map(([key]) => key).sort();
  // « Le 1er » : un ordinal, pas une règle de grammaire du pluriel
  assert.deepEqual(exact, ['liste.fiche.repete.leJour', 'repetition.pastille.mois', 'repetition.phrase.mois']);
  for (const key of exact) assert.deepEqual(Object.keys(fr[key]), ['=1', 'other'], key);
  // Toutes les autres formes : one et other (cas du français)
  for (const [key, value] of Object.entries(fr)) {
    if (typeof value !== 'object' || exact.includes(key)) continue;
    assert.deepEqual(Object.keys(value), ['one', 'other'], key);
  }
  // Français : 0 au singulier ; anglais : 0 au pluriel (formes françaises
  // en attendant la traduction, règle de la langue demandée)
  assert.equal(translate('fr', 'mots.courses.nombre', { count: 0 }), '0 article');
  assert.equal(translate('en', 'mots.courses.nombre', { count: 0 }), '0 articles');
  assert.equal(translate('en', 'mots.courses.nombre', { count: 1 }), '1 article');
  assert.equal(translate('fr', 'liste.fiche.repete.leJour', { count: 1 }), 'Le 1er');
  assert.equal(translate('fr', 'liste.fiche.repete.leJour', { count: 21 }), 'Le 21');
});

test('pluriels : textes français (0 et 1 au singulier), anciennes tournures corrigées', () => {
  assert.equal(countItems(0, true), '0 article');
  assert.equal(countItems(1, false), '1 élément');
  assert.equal(countItems(4, { type: 'wishes' }), '4 souhaits');
  assert.equal(progressLabel(0, 5, true), '0 article restant sur 5');
  assert.equal(progressLabel(1, 4, false), '1 élément restant sur 4');
  assert.equal(progressLabel(3, 8, { type: 'wishes' }), '3 souhaits restants sur 8');
  assert.equal(t('compte.appareil.reinitialiser.enAttente', { count: 1 }), 'La modification en attente est gardée et sera envoyée.');
  assert.equal(t('compte.appareil.reinitialiser.enAttente', { count: 3 }), 'Les 3 modifications en attente sont gardées et seront envoyées.');
  assert.equal(t('administration.noms.plus', { count: 1 }), 'Afficher plus (1 restant)');
  assert.equal(t('administration.noms.plus', { count: 50 }), 'Afficher plus (50 restants)');
  assert.equal(t('application.deconnexion.texte', { count: 1 }), '1 modification n\'est pas encore envoyée. Si vous vous déconnectez maintenant, elle sera perdue.');
  assert.equal(t('reglages.demandesCompte', { count: 1 }), '1 demande de compte en attente');
  assert.equal(t('liste.fiche.resume.principale', { count: 1 }), 'Tâche principale · 1 sous-tâche');
  assert.equal(newsBadgeLabel('1'), '1 nouveauté');
  assert.equal(newsBadgeLabel('12'), '12 nouveautés');
  assert.equal(newsBadgeLabel('30+'), 'plus de 30 nouveautés');
  setTranslator(t);
  assert.deepEqual([listsLabel(0), listsLabel(1), listsLabel(2)], ['0 liste', '1 liste', '2 listes']);
  // Administration, onglet « Articles » : une phrase entière par nombre
  assert.equal(savedNameSub({ aisle: null, uses: 1, inLists: 1 }), '1 utilisation · 1 article en liste');
  assert.equal(savedNameSub({ aisle: null, uses: 3, inLists: 0 }), '3 utilisations · aucun article en liste');
  assert.equal(renameImpactText({ oldName: 'Lai', newName: 'Lait', merge: false, items: 1, lists: 1 }), '« Lai » deviendra « Lait ». 1 article sera corrigé, dans 1 liste de courses.');
  assert.equal(renameImpactText({ oldName: 'Lai', newName: 'Lait', merge: false, items: 3, lists: 2 }), '« Lai » deviendra « Lait ». 3 articles seront corrigés, dans 2 listes de courses.');
  assert.equal(renameImpactText({ oldName: 'Lai', newName: 'Lait', merge: false, items: 0, lists: 0 }), '« Lai » deviendra « Lait ». Aucun article en liste ne porte ce nom : seules les suggestions changent.');
  assert.equal(renameDoneText({ items: 1, lists: 1 }), '1 article corrigé, dans 1 liste de courses');
  assert.equal(renameDoneText({ items: 4, lists: 2 }), '4 articles corrigés, dans 2 listes de courses');
  // Plus de ternaire du code qui choisit entre deux noms selon le nombre
  assert.doesNotMatch(read('public/js/format.js'), /text === '1' \?|items === 1/);
  assert.doesNotMatch(read('public/js/words.js'), /count === 1 \?|remaining <= 1/);
  assert.doesNotMatch(read('public/js/search.js').split('\n').filter((line) => !line.includes('// technique')).join('\n'), /count > 1 \?/);
});

test('phrases entières : une par sorte de liste, aucun article glissé dans une phrase', () => {
  // Plus de formes « l'article », « cet article », « de l'article »,
  // « un nouvel article » à insérer dans les textes
  for (const [key, value] of Object.entries(fr)) {
    for (const text of typeof value === 'object' ? Object.values(value) : [value]) {
      assert.doesNotMatch(text, /\{(the|this|of|aNew|what)\}/, `${key} : morceau de phrase inséré`);
    }
  }
  for (const key of ['mots.courses.le', 'mots.courses.ce', 'mots.courses.de', 'mots.courses.unNouveau', 'mots.envies.le', 'mots.taches.de', 'liste.pc.pour', 'liste.vide.astuce.debut']) assert.ok(!(key in fr), key);
  // Les phrases, pour chaque sorte de liste (texte français identique à avant)
  const three = (base) => [fr[`${base}.courses`], fr[`${base}.taches`], fr[`${base}.envies`]];
  assert.deepEqual(three('liste.fiche.titre'), ['Modifier l\'article', 'Modifier l\'élément', 'Modifier le souhait']);
  assert.deepEqual(three('liste.ajout.placeholder'), ['Ajouter un article', 'Ajouter un élément', 'Ajouter un souhait']);
  assert.deepEqual(three('liste.detail.lectureSeule'), ['Liste en lecture seule : cet article ne peut pas être modifié.', 'Liste en lecture seule : cet élément ne peut pas être modifié.', 'Liste en lecture seule : ce souhait ne peut pas être modifié.']);
  assert.deepEqual(three('liste.fiche.conflit.supprime'), ['Cet article a été supprimé par une autre personne.', 'Cet élément a été supprimé par une autre personne.', 'Ce souhait a été supprimé par une autre personne.']);
  assert.deepEqual(three('lienpublic.photo.alt'), ['Photo de l\'article {name}', 'Photo de l\'élément {name}', 'Photo du souhait {name}']);
  assert.deepEqual(three('lienpublic.fiche.titre'), ['Détail de l\'article', 'Détail de l\'élément', 'Détail du souhait']);
  // byKind : la phrase de la liste
  const texts = { shopping: 'A', tasks: 'B', wishes: 'C' };
  assert.deepEqual([byKind({ type: 'shopping' }, texts), byKind({ type: 'tasks' }, texts), byKind({ type: 'wishes' }, texts), byKind(wordKind({ type: 'wishes' }), texts)], ['A', 'B', 'C', 'C']);
  // Sous-titre de l'ordinateur : « Envies · pour Léa », sans retoucher un texte
  assert.equal(wishForLabel({ forName: 'Léa' }), 'Pour Léa');
  assert.equal(wishForLabel({ forName: 'Léa' }, { inline: true }), 'pour Léa');
  assert.equal(wishForLabel({ isBeneficiary: true }, { inline: true }), 'pour vous');
  assert.equal(wishForLabel({}, { inline: true }), 'Envies');
  assert.doesNotMatch(read('public/js/screens/list.js'), /\.replace\(\/\^Pour \//);
});
