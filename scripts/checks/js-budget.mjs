// NFR (budgets), AD-11 : JS ≤ 30 000 octets compressés (gzip, zlib niveau par défaut) par page.
// Somme, par page .html de dist/ : chaque <script> en ligne exécutable (type vide, module, text/javascript
// ou application/javascript), chaque <script src> et <link rel="modulepreload"> local, et leurs
// imports statiques ou dynamiques relatifs (ou absolus locaux), chaque fichier comptant une fois par page.
// Gzip plutôt que Brotli : plus gros, donc plus sévère.
// Usage : node scripts/checks/js-budget.mjs [dossier]  (défaut : dist/ du dépôt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { isMain, rel, report, REPO_ROOT, rootArg, walk } from './report.mjs';

export const JS_BUDGET = 30_000;
// Seuls ces types MIME (paramètres retirés, minuscules) sont du JS exécutable ; le reste (JSON, ld+json,
// importmap, speculationrules, text/template…) n'est pas compté.
const JS_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const MODULEPRELOAD = /<link\b[^>]*>/gi;
const IMPORT_SPECIFIERS = [
  /\b(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const attr = (attrs, name) => attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((v) => v !== undefined);
const gzipBytes = (content) => gzipSync(content).length;

/** URL (chemin du site) d'une page de dist/ : `he/index.html` → `/he/`. */
const pageUrl = (page) => `/${page.replace(/(^|\/)index\.html$/, '$1')}`;

/** Chemin local résolu d'un spécifieur depuis `base` (chemin du site), ou null s'il est externe/nu. */
function localPath(spec, base) {
  if (!/^(?:\.{1,2}\/|\/(?!\/))/.test(spec)) return null;
  return new URL(spec, `http://site${base}`).pathname;
}

/** Imports locaux d'un code JS, résolus depuis `base`. */
const importsOf = (code, base) =>
  IMPORT_SPECIFIERS.flatMap((re) => [...code.matchAll(re)].map((m) => localPath(m[1], base))).filter(Boolean);

/** `{ total, missing }` d'une page HTML (`html`) servie à `url`, fichiers lus dans `dist`. */
export function measurePage(dist, html, url) {
  let total = 0;
  const missing = [];
  const seen = new Set();
  const queue = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    const type = (attr(attrs, 'type') ?? '').split(';')[0].trim().toLowerCase();
    if (!JS_TYPES.has(type)) continue;
    const src = attr(attrs, 'src');
    if (src !== undefined) {
      const path = localPath(src.trim(), url);
      if (path) queue.push(path);
      continue;
    }
    total += gzipBytes(body);
    queue.push(...importsOf(body, url));
  }
  for (const [tag] of html.matchAll(MODULEPRELOAD)) {
    if (!(attr(tag.slice(5), 'rel') ?? '').toLowerCase().split(/\s+/).includes('modulepreload')) continue;
    const path = localPath((attr(tag.slice(5), 'href') ?? '').trim(), url);
    if (path) queue.push(path);
  }
  while (queue.length > 0) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    let file;
    try {
      file = join(dist, decodeURIComponent(path));
    } catch {
      file = join(dist, path);
    }
    if (!existsSync(file)) {
      missing.push(path);
      continue;
    }
    const code = readFileSync(file);
    total += gzipBytes(code);
    queue.push(...importsOf(code.toString('utf8'), path));
  }
  return { total, missing };
}

/** Échecs `{page} : …` des pages de `dist` au-delà de `budget` octets gzip, ou dont un script manque. */
export function findJsBudgetViolations(dist, budget = JS_BUDGET) {
  const failures = [];
  for (const file of walk(dist).filter((p) => p.endsWith('.html')).sort()) {
    const page = rel(dist, file);
    const { total, missing } = measurePage(dist, readFileSync(file, 'utf8'), pageUrl(page));
    for (const path of missing) failures.push(`${page} : script ${path} absent de dist/`);
    if (total > budget) failures.push(`${page} : JS ${total} octets gzip > ${budget}`);
  }
  return failures;
}

if (isMain(import.meta.url)) {
  const dist = rootArg(join(REPO_ROOT, 'dist'));
  if (!existsSync(dist)) report('js-budget', [`${dist} : absent, lancer npm run build d’abord`]);
  report('js-budget', findJsBudgetViolations(dist));
}
