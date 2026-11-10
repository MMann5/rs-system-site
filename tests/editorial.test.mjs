// Story 6.3 (NFR10, AD-11, AD-12, D2, D3) : lint éditorial des articles. Chaque règle échoue volontairement sur une
// fixture temporaire (meta.yaml ou .md) ; les cas permis et les faux positifs passent ; le dépôt réel passe ; CLI 0/1.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emojiErrors,
  exclamationErrors,
  fileErrors,
  findEditorialErrors,
  forbiddenNameErrors,
  linkErrors,
  placeholderErrors,
} from '../scripts/checks/editorial.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = 'src/content/posts/sample';
const dirs = [];

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const META = "# Article d'essai\ndate: '2026-11-12'\ncategory: cameras\nimage: camera.jpg\nslugs:\n  he: 'מצלמות-לבית'\n  en: 'home-cameras'\n  ru: 'камеры-для-дома'\n  fr: 'cameras-maison'\nenabled: true\n";

/** Texte `.md` sain, modifiable : `fm` remplace le frontmatter, `body` le corps. */
const doc = ({ title = 'Choisir ses caméras', body = 'Un texte calme.\n\n## Où les poser\n\nTous les détails sur la page [caméras](page:cameras).' } = {}) =>
  `---\n# commentaire\ntitle: '${title}'\nlede: 'Ce qu’un technicien regarde.'\nmeta:\n  title: '${title} · RS SYSTEM'\n  description: 'Ce qu’un technicien regarde.'\nalt: 'Une caméra au-dessus d’une porte, la nuit.'\n---\n\n${body}\n`;

