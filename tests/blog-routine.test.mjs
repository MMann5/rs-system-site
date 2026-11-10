// Story 6.3 (FR36, AD-12, décisions D1, D3, D4, D5 de l'epic 6) : automation/blog-routine.md, lu par la routine
// hebdomadaire à chaque exécution, fixe catégories, liens page:<id>, format des fichiers, photo et liste de sujets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { POST_CATEGORIES, postDocSchema, postMetaSchema } from '../src/lib/page-schema.ts';
import { fileErrors } from '../scripts/checks/editorial.mjs';

const ROOT = new URL('../', import.meta.url);
const DOC = readFileSync(new URL('automation/blog-routine.md', ROOT), 'utf8');
const SERVICES = parse(readFileSync(new URL('src/content/services.yaml', ROOT), 'utf8'));

/** Lignes du tableau de sujets : `| n | sujet | `catégorie` | `id` |`. */
const topicRows = () =>
  [...DOC.matchAll(/^\| (\d+) \| ([^|]+?) \| `([a-z-]+)` \| `([a-z0-9-]+)` \|$/gm)].map(([, n, title, category, id]) => ({ n: Number(n), title, category, id }));

test('blog-routine.md : chaque code de POST_CATEGORIES et sa page:<id> (services.yaml) sur la même ligne', () => {
  assert.ok(POST_CATEGORIES.length >= 6);
  for (const code of POST_CATEGORIES) {
    const page = SERVICES.find((s) => s.id === code)?.page;
    assert.ok(page, `${code} : page dans services.yaml`);
    const row = DOC.split('\n').find((l) => l.startsWith(`| \`${code}\` |`));
    assert.ok(row, `${code} : ligne du tableau des catégories`);
    assert.ok(row.includes(`\`page:${page}\``), `${code} → page:${page}`);
  }
  assert.ok(!/^\| `unsure` \|/m.test(DOC), 'unsure n’est pas une catégorie');
});

test('blog-routine.md : liste de sujets D5 bien formée (Mike la modifie : structure seulement)', () => {
  const rows = topicRows();
  assert.ok(rows.length >= 1, 'au moins un sujet');
  assert.deepEqual(rows.map((r) => r.n), rows.map((_, i) => i + 1), 'numérotation 1..n');
  for (const r of rows) assert.ok(POST_CATEGORIES.includes(r.category), `${r.n} : catégorie ${r.category}`);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'ids uniques');
  assert.match(DOC, /premier sujet de la liste qui n'est pas encore traité/);
});

test('blog-routine.md : format exact (meta.yaml + 4 .md), src/assets/blog/, ton, interdits, D1, D3, D4', () => {
  for (const s of ['src/content/posts/{id}/', '`meta.yaml`', '`he.md`', '`en.md`', '`ru.md`', '`fr.md`', 'src/assets/blog/']) {
    assert.ok(DOC.includes(s), s);
  }
  for (const field of ['date', 'category', 'image', 'slugs', 'enabled', 'title', 'lede', 'meta.title', 'meta.description', 'alt']) {
    assert.ok(DOC.includes(`\`${field}\``), `champ ${field}`);
  }
  assert.ok(DOC.includes('Un technicien qui explique, pas une agence qui vend.'), 'Voice and Tone recopié');
  for (const s of ['Aucun emoji', 'Aucun point d\'exclamation', 'IDS', 'Maagal', 'מעגל', 'superlatif', 'Aucun placeholder', 'Pexels', 'nuit ou crépuscule', '3:2', '16:9', '1920 px', 'Asia/Jerusalem', 'date d\'exécution + 2 jours', '`alt` traduit', 'pas une traduction mot à mot']) {
    assert.ok(DOC.includes(s), s);
  }
  assert.match(DOC, /`smoke-detectors` : jamais de photo/);
  for (const cmd of ['npm run check', 'npm run lint', 'npm test', 'npm run build']) assert.ok(DOC.includes(`\`${cmd}\``), cmd);
});

test('blog-routine.md : exemple complet valide (meta.yaml au schéma, meta.title = « {title} · RS SYSTEM », description = chapeau)', () => {
  const blocks = [...DOC.matchAll(/```(yaml|markdown)\n([\s\S]*?)```/g)];
  const yamlBlock = blocks.find(([, lang]) => lang === 'yaml')[2];
  const meta = postMetaSchema.parse(parse(yamlBlock));
  assert.deepEqual(fileErrors('meta.yaml', yamlBlock), []);
  assert.equal(meta.category, 'cameras');
  assert.match(meta.image, /^[A-Za-z0-9][\w.-]*\.jpe?g$/);
  assert.deepEqual(Object.keys(meta.slugs), ['he', 'en', 'ru', 'fr']);
  const mds = blocks.filter(([, lang]) => lang === 'markdown').map(([, , body]) => body);
  for (const md of mds) assert.deepEqual(fileErrors('x.md', md), [], 'exemple conforme au lint éditorial');
  const fronts = mds.map((body) => postDocSchema.parse(parse(body.match(/^---\n([\s\S]*?)\n---/)[1])));
  assert.equal(fronts.length, 4);
  for (const fm of fronts) {
    assert.equal(fm.meta.title, `${fm.title} · RS SYSTEM`);
    assert.equal(fm.meta.description, fm.lede);
    assert.ok(fm.alt);
  }
});

test('blog-routine.md : PEXELS_API_KEY nommée, aucune valeur de clé', () => {
  assert.ok(DOC.includes('PEXELS_API_KEY'));
  assert.ok(!/PEXELS_API_KEY\s*[=:]\s*\S/.test(DOC), 'aucune affectation de la clé');
  assert.ok(!/\b[A-Za-z0-9]{40,}\b/.test(DOC), 'aucun jeton long');
});
