// Story 3.1 (AD-4, FR2) : schéma des pages fixes. Une page service incomplète (une langue, un public du trio)
// ou porteuse d'un champ inconnu est refusée : le build échoue au chargement des contenus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { pageSchema } from '../src/lib/page-schema.ts';

const PAGES = fileURLToPath(new URL('../src/content/pages/', import.meta.url));
const cameras = () => parse(readFileSync(join(PAGES, 'cameras.yaml'), 'utf8'));
const refused = (data) => !pageSchema.safeParse(data).success;

test('pages fixes : chaque src/content/pages/*.yaml passe le schéma', () => {
  for (const name of readdirSync(PAGES).filter((n) => n.endsWith('.yaml'))) {
    const result = pageSchema.safeParse(parse(readFileSync(join(PAGES, name), 'utf8')));
    assert.ok(result.success, `${name} : ${result.error?.message}`);
  }
});

test('cameras.yaml : bloc service complet (héros, trio de 3, tuile)', () => {
  const { service } = pageSchema.parse(cameras());
  assert.equal(service.trio.items.length, 3);
  assert.equal(service.hero.title.he, 'מצלמות אבטחה');
  assert.equal(service.tile.eyebrow.he, 'לקבלנים');
});

test('page service : une langue manquante est refusée (héros, trio, tuile)', () => {
  for (const drop of [
    (d) => delete d.service.hero.title.ru,
    (d) => delete d.service.hero.alt.fr,
    (d) => delete d.service.trio.items[1].text.en,
    (d) => delete d.service.tile.alt.he,
    (d) => delete d.service.tile.eyebrow.ru,
  ]) {
    const data = cameras();
    drop(data);
    assert.ok(refused(data), String(drop));
  }
});

test('page service : texte vide, trio de 2 ou de 4, champ inconnu ou langue en trop refusés', () => {
  const empty = cameras();
  empty.service.hero.subtitle.he = '   ';
  const two = cameras();
  two.service.trio.items.pop();
  const four = cameras();
  four.service.trio.items.push(four.service.trio.items[0]);
  const unknown = cameras();
  unknown.service.hero.cta = 'x';
  const extraLang = cameras();
  extraLang.service.tile.title.de = 'Auch auf dem Kran.';
  for (const data of [empty, two, four, unknown, extraLang]) assert.ok(refused(data));
});

test('page service : la tuile et son sur-titre sont facultatifs', () => {
  const noTile = cameras();
  delete noTile.service.tile;
  assert.ok(!refused(noTile));
  const noEyebrow = cameras();
  delete noEyebrow.service.tile.eyebrow;
  assert.ok(!refused(noEyebrow));
});

// Story 3.2 (AD-4) : héros illustré sans photo, donc sans `alt` ; Service.astro l'exige pour un héros à photo.
test('page service : hero.alt facultatif (héros illustré), mais complet s’il est présent', () => {
  const noAlt = cameras();
  delete noAlt.service.hero.alt;
  assert.ok(!refused(noAlt));
  const partial = cameras();
  delete partial.service.hero.alt.ru;
  assert.ok(refused(partial));
});

test('smoke-detectors.yaml : héros sans alt, trio de 3 du canvas, sans tuile', () => {
  const { service, slugs, enabled } = pageSchema.parse(parse(readFileSync(join(PAGES, 'smoke-detectors.yaml'), 'utf8')));
  assert.equal(enabled, true);
  assert.deepEqual(slugs, { he: 'גלאי-עשן', en: 'smoke-detectors', ru: 'датчики-дыма', fr: 'detecteurs-de-fumee' });
  assert.equal(service.hero.title.he, 'גלאי עשן');
  assert.equal(service.hero.subtitle.he, 'מזהים עשן מוקדם, בכל חדר.');
  assert.equal(service.hero.alt, undefined);
  assert.equal(service.tile, undefined);
  assert.deepEqual(
    service.trio.items.map((item) => [item.title.he, item.text.he]),
    [
      ['לבית', 'גלאי בכל חדר שינה, בסלון ובמטבח.'],
      ['לבניין', 'חדרי מדרגות, חניון ומחסנים.'],
      ['לעסק', 'משרד, חנות או מחסן.'],
    ],
  );
});
