// Story 7.3 : fonctions de décision de l'audit de lancement (scripts/audit/lib.mjs), sans navigateur.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  failureCount,
  headingIssues,
  hexRgb,
  imageBudget,
  imageVerdict,
  inpIssue,
  isInlineLink,
  LANGS,
  measure,
  minAlpha,
  pageMeta,
  perfVerdict,
  photoPages,
  renderReport,
  scrimAlpha,
  scrimFailure,
  scrimOk,
  servedPath,
  targetIssues,
  templatePages,
  TEMPLATE_IDS,
} from '../scripts/audit/lib.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'rs-audit-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const html = (lang, id, body = '') => `<!doctype html><html lang="${lang}" dir="ltr" data-page-id="${id}"><body>${body}</body></html>`;

// — Scrims —

test('scrimAlpha : v = 96 sous un scrim de canal 16 → α ≈ 0,665, ok', () => {
  const a = scrimAlpha(96, 16);
  assert.ok(Math.abs(a - 0.665) < 0.001, String(a));
  assert.equal(scrimOk(a), true);
  assert.equal(scrimAlpha(255, 6), 0);
  assert.equal(scrimAlpha(6, 6), 1);
});

test('minAlpha : canal le moins opaque de chaque pixel, puis minimum ; null sans pixel', () => {
  const scrim = hexRgb('#061020');
  assert.deepEqual(scrim, [6, 16, 32]);
  const dense = [6, 16, 32];
  const light = [100, 16, 32]; // rouge : (255 − 100) / 249 ≈ 0,622
  assert.equal(minAlpha([dense], scrim), 1);
  assert.ok(Math.abs(minAlpha([dense, light], scrim) - 155 / 249) < 1e-9);
  assert.equal(minAlpha([], scrim), null);
});

test('scrimOk : 0,58 échoue, 0,615 passe (tolérance 0,005), 0,614 échoue', () => {
  assert.equal(scrimOk(0.58), false);
  assert.equal(scrimOk(0.615), true);
  assert.equal(scrimOk(0.614), false);
  assert.equal(scrimOk(null), false);
});

test('measure : tampon RGBA (4 canaux), origine de capture non nulle, boîte qui déborde de la capture', () => {
  // Capture 4 × 2 à l'origine (100, 50) du document : colonnes 0-1 sombres (α 0,7 sur blanc, scrim 16), 2-3 blanches.
  const dark = Math.round(255 - 0.7 * (255 - 16));
  const data = Buffer.alloc(4 * 2 * 4);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) {
    const i = (y * 4 + x) * 4;
    const v = x < 2 ? dark : 255;
    data.set([v, v, v, 255], i);
  }
  const image = { data, info: { width: 4, height: 2, channels: 4 } };
  const clip = { x: 100, y: 50 };
  const [left, all, over] = measure(image, clip, [
    { name: 'gauche', x: 100, y: 50, w: 2, h: 2 },
    { name: 'tout', x: 100, y: 50, w: 4, h: 2 },
    { name: 'déborde', x: 98, y: 49, w: 4, h: 10 },
  ], [16, 16, 16]);
  assert.equal(left.pixels, 4);
  assert.ok(Math.abs(left.alpha - 0.7) < 0.005);
  assert.equal(all.pixels, 8);
  assert.equal(all.alpha, 0);
  assert.equal(over.pixels, 4, 'seule la partie dans la capture est lue (colonnes 0-1, lignes 0-1)');
  assert.ok(Math.abs(over.alpha - 0.7) < 0.005);
});

test('scrimFailure : 0,58 sous un h2 de tuile (ru, 320 px, fin) → échec nommant page, langue, largeur, extrême, bloc', () => {
  const base = { id: 'home', lang: 'ru', width: 320, extreme: 'fin', block: 'section.tile.dark#2' };
  assert.equal(
    scrimFailure({ ...base, worst: { name: 'h2 « Камера на кране »', alpha: 0.58 } }),
    'home · ru · 320 px · fin · section.tile.dark#2 : opacité 0.580 < 0.62 sous h2 « Камера на кране »',
  );
  assert.equal(scrimFailure({ ...base, worst: { name: 'h2', alpha: 0.63 } }), null);
  assert.match(scrimFailure({ ...base, worst: null }), /aucune boîte de texte mesurée$/);
});

