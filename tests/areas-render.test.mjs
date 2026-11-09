// Story 4.4 (FR8, UX-DR23, D6) : une 5e région ajoutée aux seules données apparaît sans changement de code.
// Le build est rejoué HORS du dépôt (comme tests/reviews-render.test.mjs) : copie de src/, public/ et de la
// configuration dans un dossier temporaire, une région de test et une ville de test rattachée écrites dans cette
// copie, `astro build` dans la copie (rien n'est écrit dans src/ ni dist/ du dépôt), puis le dossier est supprimé.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AREAS_SLUGS = { he: 'אזורים', fr: 'zones' };
const REGION = { id: 'test-north', name: { he: 'צפון בדיקה', en: 'Test north', ru: 'Тестовый север', fr: 'Nord de test' } };
const CITY = { id: 'test-city', name: { he: 'עיר בדיקה', en: 'Test city', ru: 'Тестовый город', fr: 'Ville de test' }, slugs: { he: 'עיר-בדיקה', en: 'test-city', ru: 'тестовый-город', fr: 'ville-de-test' } };
const ANCHORS = ['jerusalem-area', 'center-shfela', 'south', 'judea-samaria', 'test-north'];

const work = mkdtempSync(join(tmpdir(), 'rs-areas-'));
after(() => rmSync(work, { recursive: true, force: true }));

const perLang = (key, values) => [`${key}:`, ...Object.entries(values).map(([lang, v]) => `  ${lang}: '${v}'`)];

function buildCopy() {
  for (const entry of ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    cpSync(join(ROOT, entry), join(work, entry), { recursive: true });
  }
  // node_modules propre à la copie (liens vers chaque paquet du dépôt) : le cache d'Astro (node_modules/.astro) n'est
  // pas partagé avec un autre build lancé en parallèle par `node --test` (tests/reviews-render.test.mjs).
  mkdirSync(join(work, 'node_modules'));
  for (const name of readdirSync(join(ROOT, 'node_modules'))) {
    if (name !== '.astro') symlinkSync(join(ROOT, 'node_modules', name), join(work, 'node_modules', name), 'dir');
  }
  writeFileSync(
    join(work, 'src/content/regions', `${REGION.id}.yaml`),
    [...perLang('name', REGION.name), `anchor: '${REGION.id}'`, 'order: 5', ''].join('\n'),
  );
  const intro = Object.fromEntries(Object.entries(CITY.name).map(([lang, n]) => [lang, `intro de test ${n}`]));
  writeFileSync(
    join(work, 'src/content/cities', `${CITY.id}.yaml`),
    [...perLang('name', CITY.name), ...perLang('slugs', CITY.slugs), `region: '${REGION.id}'`, ...perLang('intro', intro), 'order: 1', ''].join('\n'),
  );
  return astroBuild();
}

function astroBuild() {
  const env = { ...process.env };
  for (const key of ['WORKERS_CI_BRANCH', 'SITE_URL', 'DOMAIN_LIVE']) delete env[key];
  execFileSync(join(work, 'node_modules/.bin/astro'), ['build'], { cwd: work, env, stdio: 'pipe' });
  return join(work, 'dist');
}

const mainOf = (dist, lang) =>
  (readFileSync(join(dist, lang, AREAS_SLUGS[lang], 'index.html'), 'utf8').match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '').replace(
    / data-astro-cid-[\w-]+(?:="")?/g,
    '',
  );

