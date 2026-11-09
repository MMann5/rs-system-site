// Stories 1.5 et 1.6 (AD-5, AD-13, FR31) : noyau des liens Appeler / WhatsApp, table des services,
// entrée WhatsApp d'une page (pageWaInput).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHONE_DISPLAY, telHref, waHref } from '../src/lib/contact/core.ts';
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
