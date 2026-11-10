// Notifications push : chiffrement des messages et signature VAPID, écrits
// avec le seul module crypto de Node (aucune bibliothèque).
//
// Deux normes :
// - RFC 8291 (« Message Encryption for Web Push ») : le message est chiffré
//   pour UN appareil, avec la clé publique (p256dh) et le secret (auth) que
//   cet appareil a donnés en s'abonnant. Le service de push (Google, Apple,
//   Mozilla, Microsoft) transporte le message sans pouvoir le lire.
//   Codage « aes128gcm » de la RFC 8188, en un seul bloc.
// - RFC 8292 (« VAPID ») : Listo signe un petit jeton (JWT, algorithme
//   ES256) avec sa propre clé ; le service de push sait ainsi que les
//   messages viennent toujours du même serveur.
//
// Les deux sont vérifiés par test/webpush.test.js avec les exemples
// officiels des RFC (valeurs intermédiaires comprises).

import crypto from 'node:crypto';

// --- Base64url (sans « = » final), utilisé partout dans le Web Push ---
export const toB64url = (buffer) => Buffer.from(buffer).toString('base64url');
export function fromB64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(text)) return null;
  return Buffer.from(text.replace(/=+$/, ''), 'base64url');
}

// HMAC-SHA-256 (base de HKDF, comme l'écrit la RFC 8291, section 3.4)
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Taille d'un bloc annoncée dans l'en-tête (« rs ») : 4096, la valeur de
// l'exemple de la RFC ; le message doit tenir dans un seul bloc
export const RECORD_SIZE = 4096;
// En-tête aes128gcm : sel (16) + rs (4) + longueur de keyid (1) + clé (65)
export const HEADER_BYTES = 86;
// Un service de push n'est pas obligé d'accepter plus de 4096 octets de
// corps (RFC 8030, section 7.2) : en-tête 86, délimiteur 1, étiquette 16,
// soit 3993 octets de texte au plus. Listo s'en tient à 4096 octets en tout.
export const MAX_BODY_BYTES = 4096;
export const MAX_PLAINTEXT_BYTES = MAX_BODY_BYTES - HEADER_BYTES - 1 - 16;

// Clé publique P-256 « non compressée » : 65 octets commençant par 0x04,
// et point réellement situé sur la courbe (sinon l'échange de clés échoue)
export function isP256PublicKey(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== 65 || buffer[0] !== 0x04) return false;
  try {
    crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: toB64url(buffer.subarray(1, 33)), y: toB64url(buffer.subarray(33)) }, format: 'jwk' });
    return true;
  } catch {
    return false;
  }
}

// Chiffre un message pour un appareil (RFC 8291, section 3.4 ; RFC 8188).
// - plaintext : Buffer ou texte (3993 octets au plus)
// - uaPublic : clé publique de l'appareil (p256dh, 65 octets)
// - authSecret : secret de l'appareil (auth, 16 octets)
// - salt, asPrivate : tirés au hasard à chaque message ; les tests les
//   fixent pour retrouver l'exemple de la RFC
// Renvoie le corps à envoyer (en-tête + texte chiffré).
export function encryptMessage({ plaintext, uaPublic, authSecret, salt = crypto.randomBytes(16), asPrivate = null }) {
  const data = Buffer.from(plaintext);
  if (data.length > MAX_PLAINTEXT_BYTES) throw new Error('Message trop long pour une notification.');
  if (!isP256PublicKey(uaPublic)) throw new Error('Clé de l\'appareil invalide.');
  if (!Buffer.isBuffer(authSecret) || authSecret.length !== 16) throw new Error('Secret de l\'appareil invalide.');
  if (!Buffer.isBuffer(salt) || salt.length !== 16) throw new Error('Sel invalide.');

  // 1. Échange de clés (ECDH P-256) : une paire de clés neuve par message
  const ecdh = crypto.createECDH('prime256v1');
  if (asPrivate) ecdh.setPrivateKey(asPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // 65 octets, forme non compressée
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  // 2. Mélange avec le secret de l'appareil (HKDF, RFC 8291 section 3.3)
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));

  // 3. Clé de chiffrement et nonce (RFC 8188, section 2.2 et 2.3)
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  // 4. Chiffrement AES-128-GCM d'un seul bloc : texte + délimiteur 0x02
  //    (dernier bloc), sans remplissage
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([data, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  // 5. En-tête : sel, taille de bloc (4 octets), longueur puis clé publique
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(RECORD_SIZE);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, encrypted]);
}

