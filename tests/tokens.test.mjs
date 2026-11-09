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
const ADDED = { '--focus-ring-width': '2px', '--focus-offset-accent': '-4px', '--scroll-padding-start': '80px', '--skip-link-pad-block': '12px', '--z-skip-link': '1000', '--z-header': '100', '--z-mobile-bar': '90', '--type-mobile-bar-size': '18px', '--type-mobile-bar-weight': '700', '--icon-size': '20px', '--icon-size-menu': '22px', '--icon-stroke-width': '1.8', '--footer-col-min': '200px', '--hero-photo-min': '780px', '--hero-photo-min-tablet': '680px', '--hero-photo-min-mobile': '560px', '--hero-zoom-from': '1.1', '--hero-zoom-duration': '2.6s', '--rise-distance': '24px', '--rise-duration': '0.9s', '--rise-opacity-from': '0.4', '--rise-delay-1': '0.25s', '--rise-delay-2': '0.45s', '--rise-delay-3': '0.65s', '--scrim-hold': 'linear-gradient(to bottom, rgba(6,16,32,.62) 0%, rgba(6,16,32,.62) calc(100% - 64px), rgba(6,16,32,0) 100%)', '--scrim-hold-extend': '96px', '--visually-hidden-size': '1px', '--arcs-size': '560px', '--arcs-offset-inline': '-60px', '--arcs-offset-block': '-80px', '--arcs-scale-mobile': '0.6', '--arc-stroke-width': '22', '--arc-opacity-2': '0.55', '--arc-opacity-3': '0.25', '--arc-duration': '1.4s', '--arc-delay-1': '0.3s', '--arc-delay-2': '0.5s', '--arc-delay-3': '0.7s', '--contact-pad-start': '88px', '--contact-hero-gap': '12px', '--container-form': '1080px', '--form-col-min': '420px', '--form-cols-gap': '64px', '--form-fields-gap': '20px', '--info-gap': '32px', '--info-pair-gap': '6px', '--field-min-height': '52px', '--field-border-width': '1px', '--field-pad-block': '12px', '--field-pad-inline': '14px', '--submit-min-height': '56px', '--submit-pad-inline': '36px', '--submit-pad-inline-mobile': '16px', '--type-submit-size': '18px', '--type-submit-weight': '700', '--type-info-value-size': '22px', '--type-info-value-weight': '600', '--type-info-phone-size': '26px', '--type-info-phone-weight': '700' };
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
