// Textes de public/js/push.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/push.js.

export default {
  // Échec de l'activation des notifications sur cet appareil
  'push.erreur.service': 'This browser couldn\'t register with its notification service (Google for Chrome and Brave, Microsoft for Edge, Mozilla for Firefox). It must be able to reach it over the Internet: check that no DNS filter (AdGuard, Pi-hole…), ad blocker (uBlock Origin…), proxy, firewall or VPN is blocking it (see the Help page). In Brave: Settings, Privacy and security, turn on “Use Google services for push messaging”, then restart Brave.',
  'push.erreur.refusees': 'The browser blocked notifications for this site. Allow them in its settings, then try again.',
  'push.erreur.autre': 'The browser couldn\'t turn on notifications on this device.',
  'push.erreur.detail': '{message} Details from the browser: {detail}.',
};
