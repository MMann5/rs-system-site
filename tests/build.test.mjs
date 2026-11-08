// Story 1.3 : sortie réelle du build, sur une branche puis sur main (registre via src/lib/routes/index.ts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LANGS = ['he', 'en', 'ru', 'fr'];
const HOMES = LANGS.map((lang) => `${lang}/index.html`);
const PROBES = ['en/path-probe/index.html', 'fr/test-de-chemin/index.html', 'he/בדיקת-נתיב/index.html', 'ru/проверка-пути/index.html'];
const dirs = [];

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function build(extraEnv) {
  const out = mkdtempSync(join(tmpdir(), 'rs-build-'));
  dirs.push(out);
  const env = { ...process.env, ...extraEnv };
  if (!extraEnv.WORKERS_CI_BRANCH) delete env.WORKERS_CI_BRANCH;
  delete env.DOMAIN_LIVE;
  execFileSync('npx', ['astro', 'build', '--outDir', out], { cwd: ROOT, env, stdio: 'pipe' });
  return out;
}

function indexFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name === 'index.html')
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/').normalize('NFC'))
    .sort();
}

const titles = (() => {
  const yaml = readFileSync(join(ROOT, 'src/content/pages/home.yaml'), 'utf8');
  const block = yaml.match(/^  title:\n((?: {4}\w\w: '.*'\n)+)/m)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/^ {4}(\w\w): '(.*)'$/gm)].map((m) => [m[1], m[2]]));
})();

test('build de branche : 4 accueils + 4 path-probe, lang/dir/title, _redirects, pas d’index racine', { timeout: 120_000 }, () => {
  const out = build({});
  assert.deepEqual(indexFiles(out), [...HOMES, ...PROBES].sort());
  assert.ok(existsSync(join(out, '_redirects')), '_redirects absent');
  assert.ok(!existsSync(join(out, 'index.html')), 'index.html racine présent');
  assert.deepEqual(Object.keys(titles), LANGS);
  for (const lang of LANGS) {
    const html = readFileSync(join(out, lang, 'index.html'), 'utf8');
    assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}">`));
    assert.equal(html.match(/<title>(.*?)<\/title>/)?.[1], titles[lang]);
  }
});

test('build de main : seulement les 4 accueils', { timeout: 120_000 }, () => {
  const out = build({ WORKERS_CI_BRANCH: 'main' });
  assert.deepEqual(indexFiles(out), [...HOMES].sort());
  assert.ok(!existsSync(join(out, 'index.html')));
});
