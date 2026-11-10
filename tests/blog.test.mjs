// Story 6.1 (FR12, FR23, FR25, AD-2, AD-4, AD-11, décisions D1 et D3 de l'epic 6) : schémas des articles, complétude
// (buildPosts), temps de lecture, dates, « autres articles », registre et contenu du premier article.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildPosts, countWords, formatPostDate, postSources, readingMinutes, relatedPosts } from '../src/lib/blog/core.ts';
import { postDocSchema, postMetaSchema, POST_CATEGORIES } from '../src/lib/page-schema.ts';
import { buildRegistry } from '../src/lib/routes/core.ts';

const LANGS = ['he', 'en', 'ru', 'fr'];
const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8');
const SLUGS = { he: 'כמה-גלאי-עשן-צריך-בדירה', en: 'how-many-smoke-detectors', ru: 'сколько-датчиков-дыма-нужно', fr: 'combien-de-detecteurs-de-fumee' };
const BLOG_SLUGS = { he: 'בלוג', en: 'blog', ru: 'блог', fr: 'blog' };

const meta = (overrides = {}) => ({ date: '2026-11-10', category: 'smoke-detectors', slugs: { ...SLUGS }, enabled: true, ...overrides });
const docData = (overrides = {}) => ({ title: 'T', lede: 'L', meta: { title: 'T · RS SYSTEM', description: 'L' }, ...overrides });

// — Schémas —

