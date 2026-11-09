// Story 1.10 : portes de build (AD-11). Chaque contrôle de scripts/checks/ échoue volontairement sur une
// fixture fautive et passe sur une fixture saine. Les contrôles HTTP (not-found, links) servent la fixture
// par wrangler dev, comme en CI.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLiteralColors, sourceFiles } from '../scripts/checks/colors.mjs';
import { findCompletenessErrors } from '../scripts/checks/completeness.mjs';
import { findInternalHrefs } from '../scripts/checks/internal-hrefs.mjs';
import { findJsBudgetViolations, JS_BUDGET } from '../scripts/checks/js-budget.mjs';
import { checkLinks, collectLinks } from '../scripts/checks/links.mjs';
import { checkNotFound, findMissingNotFound } from '../scripts/checks/not-found.mjs';
import { findPhysicalProperties } from '../scripts/checks/physical-css.mjs';
import { checkPlaceholders, countPlaceholders, placeholderVerdict } from '../scripts/checks/placeholders.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LANGS = ['he', 'en', 'ru', 'fr'];
const dirs = [];

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** Dossier temporaire rempli de `files` ({ chemin relatif: contenu }). */
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'rs-gate-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

/** Lance `node scripts/checks/{name}.mjs {arg}` : `{ status, output }`. */
function cli(name, arg, env = {}) {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'checks', `${name}.mjs`), arg], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { status: res.status, output: res.stdout + res.stderr };
}

const page = (lang, body = '') => `<!doctype html><html lang="${lang}"><head><title>x</title></head><body>${body}</body></html>`;

// — internal-hrefs (AD-2) —

test('internal-hrefs : <a href="/he/"> et ses variantes détectés ; url(), #ancre, externe, registre et seo.ts permis', () => {
  const root = fixture({
    'src/components/Bad.astro': '---\n---\n<a href="/he/">x</a>\n<a href=\'/en/\'>x</a>\n<a href={\'/ru/\'}>x</a>\n<a href={`/fr/${x}`}>x</a>',
    'src/lib/bad.ts': "export const link = { href: '/he/contact/' };",
    'src/components/Ok.astro':
      '---\n---\n<a href={url(\'home\', lang)}>x</a><a href="#content">x</a><a href="https://wa.example/">x</a><a href="//cdn.example/x">x</a><link hreflang="he" href={h} />',
    'src/lib/routes/core.ts': "const href = '/he/';",
    'src/lib/seo.ts': "export const ICON = { href: '/rs-icon-32.png' };",
  });
  const errors = findInternalHrefs(root);
  assert.equal(errors.length, 5, errors.join('\n'));
  assert.deepEqual(
    errors.map((e) => e.split(' : ')[0]),
    ['src/components/Bad.astro:3', 'src/components/Bad.astro:4', 'src/components/Bad.astro:5', 'src/components/Bad.astro:6', 'src/lib/bad.ts:1'],
  );
  assert.deepEqual(findInternalHrefs(fixture({ 'src/components/Ok.astro': '<a href={url("home", lang)}>x</a><a href="#content">x</a>' })), []);
});

test('internal-hrefs : le CLI sort en 1 et cite le fichier ; le dépôt passe', () => {
  const root = fixture({ 'src/components/Bad.astro': '<a href="/he/">x</a>' });
  const res = cli('internal-hrefs', root);
  assert.equal(res.status, 1);
  assert.match(res.output, /internal-hrefs : 1 échec\(s\)\n {2}- src\/components\/Bad\.astro:1 : /);
  assert.deepEqual(findInternalHrefs(ROOT), []);
});

// — colors (AD-8) —

test('colors : color: #fff dans un composant détecté, var(--…) et tokens.css permis', () => {
  const root = fixture({
    'src/components/Bad.astro': '<div />\n<style>\n.a { color: #fff; }\n</style>',
    'src/components/Ok.astro': '<style>.o { color: var(--color-white); }</style>',
    'src/styles/tokens.css': ':root { --color-white: #ffffff; }',
  });
  const errors = findLiteralColors(sourceFiles(root, join(root, 'src')));
  assert.deepEqual(errors, ['src/components/Bad.astro:3 : couleur littérale #fff']);
  const res = cli('colors', root);
  assert.equal(res.status, 1);
  assert.match(res.output, /colors : 1 échec\(s\)/);
});