test('5e région de test (données seules) : 5e tuile avec ancre, span, ton clair et sa ville ; page ville générée', { timeout: 300_000 }, () => {
  const dist = buildCopy();
  for (const lang of ['he', 'fr']) {
    const where = `areas (${lang})`;
    const main = mainOf(dist, lang);
    const tiles = [...main.matchAll(/<section class="tile"([^>]*)>([\s\S]*?)<\/section>/g)];
    assert.equal(tiles.length, 5, `${where} : 5 tuiles`);
    assert.deepEqual(tiles.map((t) => t[2].match(/^<h2 id="([^"]*)"/)?.[1]), ANCHORS, `${where} : ancres dans l'ordre des données`);
    // Damier (D6) : 2 colonnes clair/sombre/sombre/clair/clair, la 5e (nombre impair) pleine largeur.
    assert.deepEqual(tiles.map((t) => t[1].match(/data-tone-wide="([^"]*)"/)?.[1]), ['light', 'dark', 'dark', 'light', 'light'], `${where} : tons 2 colonnes`);
    assert.deepEqual(tiles.map((t) => t[1].match(/data-tone-narrow="([^"]*)"/)?.[1]), ['light', 'dark', 'light', 'dark', 'light'], `${where} : tons 1 colonne`);
    assert.deepEqual(tiles.map((t) => /\sdata-span[\s=>]|\sdata-span$/.test(t[1])), [false, false, false, false, true], `${where} : span`);
    const [, , last] = tiles[4];
    assert.equal(last.match(/^<h2 id="test-north" class="region-title">([^<]*)<\/h2>/)?.[1], REGION.name[lang], `${where} : titre de la région de test`);
    const href = `/${lang}/${encodeURIComponent(AREAS_SLUGS[lang])}/${encodeURIComponent(CITY.slugs[lang])}/`;
    assert.deepEqual(
      [...last.matchAll(/<a href="([^"]*)" class="city-row"><span class="city-name">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]),
      [[href, CITY.name[lang]]],
      `${where} : ville de test`,
    );
    assert.ok(!last.includes('data-placeholder'), `${where} : pas d'autres yishouvim sans others`);
    assert.ok(existsSync(join(dist, lang, AREAS_SLUGS[lang], CITY.slugs[lang], 'index.html')), `${where} : page de la ville de test`);
  }
  // Aucun fichier de test dans src/ du dépôt.
  assert.ok(!readdirSync(join(ROOT, 'src/content/regions')).includes(`${REGION.id}.yaml`), 'région de test dans le dépôt');
  assert.ok(!readdirSync(join(ROOT, 'src/content/cities')).includes(`${CITY.id}.yaml`), 'ville de test dans le dépôt');
});

// Matrice I/O (région sans ville) : même copie, 6e région de test sans ville ni `others` → tuile avec son titre, sans
// <ul> ; 6 tuiles (nombre pair) → aucune pleine largeur. Exécuté après le test précédent (même fichier, en série).
test('région de test sans ville (données seules) : tuile avec son h2, sans liste ; 6 tuiles, aucun span', { timeout: 300_000 }, () => {
  // Autonome : sans le 1er test (filtre --test-name-pattern), copie et test-north/test-city écrits ici.
  if (!existsSync(join(work, 'src'))) buildCopy();
  writeFileSync(
    join(work, 'src/content/regions', 'test-empty.yaml'),
    [...perLang('name', { he: 'ריק בדיקה', en: 'Test empty', ru: 'Тест пусто', fr: 'Vide de test' }), "anchor: 'test-empty'", 'order: 6', ''].join('\n'),
  );
  const dist = astroBuild();
  for (const lang of ['he', 'fr']) {
    const where = `areas (${lang}, région vide)`;
    const tiles = [...mainOf(dist, lang).matchAll(/<section class="tile"([^>]*)>([\s\S]*?)<\/section>/g)];
    assert.equal(tiles.length, 6, `${where} : 6 tuiles`);
    assert.deepEqual(tiles.map((t) => /\sdata-span[\s=>]|\sdata-span$/.test(t[1])), [false, false, false, false, false, false], `${where} : span`);
    assert.match(tiles[5][2], /^<h2 id="test-empty" class="region-title">[^<]+<\/h2>$/, `${where} : titre seul, sans <ul>`);
  }
  assert.ok(!readdirSync(join(ROOT, 'src/content/regions')).includes('test-empty.yaml'), 'région vide de test dans le dépôt');
});
