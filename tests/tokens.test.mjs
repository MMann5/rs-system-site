// Story 1.2 (UX-DR1, AD-8) : tokens.css = frontmatter de DESIGN.md, valeur par valeur.
// Local seulement : DESIGN.md est dans _bmad-output/, hors dépôt (AD-11) ; le test est ignoré s'il est absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UX = '../_bmad-output/planning-artifacts/ux-designs/ux-rs_system-2026-11-04/';
const DESIGN = fileURLToPath(new URL(UX + 'DESIGN.md', import.meta.url));
const EXPERIENCE = fileURLToPath(new URL(UX + 'EXPERIENCE.md', import.meta.url));
const TOKENS = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));
const SKIP = existsSync(DESIGN) ? false : 'DESIGN.md absent (hors dépôt)';

// Valeurs ajoutées hors frontmatter, chacune commentée avec sa source dans tokens.css.
const ADDED = { '--focus-ring-width': '2px', '--focus-offset-accent': '-4px', '--scroll-padding-start': '80px', '--skip-link-pad-block': '12px', '--z-skip-link': '1000', '--z-header': '100', '--z-mobile-bar': '90', '--type-mobile-bar-size': '18px', '--type-mobile-bar-weight': '700', '--icon-size': '20px', '--icon-size-menu': '22px', '--icon-stroke-width': '1.8', '--footer-col-min': '200px', '--hero-photo-min': '780px', '--hero-photo-min-tablet': '680px', '--hero-photo-min-mobile': '560px', '--hero-zoom-from': '1.1', '--hero-zoom-duration': '2.6s', '--rise-distance': '24px', '--rise-duration': '0.9s', '--rise-opacity-from': '0.4', '--rise-delay-1': '0.25s', '--rise-delay-2': '0.45s', '--rise-delay-3': '0.65s', '--scrim-hold': 'linear-gradient(to bottom, rgba(6,16,32,.62) 0%, rgba(6,16,32,.62) calc(100% - 64px), rgba(6,16,32,0) 100%)', '--scrim-hold-extend': '96px', '--visually-hidden-size': '1px', '--arcs-size': '560px', '--arcs-offset-inline': '-60px', '--arcs-offset-block': '-80px', '--arcs-scale-mobile': '0.6', '--arc-stroke-width': '41', '--arcs-ink-block': '0.756', '--arcs-ink-inline': '0.835', '--arcs-clearance': '16px', '--arc-duration': '1.4s', '--arc-delay-1': '0.3s', '--arc-delay-2': '0.5s', '--arc-delay-3': '0.7s', '--contact-pad-start': '88px', '--contact-hero-gap': '12px', '--container-form': '1080px', '--form-col-min': '420px', '--form-cols-gap': '64px', '--form-fields-gap': '20px', '--info-gap': '32px', '--info-pair-gap': '6px', '--field-min-height': '52px', '--field-border-width': '1px', '--field-pad-block': '12px', '--field-pad-inline': '14px', '--submit-min-height': '56px', '--submit-pad-inline': '36px', '--submit-pad-inline-mobile': '16px', '--type-submit-size': '18px', '--type-submit-weight': '700', '--type-info-value-size': '22px', '--type-info-value-weight': '600', '--type-info-phone-size': '26px', '--type-info-phone-weight': '700', '--field-border-width-error': '2px', '--icon-size-alert': '16px', '--icon-size-status': '24px', '--form-status-rule': '4px', '--hero-light-photo-height': '600px', '--photo-ratio-tablet': '16 / 9', '--photo-ratio-portrait': '4 / 5', '--hero-light-photo-gap': '44px', '--hero-light-subtitle-max': '760px', '--photo-focus-dome': 'center 32%', '--photo-focus-crane': 'center 40%', '--section-head-gap': '56px', '--stack-gap': '10px', '--trio-col-min': '260px', '--trio-gap': '48px', '--type-trio-text-size': '17px', '--steps-col-min': '220px', '--steps-gap': '40px', '--type-step-title-weight': '700', '--tile-crane-min': '640px', '--tile-crane-min-tablet': '600px', '--tile-pad-top': '64px', '--type-eyebrow-size': '17px', '--type-eyebrow-weight': '600', '--type-tile-text-size': '22px', '--reveal-opacity-from': '0.4', '--reveal-distance': '56px', '--tile-zoom-from': '1.14', '--drift-from': '-7%', '--drift-to': '7%', '--drift-scale': '1.16', '--detector-size-lg': '380px', '--detector-size-md': '260px', '--detector-size-sm': '150px', '--detector-max-lg': '80vw', '--detector-grille-ratio': '58%', '--detector-rim-width': '1px', '--detector-led-lg': '12px', '--detector-led': '10px', '--detector-grille-step-lg': '7px', '--detector-grille-pitch-lg': '8px', '--detector-grille-step-md': '6px', '--detector-grille-pitch-md': '7px', '--detector-grille-step-sm': '5px', '--detector-grille-pitch-sm': '6px', '--shadow-detector-lg': '0 40px 80px rgba(9,39,71,.16), inset 0 -8px 18px rgba(9,39,71,.06)', '--shadow-detector-md': '0 30px 60px rgba(9,39,71,.14), inset 0 -6px 14px rgba(9,39,71,.06)', '--shadow-detector-sm': '0 20px 40px rgba(9,39,71,.14)', '--detector-rise-distance': '60px', '--detector-rise-scale': '0.94', '--detector-rise-duration': '1.4s', '--detector-rise-delay': '0.5s', '--led-pulse-duration': '2.4s', '--led-pulse-min': '0.3', '--led-pulse-count': '2', '--hero-light-illustration-gap': '72px', '--hero-light-illustration-pad-end': '112px', '--photo-ratio-mobile-landscape': '4 / 3', '--photo-focus-switch': 'center 50%', '--photo-focus-intercom': 'center 55%', '--photo-focus-building': 'center 70%', '--tile-building-min': '620px', '--tile-building-min-tablet': '560px', '--tile-building-min-mobile': '520px', '--hero-photo-min-networks': '760px', '--hero-photo-min-contractors': '820px', '--photo-focus-network': 'center 60%', '--tile-crane-min-home': '720px', '--tile-feature-photo-max': '1100px', '--tile-feature-photo-height': '520px', '--tile-feature-photo-gap': '36px', '--tile-grid-col-min': '520px', '--tile-grid-min': '600px', '--tile-grid-min-tablet': '560px', '--tile-grid-min-mobile': '520px', '--tile-grid-pad-top': '52px', '--tile-grid-photo-gap': '28px', '--type-grid-tile-text-size': '20px', '--tile-smoke-pad-top': '72px', '--tile-smoke-pad-end': '88px', '--drift-from-mobile': '-2%', '--drift-to-mobile': '2%', '--drift-scale-mobile': '1.05', '--type-breadcrumb-size': '18px', '--type-breadcrumb-weight': '600', '--hero-typo-subtitle-max': '680px', '--row-list-head-gap': '28px', '--row-min-height': '56px', '--row-pad-block': '24px', '--row-gap': '24px', '--row-rule-width': '1px', '--type-row-hint-size': '17px', '--type-neighbors-size': '20px', '--type-neighbors-leading': '1.7', '--type-midrag-quote-size': 'clamp(24px, 2.4vw, 32px)', '--type-midrag-quote-weight': '600', '--type-midrag-quote-leading': '1.35', '--review-col-min': '440px', '--review-grid-gap': '56px', '--review-gap': '16px', '--areas-head-pad-top': '88px', '--areas-head-pad-end': '64px', '--areas-head-gap': '12px', '--region-tile-pad': '48px', '--region-tile-pad-tablet': '40px', '--region-tile-pad-mobile-block': '32px', '--region-tile-pad-mobile-inline': '22px', '--region-tile-min': '360px', '--region-tile-gap': '20px', '--city-row-pad-block': '14px', '--type-city-row-size': '20px', '--areas-missing-max': '760px', '--areas-missing-gap': '40px', '--about-logo-height': '220px', '--about-logo-height-mobile': '150px', '--type-stat-text-size': '40px', '--type-stat-text-weight': '700', '--type-stat-text-leading': '1.6', '--type-stat-label-size': '17px', '--stat-col-min': '240px', '--stat-grid-gap': '48px', '--stat-gap': '6px', '--prose-list-indent': '1.2em', '--prose-quote-rule': '3px', '--prose-block-gap': '24px', '--prose-section-gap': '48px', '--prose-subsection-gap': '32px', '--prose-heading-gap': '16px', '--prose-item-gap': '8px', '--prose-quote-pad': '24px', '--prose-caption-gap': '8px', '--article-head-gap': '14px', '--article-head-pad-end': '40px', '--photo-ratio-article': '16 / 9', '--article-media-max': '560px', '--photo-ratio-card': '3 / 2', '--detector-fit-margin': '16px', '--article-body-pad-top': '56px', '--article-body-pad-end': '24px', '--article-box-gap-before': '32px', '--article-box-pad': '40px', '--article-box-pad-mobile': '32px', '--article-box-gap': '12px', '--type-phone-box-size': 'clamp(28px, 8vw, 40px)', '--type-phone-box-weight': '700', '--type-category-weight': '600', '--type-related-title-size': '32px', '--related-gap': '32px', '--card-col-min': '300px', '--card-grid-gap-block': '32px', '--card-grid-gap-inline': '24px', '--card-gap': '12px', '--card-zoom': '1.04', '--card-zoom-duration': '0.6s' };
const TYPE_FIELDS = { fontFamily: 'family', fontSize: 'size', fontWeight: 'weight', lineHeight: 'leading', letterSpacing: 'tracking' };

