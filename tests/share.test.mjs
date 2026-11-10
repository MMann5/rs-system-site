// Story 7.2 (FR39, AD-8, D4) : balises Open Graph / Twitter (src/lib/share.ts), carte détecteur cohérente avec le
// dessin CSS (mêmes jetons que SmokeDetector.astro), et contrôle des aperçus de scripts/checks/share.mjs sur un dist/
// fabriqué.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { checkShare, findShareFailures, imageInfo, MAX_IMAGE_BYTES } from '../scripts/checks/share.mjs';
import { absoluteUrl, SHARE_CARD_PATHS } from '../src/lib/seo.ts';
import { DETECTOR_CARD_TOKENS, detectorCardSvg, OG_LOCALES, parseShadows, parseTokens, shareMeta } from '../src/lib/share.ts';
import { localBusiness, serializeJsonLd } from '../src/lib/structured-data.ts';

const ROOT = new URL('../', import.meta.url);
const TOKENS_CSS = readFileSync(new URL('src/styles/tokens.css', ROOT), 'utf8');
const DETECTOR = readFileSync(new URL('src/components/SmokeDetector.astro', ROOT), 'utf8');
const SITE = 'https://rssystem.co.il';
const LOGO = { src: SHARE_CARD_PATHS.logo, width: 1200, height: 630, type: 'image/png' };
const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const tags = (list) => list.map(({ attr, key, content }) => `${attr}:${key}=${content}`);

test('OG_LOCALES : he_IL, en_US, ru_RU, fr_FR', () => {
  assert.deepEqual(OG_LOCALES, { he: 'he_IL', en: 'en_US', ru: 'ru_RU', fr: 'fr_FR' });
});

test('shareMeta : balises OG puis Twitter, locale de la page + 3 alternates, image 1200 × 630', () => {
  const list = shareMeta({ title: 'T · RS SYSTEM', description: 'D', lang: 'fr', url: '/fr/x/', image: LOGO, type: 'website' });
  assert.deepEqual(tags(list), [
    'property:og:title=T · RS SYSTEM',
    'property:og:description=D',
    'property:og:type=website',
    'property:og:url=/fr/x/',
    'property:og:site_name=RS SYSTEM',
    'property:og:locale=fr_FR',
    'property:og:locale:alternate=he_IL',
    'property:og:locale:alternate=en_US',
    'property:og:locale:alternate=ru_RU',
    'property:og:image=/og/logo.png',
    'property:og:image:width=1200',
    'property:og:image:height=630',
    'property:og:image:type=image/png',
    'name:twitter:card=summary_large_image',
    'name:twitter:title=T · RS SYSTEM',
    'name:twitter:description=D',
    'name:twitter:image=/og/logo.png',
  ]);
});

test('shareMeta : article → og:type article ; hébreu → he_IL', () => {
  const list = shareMeta({ title: 'T', description: 'D', lang: 'he', url: '/he/x/', image: LOGO, type: 'article' });
  assert.ok(tags(list).includes('property:og:type=article'));
  assert.ok(tags(list).includes('property:og:locale=he_IL'));
  assert.deepEqual(list.filter((t) => t.key === 'og:locale:alternate').map((t) => t.content), ['en_US', 'ru_RU', 'fr_FR']);
});

test('shareMeta 404 : ni og:url, ni og:description, ni twitter:description', () => {
  const keys = shareMeta({ title: 'Page introuvable · RS SYSTEM', lang: 'fr', image: LOGO, type: 'website' }).map((t) => t.key);
  for (const key of ['og:url', 'og:description', 'twitter:description']) assert.ok(!keys.includes(key), key);
  for (const key of ['og:title', 'og:image', 'og:locale', 'twitter:card', 'twitter:image']) assert.ok(keys.includes(key), key);
});

