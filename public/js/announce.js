// Annonces pour les lecteurs d'écran (VoiceOver sur iPhone).
//
// Pourquoi : un lecteur d'écran ne lit de façon fiable un message qui
// apparaît que s'il arrive dans une « zone d'annonce » déjà présente dans la
// page. Un message créé avec son texte (un toast), ou un bloc d'erreur caché
// puis montré, peut être lu… ou pas. Le même message répété (deux fois
// « Saisissez votre identifiant ») n'est pas relu.
//
// Comment : deux zones invisibles, créées une seule fois au démarrage, hors
// de l'écran affiché (directement dans <body>, donc jamais rendues inertes
// par une fenêtre ouverte) :
// - polie (role="status") : messages ordinaires (« « Lait » supprimé »),
//   lus quand le lecteur a fini sa phrase en cours ;
// - urgente (role="alert") : erreurs, lues tout de suite.
// announce() vide la zone, puis y écrit le texte un instant après : le
// lecteur voit un changement, même pour un texte identique au précédent.
// Rien ne change à l'écran (classe visually-hidden du kit).
// Module partagé par l'application et la page publique (js/public.js).

const DELAY_MS = 100;
const regions = {};

function region(kind) {
  if (regions[kind]?.isConnected) return regions[kind];
  const el = document.createElement('div');
  el.className = 'visually-hidden';
  el.setAttribute('role', kind === 'urgent' ? 'alert' : 'status');
  el.setAttribute('aria-live', kind === 'urgent' ? 'assertive' : 'polite');
  el.setAttribute('aria-atomic', 'true');
  document.body.append(el);
  regions[kind] = el;
  return el;
}

// À appeler au démarrage : les zones existent avant le premier message
export function prepareAnnouncer() {
  region('polite');
  region('urgent');
}

// Annonce un texte (urgent : une erreur). Texte vide : rien.
export function announce(text, { urgent = false } = {}) {
  if (!text) return;
  const el = region(urgent ? 'urgent' : 'polite');
  clearTimeout(el.listoTimer);
  el.textContent = '';
  el.listoTimer = setTimeout(() => { el.textContent = text; }, DELAY_MS);
}
