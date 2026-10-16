#!/bin/sh
# Script de démarrage du conteneur Listo.
#
# Les dossiers data/ et secrets/ sont montés depuis le serveur hôte. Quand
# Docker les crée lui-même, ils appartiennent à « root » et Listo ne pourrait
# pas y écrire. Ce script les donne donc à l'utilisateur « node », puis lance
# Listo sous cet utilisateur, sans les droits administrateur.

set -e

# Les fichiers créés par Listo (base, sauvegardes, clé) ne sont lisibles que
# par lui-même
umask 077

DATA_DIR=$(dirname "${LISTO_DB_PATH:-/data/listo.db}")
KEY_DIR=$(dirname "${LISTO_KEY_PATH:-/secrets/secret.key}")

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR" "$KEY_DIR"
  chown -R node:node "$DATA_DIR" "$KEY_DIR"
  # Dossiers de la base et de la clé : accessibles à Listo seul
  chmod 700 "$DATA_DIR" "$KEY_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

# Déjà lancé sans les droits administrateur : on démarre directement
exec "$@"
