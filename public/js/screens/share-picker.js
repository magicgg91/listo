// Choix des personnes d'un partage (feuille « Partager avec des
// personnes », décision du 24 novembre 2026) : le même choix pour une liste
// et pour une note. Repris tel quel de l'ancienne fenêtre « Partager avec »
// du formulaire de liste (le style préféré du propriétaire) : une ligne par
// personne, case à cocher, pastille, prénom, et au bout de la ligne son droit
// (accessChoice : « Modifier » ou « Lire »), visible seulement si elle est
// cochée (la place reste réservée).
//
// Moi d'abord (propriétaire : cochée, verrouillée), puis les autres comptes
// de mon annuaire (server/directory.js) ; une personne déjà présente mais
// désactivée reste affichée (et peut être retirée). Une personne déjà
// présente que mon annuaire ne montre pas (un invité, pour la famille :
// docs/cadrage-comptes.md, 5.3) reste affichée comme les autres, sans
// mention. L'Admin voit aussi les invités, avec « Invité · discret » sous
// leur prénom (l'œil barré ET les mots). Une personne ajoutée commence en « Lecture seule »
// (« Lire ») ; une personne déjà présente garde son droit. Le destinataire
// d'une liste d'envies, s'il est membre, est coché et verrouillé
// (« Destinataire · Peut modifier ») : jamais retiré, toujours « Peut
// modifier » (le serveur l'impose aussi). S'il a quitté la liste, il peut
// être recoché, toujours en « Peut modifier » (sans choix de droit).
//
// Rien n'est envoyé ici : payload() donne ce que « OK » enverra
// (share-panel.js).

import { h, icon, avatar, replace } from '../dom.js';
import { compareNames } from '../sorting.js';
import { membersPayload } from '../sharing.js';
import { t } from '../i18n.js';

// Droit d'une personne, au bout de sa ligne : deux petits choix côte à côte
// (.segmented), « Modifier » (droit « Peut modifier ») et « Lire » (droit
// « Lecture seule »). Le choix actif est en relief (bord, fond, ombre :
// jamais la couleur seule) et s'annonce par aria-checked. onChange(valeur)
// reçoit 'modification' ou 'lecture'. label : le nom lu par les lecteurs
// d'écran (« Droit de Léa sur la liste »).
// three : les trois droits d'un projet (« Modifier | Contribuer | Lire »).
export function accessChoice(label, value, onChange, { three = false } = {}) {
  let current = value;
  const choices = three
    ? [['modification', t('partage.droit.modifier')], ['contribution', t('partage.droit.contribuer')], ['lecture', t('partage.droit.lire')]]
    : [['modification', t('partage.droit.modifier')], ['lecture', t('partage.droit.lire')]];
  const options = choices.map(([choice, text]) => {
    const option = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', onClick: () => {
      current = choice;
      paint();
      onChange(choice);
    } }, text);
    option.dataset.value = choice;
    return option;
  });
  const paint = () => {
    for (const option of options) option.setAttribute('aria-checked', String(option.dataset.value === current));
  };
  paint();
  return h('div', { class: `segmented share__access${three ? ' share__access--3' : ''}`, role: 'radiogroup', 'aria-label': label }, options);
}

// Une phrase par droit d'un projet, sous la carte des personnes
export function roleLegend() {
  return h('ul', { class: 'share-roles' },
    [['partage.droit.modifier', 'partage.legende.modifier'], ['partage.droit.contribuer', 'partage.legende.contribuer'], ['partage.droit.lire', 'partage.legende.lire']]
      .map(([name, text]) => h('li', {}, h('strong', {}, t(name)), t('partage.legende.separateur'), t(text))));
}

// Projets (décision du 25 novembre 2026, maquette design/projets
// partage-1) : quatre rôles, donc trois droits à donner, « Modifier |
// Contribuer | Lire » (droits 'modification', 'contribution', 'lecture').
// Trois choix ne tiennent pas au bout de la ligne sur 390 px avec le
// prénom : la ligne garde la case, la pastille et le prénom, et le choix
// passe dessous, sur toute la largeur (.share__person--3,
// .share__access--3), seulement pour une personne cochée. Sous la carte,
// une phrase par droit (.share-roles, roleLegend). Les listes et les notes
// gardent leurs deux droits : rien ne change pour elles.

