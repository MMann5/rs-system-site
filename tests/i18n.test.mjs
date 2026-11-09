import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildDictionary, KEY_RE } from '../src/lib/i18n/core.ts';

const DIR = new URL('../src/i18n/', import.meta.url);
const four = (data) => ['he', 'en', 'ru', 'fr'].map((id) => ({ id, data: { ...data } }));
const throwsI18n = (fn, ...patterns) =>
  assert.throws(fn, (error) => {
    assert.match(error.message, /^i18n : /);
    for (const pattern of patterns) assert.match(error.message, pattern);
    return true;
  });

// — buildDictionary —

test('cas OK : t(lang, key) rend la chaîne de la langue', () => {
  const sources = four({ 'site.name': 'RS SYSTEM', 'form.phone.error': 'x' });
  sources[0].data['form.phone.error'] = 'שגיאה';
  const d = buildDictionary(sources);
  assert.equal(d.t('he', 'form.phone.error'), 'שגיאה');
  assert.equal(d.t('fr', 'site.name'), 'RS SYSTEM');
  assert.deepEqual(d.keys, ['form.phone.error', 'site.name']);
});

test('t() lève sur une clé inconnue', () => {
  const d = buildDictionary(four({ 'site.name': 'RS SYSTEM' }));
  assert.throws(() => d.t('he', 'site.missing'), /i18n : clé inconnue « site\.missing »/);
});

test('clé absente d’un fichier : lève et liste les clés manquantes par langue', () => {
  const sources = four({ 'site.name': 'RS SYSTEM', 'site.tagline': 'x', 'nav.home': 'y' });
  delete sources[2].data['site.tagline'];
  delete sources[2].data['nav.home'];
  delete sources[3].data['nav.home'];
  throwsI18n(() => buildDictionary(sources), /ru : clés manquantes nav\.home, site\.tagline/, /fr : clés manquantes nav\.home/);
});

test('fichier en trop (de.json) ou manquant : lève', () => {
  throwsI18n(() => buildDictionary([...four({ 'site.name': 'x' }), { id: 'de', data: { 'site.name': 'x' } }]), /« de\.json » hors des langues/);
  throwsI18n(() => buildDictionary(four({ 'site.name': 'x' }).slice(0, 3)), /« fr\.json » manquant/);
  throwsI18n(() => buildDictionary([...four({ 'site.name': 'x' }), { id: 'he', data: { 'site.name': 'x' } }]), /« he » fournie deux fois/);
});

test('clé non conforme (Bad Key, sans point, majuscule) : lève', () => {
  for (const bad of ['Bad Key', 'site', 'Site.name', 'site.', 'site..name', 'site.1name', 'site_name.x']) {
    throwsI18n(() => buildDictionary(four({ [bad]: 'x' })), new RegExp(`clé « ${bad.replace(/[.]/g, '\\.')} » invalide`));
  }
});

test('valeur vide ou non textuelle : lève', () => {
  throwsI18n(() => buildDictionary(four({ 'site.name': '' })), /valeur vide pour « site\.name »/);
  throwsI18n(() => buildDictionary(four({ 'site.name': '   ' })), /valeur vide/);
  throwsI18n(() => buildDictionary(four({ 'site.name': 3 })), /valeur vide/);
});

test('KEY_RE : section.element, segments [a-z][a-z0-9-]*', () => {
  for (const ok of ['site.name', 'form.phone.error', 'nav.smoke-detectors', 'blog.page2']) assert.ok(KEY_RE.test(ok), ok);
});

// — Fichiers réels —

test('src/i18n : exactement he, en, ru, fr, mêmes clés conformes, valeurs non vides', () => {
  const files = readdirSync(DIR).sort();
  assert.deepEqual(files, ['en.json', 'fr.json', 'he.json', 'ru.json']);
  const sources = files.map((file) => ({ id: file.replace(/\.json$/, ''), data: JSON.parse(readFileSync(new URL(file, DIR), 'utf8')) }));
  const d = buildDictionary(sources);
  for (const key of d.keys) assert.ok(KEY_RE.test(key), key);
  assert.ok(d.keys.includes('site.name') && d.keys.includes('site.tagline'));
  assert.equal(d.t('he', 'site.tagline'), 'מערכת מיגון ואבטחה');
  for (const lang of ['he', 'en', 'ru', 'fr']) assert.equal(d.t(lang, 'site.name'), 'RS SYSTEM');
});
