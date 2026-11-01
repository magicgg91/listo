// Petits outils pour construire l'écran.
//
// Règle de sécurité : tout texte est placé avec textContent, jamais avec
// innerHTML. Un nom d'article comme « <script>… » s'affiche donc tel quel,
// sans jamais être exécuté.

const SVG = 'http://www.w3.org/2000/svg';

// Crée un élément HTML.
//   h('button', { class: 'btn', type: 'button', onClick: f }, 'Texte', autreElement)
// - les attributs « onXxx » deviennent des écouteurs d'événements ;
// - les valeurs true ajoutent l'attribut, false/null/undefined l'omettent ;
// - les enfants peuvent être du texte, des éléments, des tableaux ou rien.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (name.startsWith('on') && typeof value === 'function') {
      el.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (name === 'value') {
      el.value = value;
      // Valeur de départ retenue aussi : un champ dont la valeur a changé
      // contient un texte pas encore validé (voir freshness.js)
      if ('defaultValue' in el) el.defaultValue = value;
    } else {
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

// Ajoute des enfants (texte, éléments, tableaux) à un élément
export function append(parent, children) {
  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

// Remplace tout le contenu d'un élément
export function replace(parent, ...children) {
  parent.replaceChildren();
  return append(parent, children);
}

// Icône du sprite : icon('check') ou icon('check', 'icon--sm')
export function icon(name, extraClass = '') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `icon ${extraClass}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

// Bouton-icône avec son libellé pour les lecteurs d'écran (obligatoire)
export function iconButton(name, label, onClick, extraClass = '') {
  return h('button', { class: `icon-btn ${extraClass}`.trim(), type: 'button', 'aria-label': label, onClick }, icon(name));
}

// Champ de mot de passe avec le bouton « œil » pour l'afficher
export function passwordInput(attrs = {}) {
  const input = h('input', { class: 'input', type: 'password', autocapitalize: 'off', spellcheck: 'false', ...attrs });
  const toggle = iconButton('eye', 'Afficher le mot de passe', () => {
    const shown = input.type === 'text';
    input.type = shown ? 'password' : 'text';
    toggle.setAttribute('aria-label', shown ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
    toggle.setAttribute('aria-pressed', String(!shown));
  });
  toggle.setAttribute('aria-pressed', 'false');
  return { wrap: h('div', { class: 'input-wrap' }, input, toggle), input };
}

// Champ de formulaire du kit : libellé + contrôle + aide + erreur.
// Renvoie { field, setError } pour afficher ou effacer une erreur.
// aside : aide courte, écrite à côté du titre entre parenthèses, en texte
// discret (« Quantité (par exemple 2 ou 500 g) ») ; elle est dans le <label>,
// donc lue avec le nom du champ. hint : explication plus longue, sous le champ.
// Attributs d'un champ qui contient un nom de produit ou un libellé (article,
// élément, liste, catégorie, magasin, rayon, nom enregistré). L'iPhone devine
// qu'un champ est un « contact » d'après ses propres indices (libellé « Nom »,
// attributs name, id, aria-label…) et propose alors « Préremplir le
// contact » ; autocomplete="off" seul ne suffit pas toujours. Ces champs
// n'ont donc ni name, ni id parlant (field() leur donne un id neutre), ni
// libellé « Nom », et portent tous ces attributs. Jamais pour un identifiant,
// un mot de passe ou un code (le gestionnaire de mots de passe doit les
// reconnaître).
export const LABEL_INPUT = { type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'done', inputmode: 'text' };

export function field(label, control, { hint, aside, id } = {}) {
  // Le libellé désigne le champ de saisie de la ligne s'il y en a un (un
  // bouton posé à côté, comme celui de l'icône d'une liste, garde son propre nom)
  const input = control.matches?.('input, textarea, select, button') ? control : control.querySelector('input, textarea, select') ?? control.querySelector('button');
  const inputId = id ?? `f-${Math.random().toString(36).slice(2, 9)}`;
  if (input && !input.id) input.id = inputId;
  const error = h('span', { class: 'field__error', id: `${inputId}-erreur`, role: 'alert', hidden: true });
  const hintEl = hint ? h('span', { class: 'field__hint' }, hint) : null;
  const title = h('label', { class: 'field__label', for: input?.id }, label,
    aside ? [' ', h('span', { class: 'field__aside' }, `(${aside})`)] : null);
  const wrapper = h('div', { class: 'field' }, title, control, hintEl, error);
  return {
    field: wrapper,
    setError(message) {
      if (message) {
        replace(error, icon('alert', 'icon--xs'), message);
        error.hidden = false;
        // Le champ fautif est signalé (et son message lui est relié pour les
        // lecteurs d'écran), sans y mettre le curseur
        input?.setAttribute('aria-invalid', 'true');
        input?.setAttribute('aria-describedby', error.id);
      } else {
        error.hidden = true;
        input?.removeAttribute('aria-invalid');
        input?.removeAttribute('aria-describedby');
      }
    },
  };
}

// Message d'erreur général d'un formulaire (encadré rouge du kit).
// show(message, ...champs) : les champs donnés sont signalés comme fautifs
// (aria-invalid) et reliés au message (aria-describedby), sans y mettre le
// curseur ; show('') efface le message et ces signalements.
export function errorNote() {
  const text = h('p');
  const id = `err-${Math.random().toString(36).slice(2, 9)}`;
  const note = h('div', { class: 'note note--danger form-error', id, role: 'alert', hidden: true }, icon('alert'), text);
  let flagged = [];
  return {
    note,
    show(message, ...fields) {
      text.textContent = message;
      note.hidden = !message;
      for (const input of flagged) {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
      flagged = message ? fields.filter(Boolean) : [];
      for (const input of flagged) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', id);
      }
    },
  };
}

// Pastille avec l'initiale d'une personne
export function avatar(name, { second = false, large = false } = {}) {
  const classes = ['avatar', second ? 'avatar--b' : '', large ? 'avatar--lg' : ''].filter(Boolean).join(' ');
  return h('span', { class: classes, 'aria-hidden': 'true' }, initial(name));
}

export function initial(name) {
  return (String(name ?? '').trim()[0] ?? '?').toLocaleUpperCase('fr');
}

// Pastille « Multi » : magasin qui en regroupe plusieurs (kit, section 16.2)
export function multiBadge() {
  return h('span', { class: 'badge-multi' }, icon('layers', 'icon--xs'), 'Multi');
}