// Le choix lui-même. me : le compte connecté (propriétaire) ; users : les
// comptes actifs (copie locale) ; members : les personnes actuelles
// (propriétaire compris) ; beneficiaryId : destinataire d'une liste
// d'envies, ou null ; note : vrai pour une note (« Droit de Léa sur la
// note ») ; project : vrai pour un projet (trois droits, « Droit de Léa sur
// le projet »). Renvoie { element, payload() }.
export function peoplePicker({ me, users, members, beneficiaryId = null, note = false, project = false }) {
  const current = (members ?? []).filter((m) => !m.isOwner);
  const guests = new Set(current.map((m) => m.id));
  const rights = new Map(current.map((m) => [m.id, m.access ?? 'modification']));
  const people = (users ?? []).filter((u) => u.id !== me.id).map((u) => ({ ...u, active: true }));
  for (const member of current) {
    if (!people.some((p) => p.id === member.id)) people.push({ ...member, active: member.active === true });
  }
  people.sort((a, b) => compareNames(a.displayName, b.displayName));
  // Destinataire membre : verrouillé (coché, sans choix)
  const lockedBeneficiary = beneficiaryId !== null && guests.has(beneficiaryId);
  const rightLabel = (name) => (project ? t('partage.droit.choix.projet', { name }) : note ? t('partage.droit.choix.note', { name }) : t('partage.droit.choix', { name }));

  // Ligne verrouillée (moi, le destinataire) : cochée, sans choix
  const lockedRow = (person, title, sub) => h('div', { class: 'share__person' },
    h('div', { class: 'tick-row', role: 'checkbox', 'aria-checked': 'true', 'aria-disabled': 'true' },
      h('span', { class: 'tick is-on' }, icon('check')),
      avatar(person.displayName, { second: person.id !== me.id }),
      h('span', { class: 'grow share__name' }, h('span', { class: 'row__title' }, title), h('span', { class: 'row__sub' }, sub))));

  // Une personne : sa case, sa pastille, son prénom, puis son droit
  const personRow = (person) => {
    const beneficiary = person.id === beneficiaryId;
    if (beneficiary && lockedBeneficiary) return lockedRow(person, person.displayName, t('partage.personnes.destinataire'));
    const box = h('span', { class: 'tick' });
    const sub = !person.active ? t('partage.personnes.desactive') : beneficiary ? t('partage.personnes.destinataire') : null;
    // Un invité, dans l'annuaire de l'Admin seulement (rôle envoyé à lui seul)
    const discreet = person.role === 'guest' && person.active
      ? h('span', { class: 'discreet-tag' }, icon('eye-off'), t('partage.personnes.invite')) : null;
    const tick = h('button', { class: 'tick-row', type: 'button', role: 'checkbox' },
      box,
      avatar(person.displayName, { second: true }),
      h('span', { class: 'grow share__name' }, h('span', { class: 'row__title' }, person.displayName),
        sub ? h('span', { class: 'row__sub' }, sub) : discreet));
    // Le destinataire qui a quitté la liste : pas de choix (« Peut modifier »)
    const access = beneficiary ? null : accessChoice(rightLabel(person.displayName), rights.get(person.id) ?? 'lecture', (value) => rights.set(person.id, value), { three: project });
    // Mise à jour sur place (la case garde le focus) ; personne non cochée :
    // son droit est caché (place réservée, hors lecteurs d'écran ; projet :
    // le choix sous la ligne n'est montré que pour une personne cochée)
    const paintRow = () => {
      const on = guests.has(person.id);
      tick.setAttribute('aria-checked', String(on));
      box.classList.toggle('is-on', on);
      replace(box, on ? icon('check') : null);
      access?.classList.toggle('is-off', !on);
      if (project && access) access.hidden = !on;
    };
    tick.addEventListener('click', () => {
      if (guests.has(person.id)) guests.delete(person.id);
      else guests.add(person.id);
      paintRow();
    });
    paintRow();
    return h('div', { class: `share__person${project ? ' share__person--3' : ''}` }, tick, access);
  };

  const element = h('div', { class: 'share share--sheet' },
    lockedRow(me, t('partage.personnes.vous', { name: me.displayName }), t('partage.personnes.proprietaire')),
    people.map((person) => personRow(person)));
  // Focus sur la première case à l'ouverture (jamais un champ de saisie)
  element.querySelector('button.tick-row')?.setAttribute('data-initial-focus', 'true');
  return { element, payload: () => membersPayload({ guests, rights, beneficiaryId }) };
}
