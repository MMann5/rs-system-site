// Story 1.2 : règles structurelles des styles (AD-7, AD-8, UX-DR2, UX-DR3, UX-DR6, NFR5, NFR7).
// Tourne partout (CI comprise). Chaque contrôle est une fonction pure, testée aussi sur une entrée fautive.
// Couleurs et propriétés physiques regroupées en portes scripts/checks/ : story 1.10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_PRELOAD } from '../src/lib/fonts.ts';
import { findLiteralColors, lineOf, sourceFiles as sourceFilesOf, stripComments, TOKENS_REL } from '../scripts/checks/colors.mjs';
import { findPhysicalProperties } from '../scripts/checks/physical-css.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const STYLES = join(SRC, 'styles');
const PUBLIC = join(ROOT, 'public');
const FONTS = join(PUBLIC, 'fonts');
const FONT_BUDGET = 120_000;

// Fichiers vérifiés, en chemins relatifs à la racine.
const sourceFiles = (dir) => sourceFilesOf(ROOT, dir);

// — Contrôles purs : chacun renvoie la liste des violations (vide = conforme). —
// Couleurs littérales et propriétés physiques : portes scripts/checks/colors.mjs et physical-css.mjs (story 1.10).

/** UX-DR3 : --radius-* ∈ {0px, 2px, 9999px} ; tout border*-radius = 0 ou var(--radius-*). */
function findBadRadii(files) {
  const errors = [];
  for (const { path, text } of files) {
    const src = stripComments(text);
    for (const m of src.matchAll(/(--radius-[\w-]+)\s*:\s*([^;}\n]+)/g)) {
      if (!['0px', '2px', '9999px'].includes(m[2].trim())) {
        errors.push(`${path}:${lineOf(src, m.index)} : ${m[1]}: ${m[2].trim()} (attendu 0px, 2px ou 9999px)`);
      }
    }
    for (const m of src.matchAll(/(?<![\w-])(border(?:-[\w]+)*-radius)\s*:\s*([^;}\n]+)/g)) {
      const value = m[2].trim().replace(/\s*!important$/, '');
      if (!/^(?:0|var\(--radius-(?:none|xs|full)\))$/.test(value)) {
        errors.push(`${path}:${lineOf(src, m.index)} : ${m[1]}: ${value} (attendu 0 ou var(--radius-*))`);
      }
    }
  }
  return errors;
}

