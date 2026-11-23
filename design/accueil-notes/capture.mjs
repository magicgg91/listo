// Captures des maquettes (design/accueil-notes/captures/), clair et sombre.
// Usage : node design/accueil-notes/capture.mjs  (Playwright préinstallé)
// Téléphone : 390 × 844 points à 2x (780 × 1688 px), comme les captures
// existantes ; ordinateur : 1 440 × 900 points à 2x.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Playwright préinstallé (hors du projet) : chargé par require
const { chromium } = createRequire(import.meta.url)('playwright');
const SHOTS = [
  ['reference-telephone.html', ['accueil-1', 'accueil-2', 'accueil-3', 'notes-1', 'notes-3', 'note-1', 'note-2', 'notifications-1', 'notifications-2'], { width: 390, height: 844 }],
  ['reference-ordinateur.html', ['pc-accueil-1', 'pc-notes-1', 'pc-listes-1'], { width: 1440, height: 900 }],
];
const THEMES = [['light', 'clair'], ['dark', 'sombre']];

const browser = await chromium.launch();
for (const [file, ids, viewport] of SHOTS) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  for (const id of ids) {
    for (const [theme, suffix] of THEMES) {
      await page.goto(pathToFileURL(join(here, file)).href);
      // Un seul écran dans la page, sans cadre, à 0,0, dans le thème voulu
      await page.evaluate(([shotId, themeName]) => {
        const frame = document.getElementById(shotId).querySelector('.phone, .desk');
        const sprite = document.querySelector('body > svg');
        document.body.replaceChildren(sprite, frame);
        document.documentElement.classList.add('is-capture');
        document.documentElement.dataset.theme = themeName;
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