/** Lecteur YAML minimal, limité à ce frontmatter : maps indentées, `clé: valeur`, guillemets, commentaires, listes ignorées. */
function parseFrontmatter(markdown) {
  const block = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!block) throw new Error('frontmatter introuvable');
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const raw of block[1].split('\n')) {
    const line = stripYamlComment(raw);
    if (!line.trim() || line.trim().startsWith('- ')) continue;
    const indent = line.length - line.trimStart().length;
    const m = line.trim().match(/^([\w-]+):(?:\s+(.*))?$/);
    if (!m) throw new Error(`ligne YAML non lue : ${raw}`);
    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).node;
    if (m[2] === undefined) {
      parent[m[1]] = {};
      stack.push({ indent, node: parent[m[1]] });
    } else {
      parent[m[1]] = unquote(m[2].trim());
    }
  }
  return root;
}

// Retire un commentaire `#` hors guillemets (les couleurs '#092747' sont entre guillemets).
function stripYamlComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function unquote(v) {
  const m = v.match(/^(['"])(.*)\1$/);
  return m ? m[2] : v;
}

/** Custom properties de tokens.css, var() résolus. */
function readTokens(css) {
  const props = {};
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) props[m[1]] = m[2].trim();
  const resolve = (v, depth = 0) => {
    if (depth > 10) throw new Error(`var() circulaire : ${v}`);
    return v.replace(/var\((--[\w-]+)\)/g, (_, name) => {
      if (!(name in props)) throw new Error(`var(${name}) non défini`);
      return resolve(props[name], depth + 1);
    });
  };
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, resolve(v)]));
}