/** UX-DR6, NFR7, AD-7 : règles obligatoires de base.css. */
function findMissingBaseRules(css) {
  const src = stripComments(css).replace(/\s+/g, ' ');
  const required = {
    'mouvement réduit':
      /@media \(prefers-reduced-motion: reduce\) \{ \*, \*::before, \*::after \{ animation: none !important; transition: none !important; \} \}/,
    'scroll-padding-block':
      /html \{[^}]*scroll-padding-block: var\(--scroll-padding-start\) calc\(var\(--scroll-padding-start\) \+ env\(safe-area-inset-bottom\)\)/,
    'titres text-wrap: balance': /h1, h2, h3, h4, h5, h6 \{[^}]*text-wrap: balance/,
    'titres overflow-wrap: anywhere': /h1, h2, h3, h4, h5, h6 \{[^}]*overflow-wrap: anywhere/,
    'titres hyphens: auto': /h1, h2, h3, h4, h5, h6 \{[^}]*hyphens: auto/,
    'focus-visible': /:focus-visible \{ outline: var\(--focus-ring-width\) solid var\(--focus-ring\); outline-offset: var\(--focus-ring-offset\);/,
    'focus clair (défaut)': /:root \{ --focus-ring: var\(--color-focus-ring\); --focus-ring-offset: var\(--focus-offset\);/,
    'focus navy': /\[data-surface="navy"\] \{ --focus-ring: var\(--color-focus-ring-dark\); --focus-ring-offset: var\(--focus-offset\);/,
    'focus photo': /\[data-surface="photo"\] \{ --focus-ring: var\(--color-focus-ring-on-photo\); --focus-ring-offset: var\(--focus-offset\);/,
    'focus accent': /\[data-surface="accent"\] \{ --focus-ring: var\(--color-focus-ring-on-accent\); --focus-ring-offset: var\(--focus-offset-accent\);/,
    'police hébreu :lang': /:where\([^)]*:lang\(he\)\) \{ font-family: var\(--family-he\);/,
    'police autres langues :lang': /:where\([^)]*:not\(:lang\(he\)\)\) \{ font-family: var\(--family-sans\);/,
  };
  return Object.entries(required)
    .filter(([, re]) => !re.test(src))
    .map(([name]) => `base.css : règle manquante (${name})`);
}

/** NFR5 : chaque @font-face en swap, normal, graisse 400/600/700, fichier WOFF2 existant. */
function findBadFontFaces(css, fileExists) {
  const errors = [];
  const faces = [...stripComments(css).matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  if (faces.length === 0) errors.push('aucune @font-face');
  faces.forEach((body, i) => {
    const get = (prop) => body.match(new RegExp(`(?<![\\w-])${prop}\\s*:\\s*([^;]+)`))?.[1].trim();
    const label = `@font-face n° ${i + 1}`;
    if (get('font-display') !== 'swap') errors.push(`${label} : font-display ≠ swap`);
    if (get('font-style') !== 'normal') errors.push(`${label} : font-style ≠ normal`);
    if (!['400', '600', '700'].includes(get('font-weight'))) errors.push(`${label} : graisse ${get('font-weight')}`);
    if (!get('unicode-range')) errors.push(`${label} : unicode-range absente`);
    const urls = [...(get('src') ?? '').matchAll(/url\(['"]?([^'")]+)['"]?\)\s*format\(['"]woff2['"]\)/g)];
    if (urls.length !== 1) errors.push(`${label} : src doit être une seule url(…) format('woff2')`);
    for (const [, url] of urls) if (!fileExists(url)) errors.push(`${label} : fichier absent ${url}`);
  });
  return errors;
}

/** NFR5 : poids total des WOFF2 ≤ budget. */
function checkFontBudget(sizes, budget = FONT_BUDGET) {
  const total = sizes.reduce((s, n) => s + n, 0);
  return total <= budget ? [] : [`polices : ${total} octets > ${budget}`];
}

/** NFR5 : préchargement = 700 existante de l'écriture de la langue. */
function findBadPreloads(preload, fileExists) {
  const errors = [];
  const script = { he: 'hebrew', en: 'latin', ru: 'cyrillic', fr: 'latin' };
  for (const [lang, name] of Object.entries(script)) {
    const href = preload[lang];
    if (href !== `/fonts/noto-sans-${name}-700.woff2`) errors.push(`${lang} : ${href} (attendu la 700 ${name})`);
    else if (!fileExists(href)) errors.push(`${lang} : fichier absent ${href}`);
  }
  return errors;
}

/** NFR5 : FontPreload rend le bon <link rel="preload"> et le layout Base l'utilise dans son <head>. */
function findBadPreloadMarkup(component, layout) {
  const errors = [];
  const link = component.match(/<link\b[^>]*>/)?.[0];
  if (!link) errors.push('FontPreload.astro : <link> absent');
  else {
    for (const attr of ['rel="preload"', 'href={FONT_PRELOAD[lang]}', 'as="font"', 'type="font/woff2"']) {
      if (!link.includes(attr)) errors.push(`FontPreload.astro : ${attr} absent du <link>`);
    }
    if (!/\scrossorigin(?=[\s/>=])/.test(link)) errors.push('FontPreload.astro : crossorigin absent du <link>');
  }
  const head = layout.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  if (!head.includes('<FontPreload lang={ctx.lang} />')) errors.push('Base.astro : <FontPreload lang={ctx.lang} /> absent du <head>');
  return errors;
}

/**
 * Recette 4.1 : `.crumb-link` est en inline-flex, qui supprime les espaces autour du chevron « › » ;
 * l'écart doit venir d'un `column-gap` (ou `gap`) tiré d'un jeton (AD-8).
 */
function findMissingCrumbGap(astro) {
  const rule = stripComments(astro).match(/\.crumb-link\s*\{([^}]*)\}/)?.[1];
  if (rule === undefined) return ['City.astro : règle .crumb-link absente'];
  if (!/(?:^|[\s;])(?:column-)?gap\s*:\s*var\(--[\w-]+\)\s*(?:;|$)/.test(rule)) {
    return ['City.astro : .crumb-link sans column-gap: var(--…) (chevron collé au texte)'];
  }
  return [];
}

const publicFileExists = (url) => url.startsWith('/') && existsSync(join(PUBLIC, url));

// — Le dépôt —

test('aucune couleur littérale dans src/ hors tokens.css', () => {
  assert.deepEqual(findLiteralColors(sourceFiles(SRC)), []);
});

test('rayons limités à 0, 2px et 9999px', () => {
  assert.deepEqual(findBadRadii(sourceFiles(SRC)), []);
});

test('src/ en propriétés logiques uniquement', () => {
  assert.deepEqual(findPhysicalProperties(sourceFiles(SRC)), []);
});

test('base.css porte focus, mouvement réduit, scroll-padding, titres et polices par langue', () => {
  assert.deepEqual(findMissingBaseRules(readFileSync(join(STYLES, 'base.css'), 'utf8')), []);
});

test('base.css importe tokens.css et fonts.css', () => {
  const css = readFileSync(join(STYLES, 'base.css'), 'utf8');
  assert.match(css, /@import '\.\/tokens\.css';/);
  assert.match(css, /@import '\.\/fonts\.css';/);
});

test('@font-face : 12 faces en swap, 400/600/700, fichiers présents', () => {
  const css = readFileSync(join(STYLES, 'fonts.css'), 'utf8');
  assert.deepEqual(findBadFontFaces(css, publicFileExists), []);
  assert.equal([...css.matchAll(/@font-face/g)].length, 12);
});

test('public/fonts/*.woff2 ≤ 120 000 octets', () => {
  const sizes = readdirSync(FONTS)
    .filter((f) => f.endsWith('.woff2'))
    .map((f) => statSync(join(FONTS, f)).size);
  assert.equal(sizes.length, 12);
  assert.deepEqual(checkFontBudget(sizes), []);
});

test('FONT_PRELOAD : 700 existante, hébreu pour he, cyrillique pour ru', () => {
  assert.deepEqual(findBadPreloads(FONT_PRELOAD, publicFileExists), []);
});

test('FontPreload rend le preload et le layout Base l\'utilise dans son <head>', () => {
  const component = readFileSync(join(SRC, 'components', 'FontPreload.astro'), 'utf8');
  const layout = readFileSync(join(SRC, 'layouts', 'Base.astro'), 'utf8');
  assert.deepEqual(findBadPreloadMarkup(component, layout), []);
});

// — Chaque contrôle échoue sur une entrée fautive —

test('contrôle couleurs : #fff, rgba(), mot-clé et attribut SVG détectés, tokens.css ignoré', () => {
  const errors = findLiteralColors([
    { path: 'src/components/A.astro', text: '<style>\n.a { color: #fff; }\n</style>' },
    { path: 'src/styles/b.css', text: '.b { background: rgba(0,0,0,.5); }' },
    { path: 'src/styles/c.css', text: '.c { border-color: White; }' },
    { path: 'src/components/D.astro', text: '<svg><path fill="red" /></svg>' },
    { path: TOKENS_REL, text: ':root { --color-white: #ffffff; }' },
    { path: 'src/components/Ok.astro', text: '<a href="#content">x</a><style>.o { color: var(--color-white); }</style>' },
  ]);
  assert.equal(errors.length, 4);
  assert.match(errors[0], /^src\/components\/A\.astro:2 /);
  assert.ok(errors.some((e) => e.startsWith('src/styles/b.css')));
  assert.ok(errors.some((e) => e.startsWith('src/styles/c.css') && /white/i.test(e)));
  assert.ok(errors.some((e) => e.startsWith('src/components/D.astro')));
});

test('contrôle rayons : --radius-* à 6px et border-radius: 12px détectés', () => {
  const errors = findBadRadii([
    { path: TOKENS_REL, text: ':root { --radius-sm: 6px; --radius-xs: 2px; }' },
    { path: 'src/styles/x.css', text: '.x { border-radius: 12px; }\n.y { border-top-left-radius: 4px; }' },
    { path: 'src/styles/ok.css', text: '.o { border-radius: var(--radius-xs); border-radius: 0; }' },
  ]);
  assert.equal(errors.length, 3);
  assert.ok(errors.some((e) => e.includes('--radius-sm: 6px')));
  assert.ok(errors.some((e) => e.includes('border-radius: 12px')));
  assert.ok(errors.some((e) => e.includes('border-top-left-radius: 4px')));
});

test('contrôle propriétés physiques : left, margin-right, text-align: left détectés ; physical-ok toléré', () => {
  const errors = findPhysicalProperties([
    {
      path: 'src/styles/x.css',
      text: '.a { left: 0; }\n.b { margin-right: 8px; }\n.c { text-align: left; }\n.d { float: right; }\n.logo { left: 0; } /* physical-ok */\n.e { inset-inline-start: 0; text-align: start; }',
    },
  ]);
  assert.equal(errors.length, 4);
  assert.deepEqual(errors.map((e) => e.split(' : ')[0]).sort(), ['src/styles/x.css:1', 'src/styles/x.css:2', 'src/styles/x.css:3', 'src/styles/x.css:4']);
});

test('contrôle base.css : une feuille vide manque toutes les règles', () => {
  const errors = findMissingBaseRules('body { margin: 0; }');
  assert.equal(errors.length, 12);
  assert.ok(errors.some((e) => e.includes('mouvement réduit')));
  assert.ok(errors.some((e) => e.includes('focus accent')));
});

test('contrôle @font-face : block, 500, italique et fichier absent détectés', () => {
  const css = "@font-face { font-family: 'X'; font-style: italic; font-weight: 500; font-display: block; src: url('/fonts/absent.woff2') format('woff2'); }";
  const errors = findBadFontFaces(css, () => false);
  assert.equal(errors.length, 5);
  assert.ok(errors.some((e) => e.includes('swap')));
  assert.ok(errors.some((e) => e.includes('graisse 500')));
  assert.ok(errors.some((e) => e.includes('font-style')));
  assert.ok(errors.some((e) => e.includes('unicode-range')));
  assert.ok(errors.some((e) => e.includes('absent.woff2')));
});

test('contrôle budget : 120 001 octets échoue en citant le total', () => {
  assert.deepEqual(checkFontBudget([60_000, 60_000]), []);
  assert.deepEqual(checkFontBudget([60_000, 60_001]), ['polices : 120001 octets > 120000']);
});

test('contrôle préchargement : latin pour ru et 400 pour he détectés', () => {
  const errors = findBadPreloads(
    {
      he: '/fonts/noto-sans-hebrew-400.woff2',
      en: '/fonts/noto-sans-latin-700.woff2',
      ru: '/fonts/noto-sans-latin-700.woff2',
      fr: '/fonts/noto-sans-latin-700.woff2',
    },
    () => true,
  );
  assert.equal(errors.length, 2);
  assert.ok(errors[0].startsWith('he :'));
  assert.ok(errors[1].startsWith('ru :'));
});

// — Matrice « Page hébraïque » : les chiffres d'une page he tombent sur Noto Sans (family-sans) —

/** Vrai si une unicode-range CSS couvre le point de code. */
function rangeCovers(range, codePoint) {
  return range.split(',').some((part) => {
    const [lo, hi = lo] = part.trim().replace(/^U\+/i, '').split('-').map((h) => parseInt(h, 16));
    return codePoint >= lo && codePoint <= hi;
  });
}

/** Familles @font-face qui couvrent au moins un chiffre ASCII. */
function familiesCoveringDigits(css) {
  const out = new Set();
  for (const [, body] of stripComments(css).matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = body.match(/font-family\s*:\s*["']?([^"';]+)["']?/)?.[1];
    const range = body.match(/unicode-range\s*:\s*([^;]+)/)?.[1];
    if (family && range && [...'0123456789'].some((d) => rangeCovers(range, d.codePointAt(0)))) out.add(family);
  }
  return [...out].sort();
}

test('chiffres : seule Noto Sans les couvre, Noto Sans Hebrew couvre l’hébreu', () => {
  const css = readFileSync(join(STYLES, 'fonts.css'), 'utf8');
  assert.deepEqual(familiesCoveringDigits(css), ['Noto Sans']);
  assert.ok(/font-family:\s*"Noto Sans Hebrew"[^}]*unicode-range:[^;]*U\+0590-05FF/.test(css));
});

test('contrôle chiffres : une face hébraïque qui couvre U+0030-0039 est détectée', () => {
  const css = '@font-face { font-family: "Noto Sans Hebrew"; unicode-range: U+0000-00FF, U+0590-05FF; }';
  assert.deepEqual(familiesCoveringDigits(css), ['Noto Sans Hebrew']);
});

test('contrôle balisage preload : as, crossorigin et FontPreload absents détectés', () => {
  const errors = findBadPreloadMarkup(
    '<link rel="preload" href={FONT_PRELOAD[lang]} as="style" type="font/woff2" />',
    '<html><head><title>x</title></head><body><FontPreload lang={ctx.lang} /></body></html>',
  );
  assert.deepEqual(errors, [
    'FontPreload.astro : as="font" absent du <link>',
    'FontPreload.astro : crossorigin absent du <link>',
    'Base.astro : <FontPreload lang={ctx.lang} /> absent du <head>',
  ]);
});

test('fil d\'Ariane de la page ville : écart du chevron par column-gap tiré d\'un jeton', () => {
  assert.deepEqual(findMissingCrumbGap(readFileSync(join(SRC, 'templates', 'City.astro'), 'utf8')), []);
});

test('contrôle écart du fil d\'Ariane : gap absent ou littéral détecté', () => {
  const missing = ['City.astro : .crumb-link sans column-gap: var(--…) (chevron collé au texte)'];
  assert.deepEqual(findMissingCrumbGap('<style>.crumb-link { display: inline-flex; align-items: center; }</style>'), missing);
  assert.deepEqual(findMissingCrumbGap('<style>.crumb-link { display: inline-flex; column-gap: 8px; }</style>'), missing);
  assert.deepEqual(findMissingCrumbGap('<style>.crumb-link { row-gap: var(--space-2); }</style>'), missing);
  assert.deepEqual(findMissingCrumbGap('<style>.crumb { color: red; }</style>'), ['City.astro : règle .crumb-link absente']);
  assert.deepEqual(findMissingCrumbGap('<style>.crumb-link { gap: 8px; }</style>'), missing);
  assert.deepEqual(findMissingCrumbGap('<style>.crumb-link { gap: var(--space-2); }</style>'), []);
  assert.deepEqual(findMissingCrumbGap('<style>.crumb-link { column-gap: var(--space-2); }</style>'), []);
});