test('postMetaSchema : catégories = SERVICE_CODES sans unsure ; date ISO réelle ; champ inconnu refusé', () => {
  assert.deepEqual(POST_CATEGORIES, ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom', 'crane-cameras']);
  assert.ok(postMetaSchema.safeParse(meta()).success);
  assert.equal(postMetaSchema.parse(meta({ date: new Date('2026-11-10T00:00:00Z') })).date, '2026-11-10', 'date YAML non citée');
  for (const date of ['2026-11-1', '10/11/2026', '2026-02-30', '']) assert.ok(!postMetaSchema.safeParse(meta({ date })).success, date);
  assert.ok(!postMetaSchema.safeParse(meta({ category: 'unsure' })).success, 'unsure');
  assert.ok(!postMetaSchema.safeParse(meta({ category: 'alarms' })).success, 'catégorie inconnue');
  assert.ok(!postMetaSchema.safeParse(meta({ extra: 1 })).success, 'champ inconnu');
  assert.ok(!postMetaSchema.safeParse(meta({ slugs: { he: 'a', en: 'b', ru: 'c' } })).success, 'slug manquant');
  assert.ok(postMetaSchema.safeParse(meta({ featured: true })).success, 'featured');
});

test('postMetaSchema (D1) : image refusée pour smoke-detectors, obligatoire ailleurs, nom de fichier simple', () => {
  const smoke = postMetaSchema.safeParse(meta({ image: 'x.jpg' }));
  assert.ok(!smoke.success);
  assert.match(smoke.error.issues[0].message, /interdite pour la catégorie smoke-detectors/);
  const cameras = postMetaSchema.safeParse(meta({ category: 'cameras' }));
  assert.ok(!cameras.success);
  assert.match(cameras.error.issues[0].message, /obligatoire pour la catégorie cameras/);
  assert.ok(postMetaSchema.safeParse(meta({ category: 'cameras', image: 'dome-2.jpg' })).success);
  for (const image of ['photos/x.jpg', '../x.jpg', 'x.gif', 'x']) assert.ok(!postMetaSchema.safeParse(meta({ category: 'cameras', image })).success, image);
});

test('postDocSchema : title, lede, meta.title, meta.description obligatoires, alt facultatif, rien d\'autre', () => {
  assert.ok(postDocSchema.safeParse(docData()).success);
  assert.ok(postDocSchema.safeParse(docData({ alt: 'Une caméra' })).success);
  assert.ok(!postDocSchema.safeParse(docData({ lede: '  ' })).success, 'chapeau vide');
  assert.ok(!postDocSchema.safeParse({ title: 'T', lede: 'L', meta: { title: 'T' } }).success, 'description manquante');
  assert.ok(!postDocSchema.safeParse(docData({ date: '2026-11-10' })).success, 'champ inconnu');
});

// — buildPosts —

const docs = (id, overrides = {}) => LANGS.map((l) => ({ id: `${id}/${l}`, data: docData(overrides[l]?.data), body: 'Un corps.', ...overrides[l]?.doc }));

test('buildPosts : article complet → accepté, doc() lit frontmatter, html et temps de lecture', () => {
  const posts = buildPosts([{ id: 'a', data: meta() }], docs('a', { fr: { doc: { html: '<p>x</p>' } } }), []);
  assert.deepEqual(posts.posts.map((p) => p.id), ['a']);
  assert.equal(posts.doc('a', 'fr').html, '<p>x</p>');
  assert.equal(posts.doc('a', 'fr').minutes, 1);
  assert.equal(posts.doc('a', 'he').title, 'T');
  assert.throws(() => posts.doc('b', 'fr'), /src\/content\/posts\/b\/fr\.md : texte inconnu/);
});

test('buildPosts : article actif sans ru.md → erreur citant le fichier', () => {
  assert.throws(
    () => buildPosts([{ id: 'a', data: meta() }], docs('a').filter((d) => d.id !== 'a/ru'), []),
    { message: 'blog : src/content/posts/a/ru.md : fichier manquant (article actif)' },
  );
});

test('buildPosts : article désactivé, .md incomplets → accepté, hors des actifs', () => {
  const posts = buildPosts([{ id: 'a', data: meta({ enabled: false }) }], docs('a').slice(0, 1), []);
  assert.deepEqual(posts.posts.map((p) => p.id), ['a']);
  assert.deepEqual(posts.active, []);
});

test('buildPosts : image interdite ou manquante (règle D1, fichier absent) → erreur nommant meta.yaml', () => {
  assert.throws(() => buildPosts([{ id: 'a', data: meta({ image: 'x.jpg' }) }], docs('a', Object.fromEntries(LANGS.map((l) => [l, { data: { alt: 'x' } }]))), ['x.jpg']), /src\/content\/posts\/a\/meta\.yaml : « image » interdite/);
  assert.throws(() => buildPosts([{ id: 'a', data: meta({ category: 'cameras' }) }], docs('a'), []), /src\/content\/posts\/a\/meta\.yaml : « image » obligatoire/);
  const withAlt = docs('a', Object.fromEntries(LANGS.map((l) => [l, { data: { alt: 'Une caméra' } }])));
  assert.throws(() => buildPosts([{ id: 'a', data: meta({ category: 'cameras', image: 'dome.jpg' }) }], withAlt, ['other.jpg']), /src\/content\/posts\/a\/meta\.yaml : image « dome\.jpg » absente de src\/assets\/blog\//);
  assert.equal(buildPosts([{ id: 'a', data: meta({ category: 'cameras', image: 'dome.jpg' }) }], withAlt, ['dome.jpg']).doc('a', 'he').alt, 'Une caméra');
});

test('buildPosts : alt incohérent avec l\'image → erreur nommant le .md', () => {
  assert.throws(() => buildPosts([{ id: 'a', data: meta({ category: 'cameras', image: 'dome.jpg' }) }], docs('a'), ['dome.jpg']), /src\/content\/posts\/a\/he\.md : « alt » obligatoire/);
  assert.throws(() => buildPosts([{ id: 'a', data: meta() }], docs('a', { en: { data: { alt: 'x' } } }), []), /src\/content\/posts\/a\/en\.md : « alt » interdit/);
});

test('buildPosts : corps vide, .md sans meta.yaml, nom hors langue, doublon → erreur', () => {
  assert.throws(() => buildPosts([{ id: 'a', data: meta() }], docs('a', { fr: { doc: { body: ' \n' } } }), []), /src\/content\/posts\/a\/fr\.md : corps vide/);
  assert.throws(() => buildPosts([], docs('b'), []), /src\/content\/posts\/b\/he\.md : aucun src\/content\/posts\/b\/meta\.yaml/);
  assert.throws(() => buildPosts([{ id: 'a', data: meta() }], [...docs('a'), { id: 'a/de', data: docData(), body: 'x' }], []), /src\/content\/posts\/a\/de\.md : fichier inattendu/);
  assert.throws(() => buildPosts([{ id: 'a', data: meta() }, { id: 'a', data: meta() }], docs('a'), []), /a\/meta\.yaml : article déclaré deux fois/);
});

test('buildPosts : plusieurs articles → posts et active du plus récent au plus ancien, égalité par id, désactivés hors active', () => {
  const ids = ['old', 'zeta', 'alpha', 'off', 'new'];
  const dates = { old: '2026-01-01', zeta: '2026-06-01', alpha: '2026-06-01', off: '2026-12-01', new: '2026-11-10' };
  const metas = ids.map((id) => ({ id, data: meta({ date: dates[id], enabled: id !== 'off', slugs: { he: id, en: id, ru: id, fr: id } }) }));
  const posts = buildPosts(metas, ids.flatMap((id) => docs(id)), []);
  assert.deepEqual(posts.posts.map((x) => x.id), ['off', 'new', 'alpha', 'zeta', 'old']);
  assert.deepEqual(posts.active.map((x) => x.id), ['new', 'alpha', 'zeta', 'old']);
});

// — Temps de lecture, dates —

const words = (n, w = 'mot') => Array.from({ length: n }, () => w).join(' ');

test('readingMinutes : mots / 200, arrondi, au moins 1 (0, 299, 300, 500 mots, hébreu)', () => {
  assert.equal(readingMinutes(''), 1);
  assert.equal(readingMinutes(words(299)), 1);
  assert.equal(readingMinutes(words(300)), 2);
  assert.equal(readingMinutes(words(500)), 3);
  assert.equal(readingMinutes(words(500, 'גלאי')), 3, 'hébreu');
  assert.equal(countWords('## Titre\n\n- un [lien vers la page](page:smoke-detectors), **gras** l’air dû-à'), 9, 'syntaxe et cible de lien non comptées');
});

test('formatPostDate : jour numérique, mois long, année, dans les 4 locales, sans dérive de fuseau', () => {
  assert.equal(formatPostDate('2026-11-10', 'fr'), '10 novembre 2026');
  assert.equal(formatPostDate('2026-11-10', 'en'), '10 November 2026');
  assert.equal(formatPostDate('2026-11-10', 'ru'), '10 ноября 2026 г.');
  assert.equal(formatPostDate('2026-11-10', 'he'), '10 בנובמבר 2026');
  assert.equal(formatPostDate('2026-01-01', 'fr'), '1 janvier 2026');
});

// — Autres articles —

const p = (id, category, date, enabled = true) => ({ id, meta: { ...meta(), category, date, enabled } });

test('relatedPosts : même catégorie d\'abord (plus récents), puis les plus récents toutes catégories, sans doublon', () => {
  const current = p('cur', 'cameras', '2026-11-10');
  const all = [current, p('old-cam', 'cameras', '2026-01-01'), p('net', 'networks', '2026-10-01'), p('smoke', 'smoke-detectors', '2026-11-01'), p('intercom', 'intercom', '2026-09-01')];
  assert.deepEqual(relatedPosts(current, all).map((x) => x.id), ['old-cam', 'smoke', 'net']);
});

test('relatedPosts : courant et désactivés exclus ; aucun autre article → []', () => {
  const current = p('cur', 'cameras', '2026-11-10');
  assert.deepEqual(relatedPosts(current, [current]), []);
  assert.deepEqual(relatedPosts(current, [current, p('off', 'cameras', '2026-11-11', false)]), []);
  const all = [current, p('b', 'cameras', '2026-05-01'), p('a', 'cameras', '2026-05-01')];
  assert.deepEqual(relatedPosts(current, all).map((x) => x.id), ['a', 'b'], 'date égale : par id');
});

// — Registre —

test('registre : post: actif sous blog désactivé, chemins /{lang}/{slug-blog}/{slug}/ × 4, blog non généré', () => {
  const blog = parse(read('src/content/pages/blog.yaml'));
  assert.equal(blog.enabled, false);
  assert.deepEqual(blog.slugs, BLOG_SLUGS);
  assert.deepEqual(blog.meta.title, { he: 'בלוג · RS SYSTEM', en: 'Blog · RS SYSTEM', ru: 'Блог · RS SYSTEM', fr: 'Blog · RS SYSTEM' });
  const sources = [
    { id: 'home', slugs: { he: '', en: '', ru: '', fr: '' }, enabled: true },
    { id: 'blog', slugs: blog.slugs, enabled: blog.enabled },
    ...postSources([{ id: 'how-many-smoke-detectors', meta: meta() }, { id: 'off', meta: meta({ enabled: false, slugs: { he: 'x', en: 'x', ru: 'x', fr: 'x' } }) }]),
  ];
  assert.deepEqual(sources[2], { id: 'post:how-many-smoke-detectors', slugs: SLUGS, enabled: true, parent: 'blog', inheritActive: false });
  const registry = buildRegistry(sources, { isMainBranch: true });
  assert.equal(registry.isEnabled('blog'), false);
  assert.equal(registry.isEnabled('post:off'), false);
  for (const lang of LANGS) {
    assert.equal(registry.url('post:how-many-smoke-detectors', lang), `/${lang}/${encodeURIComponent(BLOG_SLUGS[lang])}/${encodeURIComponent(SLUGS[lang])}/`);
  }
  assert.deepEqual(registry.entries().map((e) => e.id), ['home', 'home', 'home', 'home', ...LANGS.map(() => 'post:how-many-smoke-detectors')]);
});

// — Premier article (D3) —

const DIR = 'src/content/posts/how-many-smoke-detectors/';
const split = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, 'frontmatter');
  return { data: parse(m[1]), body: m[2] };
};
const EMOJI = /\p{Extended_Pictographic}/u;
const TITLES = { he: 'כמה גלאי עשן צריך בדירה, ואיפה לשים אותם', fr: 'Combien de détecteurs de fumée dans un appartement, et où les placer' };

