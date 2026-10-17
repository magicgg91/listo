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
export function field(label, control, { hint, id } = {}) {
  const input = control.matches?.('input, textarea, select, button') ? control : control.querySelector('input, textarea, select, button');
  const inputId = id ?? `f-${Math.random().toString(36).slice(2, 9)}`;
  if (input && !input.id) input.id = inputId;
  const error = h('span', { class: 'field__error', role: 'alert', hidden: true });
  const hintEl = hint ? h('span', { class: 'field__hint' }, hint) : null;
  const wrapper = h('div', { class: 'field' }, h('label', { class: 'field__label', for: input?.id }, label), control, hintEl, error);
  return {
    field: wrapper,
    setError(message) {
      if (message) {
        replace(error, icon('alert', 'icon--xs'), message);
        error.hidden = false;
        input?.setAttribute('aria-invalid', 'true');
      } else {
        error.hidden = true;
        input?.removeAttribute('aria-invalid');
      }
    },
  };
}

// Message d'erreur général d'un formulaire (encadré rouge du kit)
export function errorNote() {
  const text = h('p');
  const note = h('div', { class: 'note note--danger form-error', role: 'alert', hidden: true }, icon('alert'), text);
  return {
    note,
    show(message) {
      text.textContent = message;
      note.hidden = !message;
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
