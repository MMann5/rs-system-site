// Story 5.1 (FR10, FR40, AD-4, décisions D2 et D3 de l'epic 5) : schéma du bloc `about` et règle des chiffres.
// Un champ mal formé (langue manquante, texte et placeholder mêlés) est refusé ; chaque chiffre est facultatif, et un
// chiffre retiré des données ne laisse ni colonne ni trou (aboutStats).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { aboutStats, fill } from '../src/lib/about.ts';
import { pageSchema, requireAbout } from '../src/lib/page-schema.ts';

const FILE = fileURLToPath(new URL('../src/content/pages/about.yaml', import.meta.url));
const about = () => parse(readFileSync(FILE, 'utf8'));
const refused = (data) => !pageSchema.safeParse(data).success;

test('about.yaml : slugs A1, activée, bloc about complet (2 chiffres en placeholder + zone, trio de 3 en placeholder)', () => {
  const { slugs, enabled, meta, about: data } = pageSchema.parse(about());
  assert.deepEqual(slugs, { he: 'אודות', en: 'about', ru: 'о-нас', fr: 'a-propos' });
  assert.equal(enabled, true);
  assert.deepEqual(meta.title, { he: 'אודות · RS SYSTEM', en: 'About · RS SYSTEM', ru: 'О нас · RS SYSTEM', fr: 'À propos · RS SYSTEM' });
  for (const d of Object.values(meta.description)) assert.doesNotMatch(d, /\d/, 'description sans chiffre');
  assert.equal(data.hero.title.he, 'מערכת מיגון ואבטחה.');
  assert.deepEqual(fill(data.story, 'he'), { text: 'סיפור החברה: מתי הוקמה, מי מאחוריה, ולמה לקוחות בוחרים בה.', placeholder: true });
  assert.deepEqual(data.how.items.map((i) => i.title.he), ['טכנאים שלנו', 'הצעה ברורה', 'אחרי ההתקנה']);
  assert.ok(data.how.items.every((i) => 'placeholder' in i.text), 'corps du trio en placeholder');
  const text = JSON.stringify(data);
  assert.ok(!/\bIDS\b/.test(text) && !/maagal|מעגל/i.test(text), 'ni IDS ni Maagal');
});

test('aboutStats : données complètes → 3 chiffres dans l’ordre année · installations · zone', () => {
  const { about: data } = pageSchema.parse(about());
  assert.deepEqual(aboutStats(data, 'he'), [
    { key: 'founded', value: 'שנה', placeholder: true, label: 'שנת הקמה' },
    { key: 'installations', value: 'מספר', placeholder: true, label: 'התקנות' },
    { key: 'zone', value: 'מבאר שבע ועד ירושלים', placeholder: false, label: 'כולל היישובים' },
  ]);
  assert.deepEqual(aboutStats(data, 'fr').map((s) => s.value), ['année', 'nombre', 'De Beer-Sheva à Jérusalem']);
  assert.deepEqual(aboutStats(data, 'en').map((s) => s.value), ['year', 'number', 'From Beer Sheva to Jerusalem']);
  assert.deepEqual(aboutStats(data, 'ru').map((s) => s.value), ['год', 'число', 'От Беэр-Шевы до Иерусалима']);
});

test('aboutStats : un chiffre retiré → sa colonne disparaît, l’ordre reste ; aucun chiffre → liste vide', () => {
  const noInstall = about();
  delete noInstall.about.stats.installations;
  const parsed = pageSchema.parse(noInstall).about;
  assert.deepEqual(aboutStats(parsed, 'he').map((s) => s.key), ['founded', 'zone']);
  const noFounded = about();
  delete noFounded.about.stats.founded;
  assert.deepEqual(aboutStats(pageSchema.parse(noFounded).about, 'fr').map((s) => s.key), ['installations', 'zone']);
  const none = about();
  for (const key of ['founded', 'installations', 'zone']) delete none.about.stats[key];
  assert.deepEqual(aboutStats(pageSchema.parse(none).about, 'he'), []);
});

test('aboutStats : une valeur fournie (texte) remplace le placeholder sans changer la colonne', () => {
  const data = about();
  data.about.stats.founded.value = { he: '2010', en: '2010', ru: '2010', fr: '2010' };
  const [founded] = aboutStats(pageSchema.parse(data).about, 'ru');
  assert.deepEqual(founded, { key: 'founded', value: '2010', placeholder: false, label: 'Год основания' });
});

test('bloc about : langue manquante, texte et placeholder mêlés, champ inconnu, trio de 2 refusés', () => {
  for (const change of [
    (d) => delete d.about.stats.founded.value.placeholder.ru,
    (d) => delete d.about.stats.zone.value.fr,
    (d) => delete d.about.stats.zone.label.en,
    (d) => (d.about.stats.zone.value.placeholder = { he: 'א', en: 'a', ru: 'а', fr: 'a' }),
    (d) => (d.about.story.he = 'סיפור'),
    (d) => delete d.about.story.placeholder.he,
    (d) => (d.about.stats.other = d.about.stats.zone),
    (d) => (d.about.how.items[0].text.placeholder.de = 'x'),
    (d) => d.about.how.items.pop(),
    (d) => (d.about.hero.title.fr = '  '),
    (d) => delete d.about.stats.label,
  ]) {
    const data = about();
    change(data);
    assert.ok(refused(data), String(change));
  }
});

test('requireAbout : bloc absent → erreur nommant src/content/pages/about.yaml', () => {
  const data = about();
  delete data.about;
  const parsed = pageSchema.parse(data);
  assert.throws(() => requireAbout('about', parsed.about), { message: 'About : bloc « about » absent de src/content/pages/about.yaml' });
  assert.equal(requireAbout('about', pageSchema.parse(about()).about).hero.title.en, 'Security and protection systems.');
});
