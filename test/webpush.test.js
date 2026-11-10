// Chiffrement des notifications (RFC 8291) et jeton VAPID (RFC 8292),
// vérifiés avec les exemples officiels des RFC.
//
// Source des valeurs : RFC 8291, section 5 et annexe A ; RFC 8292,
// section 2.4. Les sites de l'IETF étant inaccessibles depuis
// l'environnement de développement, elles ont été relevées dans le texte
// source des RFC, sur le dépôt du groupe de travail IETF « webpush »
// (github.com/webpush-wg/webpush-encryption et webpush-vapid).

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encryptMessage, decryptMessage, generateVapidKeys, vapidKeyObject, vapidAuthorization, verifyVapid,
  fromB64url, toB64url, isP256PublicKey, MAX_PLAINTEXT_BYTES,
} from '../server/webpush.js';

const b = (text) => fromB64url(text.replace(/\s+/g, ''));

// --- RFC 8291, annexe A ---
const RFC8291 = {
  plaintext: b('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
  asPublic: b('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
  asPrivate: b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
  uaPublic: b('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
  uaPrivate: b('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'),
  salt: b('DGv6ra1nlYgDCS1FRnbzlw'),
  auth: b('BTBZMqHH6r4Tts7J_aSIgg'),
  // Message complet de l'exemple (section 5)
  body: b(`DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
    mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
    pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`),
  header: b('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8'),
  ciphertext: b('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ'),
};

test('RFC 8291 : le texte de l\'exemple vaut bien « When I grow up, I want to be a watermelon »', () => {
  assert.equal(RFC8291.plaintext.toString(), 'When I grow up, I want to be a watermelon');
});

test('RFC 8291 : mêmes clés, même sel → exactement le message de l\'exemple (en-tête et texte chiffré)', () => {
  const body = encryptMessage({
    plaintext: RFC8291.plaintext, uaPublic: RFC8291.uaPublic, authSecret: RFC8291.auth,
    salt: RFC8291.salt, asPrivate: RFC8291.asPrivate,
  });
  // Le message de l'exemple décodé fait 144 octets (86 + 41 + 1 + 16) ; la
  // ligne « Content-Length: 145 » de l'exemple ne correspond pas à ces octets
  // (coquille du texte de la RFC) : ce sont les octets qui font foi.
  assert.equal(RFC8291.body.length, 144);
  assert.equal(body.length, 144);
  assert.deepEqual(body.subarray(0, 86), RFC8291.header, 'en-tête de 86 octets');
  assert.deepEqual(body.subarray(86), RFC8291.ciphertext, 'texte chiffré');
  assert.deepEqual(body, RFC8291.body, 'message complet');
});

test('RFC 8291 : valeurs intermédiaires de l\'annexe A (secret ECDH, PRK, IKM, CEK, nonce)', () => {
  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(RFC8291.asPrivate);
  assert.deepEqual(ecdh.getPublicKey(), RFC8291.asPublic);
  const secret = ecdh.computeSecret(RFC8291.uaPublic);
  assert.equal(toB64url(secret), 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs');
  const prkKey = hmac(RFC8291.auth, secret);
  assert.equal(toB64url(prkKey), 'Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k');
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), RFC8291.uaPublic, RFC8291.asPublic]);
  assert.deepEqual(keyInfo, b(`V2ViUHVzaDogaW5mbwAEJXGyvs3942BVGq8e0PTNNmwR zr5VX4m8t7GGpTM5FzFo7OLr4BhZe9MEebhuPI-OztV3
    ylkYfpJGmQ22ggCLDgT-M_SrDepxkU21WCP3O1SUj0Ew bZIHMtu5pZpTKGSCIA5Zent7wmC6HCJ5mFgJkuk5cwAv MBKiiujwa7t45ewP`));
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  assert.equal(toB64url(ikm), 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg');
  const prk = hmac(RFC8291.salt, ikm);
  assert.equal(toB64url(prk), '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc');
  assert.equal(toB64url(Buffer.from('Content-Encoding: aes128gcm\0')), 'Q29udGVudC1FbmNvZGluZzogYWVzMTI4Z2NtAA');
  assert.equal(toB64url(Buffer.from('Content-Encoding: nonce\0')), 'Q29udGVudC1FbmNvZGluZzogbm9uY2UA');
  assert.equal(toB64url(hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16)), 'oIhVW04MRdy2XN9CiKLxTg');
  assert.equal(toB64url(hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12)), '4h_95klXJ5E_qnoN');
});

test('RFC 8291 : l\'appareil (clé privée de l\'exemple) déchiffre le message de l\'exemple', () => {
  const plain = decryptMessage({ body: RFC8291.body, uaPrivate: RFC8291.uaPrivate, uaPublic: RFC8291.uaPublic, authSecret: RFC8291.auth });
  assert.equal(plain.toString(), 'When I grow up, I want to be a watermelon');
});