// Déchiffre un message (ce que fait l'appareil). Sert seulement aux tests et
// au faux service de push des vérifications : Listo n'en a pas besoin.
export function decryptMessage({ body, uaPrivate, uaPublic, authSecret }) {
  const salt = body.subarray(0, 16);
  const idLength = body[20];
  const asPublic = body.subarray(21, 21 + idLength);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const ecdhSecret = ecdh.computeSecret(asPublic);
  const prkKey = hmac(authSecret, ecdhSecret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const record = body.subarray(21 + idLength);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  // Délimiteur du dernier bloc (0x02), après un éventuel remplissage de zéros
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end -= 1;
  if (plain[end] !== 2) throw new Error('Délimiteur invalide.');
  return plain.subarray(0, end);
}

// --- VAPID (RFC 8292) ---

// Nouvelle paire de clés ECDSA P-256 pour signer les jetons. Renvoie la clé
// publique (65 octets, forme non compressée, celle que le navigateur reçoit
// comme applicationServerKey) et la clé privée (32 octets), en base64url.
export function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  return {
    publicKey: toB64url(Buffer.concat([Buffer.from([4]), fromB64url(pub.x), fromB64url(pub.y)])),
    privateKey: jwk.d,
  };
}

// Vérifie une paire de clés lue sur le disque ; renvoie un objet clé privée
// prêt à signer, ou lève une erreur claire
export function vapidKeyObject({ publicKey, privateKey }) {
  const pub = fromB64url(publicKey);
  const d = fromB64url(privateKey);
  if (!pub || !isP256PublicKey(pub)) throw new Error('clé publique VAPID invalide');
  if (!d || d.length !== 32) throw new Error('clé privée VAPID invalide');
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: toB64url(pub.subarray(1, 33)), y: toB64url(pub.subarray(33)), d: toB64url(d) },
    format: 'jwk',
  });
  // La clé privée doit bien aller avec la clé publique : la clé publique
  // recalculée à partir de la clé privée (d) doit être la même
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  if (!ecdh.getPublicKey().equals(pub)) throw new Error('les deux clés VAPID ne vont pas ensemble');
  return key;
}

// En-tête Authorization d'un envoi (RFC 8292, sections 2 et 3) :
// « vapid t=<jeton>, k=<clé publique> ». Le jeton dit :
// - aud : l'origine du service de push appelé (https://fcm.googleapis.com…) ;
// - exp : sa fin de validité (au plus 24 h ; ici 12 h) ;
// - sub : comment joindre le serveur. Listo donne son adresse publique
//   (LISTO_PUBLIC_URL), JAMAIS une adresse e-mail : elle partirait chez les
//   services de push.
export const VAPID_HOURS = 12;
export function vapidAuthorization({ endpoint, subject, publicKey, key, now = Date.now() }) {
  const header = toB64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = toB64url(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + VAPID_HOURS * 3600,
    sub: subject,
  }));
  const input = `${header}.${claims}`;
  // ES256 : signature ECDSA P-256 / SHA-256, au format JOSE (r || s, 64 octets)
  const signature = crypto.sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${input}.${toB64url(signature)}, k=${publicKey}`;
}

// Vérifie un en-tête VAPID (ce que fait le service de push). Sert aux tests
// (exemple de la RFC 8292) et au faux service de push. Renvoie les
// informations du jeton, ou null si la signature est fausse.
export function verifyVapid(authorization) {
  const match = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), ?k=([A-Za-z0-9_-]+)$/.exec(authorization ?? '');
  if (!match) return null;
  const [, header, claims, signature, k] = match;
  const pub = fromB64url(k);
  if (!isP256PublicKey(pub)) return null;
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: toB64url(pub.subarray(1, 33)), y: toB64url(pub.subarray(33)) }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, fromB64url(signature));
  if (!ok) return null;
  return { header: JSON.parse(fromB64url(header)), claims: JSON.parse(fromB64url(claims)), publicKey: k };
}
