// Matrice I/O de la story 1.1 : headers.mjs et noindex.mjs lancés sur un dossier temporaire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADERS = fileURLToPath(new URL('../scripts/postbuild/headers.mjs', import.meta.url));
const CHECK = fileURLToPath(new URL('../scripts/checks/noindex.mjs', import.meta.url));
const PAGE_OK = '<!DOCTYPE html><html><head><meta name="robots" content="noindex"></head><body></body></html>';
const PAGE_KO = '<!DOCTYPE html><html><head></head><body></body></html>';
const HEADERS_OK = '/*\n  X-Robots-Tag: noindex\n';
const LIVE = { WORKERS_CI_BRANCH: 'main', DOMAIN_LIVE: 'true' };

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
  const dir = tempDist(t, { 'index.html': PAGE_OK, 'he/sans-meta/index.html': PAGE_KO, _headers: HEADERS_OK });
  const result = run(CHECK, dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /he\/sans-meta\/index\.html/);
});

test('pages et _headers corrects : le contrôle passe', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, 'he/index.html': PAGE_OK, _headers: HEADERS_OK });
  const result = run(CHECK, dir);
  assert.equal(result.status, 0, result.stderr);
});

test('non indexable sans _headers : le contrôle échoue', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK });
  const result = run(CHECK, dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /_headers/);
});

test('non indexable avec _headers vide : le contrôle échoue', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, _headers: '' });
  assert.equal(run(CHECK, dir).status, 1);
});

test('_worker.js présent : le contrôle échoue', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, _headers: HEADERS_OK, '_worker.js': 'export default {};' });
  const result = run(CHECK, dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /_worker\.js/);
});

test('indexable avec une page encore en noindex : le contrôle échoue', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_OK, _headers: '' });
  const result = run(CHECK, dir, LIVE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /index\.html/);
});

test('indexable, page sans meta et _headers vide : le contrôle passe', (t) => {
  const dir = tempDist(t, { 'index.html': PAGE_KO, _headers: '' });
  const result = run(CHECK, dir, LIVE);
  assert.equal(result.status, 0, result.stderr);
});