/** Tokens attendus (nommage de la spec 1.2) depuis le frontmatter. */
function expectedTokens(fm) {
  const resolveRef = (v) =>
    v.replace(/\{typography\.([\w-]+)\.fontFamily\}/g, (_, key) => fm.typography[key].fontFamily);
  const out = {};
  for (const [k, v] of Object.entries(fm.colors)) out[`--color-${k}`] = v;
  for (const [k, def] of Object.entries(fm.typography)) {
    if (k.startsWith('family-')) {
      out[`--${k}`] = def.fontFamily;
      continue;
    }
    for (const [field, v] of Object.entries(def)) {
      if (!TYPE_FIELDS[field]) throw new Error(`champ typographique inconnu : ${k}.${field}`);
      out[`--type-${k}-${TYPE_FIELDS[field]}`] = resolveRef(v);
    }
  }
  for (const [k, v] of Object.entries(fm.rounded)) out[`--radius-${k}`] = v;
  for (const [k, v] of Object.entries(fm.spacing)) out[`--${k}`] = v;
  for (const [k, def] of Object.entries(fm.components)) {
    if (!k.startsWith('scrim-')) continue;
    out[`--${k}`] = def.gradient;
    if (out['--scrim-min-opacity'] && out['--scrim-min-opacity'] !== def.minOpacityUnderText) {
      throw new Error(`minOpacityUnderText différent selon le scrim : ${k}`);
    }
    out['--scrim-min-opacity'] = def.minOpacityUnderText;
  }
  return out;
}

const norm = (v) => v.replace(/\s+/g, ' ').trim().toLowerCase();

test('chaque token du frontmatter existe dans tokens.css avec la valeur exacte', { skip: SKIP }, () => {
  const expected = expectedTokens(parseFrontmatter(readFileSync(DESIGN, 'utf8')));
  const actual = readTokens(readFileSync(TOKENS, 'utf8'));
  const mismatches = Object.entries(expected)
    .filter(([name, v]) => actual[name] === undefined || norm(actual[name]) !== norm(v))
    .map(([name, v]) => `${name} : attendu « ${v} », trouvé « ${actual[name] ?? '(absent)'} »`);
  assert.deepEqual(mismatches, []);
  assert.ok(Object.keys(expected).length > 150, 'frontmatter lu en entier');
});

