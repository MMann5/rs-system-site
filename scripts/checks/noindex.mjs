// AD-10 / AD-11 : si le build n'est pas indexable, chaque page porte la meta noindex et _headers
// l'en-tête X-Robots-Tag ; s'il est indexable, ni l'une ni l'autre. Aucun code Worker (AD-1).
// Usage : node scripts/checks/noindex.mjs [dossier]  (défaut : dist/ du dépôt).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEXABLE } from '../../src/lib/env.ts';

const dist = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../../dist/', import.meta.url));
const label = relative(process.cwd(), dist) || '.';
const META = /<meta\s+name="robots"\s+content="noindex"\s*\/?>/i;
const HEADER = /^\/\*\s*\n\s+X-Robots-Tag:\s*noindex\s*$/m;
const ANY_HEADER = /X-Robots-Tag:\s*noindex/i;
const failures = [];
const at = (path) => join(label, relative(dist, path));

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

if (!existsSync(dist)) {
  console.error(`noindex : ${label} absent, lancer npm run build d’abord`);
  process.exit(1);
}

for (const worker of ['_worker.js', '_worker.mjs']) {
  const path = join(dist, worker);
  if (existsSync(path)) failures.push(`${at(path)} : code Worker interdit (AD-1)`);
}

const pages = htmlFiles(dist);
const headersPath = join(dist, '_headers');
const headers = existsSync(headersPath) ? readFileSync(headersPath, 'utf8') : null;
if (pages.length === 0) failures.push(`${label} : aucune page HTML`);

if (!INDEXABLE) {
  for (const page of pages) {
    if (!META.test(readFileSync(page, 'utf8'))) failures.push(`${at(page)} : meta robots noindex absente`);
  }
  if (headers === null || !HEADER.test(headers)) {
    failures.push(`${at(headersPath)} : en-tête X-Robots-Tag: noindex absent`);
  }
} else {
  for (const page of pages) {
    if (META.test(readFileSync(page, 'utf8'))) failures.push(`${at(page)} : meta noindex sur un build indexable`);
  }
  if (headers !== null && ANY_HEADER.test(headers)) {
    failures.push(`${at(headersPath)} : X-Robots-Tag: noindex sur un build indexable`);
  }
}

if (failures.length > 0) {
  console.error(`noindex : ${failures.length} échec(s)\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('noindex : OK');