// — physical-css (AD-7, NFR6) —

test('physical-css : margin-left dans le <style> d’un .astro et left dans un .ts détectés ; physical-ok toléré', () => {
  const root = fixture({
    'src/components/Bad.astro': '<div />\n<style>\n.a { margin-left: 8px; }\n.logo { left: 0; } /* physical-ok */\n</style>',
    'src/scripts/bad.ts': "el.style.cssText = 'x';\nconst s = { text-align: right };",
    'src/components/Ok.astro': '<style>.o { margin-inline-start: 8px; text-align: start; }</style>',
  });
  const errors = findPhysicalProperties(sourceFiles(root, join(root, 'src')));
  assert.deepEqual(errors.sort(), [
    'src/components/Bad.astro:3 : propriété physique « margin-left »',
    'src/scripts/bad.ts:2 : propriété physique « text-align: right »',
  ]);
  const res = cli('physical-css', root);
  assert.equal(res.status, 1);
  assert.match(res.output, /physical-css : 2 échec\(s\)/);
});

// — completeness (AD-4, AD-2) —

/** Racine minimale saine : 4 i18n identiques, accueil + une page. */
function completeRoot(overrides = {}) {
  const i18n = Object.fromEntries(LANGS.map((lang) => [`src/i18n/${lang}.json`, JSON.stringify({ 'nav.home': lang, 'nav.menu': lang })]));
  return fixture({
    ...i18n,
    'src/content/pages/home.yaml': "slugs: { he: '', en: '', ru: '', fr: '' }\nenabled: true\n",
    'src/content/pages/contact.yaml': "slugs: { he: 'צור-קשר', en: 'contact', ru: 'контакты', fr: 'contact' }\nenabled: false\n",
    ...overrides,
  });
}

test('completeness : fixture saine et dépôt acceptés', () => {
  assert.deepEqual(findCompletenessErrors(completeRoot()), []);
  assert.deepEqual(findCompletenessErrors(ROOT), []);
});

test('completeness : clé i18n absente de ru.json → message i18n', () => {
  const errors = findCompletenessErrors(completeRoot({ 'src/i18n/ru.json': JSON.stringify({ 'nav.home': 'ru' }) }));
  assert.deepEqual(errors, ['src/i18n/ : i18n : ru : clés manquantes nav.menu']);
});

test('completeness : fichier i18n manquant ou en trop détecté', () => {
  const root = completeRoot({ 'src/i18n/de.json': '{}' });
  unlinkSync(join(root, 'src/i18n/fr.json'));
  const errors = findCompletenessErrors(root);
  assert.ok(errors.some((e) => e.startsWith('src/i18n/de.json : fichier inattendu')), errors.join('\n'));
  assert.ok(errors.includes('src/i18n/ : i18n : fichier « fr.json » manquant'), errors.join('\n'));
});

test('completeness : page sans slug fr → message routes', () => {
  const errors = findCompletenessErrors(
    completeRoot({ 'src/content/pages/contact.yaml': "slugs: { he: 'צור-קשר', en: 'contact', ru: 'контакты' }\nenabled: true\n" }),
  );
  assert.deepEqual(errors, ['src/content/pages/ : routes : « contact » (fr) : slug manquant']);
});

test('completeness : deux pages au même chemin fr → message routes, même réservées aux aperçus', () => {
  const errors = findCompletenessErrors(
    completeRoot({
      'src/content/pages/about.yaml': "slugs: { he: 'אודות', en: 'about', ru: 'о-нас', fr: 'contact' }\nenabled: true\npreviewOnly: true\n",
    }),
  );
  assert.equal(errors.length, 1, errors.join('\n'));
  assert.match(errors[0], /^src\/content\/pages\/ : routes : « .+ » et « .+ » \(fr\) : même chemin \/fr\/contact\/$/);
});

