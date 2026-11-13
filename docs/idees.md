# Idées pour plus tard

Évolutions notées de côté, ni validées ni commencées. Chacune passera par
un plan court et l'accord du propriétaire avant d'être construite.

## Connexion unique (SSO) avec OpenID Connect

Notée le 13 novembre 2026. À reprendre quand le propriétaire aura installé
son fournisseur d'identité à la maison.

- **Idée :** se connecter à Listo avec le compte du fournisseur d'identité
  de la maison (bouton « Se connecter avec … » sur l'écran de connexion).
- **Interrupteur :** un paramètre dans le compose pour activer la fonction,
  désactivée par défaut. Sans ce paramètre, rien ne change : rien dans
  l'administration, rien sur l'écran de connexion, et les adresses de
  retour du fournisseur répondent 404 (comme `LISTO_MCP` et `LISTO_PUSH`).
- **Points à décider le moment venu :**
  - le fournisseur utilisé, et l'adresse de son « issuer » ;
  - la clé secrète du client OIDC : dans `secrets/`, jamais dans le compose
    ni dans une variable d'environnement (règle « aucun mot de passe dans
    une variable ») ;
  - le lien entre un compte du fournisseur et un compte Listo existant
    (fait par l'Admin, ou à la première connexion), et la création ou non
    de nouveaux comptes ;
  - ce qui reste du mot de passe et de la double authentification de Listo
    (garder une connexion de secours pour l'Admin) ;
  - les dépendances : a priori aucune nouvelle (`fetch` et `node:crypto`
    suffisent pour vérifier les jetons), à confirmer avant de commencer.
- **À prévoir avec :** le tableau des paramètres du guide et les exemples
  de compose (test `compose-params`), la section Sécurité du cahier des
  charges, et la relecture de sécurité de la PR.
