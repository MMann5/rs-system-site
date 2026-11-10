// FR40, AD-11 : un contenu manquant n'existe que comme <Placeholder> (attribut data-placeholder).
// Par page de dist/ : aucun placeholder → ok ; sinon bloquant (code 1) sur un build INDEXABLE (tout placeholder) ;
// sur une PR `blog-auto` (BLOG_AUTO=true, posé par ci.yml), bloquant seulement si un placeholder est dans un
// élément <article> (contenu de l'article, seul Post.astro en a), décision D2 de l'epic 6 (story 6.3) : les
// placeholders partagés du site (footer, À propos…) n'y font qu'avertir. Ailleurs : simple avertissement (annotation
// GitHub ::warning::, code 0). Placeholders dans les sources d'article : lint éditorial (scripts/checks/editorial.mjs).
// Le blocage dans la chaîne `build` de Cloudflare arrive en epic 7.
// Story 7.3 (D7) : `--list` imprime la liste brute (page, langue, chemin, contenu) puis les groupes (page, rang) avec le
// libellé français et les langues, en Markdown, sans changer le verdict.
// Usage : node scripts/checks/placeholders.mjs [--list] [dossier]  (défaut : dist/ du dépôt).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { INDEXABLE } from '../../src/lib/env.ts';
import { isMain, rel, report, REPO_ROOT, walk } from './report.mjs';

export const PLACEHOLDER = /<[a-z][\w-]*\b[^>]*?\sdata-placeholder(?=[\s=/>])/gi;
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

const ELEMENT = /<([a-z][\w-]*)\b[^>]*?\sdata-placeholder(?=[\s=/>])[^>]*>([\s\S]*?)<\/\1\s*>/gi;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const decode = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m));

/** Contenu d'un placeholder : texte de l'élément, balises retirées, entités décodées, sans les crochets. */
export const placeholderText = (inner) =>
  decode(inner.replace(/<[^>]*>/g, ''))
    .trim()
    .replace(/^\[([\s\S]*)\]$/, '$1')
    .trim();

/** Placeholders d'une page HTML, dans l'ordre : textes (sans crochets). */
export const placeholdersOf = (html) => [...html.matchAll(ELEMENT)].map((m) => placeholderText(m[2]));

/**
 * Liste brute (D7) des placeholders de `dist` : `[{ page, lang, path, text, rank }]`, `page` = `data-page-id`, `lang` =
 * `lang` de `<html>`, `path` = chemin du site, `rank` = rang du placeholder dans la page (0, 1…).
 */
export function listPlaceholders(dist) {
  const rows = [];
  for (const file of walk(dist).filter((p) => p.endsWith('.html')).sort()) {
    const html = readFileSync(file, 'utf8');
    const tag = html.match(/<html\b([^>]*)>/i)?.[1] ?? '';
    const page = tag.match(/\sdata-page-id="([^"]*)"/)?.[1] ?? '?';
    const lang = tag.match(/\slang="([^"]*)"/)?.[1] ?? '?';
    const path = `/${rel(dist, file).replace(/(^|\/)index\.html$/, '$1')}`;
    placeholdersOf(html).forEach((text, rank) => rows.push({ page, lang, path, text, rank }));
  }
  return rows;
}

/**
 * Groupes (D7) par (page, rang) : `[{ page, rank, label, langs, texts }]`, `label` = texte français (sinon le premier
 * trouvé), `langs` = langues où le placeholder existe (sans doublon), `texts` = texte par langue.
 */
export function groupPlaceholders(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.page}\u0000${row.rank}`;
    if (!groups.has(key)) groups.set(key, { page: row.page, rank: row.rank, label: undefined, langs: [], texts: {} });
    const group = groups.get(key);
    if (!group.langs.includes(row.lang)) group.langs.push(row.lang);
    group.texts[row.lang] ??= row.text;
  }
  return [...groups.values()].map((g) => ({ ...g, label: g.texts.fr ?? Object.values(g.texts)[0] }));
}

const md = (v) => String(v).replace(/\|/g, '\\|');

/** Tableaux Markdown : liste brute puis groupes. */
export function placeholderTables(rows) {
  const raw = ['| Page | Langue | Chemin | Contenu |', '| --- | --- | --- | --- |', ...rows.map((r) => `| ${md(r.page)} | ${r.lang} | ${md(r.path)} | ${md(r.text)} |`)];
  const grouped = groupPlaceholders(rows);
  const groups = ['| Page | Rang | Libellé (fr) | Langues |', '| --- | --- | --- | --- |', ...grouped.map((g) => `| ${md(g.page)} | ${g.rank} | ${md(g.label)} | ${g.langs.join(', ')} |`)];
  return `## Placeholders : liste brute (${rows.length})\n\n${raw.join('\n')}\n\n## Placeholders : groupes (${grouped.length})\n\n${groups.join('\n')}\n`;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const list = args.includes('--list');
  const positional = args.find((a) => !a.startsWith('--'));
  const dist = positional ? resolve(positional) : join(REPO_ROOT, 'dist');
  if (!existsSync(dist)) report('placeholders', [`${dist} : absent, lancer npm run build d’abord`]);
  if (list) console.log(placeholderTables(listPlaceholders(dist)));
  const { failures, warnings } = checkPlaceholders(dist);
  for (const warning of warnings) console.log(`::warning::placeholders : ${warning}`);
  report('placeholders', failures);
}
