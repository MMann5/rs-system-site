// Story 5.2 (FR14, FR40, AD-2, AD-4, AD-11, décision D4 de l'epic 5) : contenus légaux, complétude (buildLegal) et liens
// de la prose (resolveProseLinks), matrice I/O de la spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { fill } from '../src/lib/about.ts';
import { buildLegal, resolveProseLinks } from '../src/lib/legal/core.ts';
import { legalDocSchema, legalMetaSchema } from '../src/lib/page-schema.ts';

const LANGS = ['he', 'en', 'ru', 'fr'];
const ROOT = new URL('../src/content/legal/', import.meta.url);
const meta = (id) => legalMetaSchema.parse(parse(readFileSync(fileURLToPath(new URL(`${id}/meta.yaml`, ROOT)), 'utf8')));
const I18N = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(fileURLToPath(new URL(`../src/i18n/${l}.json`, import.meta.url)), 'utf8'))]));

test('meta.yaml : slugs A1, accessibility et privacy actives, terms désactivée, titres = nav.*, « {Titre} · RS SYSTEM »', () => {
  const expected = {
    accessibility: { slugs: { he: 'הצהרת-נגישות', en: 'accessibility', ru: 'доступность', fr: 'accessibilite' }, enabled: true },
    privacy: { slugs: { he: 'מדיניות-פרטיות', en: 'privacy', ru: 'конфиденциальность', fr: 'confidentialite' }, enabled: true },
    terms: { slugs: { he: 'תנאי-שימוש', en: 'terms', ru: 'условия', fr: 'conditions' }, enabled: false },
  };
  for (const [id, { slugs, enabled }] of Object.entries(expected)) {
    const data = meta(id);
    assert.deepEqual(data.slugs, slugs, `${id} : slugs`);
    assert.equal(data.enabled, enabled, `${id} : enabled`);
    for (const l of LANGS) {
      if (id !== 'terms') assert.equal(data.title[l], I18N[l][`nav.${id}`], `${id} (${l}) : titre = nav.${id}`);
      assert.equal(data.meta.title[l], `${data.title[l]} · RS SYSTEM`, `${id} (${l}) : meta.title`);
    }
  }
  assert.deepEqual(meta('terms').title, { he: 'תנאי שימוש', en: 'Terms of use', ru: 'Условия использования', fr: "Conditions d'utilisation" });
  assert.equal(meta('privacy').coordinator, undefined, 'privacy : pas de référent');
  assert.equal(meta('terms').coordinator, undefined, 'terms : pas de référent');
});

test('accessibilité (D4) : référent, titre traduit et 3 placeholders nom · téléphone · e-mail', () => {
  const { coordinator } = meta('accessibility');
  assert.deepEqual(coordinator.title, { he: 'רכז/ת נגישות', en: 'Accessibility coordinator', ru: 'Координатор по доступности', fr: 'Référent accessibilité' });
  const rows = (l) => [coordinator.name, coordinator.phone, coordinator.email].map((v) => fill(v, l));
  assert.deepEqual(rows('he'), ['שם', 'טלפון', 'דוא"ל'].map((text) => ({ text, placeholder: true })));
  assert.deepEqual(rows('en').map((r) => r.text), ['name', 'phone', 'email']);
  assert.deepEqual(rows('ru').map((r) => r.text), ['имя', 'телефон', 'эл. почта']);
  assert.deepEqual(rows('fr').map((r) => r.text), ['nom', 'téléphone', 'e-mail']);
});

test('meta.yaml : champ inconnu, langue manquante ou référent incomplet refusés', () => {
  const base = parse(readFileSync(fileURLToPath(new URL('accessibility/meta.yaml', ROOT)), 'utf8'));
  assert.ok(!legalMetaSchema.safeParse({ ...base, extra: 1 }).success, 'champ inconnu');
  assert.ok(!legalMetaSchema.safeParse({ ...base, title: { he: 'x', en: 'x', ru: 'x' } }).success, 'langue manquante');
  const { email, ...partial } = base.coordinator;
  assert.ok(!legalMetaSchema.safeParse({ ...base, coordinator: partial }).success, 'référent sans e-mail');
});

test('.md : les 12 fichiers sont pending: true, corps vide ; pending vaut false par défaut', () => {
  for (const id of ['accessibility', 'privacy', 'terms']) {
    for (const l of LANGS) {
      const text = readFileSync(fileURLToPath(new URL(`${id}/${l}.md`, ROOT)), 'utf8');
      const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      assert.ok(m, `${id}/${l}.md : frontmatter`);
      assert.deepEqual(legalDocSchema.parse(parse(m[1])), { pending: true }, `${id}/${l}.md : pending`);
      assert.equal(m[2].trim(), '', `${id}/${l}.md : corps vide`);
    }
  }
  assert.deepEqual(legalDocSchema.parse({}), { pending: false });
  assert.ok(!legalDocSchema.safeParse({ pending: true, draft: true }).success, 'champ inconnu');
});

// — buildLegal —