test('SITE_URL=https://rssystem.co.il : og:url et og:image absolues', () => {
  const image = { ...LOGO, src: absoluteUrl(LOGO.src, SITE) };
  const list = shareMeta({ title: 'T', description: 'D', lang: 'en', url: absoluteUrl('/en/', SITE), image, type: 'website' });
  for (const key of ['og:url', 'og:image', 'twitter:image']) assert.match(list.find((t) => t.key === key).content, /^https:\/\/rssystem\.co\.il\//, key);
});

test('parseTokens : custom properties de tokens.css, commentaires ignorés', () => {
  const tokens = parseTokens(':root {\n  /* --x: #000; */\n  --a: #fff;\n  --b: 0 1px 2px rgba(0,0,0,.1), inset 0 -1px 2px #000;\n}\n:root { --a: #111; }');
  assert.deepEqual(tokens, { '--a': '#fff', '--b': '0 1px 2px rgba(0,0,0,.1), inset 0 -1px 2px #000' });
  assert.deepEqual(parseShadows(tokens['--b']), [
    { inset: false, x: 0, y: 1, blur: 2, color: 'rgba(0,0,0,.1)' },
    { inset: true, x: 0, y: -1, blur: 2, color: '#000' },
  ]);
});

test('carte détecteur cohérente avec le dessin : chaque var(--color-…) de SmokeDetector.astro est dans DETECTOR_CARD_TOKENS et sa valeur dans le SVG', () => {
  const tokens = parseTokens(TOKENS_CSS);
  const svg = detectorCardSvg(tokens);
  const used = [...new Set([...DETECTOR.matchAll(/var\((--color-[\w-]+)\)/g)].map((m) => m[1]))];
  assert.ok(used.length >= 5, `couleurs du détecteur : ${used}`);
  for (const name of used) {
    assert.ok(DETECTOR_CARD_TOKENS.includes(name), `${name} absent de DETECTOR_CARD_TOKENS`);
    assert.ok(svg.includes(`"${tokens[name]}"`), `${name} (${tokens[name]}) absent du SVG`);
  }
  // Fond surface-alt, ombre tirée de --shadow-detector-lg.
  assert.ok(svg.includes(`fill="${tokens['--color-surface-alt']}"`), 'fond surface-alt');
  for (const { color } of parseShadows(tokens['--shadow-detector-lg'])) assert.ok(svg.includes(`flood-color="${color}"`), `ombre ${color}`);
  assert.match(svg, /^<svg [^>]*width="1200" height="630"/);
});

test('carte détecteur : jeton absent → lève en le nommant', () => {
  const tokens = parseTokens(TOKENS_CSS);
  delete tokens['--color-led-ok'];
  assert.throws(() => detectorCardSvg(tokens), /--color-led-ok/);
});

test('carte détecteur : une couleur changée dans tokens.css change le SVG (aucune couleur littérale)', () => {
  const tokens = { ...parseTokens(TOKENS_CSS), '--color-led-ok': '#123456' };
  assert.ok(detectorCardSvg(tokens).includes('"#123456"'));
});

test('carte détecteur rendue par sharp : PNG 1200 × 630 ≤ 300 Ko', async () => {
  const png = await sharp(Buffer.from(detectorCardSvg(parseTokens(TOKENS_CSS)))).png().toBuffer();
  assert.deepEqual(imageInfo(png), { type: 'image/png', width: 1200, height: 630 });
  assert.ok(png.length <= MAX_IMAGE_BYTES, `${png.length} octets`);
});

// — Contrôle scripts/checks/share.mjs sur un dist/ fabriqué —

async function fakeDist() {
  const dist = mkdtempSync(join(tmpdir(), 'rs-share-'));
  dirs.push(dist);
  mkdirSync(join(dist, 'og'));
  mkdirSync(join(dist, 'fr'));
  const png = await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
  writeFileSync(join(dist, 'og', 'logo.png'), png);
  const small = await sharp({ create: { width: 600, height: 315, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer();
  writeFileSync(join(dist, 'og', 'small.jpg'), small);
  return dist;
}

function page({ id = 'home', lang = 'fr', image = '/og/logo.png', imageType = 'image/png', canonical = '/fr/', description = 'D', jsonLd } = {}) {
  const meta = shareMeta({ title: 'T', description, lang, url: canonical, image: { src: image, width: 1200, height: 630, type: imageType }, type: id.startsWith('post:') ? 'article' : 'website' });
  return [
    `<!doctype html><html lang="${lang}" dir="ltr" data-page-id="${id}"><head><title>T</title>`,
    description === undefined ? '' : `<meta name="description" content="${description}">`,
    canonical === undefined ? '' : `<link rel="canonical" href="${canonical}">`,
    ...meta.map(({ attr, key, content }) => `<meta ${attr}="${key}" content="${content}">`),
    jsonLd === undefined ? '' : `<script type="application/ld+json">${jsonLd}</script>`,
    '</head><body></body></html>',
  ].join('');
}

const HOME_LD = serializeJsonLd([localBusiness({ url: '/fr/', logo: '/rs-icon-512.png', areaServed: ['Ariel'] })]);

test('contrôle share : page conforme → aucun échec ; 404 sans og:url ni description ni JSON-LD → aucun échec', async () => {
  const dist = await fakeDist();
  assert.deepEqual(findShareFailures(page({ jsonLd: HOME_LD }), dist, undefined), []);
  assert.deepEqual(findShareFailures(page({ id: 'not-found', canonical: undefined, description: undefined }), dist, undefined), []);
  writeFileSync(join(dist, 'fr', 'index.html'), page({ jsonLd: HOME_LD }));
  assert.deepEqual(checkShare(dist, undefined), []);
});

test('contrôle share : JSON-LD manquant une propriété → échec nommant la page et la propriété', async () => {
  const dist = await fakeDist();
  const data = JSON.parse(HOME_LD);
  delete data['@graph'][0].telephone;
  writeFileSync(join(dist, 'fr', 'index.html'), page({ jsonLd: JSON.stringify(data) }));
  const failures = checkShare(dist, undefined);
  assert.equal(failures.length, 1, failures.join('\n'));
  assert.match(failures[0], /^fr\/index\.html : .*propriété requise « telephone » absente/);
});

test('contrôle share : JSON-LD sur la 404, image absente, mauvaise taille, mauvais type, locale fausse → échecs', async () => {
  const dist = await fakeDist();
  assert.match(findShareFailures(page({ id: 'not-found', canonical: undefined, description: undefined, jsonLd: HOME_LD }), dist, undefined).join('\n'), /JSON-LD sur la 404/);
  assert.match(findShareFailures(page({ jsonLd: HOME_LD, image: '/og/none.png' }), dist, undefined).join('\n'), /absente de dist/);
  assert.match(findShareFailures(page({ jsonLd: HOME_LD, image: '/og/small.jpg', imageType: 'image/jpeg' }), dist, undefined).join('\n'), /600 × 315 au lieu de 1200 × 630/);
  assert.match(findShareFailures(page({ jsonLd: HOME_LD, imageType: 'image/jpeg' }), dist, undefined).join('\n'), /og:image:type/);
  const wrongLocale = page({ jsonLd: HOME_LD }).replace('content="fr_FR"', 'content="en_US"');
  assert.match(findShareFailures(wrongLocale, dist, undefined).join('\n'), /og:locale « en_US » au lieu de « fr_FR »/);
  // Page à JSON-LD attendu sans script.
  assert.match(findShareFailures(page(), dist, undefined).join('\n'), /JSON-LD absent/);
});

test('contrôle share : URL absolue sur SITE_URL → fichier lu dans dist/ ; autre origine → refusée', async () => {
  const dist = await fakeDist();
  const abs = page({ jsonLd: HOME_LD, image: `${SITE}/og/logo.png`, canonical: `${SITE}/fr/` });
  assert.deepEqual(findShareFailures(abs, dist, SITE), []);
  assert.match(findShareFailures(page({ jsonLd: HOME_LD, image: 'https://example.com/og/logo.png' }), dist, SITE).join('\n'), /hors du site/);
});