// — Titres, cibles —

test('headingIssues : un seul h1, aucun saut de niveau en descendant', () => {
  assert.deepEqual(headingIssues([1, 2, 3, 2, 3, 2]), []);
  assert.deepEqual(headingIssues([1, 3]), ['saut de niveau h1 → h3']);
  assert.deepEqual(headingIssues([2, 1, 2]), []);
  assert.deepEqual(headingIssues([1, 2, 1]), ['2 h1 (un seul attendu)']);
  assert.deepEqual(headingIssues([2, 3]), ['0 h1 (un seul attendu)']);
});

test('isInlineLink / targetIssues : lien en phrase de 20 px exempté, cible autonome < 44 px en échec', () => {
  const inline = { tag: 'a', display: 'inline', siblingText: 'texte  texte' };
  assert.equal(isInlineLink(inline), true);
  assert.equal(isInlineLink({ ...inline, siblingText: '  ' }), false);
  assert.equal(isInlineLink({ ...inline, display: 'inline-flex' }), false);
  assert.equal(isInlineLink({ ...inline, tag: 'button' }), false);
  const rects = [
    { name: 'a « lien »', width: 40, height: 20, inline: true },
    { name: 'a « pied »', width: 120, height: 30, inline: false },
    { name: 'button « menu »', width: 44, height: 44, inline: false },
  ];
  assert.deepEqual(targetIssues(rects), ['cible 120 × 30 px < 44 : a « pied »']);
});

// — Performance —

const lhr = (over = {}) => ({
  audits: {
    'largest-contentful-paint': { numericValue: 1800 },
    'cumulative-layout-shift': { numericValue: 0.01 },
    'total-blocking-time': { numericValue: 50 },
    'total-byte-weight': { numericValue: 600_000 },
    'resource-summary': { details: { items: [{ resourceType: 'font', transferSize: 90_000 }, { resourceType: 'script', transferSize: 8_000 }] } },
    ...over,
  },
});

test('perfVerdict : valeurs relevées, sans échec sous les seuils', () => {
  const { values, failures } = perfVerdict(lhr());
  assert.deepEqual(values, { lcp: 1800, cls: 0.01, tbt: 50, total: 600_000, fonts: 90_000, scripts: 8_000 });
  assert.deepEqual(failures, []);
});

test('perfVerdict : chaque seuil dépassé est nommé ; polices et scripts relus dans network-requests à défaut', () => {
  const { failures } = perfVerdict(
    lhr({
      'largest-contentful-paint': { numericValue: 2600 },
      'cumulative-layout-shift': { numericValue: 0.2 },
      'total-blocking-time': { numericValue: 250 },
      'total-byte-weight': { numericValue: 1_600_000 },
      'resource-summary': undefined,
      'network-requests': { details: { items: [{ resourceType: 'Font', transferSize: 70_000 }, { resourceType: 'Font', transferSize: 60_000 }, { resourceType: 'Script', transferSize: 31_000 }] } },
    }),
  );
  assert.equal(failures.length, 6, failures.join('\n'));
  assert.ok(failures.some((f) => f.startsWith('lcp 2 600 ms > 2 500')));
  assert.ok(failures.some((f) => f.startsWith('fonts 130 000 o')));
  assert.deepEqual(perfVerdict({ audits: {} }).failures.length, 6);
});

test('inpIssue, imageVerdict : seuils INP et images (héros 1440 / 390, carte, autres)', () => {
  assert.equal(inpIssue(null), null);
  assert.equal(inpIssue(200), null);
  assert.equal(inpIssue(240), 'INP 240 ms > 200');
  assert.equal(imageBudget('hero', 1440), 250_000);
  assert.equal(imageBudget('hero', 390), 120_000);
  assert.equal(imageBudget('photo', 390), 180_000);
  assert.equal(imageBudget('card', 1440), 60_000);
  assert.equal(imageVerdict({ kind: 'hero', url: '/a.avif', bytes: 200_000 }, 1440), null);
  assert.match(imageVerdict({ kind: 'hero', url: '/a.avif', bytes: 200_000 }, 390), /image hero 200 000 o > 120 000 à 390 px/);
  assert.match(imageVerdict({ kind: 'card', url: '/c.avif', bytes: 61_000 }, 390), /card/);
});