/** Dépôt temporaire avec un article `sample` : `files` remplace ou ajoute des fichiers (nom → contenu). */
function repo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rs-editorial-'));
  dirs.push(root);
  const all = { 'meta.yaml': META, 'he.md': doc(), 'en.md': doc(), 'ru.md': doc(), 'fr.md': doc(), ...files };
  for (const [name, content] of Object.entries(all)) {
    const path = join(root, DIR, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

const errorsOf = (files) => findEditorialErrors(repo(files));

/** Un échec par ligne de `lines` (un numéro ou une liste : le titre revient dans meta.title), raison `reason`. */
function assertOne(files, file, lines, reason) {
  const expected = [lines].flat();
  const errors = errorsOf(files);
  assert.equal(errors.length, expected.length, errors.join('\n'));
  expected.forEach((line, i) => {
    assert.ok(errors[i].startsWith(`${DIR}/${file}:${line} : `), errors[i]);
    assert.match(errors[i], reason);
  });
}

test('fixture saine : aucun échec', () => {
  assert.deepEqual(errorsOf(), []);
});

// — (1) emoji —

test('règle emoji : titre, chapeau, alt, meta.yaml et corps échouent avec fichier:ligne', () => {
  assertOne({ 'fr.md': doc({ title: 'Caméras 🔥' }) }, 'fr.md', [3, 6], /emoji « 🔥 »/);
  assertOne({ 'en.md': doc({ body: 'Fine.\n\nAll good ✅ here.' }) }, 'en.md', 13, /emoji/);
  assertOne({ 'he.md': doc().replace("alt: '", "alt: '📷 ") }, 'he.md', 8, /emoji/);
  assertOne({ 'meta.yaml': META.replace("en: 'home-cameras'", "en: 'home-cameras🇮🇱'") }, 'meta.yaml', 7, /emoji/);
  assert.equal(emojiErrors('drapeau \u{1F1EE}\u{1F1F1}').length, 1);
  assert.match(emojiErrors('coeur \u2764\uFE0F')[0], /U\+2764 U\+FE0F/);
  assert.deepEqual(emojiErrors('Texte sans emoji, 050-956-5669 · RS SYSTEM'), []);
});

// — (2) point d'exclamation —

test('règle ! : « ! », « ！ », « ‼ », « ¡ » échouent ; commentaires YAML et HTML ignorés', () => {
  assertOne({ 'fr.md': doc({ title: 'Attention !' }) }, 'fr.md', [3, 6], /point d’exclamation/);
  assertOne({ 'ru.md': doc({ body: 'Важно！' }) }, 'ru.md', 11, /point d’exclamation/);
  for (const bang of ['!', '！', '‼', '¡']) assert.equal(exclamationErrors(`x ${bang} y`.normalize('NFKC')).length, 1, bang);
  const comments = {
    'meta.yaml': `# attention !\n${META}`,
    'fr.md': doc({ body: 'Texte <!-- ! --> calme.\n\n<!--\nnote !\n-->\nFin.' }).replace('# commentaire', '# commentaire !'),
  };
  assert.deepEqual(errorsOf(comments), []);
  assert.deepEqual(errorsOf({ 'fr.md': doc().replace("title: 'Choisir ses caméras'", "title: 'Choisir ses caméras' # pas publié !") }), []);
});

// — (3) IDS / Maagal —

const FORBIDDEN = ['IDS', 'ids', 'I.D.S', 'I.D.S.', 'I D S', 'איי די אס', 'אי.די.אס', 'ואיי די אס', 'ИДС', 'И.Д.С.', 'Ай-Ди-Эс', 'Maagal', "Ma'agal", 'Ma’agal', 'MAAGAL', 'Magal', 'מעגל', 'ומעגל', 'שמעגל', 'Маагал', 'Маагале', 'מַעְגָּל', 'Maa\u00ADgal', 'I\u200BDS', 'I-D-S', 'I_D_S', 'I. D. S.'];
const ALLOWED = ['kids', 'rapids', 'AIDS', 'idsx', 'מעגלים', 'המעגלים', 'Magalie', 'Magali', 'Магали', 'идеальный'];

test('règle IDS / Maagal : 4 langues et graphies échouent ; faux positifs permis', () => {
  for (const word of FORBIDDEN) assert.equal(forbiddenNameErrors(`avant ${word} après`.normalize('NFKC')).length, 1, word);
  for (const word of ALLOWED) assert.deepEqual(forbiddenNameErrors(`avant ${word} après`), [], word);
  assertOne({ 'he.md': doc({ body: 'עבדנו עם מעגל.' }) }, 'he.md', 11, /Maagal/);
  assertOne({ 'en.md': doc({ title: 'Like I.D.S does it' }) }, 'en.md', [3, 6], /IDS/);
  assertOne({ 'ru.md': doc({ body: 'Как у ИДС.' }) }, 'ru.md', 11, /IDS/);
  assertOne({ 'fr.md': doc().replace("alt: '", "alt: 'Panneau Ma'agal, ").replace("Ma'agal", "Ma''agal") }, 'fr.md', 8, /Maagal/);
});

// — (4) href littéral —

test('règle lien : cible Markdown, définition, autolien ou href= littéral échoue ; page:, https, http, mailto, # permis', () => {
  for (const bad of ['[x](/fr/cameras/)', '[x](cameras)', '[x](./a.md)', '<a href="/he/">x</a>', "<a href='tel:0501'>x</a>", '[x]: /a', '<tel:0509565669>', '[x]()']) {
    assert.equal(linkErrors(bad).length, 1, bad);
  }
  for (const ok of ['[x](page:cameras)', '[x](page:areas#south)', '[x](https://a.example/)', '[x](http://a.example/)', '[x](mailto:a@b.c)', '[x](#a)', '[x](<https://a.example/>)', '<https://a.example/>', '[x]: https://a.example/']) {
    assert.deepEqual(linkErrors(ok), [], ok);
  }
  assertOne({ 'fr.md': doc({ body: 'Voir [la page](/fr/cameras/).' }) }, 'fr.md', 11, /lien « \/fr\/cameras\/ »/);
  assertOne({ 'en.md': doc({ body: 'See <a href="/en/">home</a>.' }) }, 'en.md', 11, /lien « \/en\/ »/);
});

// — (5) placeholder —

test('règle placeholder : crochet hors lien, data-placeholder et <Placeholder> échouent ; liens Markdown permis', () => {
  assertOne({ 'fr.md': doc({ body: 'Écrivez à [e-mail].' }) }, 'fr.md', 11, /crochet « \[e-mail\] »/);
  assertOne({ 'he.md': doc({ title: '[ציון] לקוחות' }) }, 'he.md', [3, 6], /crochet/);
  assertOne({ 'en.md': doc({ body: '<span data-placeholder>x</span>' }) }, 'en.md', 11, /data-placeholder/);
  assertOne({ 'ru.md': doc({ body: '<Placeholder text="x" />' }) }, 'ru.md', 11, /<Placeholder>/);
  assert.equal(placeholderErrors('liste [ ] à cocher').length, 1);
  assert.equal(placeholderErrors('crochet seul ]').length, 1);
  assert.deepEqual(placeholderErrors('[a](page:cameras), [b][r], [c][]'), []);
  assert.deepEqual(placeholderErrors('[r]', new Set(['r'])), []);
  assert.deepEqual(errorsOf({ 'fr.md': doc({ body: 'Voir [la page][p].\n\n[p]: page:cameras' }) }), []);
});

// — Agrégat, dépôt réel, CLI —

test('fileErrors : plusieurs règles sur une ligne → une raison par règle, numéro de ligne exact', () => {
  const errors = fileErrors('x.md', '---\ntitle: x\n---\n\nUn 🔥 ! IDS [x](/a) [y]');
  assert.equal(errors.length, 5, errors.join('\n'));
  for (const e of errors) assert.ok(e.startsWith('x.md:5 : '), e);
});

test('dépôt réel : les articles actuels (dont how-many-smoke-detectors) passent le lint éditorial', () => {
  assert.deepEqual(findEditorialErrors(ROOT), []);
});

test('CI : le script lint de package.json lance la porte editorial (donc ci.yml, via npm run lint)', () => {
  const { lint } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.ok(lint.split(' && ').includes('node scripts/checks/editorial.mjs'), lint);
});

test('CLI : editorial : OK (code 0) ; fixture fautive → N échec(s) et fichier:ligne (code 1)', () => {
  const run = (arg) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'checks', 'editorial.mjs'), arg], { cwd: ROOT, encoding: 'utf8' });
  const ok = run(repo());
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /^editorial : OK$/m);
  const bad = run(repo({ 'fr.md': doc({ body: 'Attention !' }) }));
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /editorial : 1 échec\(s\)\n {2}- src\/content\/posts\/sample\/fr\.md:11 : point d’exclamation/);
});
