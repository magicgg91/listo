# Sécurité

## Signaler une faille

Merci de **ne rien publier** (ticket, discussion, message public) avant que la faille soit corrigée.

Utilisez le signalement privé de GitHub : onglet **Security** du dépôt → **Report a vulnerability**.

Indiquez si possible :
- la **version** concernée : le commit affiché dans Listo, Réglages › À propos (« Version : 3a1b2c4 ») ;
- les **étapes pour reproduire** le problème ;
- l'**effet constaté** (ce qu'un attaquant peut lire, modifier ou empêcher).

Listo est un projet personnel : la réponse arrivera **dès que possible**, sans délai garanti.

## Versions prises en charge

Seule la **dernière version** est corrigée : l'image `ghcr.io/magicgg91/listo:latest`, construite depuis la branche `main`.

## Ce que Listo protège

- les **comptes** (mots de passe hachés avec scrypt, limitation des essais, mot de passe provisoire à changer) ;
- les **sessions** (cookies HttpOnly, Secure, SameSite, préfixe `__Host-` en production) ;
- la **double authentification** (TOTP, codes de secours, secret chiffré) ;
- les **droits par liste** (chaque requête vérifie que le compte est membre de la liste) ;
- le **lien public**, en lecture seule (jeton jamais stocké en clair, expiration contrôlée par le serveur, mot de passe facultatif).

## Hors périmètre

La sécurité du **serveur** de la personne qui installe Listo, de son **pare-feu**, de son **proxy HTTPS** (Nginx Proxy Manager ou autre) et de ses **sauvegardes** relève de cette personne. Le README donne des conseils (limiter l'accès au port de Listo, garder la clé `secrets/secret.key` à part), mais ces éléments ne font pas partie de Listo.
