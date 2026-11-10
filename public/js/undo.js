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

export const UNDO_MAX = 20;
export const CHANGED_MEANWHILE = 'Modifié entre-temps : rien n\'est annulé.';
export const NOTHING_TO_UNDO = 'Rien à annuler dans cette liste.';

const stacks = new Map(); // id de la liste -> actions, de la plus ancienne à la plus récente

// Note une action ; entry : { kind: 'delete' | 'check' | 'update', itemId, name, … }
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
  if (!entry) return NOTHING_TO_UNDO;
  const current = items.get(entry.itemId);
  if (entry.kind === 'delete') {
    // Revenu entre-temps (« Annuler » ailleurs, autre appareil) : rien à faire
    if (current) return CHANGED_MEANWHILE;
    await act.restore(entry.itemId);
    return `Annulé : « ${entry.name} » est de retour.`;
  }
  if (!current) return CHANGED_MEANWHILE; // supprimé entre-temps
  if (entry.kind === 'check') {
    if (Boolean(current.checked) !== entry.checked) return CHANGED_MEANWHILE;
    await act.check(current, !entry.checked);
    return `Annulé : « ${current.name} » ${entry.checked ? 'décoché' : 'coché'}.`;
  }
  if (entry.kind === 'update') {
    // Chaque champ modifié doit encore avoir la valeur que j'ai mise
    const same = Object.entries(entry.after).every(([key, value]) => sameValue(current[key], value));
    if (!same) return CHANGED_MEANWHILE;
    await act.update(current, entry.before);
    return `Annulé : modification de « ${entry.before.name ?? current.name} ».`;
  }
  return NOTHING_TO_UNDO;
}

// Valeurs « vides » équivalentes (champ effacé : null, '' ou absent)
const sameValue = (a, b) => (a ?? null) === (b ?? null) || ((a ?? '') === '' && (b ?? '') === '');

// Valeurs d'avant une modification, pour les seuls champs changés
export function beforeOf(item, changes) {
  const before = {};
  for (const key of Object.keys(changes)) before[key] = item[key] ?? (key === 'priority' ? 'normal' : null);
  return before;
}
