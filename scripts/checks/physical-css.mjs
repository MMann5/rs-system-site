// AD-7, NFR6, AD-11 : propriétés CSS logiques uniquement dans tout src/ (.css, .astro, .ts, .mjs, .js),
// sauf sur une ligne marquée `physical-ok` (élément qui ne se retourne jamais : logo). Axe horizontal
// seulement : left/right, *-left/*-right, text-align/float/clear à left/right.
// Déplacé de tests/styles.test.mjs (story 1.2) sans changement de logique ; appliqué à src/ en entier.
// Usage : node scripts/checks/physical-css.mjs [racine]  (défaut : racine du dépôt).
import { join } from 'node:path';
import { lineOf, sourceFiles, stripComments } from './colors.mjs';
import { isMain, report, REPO_ROOT, rootArg } from './report.mjs';

/** AD-7 : propriétés logiques uniquement (sauf ligne marquée physical-ok). */
export function findPhysicalProperties(files) {
  const errors = [];
  const rules = [
    /(?<=(?:^|[{;])\s*)(left|right)\s*:/gm,
    /(?<=(?:^|[{;])\s*)([\w-]+-(?:left|right)(?:-[\w-]+)?)\s*:/gm,
    /(?<![\w-])((?:text-align|float|clear)\s*:\s*(?:left|right))\b/g,
  ];
  for (const { path, text } of files) {
    const src = stripComments(text);
    const original = text.split('\n');
    for (const re of rules) {
      for (const m of src.matchAll(re)) {
        const line = lineOf(src, m.index);
        if (original[line - 1].includes('physical-ok')) continue;
        errors.push(`${path}:${line} : propriété physique « ${m[1]} »`);
      }
    }
  }
  return errors;
}

if (isMain(import.meta.url)) {
  const root = rootArg(REPO_ROOT);
  report('physical-css', findPhysicalProperties(sourceFiles(root, join(root, 'src'))));
}