test('tokens.css ne définit rien hors frontmatter, courbe et valeurs ajoutées (ADDED)', { skip: SKIP }, () => {
  const expected = expectedTokens(parseFrontmatter(readFileSync(DESIGN, 'utf8')));
  const actual = readTokens(readFileSync(TOKENS, 'utf8'));
  const extra = Object.keys(actual).filter((k) => !(k in expected) && !(k in ADDED) && k !== '--ease');
  assert.deepEqual(extra, []);
  for (const [k, v] of Object.entries(ADDED)) assert.equal(actual[k], v, k);
});

test('--ease = courbe commune de EXPERIENCE.md', { skip: existsSync(EXPERIENCE) ? false : 'EXPERIENCE.md absent (hors dépôt)' }, () => {
  const curve = readFileSync(EXPERIENCE, 'utf8').match(/Courbe commune `(cubic-bezier\([^)]*\))`/)?.[1];
  assert.ok(curve, 'courbe introuvable dans EXPERIENCE.md');
  assert.equal(readTokens(readFileSync(TOKENS, 'utf8'))['--ease'], curve);
});

// — Le lecteur et la comparaison échouent sur une entrée fautive (toujours exécuté) —

test('lecteur YAML : guillemets, commentaires, imbrication, listes', () => {
  const fm = parseFrontmatter(
    "---\nname: X\nsources:\n  - a\ncolors:\n  # charte\n  navy: '#092747' # commentaire\ntypography:\n  h1:\n    fontSize: 36px\n    fontWeight: '700'\nrounded:\n  xs: 2px\n---\n# Corps",
  );
  assert.deepEqual(fm, { name: 'X', sources: {}, colors: { navy: '#092747' }, typography: { h1: { fontSize: '36px', fontWeight: '700' } }, rounded: { xs: '2px' } });
});

test('comparaison : une valeur dérivée de DESIGN.md est détectée', () => {
  const fm = {
    colors: { navy: '#092747' },
    typography: { 'family-sans': { fontFamily: '"Noto Sans", sans-serif' }, phone: { fontFamily: '{typography.family-sans.fontFamily}', fontSize: '15px' } },
    rounded: { xs: '2px' },
    spacing: { 'space-2': '8px' },
    components: { 'scrim-hero': { gradient: 'linear-gradient(red, blue)', minOpacityUnderText: '0.62' } },
  };
  const expected = expectedTokens(fm);
  assert.equal(expected['--type-phone-family'], '"Noto Sans", sans-serif');
  const actual = readTokens(
    ':root { --color-navy: #0b2142; --family-sans: "Noto Sans", sans-serif; --type-phone-family: var(--family-sans); --type-phone-size: 15px; --radius-xs: 6px; --space-2: 8px; --scrim-hero: linear-gradient(red, blue); --scrim-min-opacity: 0.62; }',
  );
  const bad = Object.keys(expected).filter((k) => norm(actual[k] ?? '') !== norm(expected[k]));
  assert.deepEqual(bad, ['--color-navy', '--radius-xs']);
});

// — Story 4.1 (décision D7 de l'epic 4) : ondes du logo dans le héros typographique (ville et 404) —

test('D7 : HeroTypographic trace les 3 ondes du logo (viewBox 480, pathLength 1), trait 41, sans opacité ni retournement', () => {
  const hero = readFileSync(fileURLToPath(new URL('../src/components/HeroTypographic.astro', import.meta.url)), 'utf8');
  const css = readFileSync(TOKENS, 'utf8');
  assert.match(hero, /viewBox="0 0 480 480"/);
  const paths = [...hero.matchAll(/<path class="arc arc-(\d)" pathLength="1" d="([^"]+)" \/>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(paths, [
    ['1', 'M100 270 A110 110 0 0 1 208.9 395.3'],
    ['2', 'M100 205 A175 175 0 0 1 270.5 419.4'],
    ['3', 'M100 138 A242 242 0 0 1 330.2 454.8'],
  ]);
  assert.equal(readTokens(css)['--arc-stroke-width'], '41');
  assert.ok(!/--arc-opacity/.test(css) && !/--arc-opacity|opacity:/.test(hero.slice(hero.indexOf('<style>'))), 'opacités des arcs supprimées');
  assert.ok(!/scaleX\(-1\)|:dir\(rtl\)|\[dir=/.test(hero), 'jamais retournés en RTL');
  for (const rule of ['fill: none', 'stroke: var(--color-signal-arc)', 'stroke-linecap: round', 'stroke-width: var(--arc-stroke-width)']) assert.ok(hero.includes(rule), rule);
});
