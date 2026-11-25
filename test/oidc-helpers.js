// Faux fournisseur d'identité pour les tests de la connexion OpenID Connect
// (LISTO_OIDC=on) : aucun vrai réseau ; il signe de vrais jetons RS256.
// Partagé par test/oidc.test.js et test/oidc-sso-seulement.test.js.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp } from './helpers.js';

export const ISSUER = 'https://auth.exemple.test';
export const SECRET = 'secret-du-client-de-test';

// --- Faux Authelia ---
export function fakeAuthelia({ users = {} } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
  const codes = new Map(); // code -> { user, nonce, challenge, redirectUri }
  const tokens = new Map(); // jeton d'accès -> user
  const calls = [];
  const fake = {
    calls,
    nowS: () => Math.floor(Date.UTC(2026, 9, 16, 12, 0, 0) / 1000),
    // Réglages modifiables par un test
    tweak: {},
    sign(claims, { key = privateKey, alg = 'RS256', kid = 'k1' } = {}) {
      const header = Buffer.from(JSON.stringify({ alg, kid, typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
      const data = `${header}.${payload}`;
      const signature = alg === 'none' ? '' : crypto.sign('sha256', Buffer.from(data), key).toString('base64url');
      return `${data}.${signature}`;
    },
    // Le navigateur arrive sur la page d'Authelia ; la personne se connecte
    authorize(location, username) {
      const url = new URL(location);
      assert.equal(url.origin + url.pathname, `${ISSUER}/api/oidc/authorization`);
      const p = url.searchParams;
      assert.equal(p.get('response_type'), 'code');
      assert.equal(p.get('client_id'), 'listo');
      assert.equal(p.get('scope'), 'openid profile');
      assert.equal(p.get('code_challenge_method'), 'S256');
      const code = crypto.randomBytes(16).toString('hex');
      codes.set(code, { user: users[username], nonce: p.get('nonce'), challenge: p.get('code_challenge'), redirectUri: p.get('redirect_uri') });
      return { code, state: p.get('state'), redirectUri: p.get('redirect_uri') };
    },
    async request(url, { method = 'GET', headers = {}, body = null } = {}) {
      calls.push(`${method} ${url}`);
      if (url === `${ISSUER}/.well-known/openid-configuration`) {
        return { status: 200, json: fake.tweak.metadata ?? {
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/api/oidc/authorization`,
          token_endpoint: `${ISSUER}/api/oidc/token`,
          jwks_uri: `${ISSUER}/jwks.json`,
          userinfo_endpoint: `${ISSUER}/api/oidc/userinfo`,
        } };
      }
      if (url === `${ISSUER}/jwks.json`) return { status: 200, json: { keys: [jwk] } };
      if (url === `${ISSUER}/api/oidc/token` && method === 'POST') {
        const expected = `Basic ${Buffer.from(`listo:${encodeURIComponent(SECRET)}`).toString('base64')}`;
        if (headers.Authorization !== expected) return { status: 401, json: { error: 'invalid_client' } };
        const form = new URLSearchParams(body);
        const entry = codes.get(form.get('code'));
        codes.delete(form.get('code'));
        if (!entry || form.get('grant_type') !== 'authorization_code' || form.get('redirect_uri') !== entry.redirectUri) return { status: 400, json: { error: 'invalid_grant' } };
        // PKCE : le code_verifier doit correspondre au code_challenge du départ
        if (crypto.createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== entry.challenge) return { status: 400, json: { error: 'invalid_grant' } };
        const access = crypto.randomBytes(16).toString('hex');
        tokens.set(access, entry.user);
        const now = fake.nowS();
        const claims = { iss: ISSUER, aud: ['listo'], azp: 'listo', sub: entry.user.sub, nonce: entry.nonce, iat: now, exp: now + 3600, amr: entry.user.amr ?? ['pwd', 'otp', 'mfa'], ...fake.tweak.claims };
        return { status: 200, json: { access_token: access, token_type: 'bearer', id_token: fake.tweak.idToken?.(claims) ?? fake.sign(claims) } };
      }
      if (url === `${ISSUER}/api/oidc/userinfo`) {
        const user = tokens.get(String(headers.Authorization).replace(/^Bearer /, ''));
        if (!user) return { status: 401, json: null };
        return { status: 200, json: { sub: fake.tweak.userinfoSub ?? user.sub, preferred_username: user.username, name: user.name } };
      }
      return { status: 404, json: null };
    },
  };
  return fake;
}

export const OIDC_CONFIG = { oidc: true, oidcIssuer: ISSUER, oidcClientId: 'listo', oidcName: 'Authelia' };

export async function oidcApp(t, fake, config = {}) {
  return startTestApp(t, { config: { ...OIDC_CONFIG, ...config }, oidcRequest: fake.request, oidcClientSecret: SECRET });
}

// Parcours complet dans un « navigateur » (client avec ses cookies) ;
// renvoie l'adresse où Listo renvoie le navigateur à la fin
export async function signIn(client, fake, username, { alter } = {}) {
  const start = await client.request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' });
  assert.equal(start.status, 303);
  const back = fake.authorize(start.headers.get('location'), username);
  const params = new URLSearchParams({ code: back.code, state: back.state });
  alter?.(params);
  const ret = await client.request('GET', `/oidc/retour?${params}`, undefined, {}, { redirect: 'manual' });
  assert.equal(ret.status, 303);
  return ret.headers.get('location');
}

export const PEOPLE = {
  lea: { sub: 'sub-lea', username: 'lea', name: 'Léa' },
  LEA: { sub: 'sub-lea', username: 'Lea', name: 'Léa' },
  imposteur: { sub: 'sub-autre', username: 'lea', name: 'Pas Léa' },
  nouveau: { sub: 'sub-nouveau', username: 'Nouveau.Venu', name: 'Nouveau Venu' },
  admin2fa: { sub: 'sub-admin', username: 'guillaume', name: 'Guillaume', amr: ['pwd'] },
  adminmfa: { sub: 'sub-admin', username: 'guillaume', name: 'Guillaume', amr: ['pwd', 'otp', 'mfa'] },
};
