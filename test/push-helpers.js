// Outils des tests des notifications push : faux appareils (clés comme un
// navigateur) et faux service de push (note chaque envoi, sans réseau).

import crypto from 'node:crypto';
import { decryptMessage, toB64url } from '../server/webpush.js';

// Faux appareil. seed : clés tirées d'une graine (deux exécutions d'un même
// scénario utilisent alors exactement les mêmes appareils)
export function fakeDevice(endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomBytes(12).toString('hex')}`, seed = null) {
  const ecdh = crypto.createECDH('prime256v1');
  if (seed) ecdh.setPrivateKey(crypto.createHash('sha256').update(`appareil:${seed}`).digest());
  else ecdh.generateKeys();
  const auth = seed ? crypto.createHash('sha256').update(`auth:${seed}`).digest().subarray(0, 16) : crypto.randomBytes(16);
  return {
    subscription: { endpoint, keys: { p256dh: toB64url(ecdh.getPublicKey()), auth: toB64url(auth) } },
    read: (body) => JSON.parse(decryptMessage({ body, uaPrivate: ecdh.getPrivateKey(), uaPublic: ecdh.getPublicKey(), authSecret: auth }).toString()),
  };
}

// Faux service de push : note chaque envoi (avec l'heure de l'horloge du
// test, une fois service.clock posé) et répond le statut demandé
export function fakePushService() {
  const calls = [];
  const service = async (endpoint, { headers, body }) => {
    calls.push({ endpoint, headers, body, at: service.clock ? service.clock.now : null });
    return { status: service.status };
  };
  service.status = 201;
  service.calls = calls;
  return service;
}
