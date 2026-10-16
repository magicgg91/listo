// Petits outils partagés par les tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Crée un dossier temporaire vide, effacé à la fin du test.
export function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listo-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