// — Pages-modèles —

test('pageMeta, servedPath : lang et data-page-id lus sur <html> ; 404 servie sans .html, chemin encodé', () => {
  assert.deepEqual(pageMeta(html('fr', 'about')), { lang: 'fr', id: 'about' });
  assert.equal(pageMeta('<html lang="fr">'), null);
  assert.equal(servedPath('/fr/404.html'), '/fr/404');
  assert.equal(servedPath('/he/מצלמות/'), '/he/%D7%9E%D7%A6%D7%9C%D7%9E%D7%95%D7%AA/');
});

test('templatePages : 11 types × 4 langues choisis par data-page-id, 404 racine ignorée ; modèle absent → erreur', () => {
  const files = { '404.html': html('he', 'not-found') };
  for (const lang of LANGS) {
    for (const id of TEMPLATE_IDS) {
      const slug = id === 'home' ? '' : `${id.replace(/[:]/g, '-')}/`;
      if (id === 'not-found') files[`${lang}/404.html`] = html(lang, id);
      else files[`${lang}/${slug}index.html`] = html(lang, id);
    }
    files[`${lang}/autre/index.html`] = html(lang, 'smart-home');
  }
  const dist = fixture(files);
  const pages = templatePages(dist);
  assert.deepEqual(Object.keys(pages), TEMPLATE_IDS);
  assert.equal(pages.home.fr, '/fr/');
  assert.equal(pages['city:modiin'].ru, '/ru/city-modiin/');
  assert.equal(pages['not-found'].he, '/he/404.html');
  rmSync(join(dist, 'en', 'about'), { recursive: true });
  assert.throws(() => templatePages(dist), /about · en/);
});

test('photoPages : pages portant un bloc data-surface="photo", avec leur nombre de blocs', () => {
  const dist = fixture({
    'fr/index.html': html('fr', 'home', '<section data-surface="photo"></section><section data-surface="photo"></section>'),
    'fr/contact/index.html': html('fr', 'contact', '<header data-surface="navy"></header>'),
  });
  assert.deepEqual(photoPages(dist), [{ id: 'home', lang: 'fr', path: '/fr/', blocks: 2 }]);
});

// — Rapport, CLI —

test('renderReport : verdict, échecs par volet puis tableau ; failureCount', () => {
  const results = {
    generatedAt: '2026-11-10T00:00:00Z',
    origin: 'http://127.0.0.1:1',
    volets: {
      scrims: {
        title: 'Scrims',
        columns: [{ key: 'page', label: 'Page' }, { key: 'min', label: 'Opacité min.' }],
        rows: [{ page: 'home', min: 0.58 }],
        failures: ['home · ru · 320 px · fin · section.tile#1 : opacité 0.580 < 0.62 sous h2 « x »'],
        notes: ['note'],
      },
      perf: { title: 'Perf', columns: [{ key: 'total', label: 'Poids' }], rows: [{ total: 1234567 }], failures: [] },
    },
  };
  const md = renderReport(results);
  assert.match(md, /\*\*Verdict : 1 échec\(s\)\.\*\*/);
  assert.match(md, /- home · ru · 320 px · fin · section\.tile#1 : opacité 0\.580/);
  assert.match(md, /\| home \| 0\.58 \|/);
  assert.match(md, /\| 1 234 567 \|/);
  assert.match(md, /## Perf\n\nAucun échec\./);
  assert.equal(failureCount(results), 1);
});

test('launch : dist/ absent → « lancer npm run build d’abord », code 1', () => {
  const missing = join(tmpdir(), 'rs-audit-absent-dist');
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'audit', 'launch.mjs'), `--dist=${missing}`], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /lancer npm run build d'abord/);
});

test('launch : --only vide → « aucun volet sélectionné », code 1 (jamais un faux OK)', () => {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'audit', 'launch.mjs'), '--only=,'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /aucun volet sélectionné/);
});
