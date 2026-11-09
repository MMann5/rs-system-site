// Story 4.1 (FR9, AD-2, AD-4) : régions et villes — cœur pur (validation, tri, sources du registre), schémas Zod
// et contenus du dépôt (story 4.2 : les 15 villes et leurs 4 régions). Story 4.4 : damier `regionTones`, champ `others`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildAreas, buildReviews, citySources, CITY_ID_PREFIX, MAX_REVIEWS_PER_CITY, regionTones } from '../src/lib/areas/core.ts';
import { citySchema, regionSchema, reviewSchema } from '../src/lib/areas/schema.ts';
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

// Story 4.2 : noms (he, en, ru, fr) et slugs (he, ru, fr ; en = id) des 15 villes, dans l'ordre région puis ville
// d'EXP › Régions et villes.
const CITY_TABLE = {
  'jerusalem-area': {
    jerusalem: [['ירושלים', 'Jerusalem', 'Иерусалим', 'Jérusalem'], ['ירושלים', 'иерусалим', 'jerusalem']],
    'beit-shemesh': [['בית שמש', 'Beit Shemesh', 'Бейт-Шемеш', 'Beit Shemesh'], ['בית-שמש', 'бейт-шемеш', 'beit-shemesh']],
    'mevaseret-zion': [['מבשרת ציון', 'Mevaseret Zion', 'Мевасерет-Цион', 'Mevasseret Zion'], ['מבשרת-ציון', 'мевасерет-цион', 'mevasseret-zion']],
    'maale-adumim': [['מעלה אדומים', 'Maale Adumim', 'Маале-Адумим', 'Maalé Adoumim'], ['מעלה-אדומים', 'маале-адумим', 'maale-adoumim']],
  },
  'center-shfela': {
    modiin: [['מודיעין', 'Modiin', 'Модиин', 'Modiin'], ['מודיעין', 'модиин', 'modiin']],
    rehovot: [['רחובות', 'Rehovot', 'Реховот', 'Rehovot'], ['רחובות', 'реховот', 'rehovot']],
    'rishon-lezion': [['ראשון לציון', 'Rishon LeZion', 'Ришон-ле-Цион', 'Rishon LeZion'], ['ראשון-לציון', 'ришон-ле-цион', 'rishon-lezion']],
    ashdod: [['אשדוד', 'Ashdod', 'Ашдод', 'Ashdod'], ['אשדוד', 'ашдод', 'ashdod']],
  },
  south: {
    'beer-sheva': [['באר שבע', 'Beer Sheva', 'Беэр-Шева', 'Beer-Sheva'], ['באר-שבע', 'беэр-шева', 'beer-sheva']],
    ashkelon: [['אשקלון', 'Ashkelon', 'Ашкелон', 'Ashkelon'], ['אשקלון', 'ашкелон', 'ashkelon']],
    'kiryat-gat': [['קריית גת', 'Kiryat Gat', 'Кирьят-Гат', 'Kiryat Gat'], ['קריית-גת', 'кирьят-гат', 'kiryat-gat']],
    ofakim: [['אופקים', 'Ofakim', 'Офаким', 'Ofakim'], ['אופקים', 'офаким', 'ofakim']],
  },
  'judea-samaria': {
    'gush-etzion': [['גוש עציון', 'Gush Etzion', 'Гуш-Эцион', 'Goush Etzion'], ['גוש-עציון', 'гуш-эцион', 'goush-etzion']],
    efrat: [['אפרת', 'Efrat', 'Эфрат', 'Efrat'], ['אפרת', 'эфрат', 'efrat']],
    ariel: [['אריאל', 'Ariel', 'Ариэль', 'Ariel'], ['אריאל', 'ариэль', 'ariel']],
  },
};
// Slugs anglais d'EXP, dans l'ordre (= ids de fichier = codes `?city=`).
const EXP_SLUGS = ['jerusalem', 'beit-shemesh', 'mevaseret-zion', 'maale-adumim', 'modiin', 'rehovot', 'rishon-lezion', 'ashdod', 'beer-sheva', 'ashkelon', 'kiryat-gat', 'ofakim', 'gush-etzion', 'efrat', 'ariel'];

