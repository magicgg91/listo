// Captures des maquettes des projets (design/projets/captures/), clair et sombre.
// Usage : node design/projets/capture.mjs  (Playwright préinstallé)
// Téléphone : 390 × 844 points à 2x (780 × 1688 px), comme les captures
// existantes ; ordinateur : 1 440 × 900 points à 2x.
// Option : node design/projets/capture.mjs projet-1 carte-1  (seulement ces écrans)
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Playwright préinstallé (hors du projet) : chargé par require
const { chromium } = createRequire(import.meta.url)('playwright');
const SHOTS = [
  ['reference-telephone.html', ['accueil-1', 'projets-1', 'projets-2', 'projet-1', 'projet-2', 'carte-1', 'carte-2', 'carte-3', 'deplacer-1', 'partage-1', 'reglages-projet-1', 'colonne-1', 'fonctions-1', 'corbeille-1'], { width: 390, height: 844 }],
  ['reference-ordinateur.html', ['pc-projets-1', 'pc-projet-1', 'pc-carte-1', 'pc-reglages-projet-1'], { width: 1440, height: 900 }],
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
        window.prepare(); // onglet de la colonne en vue, carte défilée
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
