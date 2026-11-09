// Story 4.1 (FR9, AD-2, AD-4) : régions et villes — cœur pur (validation, tri, sources du registre), schémas Zod
// et contenus du dépôt (Modiin, Jérusalem et leurs deux régions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildAreas, citySources, CITY_ID_PREFIX } from '../src/lib/areas/core.ts';
import { citySchema, regionSchema } from '../src/lib/areas/schema.ts';
import { buildRegistry } from '../src/lib/routes/core.ts';

const CONTENT = fileURLToPath(new URL('../src/content/', import.meta.url));
const I18N = Object.fromEntries(
  ['he', 'en', 'ru', 'fr'].map((lang) => [lang, JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'))]),
);
const readDir = (dir) =>
  readdirSync(join(CONTENT, dir))
    .filter((n) => n.endsWith('.yaml'))
    .sort()
    .map((n) => ({ id: n.replace(/\.yaml$/, ''), raw: parse(readFileSync(join(CONTENT, dir, n), 'utf8')) }));

const four = (v) => ({ he: v, en: v, ru: v, fr: v });
const region = (id, order, anchor = id) => ({ id, data: { name: four(id), anchor, order } });
const city = (id, regionId, order) => ({
  id,
  data: { name: four(id), slugs: four(id), region: regionId, intro: four(`intro ${id}`), order, neighbors: [], reviews: [] },
});

test('buildAreas : régions triées par order, villes par ordre de région puis order', () => {
  const areas = buildAreas(
    [region('center-shfela', 2), region('jerusalem-area', 1)],
    [city('rehovot', 'center-shfela', 2), city('modiin', 'center-shfela', 1), city('jerusalem', 'jerusalem-area', 1)],
  );
  assert.deepEqual(areas.regions.map((r) => r.id), ['jerusalem-area', 'center-shfela']);
  assert.deepEqual(areas.cities.map((c) => c.id), ['jerusalem', 'modiin', 'rehovot']);
  assert.equal(areas.city('modiin').region, 'center-shfela');
  assert.equal(areas.region('jerusalem-area').anchor, 'jerusalem-area');
  assert.throws(() => areas.city('x'), { message: 'areas : ville inconnue « x »' });
  assert.throws(() => areas.region('north'), { message: 'areas : région inconnue « north »' });
});

test('buildAreas : ville vers une région inconnue → lève en nommant le fichier', () => {
  assert.throws(() => buildAreas([region('jerusalem-area', 1)], [city('haifa', 'north', 1)]), {
    message: 'areas : src/content/cities/haifa.yaml : région inconnue « north »',
  });
});

test('buildAreas : ancre en double → lève', () => {
  assert.throws(() => buildAreas([region('a', 1, 'same'), region('b', 2, 'same')], []), /src\/content\/regions\/b\.yaml : ancre « same » déjà prise par « a »/);
});

test('citySources : city:{id} sous areas, inheritActive false ; registre : actives sous areas désactivée', () => {
  const sources = citySources([{ id: 'modiin', slugs: { he: 'מודיעין', en: 'modiin', ru: 'модиин', fr: 'modiin' } }]);
  assert.equal(CITY_ID_PREFIX, 'city:');
  assert.deepEqual(sources, [
    { id: 'city:modiin', slugs: { he: 'מודיעין', en: 'modiin', ru: 'модиин', fr: 'modiin' }, enabled: true, parent: 'areas', inheritActive: false },
  ]);
  const r = buildRegistry([{ id: 'areas', slugs: { he: 'אזורים', en: 'areas', ru: 'районы', fr: 'zones' }, enabled: false }, ...sources], { isMainBranch: true });
  assert.deepEqual(r.entries().map((e) => e.href), [
    `/he/${encodeURIComponent('אזורים')}/${encodeURIComponent('מודיעין')}/`,
    '/en/areas/modiin/',
    `/ru/${encodeURIComponent('районы')}/${encodeURIComponent('модиин')}/`,
    '/fr/zones/modiin/',
  ]);
});

test('schémas : champ inconnu, langue manquante, ancre invalide refusés ; neighbors et reviews par défaut []', () => {
  const ok = { name: four('x'), slugs: four('x'), region: 'center-shfela', intro: four('intro'), order: 1 };
  const parsed = citySchema.parse(ok);
  assert.deepEqual(parsed.neighbors, []);
  assert.deepEqual(parsed.reviews, []);
  assert.ok(!citySchema.safeParse({ ...ok, extra: 1 }).success, 'champ inconnu');
  assert.ok(!citySchema.safeParse({ ...ok, intro: { he: 'a', en: 'b', ru: 'c' } }).success, 'intro sans fr');
  assert.ok(!citySchema.safeParse({ ...ok, neighbors: [{ he: 'a' }] }).success, 'voisine incomplète');
  assert.ok(citySchema.safeParse({ ...ok, neighbors: [four('n')], reviews: ['r-1'] }).success);
  assert.ok(regionSchema.safeParse({ name: four('r'), anchor: 'center-shfela', order: 2 }).success);
  assert.ok(!regionSchema.safeParse({ name: four('r'), anchor: 'Center Shfela', order: 2 }).success, 'ancre invalide');
  assert.ok(!regionSchema.safeParse({ name: four('r'), anchor: 'a', order: 1.5 }).success, 'ordre non entier');
});

test('contenus : 2 régions (noms = nav.region.*), Modiin et Jérusalem valides, slugs et régions attendus', () => {
  const regions = readDir('regions').map(({ id, raw }) => ({ id, data: regionSchema.parse(raw) }));
  const cities = readDir('cities').map(({ id, raw }) => ({ id, data: citySchema.parse(raw) }));
  assert.deepEqual(regions.map((r) => r.id), ['center-shfela', 'jerusalem-area']);
  for (const { id, data } of regions) {
    assert.equal(data.anchor, id, `${id} : ancre`);
    for (const lang of ['he', 'en', 'ru', 'fr']) assert.equal(data.name[lang], I18N[lang][`nav.region.${id}`], `${id} (${lang})`);
  }
  const areas = buildAreas(regions, cities);
  assert.deepEqual(areas.regions.map((r) => [r.id, r.order]), [['jerusalem-area', 1], ['center-shfela', 2]]);
  assert.deepEqual(areas.cities.map((c) => c.id), ['jerusalem', 'modiin']);
  assert.deepEqual(areas.city('modiin').slugs, { he: 'מודיעין', en: 'modiin', ru: 'модиин', fr: 'modiin' });
  assert.deepEqual(areas.city('jerusalem').slugs, { he: 'ירושלים', en: 'jerusalem', ru: 'иерусалим', fr: 'jerusalem' });
  assert.deepEqual(areas.city('modiin').name, { he: 'מודיעין', en: 'Modiin', ru: 'Модиин', fr: 'Modiin' });
  assert.deepEqual(areas.city('jerusalem').name, { he: 'ירושלים', en: 'Jerusalem', ru: 'Иерусалим', fr: 'Jérusalem' });
  assert.equal(areas.city('modiin').region, 'center-shfela');
  assert.equal(areas.city('jerusalem').region, 'jerusalem-area');
});

test('intros (D1, NFR10) : phrase du canvas « התקנה ב{עיר} והסביבה », sans chiffre, emoji ni « ! », toutes différentes', () => {
  const cities = readDir('cities').map(({ id, raw }) => ({ id, data: citySchema.parse(raw) }));
  const seen = new Set();
  for (const { id, data } of cities) {
    assert.ok(data.intro.he.startsWith('מצלמות אבטחה, גלאי עשן, אינטרקום, בית חכם ורשתות. '), `${id} : phrase du canvas`);
    assert.ok(data.intro.he.includes(`התקנה ב${data.name.he} והסביבה.`), `${id} : התקנה ב{עיר}`);
    for (const [lang, text] of Object.entries(data.intro)) {
      assert.ok(!/\d/.test(text), `${id} (${lang}) : chiffre`);
      assert.ok(!text.includes('!'), `${id} (${lang}) : « ! »`);
      assert.ok(!/\p{Extended_Pictographic}/u.test(text), `${id} (${lang}) : emoji`);
      assert.ok(!seen.has(text), `${id} (${lang}) : intro en double`);
      seen.add(text);
    }
    assert.deepEqual(data.neighbors, [], `${id} : voisines réelles hors site (D2)`);
    assert.deepEqual(data.reviews, [], `${id} : aucun avis (4.3)`);
  }
});

test('areas.yaml : désactivée (story 4.4), slugs אזורים / areas / районы / zones', () => {
  const data = parse(readFileSync(join(CONTENT, 'pages/areas.yaml'), 'utf8'));
  assert.equal(data.enabled, false);
  assert.deepEqual(data.slugs, { he: 'אזורים', en: 'areas', ru: 'районы', fr: 'zones' });
});
