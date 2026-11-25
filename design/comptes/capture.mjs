// Captures des maquettes des comptes (design/comptes/captures/), clair et sombre.
// Usage : node design/comptes/capture.mjs  (Playwright préinstallé)
// Téléphone : 390 × 844 points à 2x (780 × 1688 px), comme les captures
// existantes ; ordinateur : 1 440 × 900 points à 2x.
// Option : node design/comptes/capture.mjs admin-compte-1 partage-admin-1  (seulement ces écrans)
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Playwright préinstallé (hors du projet) : chargé par require
const { chromium } = createRequire(import.meta.url)('playwright');
const SHOTS = [
  ['reference-telephone.html', ['admin-comptes-1', 'admin-compte-1', 'admin-compte-2', 'nouveau-compte-1', 'invite-accueil-1', 'invite-projets-1', 'invite-reglages-1', 'partage-admin-1', 'partage-famille-1'], { width: 390, height: 844 }],
  ['reference-ordinateur.html', ['pc-invite-1', 'pc-admin-comptes-1'], { width: 1440, height: 900 }],
];
const THEMES = [['light', 'clair'], ['dark', 'sombre']];
const only = process.argv.slice(2);

const browser = await chromium.launch();
for (const [file, ids, viewport] of SHOTS) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  for (const id of ids) {
    if (only.length && !only.includes(id)) continue;
    for (const [theme, suffix] of THEMES) {
      await page.goto(pathToFileURL(join(here, file)).href);
      // Un seul écran dans la page, sans cadre, à 0,0, dans le thème voulu
      await page.evaluate(([shotId, themeName]) => {
        const frame = document.getElementById(shotId).querySelector('.phone, .desk');
        const sprite = document.querySelector('body > svg');
        document.body.replaceChildren(sprite, frame);
        document.documentElement.classList.add('is-capture');
        document.documentElement.dataset.theme = themeName;
        window.prepare(); // page du compte défilée (admin-compte-2)
      }, [id, theme]);
      await page.evaluate(() => document.fonts.ready);
      const path = join(here, 'captures', `${id}-${suffix}.png`);
      await page.screenshot({ path, clip: { x: 0, y: 0, ...viewport } });
      console.log(path);
    }
  }
  await page.close();
}
await browser.close();
