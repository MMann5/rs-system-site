// FR40, AD-11 : un contenu manquant n'existe que comme <Placeholder> (attribut data-placeholder).
// Par page de dist/ : aucun placeholder → ok ; sinon bloquant (code 1) sur un build INDEXABLE (tout placeholder) ;
// sur une PR `blog-auto` (BLOG_AUTO=true, posé par ci.yml), bloquant seulement si un placeholder est dans un
// élément <article> (contenu de l'article, seul Post.astro en a), décision D2 de l'epic 6 (story 6.3) : les
// placeholders partagés du site (footer, À propos…) n'y font qu'avertir. Ailleurs : simple avertissement (annotation
// GitHub ::warning::, code 0). Placeholders dans les sources d'article : lint éditorial (scripts/checks/editorial.mjs).
// Le blocage dans la chaîne `build` de Cloudflare arrive en epic 7.
// Usage : node scripts/checks/placeholders.mjs [dossier]  (défaut : dist/ du dépôt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INDEXABLE } from '../../src/lib/env.ts';
import { isMain, rel, report, REPO_ROOT, rootArg, walk } from './report.mjs';

const PLACEHOLDER = /<[a-z][\w-]*\b[^>]*?\sdata-placeholder(?=[\s=/>])/gi;
const ARTICLE = /<article\b[^>]*>[\s\S]*?<\/article>/gi;

/**
 * `ok` sans placeholder ; `block` sur un build indexable (tout placeholder) ou sur une PR blog-auto avec un placeholder
 * dans l'article (`articleCount > 0`, D2) ; `warn` sinon.
 */
export function placeholderVerdict({ count, articleCount = 0, indexable, blogAuto }) {
  if (count === 0) return 'ok';
  if (indexable) return 'block';
  return blogAuto && articleCount > 0 ? 'block' : 'warn';
}

/** Nombre d'éléments portant data-placeholder dans une page. */
export const countPlaceholders = (html) => [...html.matchAll(PLACEHOLDER)].length;

/** Nombre d'éléments portant data-placeholder dans les éléments <article> d'une page (balise ouvrante comprise). */
export const countArticlePlaceholders = (html) =>
  [...html.matchAll(ARTICLE)].reduce((sum, [article]) => sum + countPlaceholders(article), 0);

/** `{ failures, warnings }` des pages de `dist`. */
export function checkPlaceholders(dist, { indexable = INDEXABLE, blogAuto = process.env.BLOG_AUTO === 'true' } = {}) {
  const failures = [];
  const warnings = [];
  for (const file of walk(dist).filter((p) => p.endsWith('.html')).sort()) {
    const page = rel(dist, file);
    const html = readFileSync(file, 'utf8');
    const count = countPlaceholders(html);
    const articleCount = countArticlePlaceholders(html);
    const verdict = placeholderVerdict({ count, articleCount, indexable, blogAuto });
    const line = `${page} : ${count} placeholder(s)`;
    if (verdict === 'block' && indexable) failures.push(`${line} (build indexable)`);
    else if (verdict === 'block') failures.push(`${page} : ${articleCount} placeholder(s) (PR blog-auto, dans l'article)`);
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