test('chiffrement : sel et clé neufs à chaque message ; un autre appareil ou un message modifié ne se déchiffre pas', () => {
  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const text = JSON.stringify({ web_push: 8030, notification: { title: 'Léa a modifié « Courses »' } });
  const one = encryptMessage({ plaintext: text, uaPublic: ua.getPublicKey(), authSecret: auth });
  const two = encryptMessage({ plaintext: text, uaPublic: ua.getPublicKey(), authSecret: auth });
  assert.notDeepEqual(one.subarray(0, 16), two.subarray(0, 16), 'sel différent');
  assert.notDeepEqual(one.subarray(21, 86), two.subarray(21, 86), 'clé du serveur différente');
  assert.equal(decryptMessage({ body: one, uaPrivate: ua.getPrivateKey(), uaPublic: ua.getPublicKey(), authSecret: auth }).toString(), text);
  // Mauvais secret : refusé
  assert.throws(() => decryptMessage({ body: one, uaPrivate: ua.getPrivateKey(), uaPublic: ua.getPublicKey(), authSecret: crypto.randomBytes(16) }));
  // Un octet changé : refusé (authentification AES-GCM)
  const altered = Buffer.from(one);
  altered[100] ^= 1;
  assert.throws(() => decryptMessage({ body: altered, uaPrivate: ua.getPrivateKey(), uaPublic: ua.getPublicKey(), authSecret: auth }));
});

test('chiffrement : 4096 octets de corps au plus ; clés de l\'appareil vérifiées', () => {
  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const body = encryptMessage({ plaintext: 'x'.repeat(MAX_PLAINTEXT_BYTES), uaPublic: ua.getPublicKey(), authSecret: auth });
  assert.equal(body.length, 4096);
  assert.throws(() => encryptMessage({ plaintext: 'x'.repeat(MAX_PLAINTEXT_BYTES + 1), uaPublic: ua.getPublicKey(), authSecret: auth }), /trop long/);
  // Point hors de la courbe, mauvaise longueur, forme compressée : refusés
  const offCurve = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]);
  assert.equal(isP256PublicKey(offCurve), false);
  assert.equal(isP256PublicKey(ua.getPublicKey().subarray(0, 64)), false);
  assert.equal(isP256PublicKey(ua.getPublicKey('buffer', 'compressed')), false);
  assert.throws(() => encryptMessage({ plaintext: 'a', uaPublic: offCurve, authSecret: auth }), /Clé/);
  assert.throws(() => encryptMessage({ plaintext: 'a', uaPublic: ua.getPublicKey(), authSecret: crypto.randomBytes(15) }), /Secret/);
});

// --- RFC 8292, section 2.4 ---
test('RFC 8292 : la signature de l\'exemple est valable avec la clé de l\'exemple ; ses informations sont relues', () => {
  const t = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1haWx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_HLGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA';
  const k = 'BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs';
  const result = verifyVapid(`vapid t=${t}, k=${k}`);
  assert.ok(result, 'signature acceptée');
  assert.deepEqual(result.header, { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(result.claims, { aud: 'https://push.example.net', exp: 1453523768, sub: 'mailto:push@example.com' });
  // La clé k est bien celle du JWK de l'exemple (x et y)
  const key = fromB64url(k);
  assert.equal(toB64url(key.subarray(1, 33)), 'DUfHPKLVFQzVvnCPGyfucbECzPDa7rWbXriLcysAjEc');
  assert.equal(toB64url(key.subarray(33)), 'F6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs');
  // Une signature abîmée est refusée
  const at = t.length - 20; // un caractère au milieu de la signature
  const broken = `${t.slice(0, at)}${t[at] === 'A' ? 'B' : 'A'}${t.slice(at + 1)}`;
  assert.equal(verifyVapid(`vapid t=${broken}, k=${k}`), null);
});

test('VAPID : Listo signe en ES256 ; aud = origine du service, exp ≤ 24 h, sub = adresse publique https (jamais un e-mail)', () => {
  const keys = generateVapidKeys();
  assert.equal(fromB64url(keys.publicKey).length, 65);
  assert.equal(fromB64url(keys.privateKey).length, 32);
  const key = vapidKeyObject(keys);
  const now = Date.UTC(2026, 10, 10, 12);
  const header = vapidAuthorization({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc:def', subject: 'https://listo.exemple.fr', publicKey: keys.publicKey, key, now,
  });
  assert.match(header, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  const result = verifyVapid(header);
  assert.ok(result);
  assert.deepEqual(result.header, { typ: 'JWT', alg: 'ES256' });
  assert.equal(result.claims.aud, 'https://fcm.googleapis.com');
  assert.equal(result.claims.sub, 'https://listo.exemple.fr');
  assert.ok(result.claims.exp > now / 1000 && result.claims.exp <= now / 1000 + 24 * 3600);
  assert.equal(result.publicKey, keys.publicKey);
  // Une autre paire de clés ne signe pas pour celle-ci
  const other = generateVapidKeys();
  assert.throws(() => vapidKeyObject({ publicKey: keys.publicKey, privateKey: other.privateKey }), /ne vont pas ensemble/);
});
