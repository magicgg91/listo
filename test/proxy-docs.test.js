// Documentation du proxy inverse : Listo demande un proxy HTTPS, peu importe
// lequel ; Nginx Proxy Manager n'est qu'un exemple. Les besoins écrits dans
// le guide sont ceux du code (taille des photos, signal du temps réel, un
// seul proxy de confiance, HTTPS obligatoire en production).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUIDE, outline } from '../public/js/help-content.js';
import { MAX_PHOTO_BYTES } from '../server/photos.js';
import { KEEPALIVE_MS } from '../server/events.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const sectionText = (id) => {
  const section = GUIDE.flatMap((c) => c.sections ?? []).find((s) => s.id === id);
  return JSON.stringify(section.blocks);
};

test('guide : « Ce que doit faire le proxy », puis Nginx Proxy Manager présenté comme un exemple', () => {
  const titles = new Map(outline().map((e) => [e.id, e.title]));
  assert.equal(titles.get('proxy'), 'Ce que doit faire le proxy');
  assert.equal(titles.get('npm'), 'Exemple avec Nginx Proxy Manager');
  const ids = outline().map((e) => e.id);
  assert.ok(ids.indexOf('proxy') < ids.indexOf('npm'), 'les besoins avant l\'exemple');
  assert.match(sectionText('prerequis'), /peu importe lequel/);
  assert.match(sectionText('prerequis'), /Nginx Proxy Manager, Caddy, Traefik, nginx, Apache/);
  // Nginx Proxy Manager n'est cité que dans l'exemple (et le renvoi vers lui), la liste des produits
  // possibles et les réponses de dépannage « avec nginx ou Nginx Proxy Manager »
  for (const chapter of GUIDE) {
    for (const section of chapter.sections ?? []) {
      if (!JSON.stringify(section.blocks).includes('Nginx Proxy Manager')) continue;
      assert.ok(['prerequis', 'proxy', 'npm', 'faq-photo', 'faq-retard'].includes(section.id), `« Nginx Proxy Manager » cité dans ${section.id}`);
    }
  }
  assert.match(sectionText('faq-photo'), /Avec nginx ou Nginx Proxy Manager/);
  assert.match(sectionText('faq-retard'), /Avec nginx ou Nginx Proxy Manager/);
});

test('guide : les besoins du proxy correspondent au code', () => {
  const proxy = sectionText('proxy');
  // Photos : 2 Mo au plus (server/photos.js)
  assert.equal(MAX_PHOTO_BYTES, 2 * 1024 * 1024);
  assert.match(proxy, /au moins 2 Mo/);
  // Temps réel : un signal toutes les 25 secondes (server/events.js), en-tête X-Accel-Buffering
  assert.equal(KEEPALIVE_MS, 25 * 1000);
  assert.match(proxy, /dépasser 25 secondes/);
  assert.match(read('server/events.js'), /'X-Accel-Buffering': 'no'/);
  assert.match(proxy, /X-Accel-Buffering: no/);
  assert.match(proxy, /pas un WebSocket/);
  // Un seul proxy de confiance (X-Forwarded-For)
  assert.match(read('server/app.js'), /app\.set\('trust proxy', 1\);/);
  assert.match(proxy, /un seul proxy/);
  assert.match(proxy, /X-Forwarded-For/);
  // HTTPS : obligatoire en production (server/config.js), cookies « Secure »
  assert.match(read('server/config.js'), /En production, LISTO_PUBLIC_URL doit commencer par https:\/\//);
  assert.match(proxy, /refuse de démarrer si `LISTO_PUBLIC_URL` ne commence pas par `https:\/\/`/);
  // Origine : le navigateur doit être sur LISTO_PUBLIC_URL (server/auth.js)
  assert.match(read('server/auth.js'), /if \(req\.get\('origin'\) !== allowed\)/);
  assert.match(proxy, /en-tête `Origin`/);
});

test('documents publics : un proxy HTTPS quel qu\'il soit, Nginx Proxy Manager en exemple', () => {
  const readme = read('README.md');
  assert.match(readme, /un proxy inverse HTTPS, peu importe lequel \(Nginx Proxy Manager, Caddy, Traefik, nginx, Apache…\)/);
  assert.doesNotMatch(readme, /proxy HTTPS \(Nginx Proxy Manager\)/);
  const compose = read('docker-compose.yml');
  assert.match(compose.split('\n')[0], /derrière un proxy inverse HTTPS \(Nginx Proxy Manager, Caddy,/);
  assert.doesNotMatch(compose, /derrière Nginx Proxy Manager/);
  assert.match(read('SECURITY.md'), /\(Nginx Proxy Manager, Caddy, Traefik, nginx ou autre\)/);
  assert.match(read('docs/exploitation.md'), /\[Ce que doit faire le proxy\]\(guide\.md#proxy\)/);
  // docs/guide.md est fabriqué depuis la même source
  const guide = read('docs/guide.md');
  assert.match(guide, /Ce que doit faire le proxy/);
  assert.match(guide, /Exemple avec Nginx Proxy Manager/);
  assert.doesNotMatch(guide, /Régler Nginx Proxy Manager/);
});
