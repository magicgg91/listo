// Petits outils partagés par les tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { openDatabase } from '../server/db.js';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/passwords.js';

// Adresse publique utilisée par les tests (pour l'en-tête Origin)
export const ORIGIN = 'http://listo.test';
export const SETUP_CODE = 'K7RM-4XQP-9DHT';

// Crée un dossier temporaire vide, effacé à la fin du test.
export function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listo-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Démarre Listo sur un port libre, avec une base en mémoire, une horloge
// réglable (clock.now) et un journal capturé (logs).
export async function startTestApp(t, { config = {}, setupCode = SETUP_CODE, journalFile = null, photosDir = tempDir(t), eventOptions = {} } = {}) {
  const clock = { now: Date.UTC(2026, 9, 16, 12, 0, 0) };
  const logs = [];
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    config: { ...loadConfig({}), publicUrl: ORIGIN, ...config },
    setupCode,
    now: () => clock.now,
    log: (line) => logs.push(line),
    journalFile,
    photosDir,
    eventOptions,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => {
    app.locals.ctx.events.closeAll(); // flux temps réel encore ouverts
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, clock, logs, base, photosDir, ctx: app.locals.ctx, client: (options) => createClient(base, options) };
}

// Client HTTP qui garde ses cookies, comme un navigateur. Il envoie l'en-tête
// Origin de Listo (sauf origin: null) et peut simuler une adresse IP (via
// X-Forwarded-For, comme le ferait Nginx Proxy Manager).
export function createClient(base, { origin = ORIGIN, ip } = {}) {
  const jar = new Map();

  async function request(method, url, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (origin) headers.origin = origin;
    if (ip) headers['x-forwarded-for'] = ip;
    if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';

    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookies = res.headers.getSetCookie();
    for (const cookie of setCookies) {
      const [pair] = cookie.split(';');
      const name = pair.slice(0, pair.indexOf('=')).trim();
      const value = pair.slice(pair.indexOf('=') + 1).trim();
      if (!value || /expires=Thu, 01 Jan 1970/i.test(cookie)) jar.delete(name);
      else jar.set(name, value);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text, headers: res.headers, setCookies };
  }

  return {
    jar,
    request,
    get: (url) => request('GET', url),
    post: (url, body = {}) => request('POST', url, body),
    del: (url) => request('DELETE', url),
  };
}

// Ajoute directement un compte en base (en attendant l'administration)
export async function addUser(db, { username, password, role = 'user', active = 1 }) {
  const hash = await hashPassword(password);
  return db.prepare('INSERT INTO users (username, display_name, password_hash, role, active) VALUES (?, ?, ?, ?, ?)')
    .run(username, username, hash, role, active).lastInsertRowid;
}

// Crée le premier Admin par la route /api/setup et renvoie son client connecté
export async function setupAdmin(app, { username = 'guillaume', password = 'MotDePasseAdmin!' } = {}) {
  const client = app.client();
  const res = await client.post('/api/setup', { code: SETUP_CODE, username, password, displayName: 'Guillaume' });
  if (res.status !== 201) throw new Error(`Création de l'Admin impossible : ${res.text}`);
  return client;
}

// Connecte un client avec identifiant et mot de passe
export async function login(client, username, password) {
  return client.post('/api/login', { username, password });
}