// Story 4.1 : villes au registre (`city:{id}` sous `areas`, inheritActive false) et région connue.
const AREAS_YAML = "slugs: { he: 'אזורים', en: 'areas', ru: 'районы', fr: 'zones' }\nenabled: false\n";
const REGION_YAML = "name: { he: 'מרכז', en: 'C', ru: 'Ц', fr: 'C' }\nanchor: 'center-shfela'\norder: 1\n";
const cityYaml = (fr, ru = 'модиин', regionId = 'center-shfela') =>
  `slugs: { he: 'מודיעין', en: 'modiin', ru: '${ru}', fr: '${fr}' }\nregion: '${regionId}'\n`;

test('completeness : villes saines acceptées sous areas désactivée', () => {
  const errors = findCompletenessErrors(
    completeRoot({
      'src/content/pages/areas.yaml': AREAS_YAML,
      'src/content/regions/center-shfela.yaml': REGION_YAML,
      'src/content/cities/modiin.yaml': cityYaml('modiin'),
    }),
  );
  assert.deepEqual(errors, []);
});

test('completeness : ville vers une région inconnue → message nommant le fichier', () => {
  const errors = findCompletenessErrors(
    completeRoot({
      'src/content/pages/areas.yaml': AREAS_YAML,
      'src/content/regions/center-shfela.yaml': REGION_YAML,
      'src/content/cities/haifa.yaml': cityYaml('haifa', 'хайфа', 'north'),
    }),
  );
  assert.deepEqual(errors, ['areas : src/content/cities/haifa.yaml : région inconnue « north »']);
});

test('completeness : ville sans slug ru, ou deux villes au même slug fr → message routes', () => {
  const missing = findCompletenessErrors(
    completeRoot({
      'src/content/pages/areas.yaml': AREAS_YAML,
      'src/content/regions/center-shfela.yaml': REGION_YAML,
      'src/content/cities/modiin.yaml': "slugs: { he: 'מודיעין', en: 'modiin', fr: 'modiin' }\nregion: 'center-shfela'\n",
    }),
  );
  assert.deepEqual(missing, ['src/content/cities/ : routes : « city:modiin » (ru) : slug manquant']);
  const dup = findCompletenessErrors(
    completeRoot({
      'src/content/pages/areas.yaml': AREAS_YAML,
      'src/content/regions/center-shfela.yaml': REGION_YAML,
      'src/content/cities/modiin.yaml': cityYaml('meme'),
      'src/content/cities/rehovot.yaml': "slugs: { he: 'רחובות', en: 'rehovot', ru: 'реховот', fr: 'meme' }\nregion: 'center-shfela'\n",
    }),
  );
  assert.deepEqual(dup, ['src/content/cities/ : routes : « city:modiin » et « city:rehovot » (fr) : même chemin /fr/zones/meme/']);
});

test('completeness : le CLI sort en 1 en citant le message', () => {
  const res = cli('completeness', completeRoot({ 'src/i18n/ru.json': JSON.stringify({ 'nav.home': 'ru' }) }));
  assert.equal(res.status, 1);
  assert.match(res.output, /completeness : 1 échec\(s\)\n {2}- src\/i18n\/ : i18n : ru : clés manquantes nav\.menu/);
  assert.equal(cli('completeness', ROOT).status, 0);
});

// — not-found (AD-3) —

/** dist/ minimal : accueil et 404 de chaque langue (sauf `omit`), _redirects. */
function notFoundDist({ omit = [], wrongLang = {} } = {}) {
  const files = { '_redirects': '/ /he/ 301\n', '404.html': page(wrongLang.root ?? 'he', 'introuvable') };
  for (const lang of LANGS) {
    files[`${lang}/index.html`] = page(lang, `<main id="content"><a href="/${lang}/">x</a><a href="#content">x</a></main>`);
    if (!omit.includes(lang)) files[`${lang}/404.html`] = page(wrongLang[lang] ?? lang, 'introuvable');
  }
  return fixture(files);
}

test('not-found : dist/fr/404.html absent → échec citant le fichier (CLI en 1)', async () => {
  const dist = notFoundDist({ omit: ['fr'] });
  assert.deepEqual(findMissingNotFound(dist), ['fr/404.html : 404 absente']);
  assert.deepEqual(await checkNotFound(dist), ['fr/404.html : 404 absente']);
  const res = cli('not-found', dist);
  assert.equal(res.status, 1);
  assert.match(res.output, /not-found : 1 échec\(s\)\n {2}- fr\/404\.html : 404 absente/);
});

