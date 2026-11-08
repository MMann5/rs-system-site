// Matrices I/O des stories 1.1 et 1.9 : headers.mjs, not-found.mjs et noindex.mjs lancés sur un dossier temporaire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADERS = fileURLToPath(new URL('../scripts/postbuild/headers.mjs', import.meta.url));
const CHECK = fileURLToPath(new URL('../scripts/checks/noindex.mjs', import.meta.url));
const NOT_FOUND = fileURLToPath(new URL('../scripts/postbuild/not-found.mjs', import.meta.url));
const PAGE_OK = '<!DOCTYPE html><html><head><meta name="robots" content="noindex"></head><body></body></html>';
const PAGE_KO = '<!DOCTYPE html><html><head></head><body></body></html>';
const HEADERS_OK = '/*\n  X-Robots-Tag: noindex\n';
const LIVE = { WORKERS_CI_BRANCH: 'main', DOMAIN_LIVE: 'true' };
const ROBOTS_OFF = 'User-agent: *\nDisallow: /\n\nSitemap: /sitemap.xml\n';
const ROBOTS_ON = 'User-agent: *\nAllow: /\n\nSitemap: https://rs.example/sitemap.xml\n';
const LANGS = ['he', 'en', 'ru', 'fr'];

function run(script, dir, vars = {}) {
  const env = { ...process.env };
  delete env.WORKERS_CI_BRANCH;
  delete env.DOMAIN_LIVE;
  return spawnSync(process.execPath, [script, dir], { env: { ...env, ...vars }, encoding: 'utf8' });
}

// Crée un dossier temporaire rempli de `files`, supprimé à la fin du test.
function tempDist(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'rs-noindex-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

test('non indexable : _headers contient X-Robots-Tag: noindex', (t) => {
  const dir = tempDist(t, {});
  const result = run(HEADERS, dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dir, '_headers'), 'utf8'), /^\/\*\n\s+X-Robots-Tag: noindex$/m);
});

test('main + DOMAIN_LIVE=true : _headers vide', (t) => {
  const dir = tempDist(t, {});
  const result = run(HEADERS, dir, LIVE);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(dir, '_headers'), 'utf8'), '');
});

test('régression : une page sans meta noindex fait échouer le contrôle', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, 'he/sans-meta/index.html': PAGE_KO, _headers: HEADERS_OK, 'robots.txt': ROBOTS_OFF });
  const result = run(CHECK, dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /he\/sans-meta\/index\.html/);
});

test('pages et _headers corrects : le contrôle passe', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, 'he/index.html': PAGE_OK, _headers: HEADERS_OK, 'robots.txt': ROBOTS_OFF });
  const result = run(CHECK, dir);
  assert.equal(result.status, 0, result.stderr);
});

test('non indexable sans _headers : le contrôle échoue', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, 'robots.txt': ROBOTS_OFF });
  const result = run(CHECK, dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /_headers/);
});

test('non indexable avec _headers vide : le contrôle échoue', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, _headers: '', 'robots.txt': ROBOTS_OFF });
  assert.equal(run(CHECK, dir).status, 1);
});

test('_worker.js présent : le contrôle échoue', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, _headers: HEADERS_OK, 'robots.txt': ROBOTS_OFF, '_worker.js': 'export default {};' });
  const result = run(CHECK, dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /_worker\.js/);
});

test('indexable avec une page encore en noindex : le contrôle échoue', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, _headers: '', 'robots.txt': ROBOTS_ON });
  const result = run(CHECK, dir, LIVE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /index\.html/);
});

test('indexable, page sans meta et _headers vide : le contrôle passe', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_KO, _headers: '', 'robots.txt': ROBOTS_ON });
  const result = run(CHECK, dir, LIVE);
  assert.equal(result.status, 0, result.stderr);
});

// — Story 1.9 : 404 toujours noindex, robots.txt (AD-10) —

test('indexable : un 404.html sans meta noindex fait échouer le contrôle', (t) => {
  const dir = tempDist(t, { 'he/index.html': PAGE_KO, '404.html': PAGE_OK, 'fr/404.html': PAGE_KO, _headers: '', 'robots.txt': ROBOTS_ON });
  const result = run(CHECK, dir, LIVE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fr\/404\.html/);
});

test('indexable : pages sans meta et 404.html en noindex, le contrôle passe', (t) => {
  const dir = tempDist(t, { 'he/index.html': PAGE_KO, '404.html': PAGE_OK, 'fr/404.html': PAGE_OK, _headers: '', 'robots.txt': ROBOTS_ON });
  const result = run(CHECK, dir, LIVE);
  assert.equal(result.status, 0, result.stderr);
});

test('robots.txt absent : le contrôle échoue', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, _headers: HEADERS_OK });
  const result = run(CHECK, dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /robots\.txt/);
});

test('robots.txt incohérent : Allow sur un build non indexable, Disallow sur un build indexable → échec', (t) => {
  const off = tempDist(t, { 'index.html': PAGE_OK, _headers: HEADERS_OK, 'robots.txt': ROBOTS_ON });
  const a = run(CHECK, off);
  assert.equal(a.status, 1);
  assert.match(a.stderr, /robots\.txt/);
  const on = tempDist(t, { 'index.html': PAGE_KO, _headers: '', 'robots.txt': ROBOTS_OFF });
  const b = run(CHECK, on, LIVE);
  assert.equal(b.status, 1);
  assert.match(b.stderr, /robots\.txt/);
});

// — Story 1.9 : post-build des 404 par langue (AD-3) —

const notFoundFiles = (extra = {}) => ({
  '404.html': PAGE_OK,
  ...Object.fromEntries(LANGS.map((lang) => [`${lang}/404/index.html`, `${PAGE_OK}<!-- ${lang} -->`])),
  ...extra,
});

test('post-build : 4 dist/{lang}/404.html, plus de dist/{lang}/404/, « 404 : OK » ; une 2e passe reste OK', (t) => {
  const dir = tempDist(t, notFoundFiles());
  const first = run(NOT_FOUND, dir);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /^404 : OK$/m);
  for (const lang of LANGS) {
    assert.equal(readFileSync(join(dir, lang, '404.html'), 'utf8'), `${PAGE_OK}<!-- ${lang} -->`);
    assert.ok(!existsSync(join(dir, lang, '404')), `${lang}/404/ encore présent`);
  }
  const second = run(NOT_FOUND, dir);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /^404 : OK$/m);
});

test('post-build : source et cible absentes → code 1, fichier cité', (t) => {
  const files = notFoundFiles();
  delete files['ru/404/index.html'];
  const result = run(NOT_FOUND, tempDist(t, files));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ru\/404\/index\.html/);
});

test('post-build : fichier en trop dans {lang}/404/ → code 1', (t) => {
  const result = run(NOT_FOUND, tempDist(t, notFoundFiles({ 'en/404/extra.txt': 'x' })));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /en\/404/);
});

test('post-build : dist/404.html absent → code 1', (t) => {
  const files = notFoundFiles();
  delete files['404.html'];
  const result = run(NOT_FOUND, tempDist(t, files));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /404\.html/);
});
