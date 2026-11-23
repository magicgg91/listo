// Textes de public/js/screens/notifications.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/notifications.js.

export default {
  // État des notifications sur cet appareil (sous l'interrupteur)
  'notifications.etat.serveurCoupe': 'Notifications on devices are turned off on this Listo server. The person who runs it can turn them on. The Notifications page (bell on Home) works anyway.',
  'notifications.etat.incompatible': 'This browser can\'t receive notifications. Try an up-to-date browser.',
  'notifications.etat.iphone': 'On iPhone: first add Listo to your Home Screen, then open it from its icon.',
  'notifications.etat.refusees': 'Notifications were blocked for Listo on this device. To turn them back on, allow them in your browser or phone settings (notifications for this site or for the Listo app), then come back here.',
  'notifications.etat.horsLigne': 'Offline: this setting needs a connection.',
  'notifications.etat.activees': 'On for this device.',

  // Notifications reçues (réglages du compte)
  'notifications.sujet.modifications': 'Changes',
  'notifications.sujet.modifications.detail': 'What others add, change, check or assign to you in your shared lists, grouped together.',
  'notifications.sujet.envies': 'Wishes',
  'notifications.sujet.envies.detail': 'Someone reserves a gift or chips in, in the wish lists you can see.',
  'notifications.sujet.partage': 'Sharing',
  'notifications.sujet.partage.detail': 'You\'re added to a list, or your access changes.',
  'notifications.sujet.echeances': 'Due',
  'notifications.sujet.echeances.detail': 'Every morning around 8 AM: tasks due today and overdue tasks.',

  // Contenu
  'notifications.contenu.detail': 'Show details in the notification',
  'notifications.contenu.detail.texte': 'Item names, for example “Added: Milk, Bread”. When off: only who changed which list.',

  // Notes sous les cartes
  'notifications.compte.note': 'These settings apply to the Notifications page and to all your devices.',
  'notifications.parListe.note': 'For a single list: the list\'s ⋮ menu, “Hide what\'s new in this list” or “Turn off notifications for this list”.',
  'notifications.confidentialite': 'Notification content is encrypted: only your device can read it. Your device\'s notification service (Apple, Google, Mozilla or Microsoft) only sees the time, the message size, and the device that receives it.',

  // Notification test
  'notifications.test.bouton': 'Send a test notification',

  // Titres des parties
  'notifications.recues.titre': 'Notifications you get',
  'notifications.contenu.titre': 'Content',

  // Interrupteur de cet appareil
  'notifications.appareil.desactivees': 'Notifications turned off on this device',
  'notifications.appareil.activees': 'Notifications turned on on this device',
  'notifications.test.envoyee': 'Test notification sent: it should arrive in a few seconds.',

  // Écran
  'notifications.titre': 'Notifications',
  'notifications.application.titre': 'In the app',
  'notifications.appareil.titre': 'On this device',
  'notifications.appareil.recevoir': 'Get notifications on this device',
  'notifications.appareil.recevoir.detail': 'On this phone or computer only.',

  // Nouveautés (dans l'application)
  'notifications.nouveautes.titre': 'What\'s new',
  'notifications.nouveautes.detail': 'What others added or changed since your last visit.',
  'notifications.nouveautes.cochees': 'Include checked items',
  'notifications.nouveautes.cochees.detail': 'What others check or uncheck.',
};
