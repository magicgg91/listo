// Journal de sécurité : connexions réussies et échouées, actions sensibles et
// actions d'administration. Il est écrit dans les journaux du conteneur
// (docker logs listo), une ligne par événement, précédée de « [journal] ».
//
// Règle absolue : on n'y écrit jamais de mot de passe, de jeton de session ni
// de code (2FA, secours, démarrage). Seuls des identifiants de compte et des
// adresses IP y figurent.

export function createAudit({ write = (line) => console.log(line), now = Date.now } = {}) {
  // event : ce qui s'est passé ; details : informations utiles (sans secret)
  return function audit(event, details = {}) {
    const time = new Date(now()).toISOString();
    // JSON.stringify protège le journal : un identifiant contenant un retour à
    // la ligne ne peut pas fabriquer une fausse ligne.
    const parts = Object.entries(details).map(([name, value]) => `${name}=${JSON.stringify(value)}`);
    write([time, '[journal]', event, ...parts].join(' '));
  };
}