test('not-found : servi par wrangler dev, 404 sans 3xx dans la langue du préfixe ; mauvaise langue détectée', async () => {
  assert.deepEqual(await checkNotFound(notFoundDist()), []);
  const errors = await checkNotFound(notFoundDist({ wrongLang: { ru: 'he' } }));
  assert.deepEqual(errors, ['/ru/rs-gate-introuvable/ : <html lang="he"> (attendu ru)']);
  assert.deepEqual(await checkNotFound(notFoundDist({ wrongLang: { root: 'en' } })), ['/rs-gate-introuvable/ : <html lang="en"> (attendu he)']);
});

// — links (AD-3) —

test('links : /he (307), / (301), /he/absent/ (404) et #nulle-part détectés', async () => {
  const dist = fixture({
    '_redirects': '/ /he/ 301\n',
    'he/index.html': page('he', '<a href="/he">a</a><a href="/">b</a><a href="/he/absent/">c</a><a href="#nulle-part">d</a><a href="/he/">ok</a>'),
  });
  const errors = await checkLinks(dist, { siteUrl: undefined });
  assert.equal(errors.length, 4, errors.join('\n'));
  assert.ok(errors.includes('he/index.html : ancre #nulle-part sans id="nulle-part" dans la page'));
  assert.ok(errors.some((e) => /^\/he : statut 307 → \/he\/ .*he\/index\.html/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /^\/ : statut 301 → \/he\/ /.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /^\/he\/absent\/ : statut 404 /.test(e)), errors.join('\n'));
  const res = cli('links', dist);
  assert.equal(res.status, 1);
  assert.match(res.output, /links : 4 échec\(s\)/);
});

test('links : canonique, hreflang, srcset, sitemap et URL absolues sur SITE_URL collectés ; fixture saine OK', async () => {
  const dist = fixture({
    'he/index.html': page(
      'he',
      '<link rel="canonical" href="https://rs.example/he/"><link rel="alternate" hreflang="en" href="https://rs.example/en/?x=1">' +
        '<img srcset="/a.png 1x, /b.png 2x" src="/a.png"><main id="content"><a href="#content">x</a><a href="https://autre.example/z/">e</a></main>' +
        '<script type="module">import "/never-collected.js";</script>',
    ),
    'en/index.html': page('en'),
    'a.png': 'a',
    'b.png': 'b',
    'sitemap.xml': '<urlset><url><loc>https://rs.example/he/</loc><xhtml:link rel="alternate" hreflang="en" href="https://rs.example/en/"/></url></urlset>',
  });
  const { urls, failures } = collectLinks(dist, 'https://rs.example');
  assert.deepEqual(failures, []);
  assert.deepEqual([...urls.keys()].sort(), ['/a.png', '/b.png', '/en/', '/he/']);
  assert.deepEqual(await checkLinks(dist, { siteUrl: 'https://rs.example' }), []);
});

// — js-budget —

const bigScript = () => randomBytes(45_000).toString('base64');

test('js-budget : script en ligne dont le gzip dépasse 30 000 octets → page et total cités', () => {
  const dist = fixture({ 'he/index.html': page('he', `<script type="module">const s = "${bigScript()}";</script>`) });
  const errors = findJsBudgetViolations(dist);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^he\/index\.html : JS (\d+) octets gzip > 30000$/);
  assert.ok(Number(errors[0].match(/JS (\d+)/)[1]) > JS_BUDGET);
  const res = cli('js-budget', dist);
  assert.equal(res.status, 1);
  assert.match(res.output, /js-budget : 1 échec\(s\)/);
});

