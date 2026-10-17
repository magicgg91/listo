// Vocabulaire des listes : le mot qui désigne une ligne de la liste.
//
// - Liste de courses (catégorie « courses ») : « article ».
// - Toute autre liste (tâches…) : « élément ».
//
// Les deux mots sont masculins et commencent par une voyelle : les phrases
// s'écrivent donc pareil (« L'article barré » / « L'élément barré »,
// « Nouvel article » / « Nouvel élément », « Cet article » / « Cet élément »).
// Tous les textes affichés passent par ce module : aucun mot recopié à la
// main dans les écrans.

// Vrai pour une liste de courses. Accepte une liste telle que décrite par le
// serveur ({ category: { isShopping } }) ou directement un booléen.
export function isShopping(listOrFlag) {
  if (typeof listOrFlag === 'boolean') return listOrFlag;
  return Boolean(listOrFlag?.category?.isShopping);
}

// Le mot au singulier (one) et au pluriel (many), selon la liste
export function itemWords(listOrFlag) {
  return isShopping(listOrFlag)
    ? { one: 'article', many: 'articles' }
    : { one: 'élément', many: 'éléments' };
}

// « 1 article », « 3 éléments »… (singulier pour 1 seulement)
export function countItems(count, listOrFlag) {
  const words = itemWords(listOrFlag);
  return `${count} ${count === 1 ? words.one : words.many}`;
}

// Zone des articles cochés, en bas de la liste (design : section 16.5) :
// textes selon la liste. title : titre de la zone ; reopen : action qui
// décoche tout ; remove : action qui supprime les cochés.
export function doneZoneWords(listOrFlag) {
  return isShopping(listOrFlag)
    ? { title: 'Dans le panier', reopen: 'Tout remettre à acheter', remove: 'Retirer du panier' }
    : { title: 'Terminés', reopen: 'Tout rouvrir', remove: 'Retirer les terminés' };
}
