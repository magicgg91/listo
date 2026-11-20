// Textes de public/js/push.js, en français.
// Chaque nom commence par « push. ».

export default {
  // Échec de l'activation des notifications sur cet appareil
  'push.erreur.service': 'Ce navigateur n\'a pas réussi à s\'inscrire auprès de son service de notifications (Google pour Chrome et Brave, Microsoft pour Edge, Mozilla pour Firefox). Il doit pouvoir le joindre par Internet : vérifiez qu\'aucun filtre DNS (AdGuard, Pi-hole…), bloqueur de publicité (uBlock Origin…), proxy, pare-feu ou VPN ne l\'en empêche (voir l\'aide, « Rien ne s\'affiche »). Dans Brave : Réglages, Confidentialité et sécurité, activez « Utiliser les services Google pour la messagerie push », puis relancez Brave.',
  'push.erreur.refusees': 'Le navigateur a refusé les notifications pour ce site. Autorisez-les dans ses réglages, puis réessayez.',
  'push.erreur.autre': 'Le navigateur n\'a pas pu activer les notifications sur cet appareil.',
  'push.erreur.detail': '{message} Détail donné par le navigateur : {detail}.',
};
