// Textes de « Notifications » (public/js/screens/notifications.js), en français.
// Chaque nom commence par « notifications. » (un nom ne sert qu'à un seul écran).

export default {
  // État des notifications sur cet appareil (sous l'interrupteur)
  'notifications.etat.serveurCoupe': 'Les notifications sur les appareils sont désactivées sur ce serveur Listo. La personne qui l\'administre peut les activer. La page Notifications (cloche de l\'Accueil) fonctionne quand même.',
  'notifications.etat.incompatible': 'Ce navigateur ne sait pas recevoir de notifications. Essayez avec un navigateur à jour.',
  'notifications.etat.iphone': 'Sur iPhone : ajoutez d\'abord Listo à l\'écran d\'accueil, puis ouvrez-le depuis son icône.',
  'notifications.etat.refusees': 'Les notifications ont été refusées pour Listo sur cet appareil. Pour les rétablir, autorisez-les dans les réglages du navigateur ou du téléphone (notifications de ce site ou de l\'application Listo), puis revenez ici.',
  'notifications.etat.horsLigne': 'Hors ligne : ce réglage demande une connexion.',
  'notifications.etat.activees': 'Activées sur cet appareil.',

  // Notifications reçues (réglages du compte)
  'notifications.sujet.modifications': 'Modifications',
  'notifications.sujet.modifications.detail': 'Ce que les autres ajoutent, modifient, cochent ou vous attribuent dans vos listes partagées, regroupé.',
  'notifications.sujet.envies': 'Envies',
  'notifications.sujet.envies.detail': 'Une réservation ou une participation à un cadeau, dans les listes d\'envies que vous voyez.',
  'notifications.sujet.partage': 'Partage',
  'notifications.sujet.partage.detail': 'On vous ajoute à une liste, ou votre droit change.',
  'notifications.sujet.echeances': 'Échéances',
  'notifications.sujet.echeances.detail': 'Chaque matin vers 8 h : les tâches à faire aujourd\'hui et celles en retard.',

  // Contenu
  'notifications.contenu.detail': 'Afficher le détail dans la notification',
  'notifications.contenu.detail.texte': 'Le nom des éléments, par exemple « Ajouté : Lait, Pain ». Désactivé : seulement qui a modifié quelle liste.',

  // Notes sous les cartes
  'notifications.compte.note': 'Ces réglages valent pour la page Notifications et pour tous vos appareils.',
  'notifications.parListe.note': 'Pour une seule liste : menu ⋮ de la liste, « Masquer les nouveautés » ou « Couper les notifications ».',
  'notifications.confidentialite': 'Le contenu des notifications est chiffré : seul votre appareil peut le lire. Le service de notification de votre appareil (Apple, Google, Mozilla ou Microsoft) voit seulement l\'heure, la taille du message et l\'appareil qui le reçoit.',

  // Notification test
  'notifications.test.bouton': 'Envoyer une notification test',

  // Titres des parties
  'notifications.recues.titre': 'Notifications reçues',
  'notifications.contenu.titre': 'Contenu',

  // Interrupteur de cet appareil
  'notifications.appareil.desactivees': 'Notifications désactivées sur cet appareil',
  'notifications.appareil.activees': 'Notifications activées sur cet appareil',
  'notifications.test.envoyee': 'Notification test envoyée : elle arrive dans quelques secondes.',

  // Écran
  'notifications.titre': 'Notifications',
  'notifications.application.titre': 'Dans l\'application',
  'notifications.appareil.titre': 'Sur cet appareil',
  'notifications.appareil.recevoir': 'Recevoir les notifications sur cet appareil',
  'notifications.appareil.recevoir.detail': 'Sur ce téléphone ou cet ordinateur seulement.',

  // Nouveautés (dans l'application)
  'notifications.nouveautes.titre': 'Nouveautés',
  'notifications.nouveautes.detail': 'Ce que les autres ont ajouté ou modifié depuis votre dernière visite.',
  'notifications.nouveautes.cochees': 'Signaler les éléments cochés',
  'notifications.nouveautes.cochees.detail': 'Ce que les autres cochent ou décochent.',
};
