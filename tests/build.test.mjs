// Stories 1.3 et 1.4 : sortie réelle du build, sur une branche puis sur main (registre, layout Base.astro).
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
  if (!extraEnv.SITE_URL) delete env.SITE_URL;
  if (!extraEnv.DOMAIN_LIVE) delete env.DOMAIN_LIVE;
  execFileSync('npx', ['astro', 'build', '--outDir', out], { cwd: ROOT, env, stdio: 'pipe' });
  return out;
}

function indexFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name === 'index.html')
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/').normalize('NFC'))
    .sort();
}

/** `meta.<field>` par langue, lu dans src/content/pages/<id>.yaml. */
function metaField(id, field) {
  const yaml = readFileSync(join(ROOT, `src/content/pages/${id}.yaml`), 'utf8');
  const block = yaml.match(new RegExp(`^  ${field}:\\n((?: {4}\\w\\w: '.*'\\n)+)`, 'm'))?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/^ {4}(\w\w): '(.*)'$/gm)].map((m) => [m[1], m[2]]));
}

const META = Object.fromEntries(
  ['home', 'path-probe'].map((id) => [id, { title: metaField(id, 'title'), description: metaField(id, 'description') }]),
);
const titles = META.home.title;

const SKIP_LINK = { he: 'דלגו לתוכן', en: 'Skip to content', ru: 'Перейти к содержимому', fr: 'Aller au contenu' };
const PAGE_HREFS = {
  home: Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/`])),
  'path-probe': Object.fromEntries(
    PROBES.map((file) => [file.split('/')[0], `/${file.split('/')[0]}/${encodeURIComponent(file.split('/')[1])}/`]),
  ),
};
const FOCUSABLE = /<(?:a\b[^>]*\shref=|button\b|input\b|select\b|textarea\b|[a-z][\w-]*\b[^>]*\stabindex=)[^>]*>/i;

/** Story 1.4 : sortie du layout unique pour la page `id` en `lang` ; `site` = SITE_URL du build. */
function assertLayout(html, id, lang, site = '', indexable = false) {
  const where = `${id} (${lang})`;
  // Titre et description depuis le YAML de la page ; noindex si et seulement si non indexable.
  assert.deepEqual(Object.keys(META[id].title), LANGS, `${where} : meta.title`);
  assert.deepEqual(Object.keys(META[id].description), LANGS, `${where} : meta.description`);
  assert.equal(html.match(/<title>(.*?)<\/title>/)?.[1], META[id].title[lang], `${where} : <title>`);
  assert.equal(html.match(/<meta name="description" content="([^"]*)">/)?.[1], META[id].description[lang], `${where} : description`);
  assert.equal(html.includes('<meta name="robots" content="noindex">'), !indexable, `${where} : noindex`);
  // AD-7 : un seul lang= et un seul dir=, sur <html>, avec data-page-id.
  assert.equal(html.match(/\slang=/g)?.length, 1, `${where} : lang= en double`);
  assert.equal(html.match(/\sdir=/g)?.length, 1, `${where} : dir= en double`);
  assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}" data-page-id="${id}"[\\s>]`), where);
  // AD-13 : un seul #rs-data, qui vaut { context }.
  assert.equal(html.match(/\sid="rs-data"/g)?.length, 1, `${where} : #rs-data absent ou en double`);
  const json = html.match(/<script type="application\/json" id="rs-data">([\s\S]*?)<\/script>/)?.[1];
  assert.deepEqual(JSON.parse(json), { context: { id, lang, indexable } }, where);
  // FR24 : premier élément focalisable du <body> = lien d'évitement vers #content.
  const body = html.slice(html.indexOf('<body'));
  const first = body.slice(body.indexOf('>') + 1).match(FOCUSABLE);
  assert.ok(first, `${where} : aucun élément focalisable`);
  assert.match(first[0], /^<a class="skip-link" href="#content"[\s>]/, `${where} : premier focalisable ${first[0]}`);
  const text = body.slice(body.indexOf('>') + 1 + first.index + first[0].length).match(/^([^<]*)<\/a>/)?.[1];
  assert.equal(text, SKIP_LINK[lang], where);
  // Repères.
  assert.equal(html.match(/<header[\s>]/g)?.length, 1, `${where} : <header>`);
  const header = html.match(/<header[\s>][\s\S]*?<\/header>/)?.[0] ?? '';
  assert.ok(header.includes(`<a href="${PAGE_HREFS.home[lang]}"`), `${where} : lien d'accueil du header`);
  assert.equal(html.match(/<main[\s>]/g)?.length, 1, `${where} : <main>`);
  assert.match(html, /<main id="content"[\s>]/, `${where} : main#content`);
  assert.equal(html.match(/<footer[\s>]/g)?.length, 1, `${where} : <footer>`);
  // FR39 : canonique et 5 hreflang (he, en, ru, fr, x-default → he de la même page).
  const hrefs = PAGE_HREFS[id];
  const canon = [...html.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((m) => m[1]);
  assert.deepEqual(canon, [site + hrefs[lang]], `${where} : canonique`);
  const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)">/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(alts, [...LANGS.map((l) => [l, site + hrefs[l]]), ['x-default', site + hrefs.he]], `${where} : hreflang`);
  assert.ok(!/[?]/.test([...canon, ...alts.map((a) => a[1])].join('')), `${where} : paramètre d'URL`);
}

test('build de branche : 4 accueils + 4 path-probe, layout Base (lang/dir, #rs-data, évitement, repères, hreflang relatifs), _redirects', { timeout: 120_000 }, () => {
  const out = build({});
  assert.deepEqual(indexFiles(out), [...HOMES, ...PROBES].sort());
  assert.ok(existsSync(join(out, '_redirects')), '_redirects absent');
  assert.ok(!existsSync(join(out, 'index.html')), 'index.html racine présent');
  assert.deepEqual(Object.keys(titles), LANGS);
  for (const lang of LANGS) {
    const html = readFileSync(join(out, lang, 'index.html'), 'utf8');
    assert.equal(html.match(/<title>(.*?)<\/title>/)?.[1], titles[lang]);
    assertLayout(html, 'home', lang);
  }
  for (const file of PROBES) {
    assertLayout(readFileSync(join(out, file), 'utf8'), 'path-probe', file.split('/')[0]);
  }
});

test('build de main indexable avec SITE_URL : seulement les 4 accueils, sans noindex, canonique et hreflang absolus', { timeout: 120_000 }, () => {
  const out = build({ WORKERS_CI_BRANCH: 'main', DOMAIN_LIVE: 'true', SITE_URL: 'https://rs.example' });
  assert.deepEqual(indexFiles(out), [...HOMES].sort());
  assert.ok(!existsSync(join(out, 'index.html')));
  for (const lang of LANGS) {
    assertLayout(readFileSync(join(out, lang, 'index.html'), 'utf8'), 'home', lang, 'https://rs.example', true);
  }
});
