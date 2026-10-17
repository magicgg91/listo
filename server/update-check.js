// Vérification de mise à jour (Réglages › À propos, Admin seulement).
//
// Question posée : « une image Docker plus récente que celle installée
// existe-t-elle ? ». Le serveur (jamais le téléphone) demande à l'API publique
// de GitHub le dernier passage réussi du workflow « Image Docker »
// (.github/workflows/docker.yml) sur la branche main, et compare son commit
// (head_sha) à celui de l'image installée (LISTO_COMMIT).
//
// Garde-fous :
// - aucune clé ni jeton : l'API publique suffit (60 demandes par heure et par
//   adresse IP permises par GitHub ; Listo en fait au plus une par heure) ;
// - délai de 5 secondes, réponse de 256 ko au plus, aucune redirection
//   suivie (la réponse doit venir de api.github.com, rien d'autre) ;
// - résultat gardé une heure (une seule demande à GitHub par heure, quel que
//   soit le nombre de visites dans Réglages) ; « Vérifier maintenant » force
//   une nouvelle demande, une fois par minute au plus ;
// - une panne (réseau, GitHub, réponse inattendue) donne « indisponible » :
//   jamais d'erreur, jamais de nouvelle tentative automatique, une ligne
//   discrète dans les journaux ;
// - LISTO_UPDATE_CHECK=off : aucune demande, jamais ;
// - Listo ne se met jamais à jour tout seul : il affiche seulement l'info.

import { validCommit } from './config.js';

// Projet sur GitHub : défini ici seulement (côté serveur)
export const GITHUB_OWNER = 'magicgg91';
export const GITHUB_REPO = 'listo';
const API_ORIGIN = 'https://api.github.com';
export const RUNS_PATH = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/docker.yml/runs?branch=main&status=success&per_page=1`;

export const CACHE_MS = 60 * 60 * 1000;  // résultat gardé une heure
export const FORCE_MS = 60 * 1000;       // « Vérifier maintenant » : une fois par minute
const TIMEOUT_MS = 5000;
const MAX_BYTES = 256 * 1024;

// Demande à GitHub et renvoie le JSON reçu. Toute réponse autre que 200
// (redirection comprise : elle n'est jamais suivie) est une erreur.
// fetchImpl : la fonction fetch (les tests la remplacent : aucun vrai réseau)
export async function fetchGithub(path, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  const url = new URL(path, API_ORIGIN);
  // Délai : la demande (lecture de la réponse comprise) est abandonnée après
  // 5 secondes
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('délai dépassé')), timeoutMs);
  try {
    return await download(url, { fetchImpl, signal: controller.signal, maxBytes });
  } finally {
    clearTimeout(timer);
  }
}

async function download(url, { fetchImpl, signal, maxBytes }) {
  const res = await fetchImpl(url.href, {
    redirect: 'manual',
    signal,
    headers: { 'User-Agent': 'Listo', Accept: 'application/vnd.github+json' },
  });
  if (res.status !== 200) throw new Error(`réponse HTTP ${res.status}`);
  if (res.url && new URL(res.url).origin !== API_ORIGIN) throw new Error('réponse venue d\'un autre site');
  // Lecture limitée en taille (jamais tout un fichier énorme en mémoire)
  if (Number(res.headers.get('content-length')) > maxBytes) throw new Error('réponse trop grande');
  const chunks = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('réponse trop grande');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Commit du dernier passage réussi, lu dans la réponse de GitHub, ou null si
// la réponse n'a pas la forme attendue (40 caractères hexadécimaux exigés)
export function latestCommitFrom(data) {
  const run = Array.isArray(data?.workflow_runs) ? data.workflow_runs[0] : null;
  if (!run || run.conclusion !== 'success' || run.head_branch !== 'main') return null;
  return validCommit(run.head_sha);
}

// Options :
// - config : commit installé (config.commit) et interrupteur (config.updateCheck)
// - now : horloge
// - request : fonction qui demande le chemin à GitHub (par défaut fetchGithub)
// - log : ligne discrète en cas d'échec
export function createUpdateCheck({ config, now = Date.now, request = fetchGithub, log = (line) => console.warn(line) }) {
  let last = null;      // dernier résultat : { latest, state, at }
  let running = null;   // demande en cours (partagée par les appels simultanés)

  async function ask() {
    const at = now();
    try {
      const latest = latestCommitFrom(await request(RUNS_PATH));
      if (!latest) throw new Error('réponse inattendue');
      return { latest, state: 'ok', at };
    } catch (err) {
      log(`Vérification de mise à jour impossible : ${err?.message ?? err}`);
      return { latest: null, state: 'indisponible', at };
    }
  }

  // Réponse envoyée au téléphone : ces champs, et rien d'autre
  const answer = (current, state, result = null) => ({
    current,
    latest: result?.latest ?? null,
    upToDate: state === 'ok' ? result.latest === current : null,
    checkedAt: result ? new Date(result.at).toISOString() : null,
    state,
  });

  // force : « Vérifier maintenant » (une fois par minute au plus)
  async function status({ force = false } = {}) {
    const current = config.commit ?? null;
    if (config.updateCheck === false) return answer(current, 'desactive');
    if (!current) return answer(current, 'developpement'); // rien à comparer
    const age = last ? now() - last.at : Infinity;
    const stale = age >= CACHE_MS || (force && age >= FORCE_MS);
    if (stale && !running) {
      running = ask().then((result) => {
        last = result;
        running = null;
        return result;
      });
    }
    const result = running ? await running : last;
    return answer(current, result.state, result);
  }

  return { status };
}
