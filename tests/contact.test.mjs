// Stories 1.5 et 1.6 (AD-5, AD-13, FR31) : noyau des liens Appeler / WhatsApp, table des services,
// entrée WhatsApp d'une page (pageWaInput). Story 2.2 (FR28) : règles de validation du formulaire.
// Story 2.3 (FR30) : lignes du formulaire (formLines), ville en hébreu (resolveCityHe), 4 combinaisons du message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formLines, invalidContactFields, isValidName, isValidPhone, normalizePhone, PHONE_DISPLAY, resolveCityHe, telHref, waHref } from '../src/lib/contact/core.ts';
import { buildServiceTable, pageWaInput, SERVICE_CODES } from '../src/lib/contact/table.ts';

const PREFIX = 'https://wa.me/972509565669?text=';
const GREETING = 'שלום RS SYSTEM, הגעתי מהאתר.';

/** Texte décodé d'un lien WhatsApp ; vérifie le préfixe. */
function text(href) {
  assert.ok(href.startsWith(PREFIX), href);
  return decodeURIComponent(href.slice(PREFIX.length));
}

// — core.ts —

test('PHONE_DISPLAY et telHref()', () => {
  assert.equal(PHONE_DISPLAY, '050-956-5669');
  assert.equal(telHref(), 'tel:+972509565669');
});

test('waHref sans service ni ville : salutation seule ; vide ou espaces = absent', () => {
  for (const input of [undefined, {}, { serviceHe: '  ' }, { serviceHe: '', cityHe: ' \t' }, { lines: [] }]) {
    assert.equal(text(waHref(input)), GREETING, JSON.stringify(input));
  }
});

test('waHref service seul', () => {
  assert.equal(text(waHref({ serviceHe: 'מצלמות אבטחה' })), `${GREETING} אשמח לקבל הצעת מחיר למצלמות אבטחה.`);
});

test('waHref ville seule', () => {
  assert.equal(text(waHref({ cityHe: 'מודיעין' })), `${GREETING} אשמח לקבל הצעת מחיר במודיעין.`);
});

test('waHref service + ville + lignes', () => {
  const href = waHref({ serviceHe: 'מצלמות אבטחה', cityHe: 'מודיעין', lines: ['שם: דנה', 'הודעה: —'] });
  assert.equal(text(href), `${GREETING} אשמח לקבל הצעת מחיר למצלמות אבטחה במודיעין.\nשם: דנה\nהודעה: —`);
  // Encodé : aucun espace, retour à la ligne ou caractère non ASCII brut dans le lien.
  assert.match(href, /^[\x21-\x7e]+$/);
  assert.ok(href.includes('%0A'));
});

test('waHref service + ville sans lignes, valeurs entourées d’espaces', () => {
  assert.equal(
    text(waHref({ serviceHe: ' גלאי עשן ', cityHe: ' ירושלים ' })),
    `${GREETING} אשמח לקבל הצעת מחיר לגלאי עשן בירושלים.`,
  );
});

// — table.ts —

const LABELS = {
  cameras: ['מצלמות אבטחה', 'Security cameras', 'Камеры видеонаблюдения', 'Caméras de surveillance'],
  'smoke-detectors': ['גלאי עשן', 'Smoke detectors', 'Датчики дыма', 'Détecteurs de fumée'],
  'smart-home': ['בית חכם', 'Smart home', 'Умный дом', 'Maison connectée'],
  networks: ['תקשורת ורשתות', 'Networks and communications', 'Сети и связь', 'Réseaux et communication'],
  intercom: ['אינטרקום', 'Intercom', 'Домофон', 'Interphone'],
  'crane-cameras': ['מצלמות לעגורן / אתר בנייה', 'Crane and site cameras', 'Камеры для крана и стройплощадки', 'Caméras de grue et de chantier'],
  unsure: ['עוד לא בטוח', 'Not sure yet', 'Пока не знаю', 'Pas encore sûr'],
};
const entry = (id) => {
  const [he, en, ru, fr] = LABELS[id];
  return { id, label: { he, en, ru, fr } };
};
const ENTRIES = SERVICE_CODES.map(entry);
const throwsLabels = (fn, pattern) =>
  assert.throws(fn, (error) => {
    assert.match(error.message, /^labels : /);
    assert.match(error.message, pattern);
    return true;
  });

