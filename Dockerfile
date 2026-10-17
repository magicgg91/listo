# check=skip=SecretsUsedInArgOrEnv
# (Ligne ci-dessus : Docker croit voir un secret dans LISTO_KEY_PATH à cause du
# mot « KEY ». Ce n'est qu'un chemin de fichier : la clé n'est jamais dans l'image.)
#
# Image Docker de Listo.
#
# Construite et publiée automatiquement sur ghcr.io/magicgg91/listo par
# .github/workflows/docker.yml à chaque fusion sur main.
# L'image ne contient que le code : ni base de données, ni secret.

# Node.js 24 (version suivie à long terme), variante « slim » plus légère.
# L'image est épinglée sur son empreinte (sha256) : chaque construction part
# exactement de la même base, vérifiée. Dependabot propose chaque semaine une
# pull request quand une nouvelle version de node:24-slim sort.
FROM node:24-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5

ENV NODE_ENV=production
WORKDIR /app

# 1. Dépendances (express, better-sqlite3), installées d'après
#    package-lock.json pour avoir exactement les mêmes versions partout.
#    --ignore-scripts : aucun script d'installation n'est exécuté. better-sqlite3
#    utilise alors le moteur SQLite précompilé qu'il fournit (pas besoin
#    d'outils de compilation dans l'image).
#    La dernière ligne vérifie que SQLite se charge bien.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
 && node -e "new (require('better-sqlite3'))(':memory:')"

# 2. Code de l'application (seulement ce qui sert à la faire tourner)
COPY server ./server
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

# Valeurs par défaut (docker-compose.yml fixe celles de la production :
# PORT=13300, LISTO_PUBLIC_URL…). Base et clé dans deux volumes séparés.
ENV PORT=3000 \
    LISTO_DB_PATH=/data/listo.db \
    LISTO_KEY_PATH=/secrets/secret.key

# Port d'écoute dans le conteneur (simple indication : c'est
# docker-compose.yml qui publie le port, sur l'adresse du réseau local)
EXPOSE 3000

# Docker vérifie toutes les 30 secondes que Listo répond sur /healthz
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Le script de démarrage prépare les dossiers, puis lance Listo sous
# l'utilisateur « node » (sans les droits administrateur du conteneur)
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