test('contenus : 4 régions (noms = nav.region.*), 15 villes valides dans l\'ordre région → ville, slugs et noms d\'EXP', () => {
  const regions = readDir('regions').map(({ id, raw }) => ({ id, data: regionSchema.parse(raw) }));
  const cities = readDir('cities').map(({ id, raw }) => ({ id, data: citySchema.parse(raw) }));
  for (const { id, data } of regions) {
    assert.equal(data.anchor, id, `${id} : ancre`);
    for (const lang of ['he', 'en', 'ru', 'fr']) assert.equal(data.name[lang], I18N[lang][`nav.region.${id}`], `${id} (${lang})`);
  }
  const areas = buildAreas(regions, cities);
  assert.deepEqual(areas.regions.map((r) => [r.id, r.order]), [['jerusalem-area', 1], ['center-shfela', 2], ['south', 3], ['judea-samaria', 4]]);
  assert.deepEqual(areas.cities.map((c) => c.id), EXP_SLUGS);
  assert.deepEqual(Object.values(CITY_TABLE).flatMap((r) => Object.keys(r)), EXP_SLUGS, 'table = liste d\'EXP');
  for (const [rid, table] of Object.entries(CITY_TABLE)) {
    Object.entries(table).forEach(([cid, [[he, en, ru, fr], [she, sru, sfr]]], i) => {
      const c = areas.city(cid);
      assert.equal(c.region, rid, `${cid} : région`);
      assert.equal(c.order, i + 1, `${cid} : ordre dans la région`);
      assert.deepEqual(c.name, { he, en, ru, fr }, `${cid} : noms`);
      assert.deepEqual(c.slugs, { he: she, en: cid, ru: sru, fr: sfr }, `${cid} : slugs`);
    });
  }
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

test('areas.yaml : activée (story 4.4), slugs אזורים / areas / районы / zones', () => {
  const data = parse(readFileSync(join(CONTENT, 'pages/areas.yaml'), 'utf8'));
  assert.equal(data.enabled, true);
  assert.deepEqual(data.slugs, { he: 'אזורים', en: 'areas', ru: 'районы', fr: 'zones' });
});

// — Story 4.3 (FR41, AD-4, D3, D4) : avis Midrag. Fixtures de test uniquement, jamais dans src/ (D3). —

/** Ville `id` (nom hébreu `he`) avec ses voisines et ses références d'avis. */
const reviewCity = (id, he, { neighbors = [], reviews = [] } = {}) => {
  const c = city(id, 'center-shfela', 1);
  return { id, ...c.data, name: { ...c.data.name, he }, neighbors, reviews };
};
const review = (id, cityId, locality, lang = 'he') => ({
  id,
  data: { quote: `citation de test ${id}`, lang, author: `auteur ${id}`, locality, city: cityId },
});
const MODIIN = 'מודיעין';
const SHOHAM = { he: 'שוהם', en: 'Shoham', ru: 'Шохам', fr: 'Shoham' };

test('buildReviews : 0 avis → [] ; 2 avis rendus dans l\'ordre de la ville ; avis non référencé accepté', () => {
  assert.equal(MAX_REVIEWS_PER_CITY, 2);
  const none = buildReviews([], [reviewCity('modiin', MODIIN)]);
  assert.deepEqual(none('modiin'), []);
  const of = buildReviews(
    [review('m-1', 'modiin', MODIIN), review('m-2', 'modiin', MODIIN), review('m-3', 'modiin', MODIIN)],
    [reviewCity('modiin', MODIIN, { reviews: ['m-2', 'm-1'] })],
  );
  assert.deepEqual(of('modiin').map((r) => r.id), ['m-2', 'm-1']);
  assert.equal(of('modiin')[0].quote, 'citation de test m-2');
  assert.throws(() => of('haifa'), { message: 'areas : ville inconnue « haifa »' });
});

test('buildReviews : localité = une voisine dans la langue de l\'avis, après trim + NFC → accepté', () => {
  const cities = [reviewCity('modiin', MODIIN, { neighbors: [SHOHAM], reviews: ['m-1', 'm-2'] })];
  const of = buildReviews([review('m-1', 'modiin', ' שוהם '), review('m-2', 'modiin', 'Shoham', 'fr')], cities);
  assert.equal(of('modiin').length, 2);
  // Même nom en NFD (é décomposé) : accepté après NFC.
  const decomposed = 'Ville-é'.normalize('NFD');
  assert.equal(
    buildReviews([review('x-1', 'x', decomposed, 'fr')], [{ ...reviewCity('x', 'x', { reviews: ['x-1'] }), name: { ...four('x'), fr: 'Ville-é' } }])('x').length,
    1,
  );
  // Nom d'une voisine dans une autre langue que celle de l'avis : refusé.
  assert.throws(() => buildReviews([review('m-1', 'modiin', 'Shoham')], cities), /src\/content\/reviews\/m-1\.yaml : localité « Shoham »/);
});

test('buildReviews : 3 avis → lève en nommant la ville', () => {
  assert.throws(
    () =>
      buildReviews(
        [review('m-1', 'modiin', MODIIN), review('m-2', 'modiin', MODIIN), review('m-3', 'modiin', MODIIN)],
        [reviewCity('modiin', MODIIN, { reviews: ['m-1', 'm-2', 'm-3'] })],
      ),
    { message: 'areas : src/content/cities/modiin.yaml : 3 avis (au plus 2)' },
  );
});

test('buildReviews : hors zone (חיפה pour modiin sans voisine Haïfa) → lève en nommant l\'avis', () => {
  assert.throws(
    () => buildReviews([review('m-1', 'modiin', 'חיפה')], [reviewCity('modiin', MODIIN, { neighbors: [SHOHAM], reviews: ['m-1'] })]),
    { message: 'areas : src/content/reviews/m-1.yaml : localité « חיפה » ni modiin ni une de ses voisines (he)' },
  );
});

test('buildReviews : mauvaise ville, ville inconnue, avis inconnu, en double → lève, toutes les erreurs d\'un coup', () => {
  assert.throws(
    () => buildReviews([review('j-1', 'jerusalem', 'ירושלים')], [reviewCity('modiin', MODIIN, { reviews: ['j-1'] }), reviewCity('jerusalem', 'ירושלים')]),
    { message: 'areas : src/content/reviews/j-1.yaml : avis de « jerusalem », référencé par « modiin »' },
  );
  assert.throws(() => buildReviews([review('h-1', 'haifa', 'חיפה')], [reviewCity('modiin', MODIIN)]), {
    message: 'areas : src/content/reviews/h-1.yaml : ville inconnue « haifa »',
  });
  assert.throws(
    () => buildReviews([review('m-1', 'modiin', MODIIN)], [reviewCity('modiin', MODIIN, { reviews: ['m-1', 'm-1', 'absent'] })]),
    {
      message: [
        'areas : src/content/cities/modiin.yaml : 3 avis (au plus 2)',
        'areas : src/content/cities/modiin.yaml : avis « m-1 » listé deux fois',
        'areas : src/content/cities/modiin.yaml : avis inconnu « absent »',
      ].join('\n'),
    },
  );
});

test('reviewSchema : strict, lang parmi les 4, citation non vide ; translations partiel accepté', () => {
  const ok = { quote: 'citation', lang: 'he', author: 'auteur', locality: MODIIN, city: 'modiin' };
  assert.ok(reviewSchema.safeParse(ok).success);
  assert.ok(reviewSchema.safeParse({ ...ok, translations: { fr: 'traduction' } }).success, 'translations partiel');
  assert.ok(!reviewSchema.safeParse({ ...ok, extra: 1 }).success, 'champ inconnu');
  assert.ok(!reviewSchema.safeParse({ ...ok, lang: 'ar' }).success, 'lang hors des 4');
  assert.ok(!reviewSchema.safeParse({ ...ok, quote: '  ' }).success, 'citation vide');
  assert.ok(!reviewSchema.safeParse({ ...ok, city: 'Modiin' }).success, 'ville non kebab-case');
  assert.ok(!reviewSchema.safeParse({ ...ok, translations: { de: 'x' } }).success, 'traduction hors des 4');
  const { author: _a, ...noAuthor } = ok;
  assert.ok(!reviewSchema.safeParse(noAuthor).success, 'auteur manquant');
});

test('contenus (D3) : aucun avis publié, les 15 villes à reviews: []', () => {
  const files = readdirSync(join(CONTENT, 'reviews'));
  assert.deepEqual(files, ['README.md']);
  for (const { id, raw } of readDir('cities')) assert.deepEqual(raw.reviews, [], `${id} : reviews`);
});

// — Story 4.4 (FR8, UX-DR23, D2, D6) : damier des tuiles de la page Zones et ligne « autres yishouvim ». —

const tones = (n) => regionTones(n).map((t) => [t.wide, t.narrow, t.span]);

test('regionTones (D6) : 4 régions → 2 colonnes clair/sombre/sombre/clair, 1 colonne alternée, aucun span', () => {
  assert.deepEqual(tones(4), [
    ['light', 'light', false],
    ['dark', 'dark', false],
    ['dark', 'light', false],
    ['light', 'dark', false],
  ]);
});

test('regionTones (D6) : 5 régions → la 5e claire et pleine largeur ; 1 région → claire, span ; 0 → []', () => {
  const five = regionTones(5);
  assert.deepEqual(five.map((t) => t.wide), ['light', 'dark', 'dark', 'light', 'light']);
  assert.deepEqual(five.map((t) => t.narrow), ['light', 'dark', 'light', 'dark', 'light']);
  assert.deepEqual(five.map((t) => t.span), [false, false, false, false, true]);
  assert.deepEqual(regionTones(1), [{ wide: 'light', narrow: 'light', span: true }]);
  assert.deepEqual(regionTones(0), []);
  // Règle de la spine : sur 2 colonnes, (ligne + colonne) % 2, hors tuile pleine largeur.
  regionTones(8).forEach((t, i) => assert.equal(t.wide, (Math.floor(i / 2) + (i % 2)) % 2 === 0 ? 'light' : 'dark', `index ${i}`));
});

test('others (D2) : défaut false (schéma et YAML brut), true seulement pour judea-samaria dans le dépôt', () => {
  assert.equal(regionSchema.parse({ name: four('r'), anchor: 'r', order: 1 }).others, false);
  assert.equal(regionSchema.parse({ name: four('r'), anchor: 'r', order: 1, others: true }).others, true);
  assert.ok(!regionSchema.safeParse({ name: four('r'), anchor: 'r', order: 1, others: 'oui' }).success, 'others non booléen');
  // YAML brut (lint, completeness.mjs) : champ absent → false ; région sans ville → aucune ville.
  const areas = buildAreas([region('north', 1), { id: 'west', data: { ...region('west', 2).data, others: true } }], []);
  assert.deepEqual(areas.regions.map((r) => [r.id, r.others]), [['north', false], ['west', true]]);
  assert.deepEqual(areas.cities.filter((c) => c.region === 'north'), []);
  const repo = buildAreas(readDir('regions').map(({ id, raw }) => ({ id, data: regionSchema.parse(raw) })), []);
  assert.deepEqual(repo.regions.filter((r) => r.others).map((r) => r.id), ['judea-samaria']);
});
