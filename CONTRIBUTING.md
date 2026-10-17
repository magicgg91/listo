# Contribuer à Listo

Merci de votre intérêt ! Listo est un **projet personnel** : une application de listes partagées pour un foyer, auto-hébergée. Les pull requests et les tickets sont les bienvenus, mais sans garantie de délai de réponse ni de fusion.

## Avant de commencer

- Pour une petite correction (faute, bogue évident) : ouvrez directement une pull request.
- Pour un **gros changement** (nouvelle fonction, changement d'architecture) : ouvrez d'abord un ticket pour en discuter, avant d'écrire le code.
- Une **faille de sécurité** ne va **jamais** dans un ticket public : suivez [SECURITY.md](SECURITY.md).

## Règles du projet

- **Interface en français uniquement.**
- **HTML, CSS et JavaScript natifs** (modules ES), sans framework ni étape de compilation.
- **Pas de nouvelle dépendance sans discussion préalable.** Les trois dépendances actuelles du serveur sont `express`, `better-sqlite3` et `qrcode`.
- **Code simple et commenté en français** : la lisibilité passe avant l'astuce.
- **Tests** : `npm test` doit passer, et un changement arrive avec ses propres tests (surtout pour les droits d'accès, la synchronisation et le mode hors ligne).
- **Design** : respecter le kit de `design/` (`design/README.md`, `design/listo.css`, maquettes de `design/maquettes/`) ; pas de nouvelle bibliothèque d'icônes.
- Le cahier des charges (`docs/cahier-des-charges.md`) décrit les fonctions, les droits et la sécurité attendus.

## Licence des contributions

Toute contribution est acceptée sous la **licence Apache-2.0** du projet (article 5 de la licence), sans autre formalité : en ouvrant une pull request, vous acceptez que votre code soit distribué sous cette licence.

## Fusion

Le propriétaire du dépôt relit et fusionne toujours lui-même les pull requests.