test('js-budget : JSON, ld+json et importmap exclus ; scripts externes, modulepreload et imports comptés une fois', () => {
  const big = bigScript();
  const ok = fixture({
    'he/index.html': page(
      'he',
      `<script type="application/json" id="rs-data">"${big}"</script><script type="application/ld+json">"${big}"</script>` +
        `<script type="importmap">{"x":"${big}"}</script><script type="speculationrules">{"x":"${big}"}</script>` +
        `<script type="application/json; charset=utf-8">"${big}"</script><script type="module" src="/_astro/a.js"></script>`,
    ),
    '_astro/a.js': 'import "./b.js"; export const a = 1;',
    '_astro/b.js': 'import("./a.js"); export const b = 2;',
  });
  assert.deepEqual(findJsBudgetViolations(ok), []);
  const viaImport = fixture({
    'he/index.html': page('he', '<link rel="modulepreload" href="/_astro/a.js"><script type="module" src="/_astro/a.js"></script>'),
    '_astro/a.js': 'import { c } from "./c.js";',
    '_astro/c.js': `export const c = "${big}";`,
  });
  assert.equal(findJsBudgetViolations(viaImport).length, 1);
  const viaPreloadOnly = fixture({
    'he/index.html': page('he', '<link rel="preload modulepreload" href="/_astro/c.js">'),
    '_astro/c.js': `export const c = "${big}";`,
  });
  assert.equal(findJsBudgetViolations(viaPreloadOnly).length, 1);
  const missing = fixture({ 'he/index.html': page('he', '<script src="/_astro/absent.js"></script>') });
  assert.deepEqual(findJsBudgetViolations(missing), ['he/index.html : script /_astro/absent.js absent de dist/']);
});

// — placeholders (FR40) —

test('placeholderVerdict : ok sans placeholder, warn par défaut, block si indexable ou blog-auto', () => {
  assert.equal(placeholderVerdict({ count: 0, indexable: true, blogAuto: true }), 'ok');
  assert.equal(placeholderVerdict({ count: 2, indexable: false, blogAuto: false }), 'warn');
  assert.equal(placeholderVerdict({ count: 1, indexable: false, blogAuto: true }), 'block');
  assert.equal(placeholderVerdict({ count: 1, indexable: true, blogAuto: false }), 'block');
});

test('placeholders : avertit (code 0, ::warning::) hors blog-auto, bloque (code 1) en blog-auto', () => {
  const dist = fixture({
    'he/index.html': page('he', '<span data-placeholder>[אימייל]</span><span data-placeholder="x">[x]</span>'),
    'en/index.html': page('en', '<p>data-placeholder dans le texte ne compte pas</p>'),
  });
  assert.equal(countPlaceholders(readFileSync(join(dist, 'he/index.html'), 'utf8')), 2);
  assert.deepEqual(checkPlaceholders(dist, { indexable: false, blogAuto: false }), { failures: [], warnings: ['he/index.html : 2 placeholder(s)'] });
  assert.equal(checkPlaceholders(dist, { indexable: true, blogAuto: false }).failures.length, 1);
  const warn = cli('placeholders', dist, { BLOG_AUTO: 'false' });
  assert.equal(warn.status, 0);
  assert.match(warn.output, /::warning::placeholders : he\/index\.html : 2 placeholder\(s\)\nplaceholders : OK/);
  const block = cli('placeholders', dist, { BLOG_AUTO: 'true' });
  assert.equal(block.status, 1);
  assert.match(block.output, /placeholders : 1 échec\(s\)\n {2}- he\/index\.html : 2 placeholder\(s\) \(PR blog-auto\)/);
});

// — astro check et Zod, sur une copie du projet —

/** Copie de src/, public/, astro.config.mjs, tsconfig.json et package.json, node_modules lié. */
function projectCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'rs-check-'));
  dirs.push(dir);
  for (const entry of ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    cpSync(join(ROOT, entry), join(dir, entry), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

const astroCheck = (cwd) =>
  spawnSync(process.execPath, [join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'check'], { cwd, encoding: 'utf8' });

test('astro check : une erreur de type TS fait échouer', () => {
  const dir = projectCopy();
  writeFileSync(join(dir, 'src/lib/gate-broken.ts'), "export const x: number = 'pas un nombre';\n");
  const res = astroCheck(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout + res.stderr, /gate-broken\.ts/);
});

test('astro check : enabled: \'oui\' dans home.yaml (Zod) fait échouer', () => {
  const dir = projectCopy();
  const path = join(dir, 'src/content/pages/home.yaml');
  const yaml = readFileSync(path, 'utf8');
  assert.match(yaml, /^enabled: true$/m);
  writeFileSync(path, yaml.replace(/^enabled: true$/m, "enabled: 'oui'"));
  const res = astroCheck(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout + res.stderr, /pages\/home\.yaml/);
});
