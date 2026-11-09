// FR40, AD-11 : un contenu manquant n'existe que comme <Placeholder> (attribut data-placeholder).
// Par page de dist/ : aucun placeholder → ok ; sinon bloquant (code 1) sur un build INDEXABLE ou une PR
// `blog-auto` (BLOG_AUTO=true, posé par ci.yml), simple avertissement (annotation GitHub ::warning::,
// code 0) ailleurs. Le blocage dans la chaîne `build` de Cloudflare arrive en epic 7.
// Usage : node scripts/checks/placeholders.mjs [dossier]  (défaut : dist/ du dépôt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INDEXABLE } from '../../src/lib/env.ts';
import { isMain, rel, report, REPO_ROOT, rootArg, walk } from './report.mjs';

const PLACEHOLDER = /<[a-z][\w-]*\b[^>]*?\sdata-placeholder(?=[\s=/>])/gi;

/** `ok` sans placeholder ; `block` sur un build indexable ou une PR blog-auto ; `warn` sinon. */
export function placeholderVerdict({ count, indexable, blogAuto }) {
  if (count === 0) return 'ok';
  return indexable || blogAuto ? 'block' : 'warn';
}

/** Nombre d'éléments portant data-placeholder dans une page. */
export const countPlaceholders = (html) => [...html.matchAll(PLACEHOLDER)].length;

/** `{ failures, warnings }` des pages de `dist`. */
export function checkPlaceholders(dist, { indexable = INDEXABLE, blogAuto = process.env.BLOG_AUTO === 'true' } = {}) {
  const failures = [];
  const warnings = [];
  for (const file of walk(dist).filter((p) => p.endsWith('.html')).sort()) {
    const page = rel(dist, file);
    const count = countPlaceholders(readFileSync(file, 'utf8'));
    const verdict = placeholderVerdict({ count, indexable, blogAuto });
    const line = `${page} : ${count} placeholder(s)`;
    if (verdict === 'block') failures.push(`${line} (${indexable ? 'build indexable' : 'PR blog-auto'})`);
    else if (verdict === 'warn') warnings.push(line);
  }
  return { failures, warnings };
}

if (isMain(import.meta.url)) {
  const dist = rootArg(join(REPO_ROOT, 'dist'));
  if (!existsSync(dist)) report('placeholders', [`${dist} : absent, lancer npm run build d’abord`]);
  const { failures, warnings } = checkPlaceholders(dist);
  for (const warning of warnings) console.log(`::warning::placeholders : ${warning}`);
  report('placeholders', failures);
}
