// Choix des personnes d'un partage (feuille « Partager avec des
// personnes », décision du 24 novembre 2026) : le même choix pour une liste
// et pour une note. Repris tel quel de l'ancienne fenêtre « Partager avec »
// du formulaire de liste (le style préféré du propriétaire) : une ligne par
// personne, case à cocher, pastille, prénom, et au bout de la ligne son droit
// (accessChoice : « Modifier » ou « Lire »), visible seulement si elle est
// cochée (la place reste réservée).
//
// Moi d'abord (propriétaire : cochée, verrouillée), puis les autres comptes
// actifs ; une personne déjà présente mais désactivée reste affichée (et
// peut être retirée). Une personne ajoutée commence en « Lecture seule »
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
export function accessChoice(label, value, onChange) {
  let current = value;
  const options = [['modification', t('partage.droit.modifier')], ['lecture', t('partage.droit.lire')]].map(([choice, text]) => {
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
  return h('div', { class: 'segmented share__access', role: 'radiogroup', 'aria-label': label }, options);
}

// Le choix lui-même. me : le compte connecté (propriétaire) ; users : les
// comptes actifs (copie locale) ; members : les personnes actuelles
// (propriétaire compris) ; beneficiaryId : destinataire d'une liste
// d'envies, ou null ; note : vrai pour une note (« Droit de Léa sur la
// note »). Renvoie { element, payload() }.
export function peoplePicker({ me, users, members, beneficiaryId = null, note = false }) {
  const current = (members ?? []).filter((m) => !m.isOwner);
  const guests = new Set(current.map((m) => m.id));
  const rights = new Map(current.map((m) => [m.id, m.access ?? 'modification']));
  const people = (users ?? []).filter((u) => u.id !== me.id).map((u) => ({ ...u, active: true }));
  for (const member of current) {
    if (!people.some((p) => p.id === member.id)) people.push({ ...member, active: false });
  }
  people.sort((a, b) => compareNames(a.displayName, b.displayName));
  // Destinataire membre : verrouillé (coché, sans choix)
  const lockedBeneficiary = beneficiaryId !== null && guests.has(beneficiaryId);
  const rightLabel = (name) => (note ? t('partage.droit.choix.note', { name }) : t('partage.droit.choix', { name }));

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
    const tick = h('button', { class: 'tick-row', type: 'button', role: 'checkbox' },
      box,
      avatar(person.displayName, { second: true }),
      h('span', { class: 'grow share__name' }, h('span', { class: 'row__title' }, person.displayName),
        sub ? h('span', { class: 'row__sub' }, sub) : null));
    // Le destinataire qui a quitté la liste : pas de choix (« Peut modifier »)
    const access = beneficiary ? null : accessChoice(rightLabel(person.displayName), rights.get(person.id) ?? 'lecture', (value) => rights.set(person.id, value));
    // Mise à jour sur place (la case garde le focus) ; personne non cochée :
    // son droit est caché (place réservée, hors lecteurs d'écran)
    const paintRow = () => {
      const on = guests.has(person.id);
      tick.setAttribute('aria-checked', String(on));
      box.classList.toggle('is-on', on);
      replace(box, on ? icon('check') : null);
      access?.classList.toggle('is-off', !on);
    };
    tick.addEventListener('click', () => {
      if (guests.has(person.id)) guests.delete(person.id);
      else guests.add(person.id);
      paintRow();
    });
    paintRow();
    return h('div', { class: 'share__person' }, tick, access);
  };

  const element = h('div', { class: 'share share--sheet' },
    lockedRow(me, t('partage.personnes.vous', { name: me.displayName }), t('partage.personnes.proprietaire')),
    people.map((person) => personRow(person)));
  // Focus sur la première case à l'ouverture (jamais un champ de saisie)
  element.querySelector('button.tick-row')?.setAttribute('data-initial-focus', 'true');
  return { element, payload: () => membersPayload({ guests, rights, beneficiaryId }) };
}
