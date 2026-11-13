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

## Invitation par e-mail

Notée le 13 novembre 2026.

- **Idée :** inviter quelqu'un par e-mail. La personne reçoit un lien,
  choisit elle-même son mot de passe et arrive dans Listo. Aujourd'hui,
  l'Admin crée le compte avec un mot de passe provisoire et le transmet
  lui-même.
- **Écart avec une décision existante :** le 10 novembre 2026, il a été
  décidé « pas d'invitation par e-mail (comptes existants seulement) »
  pour le partage d'une liste (voir le cahier des charges, « Interface
  ordinateur »). Cette idée revient sur ce point : à confirmer au moment
  de la construire.
- **Points à décider le moment venu :**
  - qui peut inviter : l'Admin seulement (nouveau compte), ou aussi le
    propriétaire d'une liste (nouveau compte + partage de la liste) ;
  - l'envoi des e-mails : par le serveur de messagerie du propriétaire
    (SMTP), activé par un paramètre du compose et désactivé par défaut,
    comme `LISTO_PUSH`. Le mot de passe SMTP dans `secrets/`, jamais dans
    le compose ni dans une variable d'environnement. Une exception de plus
    à « aucune donnée envoyée ailleurs que sur votre serveur » ;
  - une dépendance ? Aucune bibliothèque d'envoi d'e-mails n'est autorisée
    aujourd'hui : soit un petit client SMTP écrit avec `node:tls`, soit une
    bibliothèque à proposer et argumenter d'abord ;
  - le lien d'invitation : à usage unique, expiré après quelques jours,
    jeton jamais écrit en clair en base ni dans les journaux (comme le
    lien public), limites de débit sur l'envoi ;
  - les adresses e-mail : aujourd'hui Listo n'en garde aucune ; décider si
    l'adresse est oubliée après l'envoi ou gardée sur le compte ;
  - le contenu du message : court, en français, sans détail sur les listes.
- **Lien avec le SSO :** si la connexion unique arrive d'abord, l'invitation
  pourrait passer par le fournisseur d'identité. À regarder ensemble.
