// AD-3, FR15 : déplace la 404 de chaque langue de dist/{lang}/404/index.html (route attrape-tout) vers
// dist/{lang}/404.html, là où Cloudflare (not_found_handling: "404-page") cherche la 404 la plus proche.
// Idempotent : relancé, il ne fait rien. Échoue si une 404 manque ou si dist/404.html (racine) est absent.
// Usage : node scripts/postbuild/not-found.mjs [dossier]  (défaut : dist/ du dépôt).
import { existsSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS } from '../../src/lib/langs.ts';

const dist = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../../dist/', import.meta.url));
const label = relative(process.cwd(), dist) || '.';
const at = (path) => join(label, relative(dist, path));
const failures = [];

for (const lang of LANGS) {
  const dir = join(dist, lang, '404');
  const source = join(dir, 'index.html');
  const target = join(dist, lang, '404.html');
  if (existsSync(dir)) {
    const extra = readdirSync(dir).filter((name) => name !== 'index.html');
    if (extra.length > 0) {
      failures.push(`${at(dir)} : contenu inattendu (${extra.join(', ')})`);
      continue;
    }
  }
  if (existsSync(source)) {
    renameSync(source, target);
    rmdirSync(dir);
  } else if (!existsSync(target)) {
    failures.push(`${at(source)} : 404 absente (ni ${at(target)})`);
  } else if (existsSync(dir)) {
    rmdirSync(dir);
  }
}

const root = join(dist, '404.html');
if (!existsSync(root)) failures.push(`${at(root)} : 404 racine absente`);

if (failures.length > 0) {
  console.error(`404 : ${failures.length} échec(s)\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('404 : OK');
