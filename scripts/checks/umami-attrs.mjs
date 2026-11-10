// Story 7.1 (AD-6, AD-11) : aucun attribut d'événement Umami « data-umami-* » (suivi déclaratif d'Umami) dans src/ ni
// public/ : les clics passent par data-track / data-placement et seul src/scripts/track.ts parle à Umami. Recherche insensible à la casse dans les fichiers texte.
// Usage : node scripts/checks/umami-attrs.mjs [racine]  (défaut : racine du dépôt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isBinary, isMain, rel, report, REPO_ROOT, rootArg, walk } from './report.mjs';

const DIRS = ['src', 'public'];
const ATTR = /data-umami-/i;

/** Échecs `{fichier}:{ligne} : …` des fichiers texte de src/ et public/ sous `root` qui contiennent data-umami-. */
export function findUmamiAttrs(root) {
  const failures = [];
  for (const dir of DIRS) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const path of walk(base).sort()) {
      const buffer = readFileSync(path);
      if (isBinary(buffer)) continue;
      buffer
        .toString('utf8')
        .split('\n')
        .forEach((line, i) => {
          if (ATTR.test(line)) failures.push(`${rel(root, path)}:${i + 1} : attribut data-umami-* interdit (AD-6)`);
        });
    }
  }
  return failures;
}

if (isMain(import.meta.url)) {
  report('umami-attrs', findUmamiAttrs(rootArg(REPO_ROOT)));
}