test('SERVICE_CODES : les 7 codes dans l’ordre', () => {
  assert.deepEqual(SERVICE_CODES, ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom', 'crane-cameras', 'unsure']);
});

test('buildServiceTable : 7 codes dans l’ordre, label dans la langue, he toujours hébreu', () => {
  const table = buildServiceTable([...ENTRIES].reverse(), 'fr');
  assert.deepEqual(Object.keys(table), [...SERVICE_CODES]);
  assert.deepEqual(table.cameras, { label: 'Caméras de surveillance', he: 'מצלמות אבטחה' });
  assert.deepEqual(buildServiceTable(ENTRIES, 'he').unsure, { label: 'עוד לא בטוח', he: 'עוד לא בטוח' });
});

test('buildServiceTable : code manquant, en trop ou dupliqué → lève', () => {
  throwsLabels(() => buildServiceTable(ENTRIES.slice(1), 'he'), /code « cameras » manquant/);
  throwsLabels(() => buildServiceTable([...ENTRIES, { ...entry('unsure'), id: 'alarms' }], 'he'), /code « alarms » inconnu/);
  throwsLabels(() => buildServiceTable([...ENTRIES, entry('intercom')], 'he'), /code « intercom » en double/);
});

// — src/content/services.yaml réel —

/** Lecteur limité à la forme de services.yaml : `- id:`, `label:` + 4 langues entre guillemets, `page:`. */
function readServices() {
  const yaml = readFileSync(new URL('../src/content/services.yaml', import.meta.url), 'utf8');
  return yaml
    .split(/^- /m)
    .slice(1)
    .map((block) => {
      const id = block.match(/^id: ([\w-]+)$/m)?.[1];
      const label = Object.fromEntries([...block.matchAll(/^ {4}(\w\w): '(.*)'$/gm)].map((m) => [m[1], m[2]]));
      const page = block.match(/^ {2}page: ([\w-]+)$/m)?.[1];
      return page ? { id, label, page } : { id, label };
    });
}

test('services.yaml : 7 ids dans l’ordre, 4 langues, libellés attendus, pages liées', () => {
  const services = readServices();
  assert.deepEqual(services.map((s) => s.id), [...SERVICE_CODES]);
  for (const s of services) {
    assert.deepEqual(Object.keys(s.label), ['he', 'en', 'ru', 'fr'], s.id);
    assert.deepEqual(Object.values(s.label), LABELS[s.id], s.id);
  }
  assert.deepEqual(
    Object.fromEntries(services.map((s) => [s.id, s.page])),
    { cameras: 'cameras', 'smoke-detectors': 'smoke-detectors', 'smart-home': 'smart-home', networks: 'networks', intercom: 'intercom', 'crane-cameras': 'contractors', unsure: undefined },
  );
  assert.equal(Object.keys(buildServiceTable(services, 'ru')).length, 7);
});

// — pageWaInput (story 1.6, matrice I/O) —

const TABLE = buildServiceTable(ENTRIES, 'fr');

test('pageWaInput : page sans service → {} ; lien = salutation seule', () => {
  const input = pageWaInput({ id: 'home', lang: 'fr', indexable: false }, TABLE);
  assert.deepEqual(input, {});
  assert.equal(waHref(input), waHref());
  assert.equal(text(waHref(input)), GREETING);
});

test('pageWaInput : service connu → libellé hébreu, quelle que soit la langue de la table', () => {
  assert.deepEqual(pageWaInput({ id: 'cameras', lang: 'fr', service: 'cameras', indexable: false }, TABLE), { serviceHe: 'מצלמות אבטחה' });
  assert.deepEqual(pageWaInput({ service: 'crane-cameras' }, buildServiceTable(ENTRIES, 'ru')), { serviceHe: 'מצלמות לעגורן / אתר בנייה' });
});

test('pageWaInput : service unsure → {}', () => {
  assert.deepEqual(pageWaInput({ service: 'unsure' }, TABLE), {});
});

test('pageWaInput : service inconnu → lève', () => {
  assert.throws(() => pageWaInput({ service: 'drones' }, TABLE), { message: 'contact : service inconnu « drones »' });
  assert.throws(() => pageWaInput({ service: 'toString' }, TABLE), { message: 'contact : service inconnu « toString »' });
});

test('pageWaInput : ville → lève tant que la table des villes est absente (epic 4)', () => {
  assert.throws(() => pageWaInput({ city: 'modiin' }, TABLE), { message: 'contact : table des villes absente (epic 4)' });
  assert.throws(() => pageWaInput({ service: 'cameras', city: 'modiin' }, TABLE), { message: 'contact : table des villes absente (epic 4)' });
});

// — Story 2.2 (FR28) : validation du formulaire —

test('normalizePhone retire espaces, tirets, points et parenthèses, rien d’autre', () => {
  assert.equal(normalizePhone(' (02) 123-4567 '), '021234567');
  assert.equal(normalizePhone('+972 50\t123.4567'), '+972501234567');
  assert.equal(normalizePhone('05O-12'), '05O12');
  assert.equal(normalizePhone('050–123'), '050–123', 'tiret Unicode conservé');
});

test('isValidPhone : formes valides', () => {
  for (const value of ['050-123-4567', '+972 50 123 4567', '(02) 123-4567', '+33 6 12 34 56 78', '02.123.4567', ' 0501234567 ', '021234567', '+97221234567']) {
    assert.equal(isValidPhone(value), true, value);
  }
});

test('isValidPhone : formes invalides', () => {
  for (const value of ['12345', '', '   ', '050-123', '+12345', '0501234567890', '05O1234567', '+972 50 abc', '+1234567890123456', '0050']) {
    assert.equal(isValidPhone(value), false, value);
  }
});

test('isValidName : vide ou espaces → invalide ; texte → valide', () => {
  for (const value of ['', '   ', '\t', '\n ']) assert.equal(isValidName(value), false, JSON.stringify(value));
  for (const value of ['דנה', ' a ', 'Иван']) assert.equal(isValidName(value), true, JSON.stringify(value));
});

test('invalidContactFields : liste ordonnée Nom puis Téléphone', () => {
  assert.deepEqual(invalidContactFields({ name: '', phone: '12345' }), ['name', 'phone']);
  assert.deepEqual(invalidContactFields({ name: 'דנה', phone: '' }), ['phone']);
  assert.deepEqual(invalidContactFields({ name: ' ', phone: '050-123-4567' }), ['name']);
  assert.deepEqual(invalidContactFields({ name: 'דנה', phone: '050-123-4567' }), []);
});

// — Story 2.3 (FR30) : formLines, resolveCityHe, message du formulaire —

const LINES = 'שם: דנה\nטלפון: 050-123-4567\nהודעה: 6 מצלמות';
const CITIES = Object.freeze({ modiin: { label: 'Modiin', he: 'מודיעין' }, ashkelon: { label: 'Ashkelon', he: 'אשקלון' } });
const formInput = { name: ' דנה ', phone: ' 050-123-4567 ', message: ' 6 מצלמות ' };

test('formLines : 3 lignes hébraïques, valeurs trimées ; message vide ou espaces → —', () => {
  assert.deepEqual(formLines(formInput), ['שם: דנה', 'טלפון: 050-123-4567', 'הודעה: 6 מצלמות']);
  for (const message of ['', '   ', '\n\t']) {
    assert.deepEqual(formLines({ name: 'Dana', phone: '0501234567', message }), ['שם: Dana', 'טלפון: 0501234567', 'הודעה: —'], JSON.stringify(message));
  }
});

test('message du formulaire : service + ville', () => {
  const href = waHref({ serviceHe: 'מצלמות אבטחה', cityHe: resolveCityHe('מודיעין', {}), lines: formLines(formInput) });
  assert.equal(text(href), `${GREETING} אשמח לקבל הצעת מחיר למצלמות אבטחה במודיעין.\n${LINES}`);
});

test('message du formulaire : service seul (ville vide)', () => {
  const href = waHref({ serviceHe: 'גלאי עשן', cityHe: resolveCityHe('', {}), lines: formLines(formInput) });
  assert.equal(text(href), `${GREETING} אשמח לקבל הצעת מחיר לגלאי עשן.\n${LINES}`);
});

test('message du formulaire : ville seule, libre hors liste, insérée telle quelle', () => {
  const href = waHref({ serviceHe: undefined, cityHe: resolveCityHe(' Ashdod ', CITIES), lines: formLines(formInput) });
  assert.equal(text(href), `${GREETING} אשמח לקבל הצעת מחיר בAshdod.\n${LINES}`);
});

test('message du formulaire : ni service ni ville (espaces) → phrase de devis gardée (D5)', () => {
  const href = waHref({ serviceHe: undefined, cityHe: resolveCityHe('   ', CITIES), lines: formLines({ name: 'Dana', phone: '0501234567', message: '' }), quote: true });
  assert.equal(text(href), `${GREETING} אשמח לקבל הצעת מחיר.\nשם: Dana\nטלפון: 0501234567\nהודעה: —`);
});

test('quote : sans effet quand un service ou une ville est présent ; absent → salutation seule (liens hors formulaire)', () => {
  assert.equal(text(waHref({ serviceHe: 'גלאי עשן', quote: true })), `${GREETING} אשמח לקבל הצעת מחיר לגלאי עשן.`);
  assert.equal(text(waHref({ cityHe: 'מודיעין', quote: true })), `${GREETING} אשמח לקבל הצעת מחיר במודיעין.`);
  assert.equal(text(waHref({})), GREETING);
  assert.equal(text(waHref({ quote: false })), GREETING);
});

test('resolveCityHe : vide ou espaces → undefined', () => {
  for (const value of ['', '  ', '\t']) assert.equal(resolveCityHe(value, CITIES), undefined, JSON.stringify(value));
  assert.equal(resolveCityHe(' ', CITIES, 'modiin'), undefined);
});

test('resolveCityHe : par code ?city= quand le texte est toujours son libellé', () => {
  assert.equal(resolveCityHe('Modiin', CITIES, 'modiin'), 'מודיעין');
  assert.equal(text(waHref({ cityHe: resolveCityHe('Modiin', CITIES, 'modiin') })), `${GREETING} אשמח לקבל הצעת מחיר במודיעין.`);
  // Texte modifié par le visiteur : le code ne s'applique plus, la correspondance de nom prend le relais.
  assert.equal(resolveCityHe('Ashkelon', CITIES, 'modiin'), 'אשקלון');
  assert.equal(resolveCityHe('Tel Aviv', CITIES, 'modiin'), 'Tel Aviv');
});

test('resolveCityHe : par nom (libellé ou hébreu), sans tenir compte de la casse, après NFC', () => {
  assert.equal(resolveCityHe('modiin', CITIES), 'מודיעין');
  assert.equal(resolveCityHe('  MODIIN ', CITIES), 'מודיעין');
  assert.equal(resolveCityHe('מודיעין', CITIES), 'מודיעין');
  const accented = { lod: { label: 'Lôd', he: 'לוד' } };
  assert.equal(resolveCityHe('LO\u0302D', accented), 'לוד', 'forme décomposée');
});

test('resolveCityHe : ville libre hors liste → texte trimé tel quel ; table vide', () => {
  assert.equal(resolveCityHe(' Ashdod ', CITIES), 'Ashdod');
  assert.equal(resolveCityHe('Ashdod', {}), 'Ashdod');
  assert.equal(resolveCityHe('Ashdod', {}, 'ashdod'), 'Ashdod');
});

test('resolveCityHe : codes hérités (toString, __proto__) jamais résolus', () => {
  assert.equal(resolveCityHe('toString', CITIES, 'toString'), 'toString');
  assert.equal(resolveCityHe('x', CITIES, '__proto__'), 'x');
  assert.equal(resolveCityHe('[object Object]', CITIES, 'constructor'), '[object Object]');
});
