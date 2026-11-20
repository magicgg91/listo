// Annulation (Ctrl+Z, ordinateur) : les dernières actions faites sur cet
// appareil, liste par liste (20 au plus par liste), oubliées au
// rechargement de la page. Décision du 10 novembre 2026 :
// - ANNULABLE : supprimer un article ; le cocher ou le décocher ; le
//   modifier (nom, quantité, note, rayon, magasin, priorité, échéance, prix,
//   lien, code-barres) ;
// - NON ANNULABLE : un ajout, une photo (envoyée en ligne seulement), une
//   réservation ou une participation (en ligne, elles ont « Quitter »), les
//   actions sur toute la liste (« Tout remettre à acheter », « Retirer du
//   panier », supprimer la liste : déjà confirmées ; la corbeille garde la
//   liste), les réglages de la liste et le partage.
// L'action inverse passe par les mêmes opérations que l'action d'origine
// (copie locale tout de suite, puis file d'attente : marche hors ligne, sans
// rien changer au serveur, qui revérifie les droits). Si quelqu'un a changé
// l'article entre-temps (temps réel), rien n'est écrasé : « Modifié
// entre-temps : rien n'est annulé ».

import { t } from './i18n.js';

export const UNDO_MAX = 20;
// Messages lus au moment de l'annonce (dans la langue choisie)
export const changedMeanwhile = () => t('annulation.modifieEntreTemps');
export const nothingToUndo = () => t('annulation.rien');

const stacks = new Map(); // id de la liste -> actions, de la plus ancienne à la plus récente

// Note une action ; entry : { kind: 'delete' | 'check' | 'update', itemId, name, … }
// (check : children, les sous-tâches cochées avec leur principale ;
// reopened, la principale décochée par cette sous-tâche)
export function recordUndo(listId, entry) {
  const stack = stacks.get(listId) ?? [];
  stack.push(entry);
  while (stack.length > UNDO_MAX) stack.shift();
  stacks.set(listId, stack);
}

// Oublie une action (déjà annulée par le bouton « Annuler » du message)
export function forgetUndo(listId, predicate) {
  const stack = stacks.get(listId);
  if (!stack) return;
  const index = stack.findLastIndex(predicate);
  if (index >= 0) stack.splice(index, 1);
}

export const undoCount = (listId) => stacks.get(listId)?.length ?? 0;
export function clearUndo() {
  stacks.clear();
}

// Annule la dernière action de la liste. items : Map des articles de la
// copie locale ; act : { restore(itemId), check(item, checked), update(item,
// changes) } (les mêmes fonctions que les actions d'origine).
// Renvoie le message à annoncer.
export async function undoLast(listId, items, act) {
  const stack = stacks.get(listId);
  const entry = stack?.pop();
  if (!entry) return nothingToUndo();
  const current = items.get(entry.itemId);
  if (entry.kind === 'delete') {
    // Revenu entre-temps (« Annuler » ailleurs, autre appareil) : rien à faire
    if (current) return changedMeanwhile();
    await act.restore(entry.itemId);
    return t('annulation.supprime', { name: entry.name });
  }
  if (!current) return changedMeanwhile(); // supprimé entre-temps
  if (entry.kind === 'check') {
    if (Boolean(current.checked) !== entry.checked) return changedMeanwhile();
    await act.check(current, !entry.checked);
    // Sous-tâches (subtasks.js) : celles cochées avec leur principale sont
    // décochées ; une principale décochée par une sous-tâche est recochée
    // (ce qui recoche ses sous-tâches, comme avant)
    if (entry.checked) {
      for (const id of entry.children ?? []) {
        const child = items.get(id);
        if (child?.checked) await act.check(child, false);
      }
    } else if (entry.reopened) {
      const parent = items.get(entry.reopened);
      if (parent && !parent.checked) await act.check(parent, true);
    }
    return entry.checked ? t('annulation.decoche', { name: current.name }) : t('annulation.coche', { name: current.name });
  }
  if (entry.kind === 'update') {
    // Chaque champ modifié doit encore avoir la valeur que j'ai mise
    const same = Object.entries(entry.after).every(([key, value]) => sameValue(current[key], value));
    if (!same) return changedMeanwhile();
    await act.update(current, entry.before);
    return t('annulation.modification', { name: entry.before.name ?? current.name });
  }
  return nothingToUndo();
}

// Valeurs « vides » équivalentes (champ effacé : null, '' ou absent)
const sameValue = (a, b) => (a ?? null) === (b ?? null) || ((a ?? '') === '' && (b ?? '') === '');

// Valeurs d'avant une modification, pour les seuls champs changés
export function beforeOf(item, changes) {
  const before = {};
  for (const key of Object.keys(changes)) before[key] = item[key] ?? (key === 'priority' ? 'normal' : null);
  return before;
}
