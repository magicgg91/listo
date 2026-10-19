// « Nouveau magasin… » / « Nouveau rayon… » : petite feuille de création,
// la même pour les deux, ouverte depuis un choix de magasin ou de rayon (sans
// quitter l'écran). Tout compte connecté peut créer ; le serveur vérifie le
// droit, les doublons et la fréquence (POST /api/stores, POST /api/aisles).
//
// - En ligne seulement (l'identifiant vient du serveur, qui vérifie aussi les
//   doublons) : hors ligne, un message, et l'on reste dans le choix en cours
//   (rayon existant ou « Sans rayon » : l'ajout de l'article n'est jamais
//   perdu).
// - Le champ ne prend pas le curseur tout seul (règle du projet : jamais de
//   clavier ouvert d'office) : un appui dessus suffit.
// - Libellé neutre et attributs LABEL_INPUT (pas de « Préremplir le contact »).
// - Nom déjà pris par un élément actif : la feuille propose de le choisir.
// Renvoie une promesse : l'élément { id, name } créé (ou choisi), ou
// undefined si la feuille est fermée sans rien.

import { h, field, errorNote, replace, LABEL_INPUT } from './dom.js';
import { post, errorMessage, ApiError } from './api.js';
import { refreshData } from './app.js';
import { openSheet, toast } from './ui.js';

export const REFERENCE_KINDS = {
  store: { path: '/api/stores', title: 'Nouveau magasin', label: 'Libellé du magasin', placeholder: 'Ex. Marché du samedi', offline: 'Connexion nécessaire pour créer un magasin' },
  aisle: { path: '/api/aisles', title: 'Nouveau rayon', label: 'Libellé du rayon', placeholder: 'Ex. Surgelés', offline: 'Connexion nécessaire pour créer un rayon' },
};

export function openCreateReference(kindName, { listId } = {}) {
  const kind = REFERENCE_KINDS[kindName];
  if (!navigator.onLine) {
    toast(kind.offline);
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    let result;
    const input = h('input', { class: 'input', ...LABEL_INPUT, maxlength: '100', placeholder: kind.placeholder });
    const nameField = field(kind.label, input);
    const error = errorNote();
    const useExisting = h('div', { hidden: true });
    const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Créer');
    const form = h('form', { class: 'stack', novalidate: true }, nameField.field, error.note, useExisting, submit);
    const sheet = openSheet({ title: kind.title, content: form, onClose: () => resolve(result) });
    const done = (item) => {
      result = item;
      sheet.close();
    };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.show('');
      useExisting.hidden = true;
      const name = input.value.replace(/\s+/g, ' ').trim();
      nameField.setError(name ? null : 'Le libellé est obligatoire');
      if (!name) return;
      if (!navigator.onLine) {
        error.show(kind.offline);
        return;
      }
      submit.disabled = true;
      try {
        const { item } = await post(kind.path, { name, ...(listId ? { listId } : {}) });
        await refreshData({ quiet: true }); // le nouvel élément est dans la copie locale
        done(item);
      } catch (err) {
        submit.disabled = false;
        error.show(errorMessage(err));
        // Déjà là (actif) : un bouton pour le choisir
        const existing = err instanceof ApiError ? err.data?.existing : null;
        if (existing) {
          replace(useExisting, h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: () => done(existing) }, `Choisir « ${existing.name} »`));
          useExisting.hidden = false;
        }
      }
    });
  });
}
