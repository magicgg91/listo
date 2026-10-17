// Écrans « Réglages » (provisoire : construit plus loin dans l'étape 5)
import { h } from '../dom.js';
export const renderSettings = () => h('div', { class: 'screen' }, h('p', { class: 'empty' }, 'Réglages : bientôt'));
export const renderPassword = renderSettings;
export const renderTwoFactor = renderSettings;