test('premier article : meta.yaml (id, date, catégorie, slugs, actif, sans image) et 4 .md complets', () => {
  const data = postMetaSchema.parse(parse(read(`${DIR}meta.yaml`)));
  assert.deepEqual(data, { date: '2026-11-10', category: 'smoke-detectors', slugs: SLUGS, enabled: true });
  const metas = [{ id: 'how-many-smoke-detectors', data }];
  const docsList = LANGS.map((l) => {
    const { data: fm, body } = split(read(`${DIR}${l}.md`));
    return { id: `how-many-smoke-detectors/${l}`, data: postDocSchema.parse(fm), body };
  });
  const posts = buildPosts(metas, docsList, []);
  for (const l of LANGS) {
    const doc = posts.doc('how-many-smoke-detectors', l);
    assert.equal(doc.meta.title, `${doc.title} · RS SYSTEM`, `${l} : meta.title`);
    assert.equal(doc.meta.description, doc.lede, `${l} : description = chapeau`);
    assert.equal(doc.alt, undefined, `${l} : pas d'alt`);
    if (TITLES[l]) assert.equal(doc.title, TITLES[l], `${l} : titre`);
  }
});

test('premier article (D3, NFR10) : 4 à 5 sections, lien page:smoke-detectors, ni !, emoji, IDS, Maagal, crochet, chiffre', () => {
  for (const l of LANGS) {
    const text = read(`${DIR}${l}.md`);
    const { body } = split(text);
    const sections = body.match(/^## .+$/gm) ?? [];
    assert.ok(sections.length >= 4 && sections.length <= 5, `${l} : ${sections.length} sections`);
    for (const h of sections) assert.ok(!/^## \d/.test(h), `${l} : numéro tapé « ${h} »`);
    assert.ok(!/^#(?!#)/m.test(body), `${l} : h1 dans le corps`);
    assert.match(body, /\]\(page:smoke-detectors\)/, `${l} : lien page:smoke-detectors`);
    // Seule syntaxe à crochets admise : un lien `[texte](page:<id>)` ; aucun autre crochet (placeholder).
    const withoutLinks = text.replace(/\[[^\]\n]+\]\(page:[a-z-]+\)/g, '');
    assert.ok(!/[[\]]/.test(withoutLinks), `${l} : crochet`);
    assert.ok(!/\]\((?!page:)/.test(text), `${l} : lien hors page:`);
    assert.ok(!text.includes('!'), `${l} : point d'exclamation`);
    assert.ok(!EMOJI.test(text), `${l} : emoji`);
    assert.ok(!/\bIDS\b|maagal|מעגל|маагал/i.test(text), `${l} : IDS / Maagal`);
    assert.ok(!/\d/.test(body), `${l} : chiffre dans le corps`);
  }
});