const on = (id) => ({ id, data: { enabled: true } });
const off = (id) => ({ id, data: { enabled: false } });
const docs = (id, overrides = {}) =>
  LANGS.map((l) => ({ id: `${id}/${l}`, pending: true, body: '\n', ...overrides[l] }));

test('buildLegal : avant l\'avocat (pending, corps vide) → accepté, pages triées par id, doc() lit pending et html', () => {
  const legal = buildLegal([on('privacy'), on('accessibility')], [...docs('privacy'), ...docs('accessibility')]);
  assert.deepEqual(legal.pages.map((p) => p.id), ['accessibility', 'privacy']);
  assert.deepEqual(legal.doc('privacy', 'fr'), { pending: true, html: '' });
  assert.throws(() => legal.doc('terms', 'fr'), /src\/content\/legal\/terms\/fr\.md : texte inconnu/);
});

test('buildLegal : texte fourni (pending: false, corps) → html conservé', () => {
  const legal = buildLegal([on('privacy')], docs('privacy', { fr: { pending: false, body: '# T\n\ntexte', html: '<p>texte</p>' } }));
  assert.deepEqual(legal.doc('privacy', 'fr'), { pending: false, html: '<p>texte</p>' });
});

test('buildLegal : page active sans ru.md → erreur citant le fichier', () => {
  assert.throws(
    () => buildLegal([on('privacy')], docs('privacy').filter((d) => d.id !== 'privacy/ru')),
    { message: 'legal : src/content/legal/privacy/ru.md : fichier manquant (page légale active)' },
  );
});

test('buildLegal : page désactivée sans aucun .md → acceptée', () => {
  const legal = buildLegal([on('privacy'), off('terms')], docs('privacy'));
  assert.deepEqual(legal.pages.map((p) => p.id), ['privacy', 'terms']);
});

test('buildLegal : pending incohérent avec le corps → erreur nommant le fichier', () => {
  assert.throws(() => buildLegal([on('privacy')], docs('privacy', { he: { pending: true, body: 'texte' } })), /src\/content\/legal\/privacy\/he\.md : « pending: true » mais le corps n'est pas vide/);
  assert.throws(() => buildLegal([on('privacy')], docs('privacy', { en: { pending: false, body: '  \n' } })), /src\/content\/legal\/privacy\/en\.md : corps vide sans « pending: true »/);
  // Même sur une page désactivée.
  assert.throws(() => buildLegal([off('terms')], docs('terms', { fr: { pending: false, body: '' } })), /terms\/fr\.md : corps vide/);
});

test('buildLegal : .md sans meta.yaml, ou nom de fichier hors langue → erreur', () => {
  assert.throws(() => buildLegal([], docs('cookies')), /src\/content\/legal\/cookies\/he\.md : aucun src\/content\/legal\/cookies\/meta\.yaml/);
  assert.throws(() => buildLegal([on('privacy')], [...docs('privacy'), { id: 'privacy/de', pending: true, body: '' }]), /src\/content\/legal\/privacy\/de\.md : fichier inattendu/);
});

// — resolveProseLinks —

const REGISTRY = { about: '/fr/a-propos/', contact: '/fr/contact/' };
const resolve = (id, params) => {
  if (!Object.hasOwn(REGISTRY, id)) throw new Error(`routes : id inconnu « ${id} »`);
  return REGISTRY[id] + (params?.hash ? `#${params.hash}` : '');
};
const WHERE = 'src/content/legal/privacy/fr.md';

test('resolveProseLinks : page:<id> et page:<id>#<ancre> résolus par le registre', () => {
  assert.equal(
    resolveProseLinks('<p><a href="page:about">a</a> <a href="page:contact#form">b</a></p>', resolve, WHERE),
    '<p><a href="/fr/a-propos/">a</a> <a href="/fr/contact/#form">b</a></p>',
  );
});

test('resolveProseLinks : https, http, mailto et #ancre admis tels quels', () => {
  const html = '<a href="https://example.org/x?a=1&amp;b=2">x</a><a href="http://example.org">y</a><a href="mailto:a@b.c">z</a><a href="#s1">s</a>';
  assert.equal(resolveProseLinks(html, resolve, WHERE), html);
  assert.equal(resolveProseLinks('<p>sans lien</p>', resolve, WHERE), '<p>sans lien</p>');
});

test('resolveProseLinks : lien littéral /…, relatif ou téléphone refusé avec le fichier', () => {
  for (const href of ['/fr/contact/', 'contact/', '../a-propos/', 'tel:+972500000000', 'javascript:alert(1)', '']) {
    assert.throws(() => resolveProseLinks(`<a href="${href}">x</a>`, resolve, WHERE), new RegExp(`legal : ${WHERE} : lien « .* » refusé`), href);
  }
});

test('resolveProseLinks : page: inconnu → lève via le registre, avec le fichier', () => {
  assert.throws(() => resolveProseLinks('<a href="page:nope">x</a>', resolve, WHERE), /legal : src\/content\/legal\/privacy\/fr\.md : lien « page:nope » non résolu \(routes : id inconnu « nope »\)/);
});
