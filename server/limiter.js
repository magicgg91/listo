// Limitation des tentatives de connexion (contre les essais de mots de passe
// au hasard).
//
// Règle : 5 échecs en 15 minutes pour une même « clé » bloquent cette clé
// pendant 15 minutes. Une clé est soit un identifiant (« u:guillaume »), soit
// une adresse IP (« ip:1.2.3.4 ») : il suffit que l'une des deux soit bloquée
// pour refuser la tentative, même avec le bon mot de passe.
//
// Les compteurs sont gardés en mémoire : un redémarrage de Listo les remet à
// zéro, ce qui est sans conséquence (un attaquant ne peut pas le provoquer).

const MINUTE = 60 * 1000;

export function createLimiter({ max = 5, windowMs = 15 * MINUTE, blockMs = 15 * MINUTE, now = Date.now } = {}) {
  // clé -> { failures: [dates des échecs récents], blockedUntil: date ou 0 }
  const entries = new Map();

  // Renvoie l'entrée à jour d'une clé (ou null s'il n'y a plus rien à retenir)
  function entry(key) {
    const e = entries.get(key);
    if (!e) return null;
    const t = now();
    // Fin du blocage : on repart de zéro
    if (e.blockedUntil && e.blockedUntil <= t) {
      entries.delete(key);
      return null;
    }
    // Les échecs de plus de 15 minutes ne comptent plus
    e.failures = e.failures.filter((time) => time > t - windowMs);
    if (!e.blockedUntil && e.failures.length === 0) {
      entries.delete(key);
      return null;
    }
    return e;
  }

  return {
    // Vrai si l'une des clés est actuellement bloquée
    isBlocked(keys) {
      return keys.some((key) => Boolean(entry(key)?.blockedUntil));
    },

    // Enregistre un échec pour chaque clé ; au 5e échec, la clé est bloquée
    fail(keys) {
      const t = now();
      for (const key of keys) {
        const e = entry(key) ?? { failures: [], blockedUntil: 0 };
        e.failures.push(t);
        if (!e.blockedUntil && e.failures.length >= max) e.blockedUntil = t + blockMs;
        entries.set(key, e);
      }
    },

    // Retire le dernier échec enregistré. Sert quand une tentative a été
    // comptée d'avance et s'avère correcte (mot de passe bon, mais code 2FA
    // encore à saisir) : elle ne doit pas réduire les essais de code.
    forgive(keys) {
      for (const key of keys) {
        const e = entry(key);
        if (!e || e.failures.length === 0) continue;
        const last = e.failures.pop();
        // Si c'est justement cette tentative qui avait déclenché le blocage
        if (e.blockedUntil === last + blockMs && e.failures.length < max) e.blockedUntil = 0;
        if (!e.blockedUntil && e.failures.length === 0) entries.delete(key);
      }
    },

    // Remet les compteurs à zéro (après une connexion réussie)
    reset(keys) {
      for (const key of keys) entries.delete(key);
    },

    // Supprime les entrées périmées (appelé régulièrement)
    prune() {
      for (const key of [...entries.keys()]) entry(key);
    },
  };
}
