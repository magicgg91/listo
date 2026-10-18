// Fraîcheur du code affiché : après une mise à jour du serveur, le téléphone
// recharge la page pour ne pas garder l'ancien code en mémoire.
//
// Pourquoi : une application installée sur l'écran d'accueil (iPhone surtout)
// reste ouverte en mémoire pendant des jours. Revenir dessus ne recharge que
// les données, jamais le code : l'ancienne version continuait de tourner.
//
// Comment :
// 1. Le code chargé connaît son identifiant de version (js/version.js, gardé
//    avec les autres fichiers). Le serveur donne le sien (GET /api/about,
//    comptes connectés). Ce sont des identifiants opaques : ni l'un ni
//    l'autre ne révèle le commit installé. S'ils diffèrent, le code est
//    périmé. En développement (pas d'identifiant), rien ne se passe.
// 2. Vérification au démarrage, au retour au premier plan, à la reconnexion
//    du temps réel, et toutes les heures. Hors ligne : rien, sans erreur.
// 3. Code périmé : on demande au navigateur la nouvelle version du service
//    worker (sw.js), on attend qu'elle soit active (elle a déjà copié les
//    nouveaux fichiers), puis on recharge au premier moment sûr : aucune
//    fenêtre ouverte, aucun champ en cours de saisie, aucun envoi en cours.
//    Sinon, bandeau « Nouvelle version disponible » avec « Recharger », et
//    nouvel essai au changement d'écran ou au retour au premier plan.
// 4. Un seul rechargement automatique par version (noté pour la session de
//    l'onglet). Toujours périmé après lui : bandeau, et une ligne dans la
//    console, sans boucle.
//
// Rien n'est perdu au rechargement : la file d'attente des modifications et
// la copie des listes sont dans IndexedDB, qu'un rechargement ne touche pas ;
// un texte en cours de saisie empêche justement le rechargement automatique.
//
// Ce module ne touche pas directement à l'écran : app.js lui fournit ce qu'il
// faut (testé automatiquement avec de fausses fonctions, test/freshness.test.js).

export const CHECK_EVERY_MS = 60 * 60 * 1000; // vérification au premier plan : toutes les heures
export const NOTICE_MS = 1200;                // durée du message avant le rechargement
export const BUSY_WAIT_MS = 1000;             // envoi en cours : nouvel essai une seconde plus tard…
export const BUSY_TRIES = 10;                 // … dix fois au plus, puis le bandeau
const GUARD_PREFIX = 'listo-rechargement:';

// Le code chargé est-il périmé ? Seulement si les deux identifiants sont
// connus et différents (calcul pur)
export function isStale(localBuild, serverBuild) {
  return typeof localBuild === 'string' && localBuild !== ''
    && typeof serverBuild === 'string' && serverBuild !== ''
    && localBuild !== serverBuild;
}

// Champ de saisie de texte (même règle que ui.js : pas les cases à cocher,
// boutons, choix de fichier…)
const NOT_TEXT = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'image', 'hidden'];
function isTextField(element) {
  if (!element?.matches) return false;
  if (element.isContentEditable || element.matches('textarea')) return true;
  return element.matches('input') && !NOT_TEXT.includes(element.type);
}

// Ce qui empêche de recharger maintenant (null : moment sûr). Calcul pur sur
// le document (un faux document dans les tests).
// - 'fenetre' : une feuille, une boîte de dialogue ou un menu est ouvert ;
// - 'saisie' : le curseur est dans un champ, ou un champ contient un texte
//   pas encore validé (sa valeur diffère de celle de départ) ;
// - 'envoi' : la file d'attente envoie des modifications ou une photo, ou une
//   synchronisation est en cours.
export function reloadBlocker(doc, { busy = false } = {}) {
  if (busy) return 'envoi';
  if (doc.querySelector('.scrim')) return 'fenetre';
  if (isTextField(doc.activeElement)) return 'saisie';
  for (const field of doc.querySelectorAll('input, textarea')) {
    if (isTextField(field) && field.value !== field.defaultValue) return 'saisie';
  }
  return null;
}

// Options (fournies par app.js) :
// - localBuild : identifiant du code chargé (js/version.js), null en développement
// - serverBuild : async () => identifiant du serveur (GET /api/about)
// - blocker : () => raison qui empêche de recharger maintenant, ou null
// - updateWorker : async () => nouveau service worker installé et actif
// - reload, notify (message bref), showBanner (bandeau), storage
//   (sessionStorage), isOnline, wait, log : voir app.js
export function createFreshness({
  localBuild, serverBuild, blocker, updateWorker, reload, notify, showBanner, storage,
  isOnline = () => true, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {},
}) {
  let target = null;    // identifiant du serveur, quand le code est périmé et prêt à recharger
  let checking = null;  // vérification en cours
  let reloading = false; // essai en cours (attente, message), ou rechargement lancé
  let logged = false;

  // Un rechargement automatique a-t-il déjà eu lieu pour cette version ?
  // Stockage indisponible : on ne peut pas éviter une boucle, donc pas de
  // rechargement automatique (le bandeau reste)
  function alreadyReloaded(build) {
    try {
      return storage.getItem(GUARD_PREFIX + build) !== null;
    } catch {
      return true;
    }
  }
  function rememberReload(build) {
    try {
      storage.setItem(GUARD_PREFIX + build, '1');
      return true;
    } catch {
      return false;
    }
  }

  // Recharge au premier moment sûr ; sinon bandeau (nouvel essai plus tard)
  async function attempt() {
    if (!target || reloading) return;
    if (alreadyReloaded(target)) {
      if (!logged) log('Listo : le code affiché est toujours ancien après un rechargement ; bouton « Recharger » proposé.');
      logged = true;
      showBanner();
      return;
    }
    // Un envoi se termine vite : on l'attend un peu avant de renoncer
    reloading = true;
    let reason = blocker();
    for (let i = 0; reason === 'envoi' && i < BUSY_TRIES; i++) {
      await wait(BUSY_WAIT_MS);
      reason = blocker();
    }
    if (reason) {
      reloading = false;
      showBanner();
      return;
    }
    notify('Mise à jour de Listo…');
    await wait(NOTICE_MS);
    // Entre-temps, on a pu ouvrir une fenêtre ou toucher un champ
    if (blocker() || !rememberReload(target)) {
      reloading = false;
      showBanner();
      return;
    }
    reload();
  }

  // Compare les deux identifiants ; code périmé : nouveau service worker,
  // puis rechargement au bon moment
  function check() {
    if (!localBuild || !isOnline()) return Promise.resolve();
    if (checking) return checking;
    checking = (async () => {
      let build;
      try {
        build = await serverBuild();
      } catch {
        return; // pas de réseau, serveur arrêté, session expirée : rien à dire
      }
      if (!isStale(localBuild, build)) return;
      if (target !== build) {
        await updateWorker();
        target = build;
      }
      await attempt();
    })().finally(() => {
      checking = null;
    });
    return checking;
  }

  return {
    check,
    // Nouvel essai (changement d'écran) : seulement si une version attend
    retry: () => attempt(),
    // Bouton « Recharger » du bandeau : choix de l'utilisateur, sans condition
    reloadNow: () => reload(),
  };
}
