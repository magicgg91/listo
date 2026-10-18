// Lecture d'une réponse JSON venue d'un autre site (GitHub, Open Food Facts),
// limitée en taille : jamais tout un fichier énorme en mémoire. Au-delà de
// maxBytes, la lecture s'arrête et c'est une erreur.

export async function readJson(res, maxBytes) {
  // Taille annoncée trop grande : inutile de lire
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
