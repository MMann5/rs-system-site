// Story 2.2 (FR28, FR33, UX-DR29, AD-14) : îlot du formulaire de Contact. Source qui n'importe que les modules
// purs ../lib/contact/core.ts et ../lib/track-events.ts ; comportement (validation à l'envoi, ARIA, focus,
// résumé, liens) sur un DOM factice minimal. Story 2.3 (FR29, FR30, AD-6) : lecture de #rs-data, présélection
// par ?service= / ?city=, message WhatsApp, ouverture (nouvel onglet, même onglet), événements rs:track.
// Story 2.4 (FR33, UX-DR29) : état d'envoi (3 s, double envoi ignoré), retour (visibilitychange, pageshow),
// Réessayer, hors ligne.
// L'îlot s'exécute à l'import : chaque cas l'importe à neuf (?case=n) après avoir posé les globaux.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formLines, waHref } from '../src/lib/contact/core.ts';

// Minuteurs simulés (3 s de l'état d'envoi) : avancés par mock.timers.tick().
mock.timers.enable({ apis: ['setTimeout'] });

const ISLAND_URL = new URL('../src/scripts/contact-form.ts', import.meta.url).href;
const ISLAND = fileURLToPath(ISLAND_URL);

/** Retire les commentaires // et /* *\/ (le texte des commentaires peut citer « import »). */
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Spécifieurs importés (statiques, dynamiques, require) et présence d'un module astro:. */
function islandImports(code) {
  const src = stripComments(code);
  const specs = [
    ...[...src.matchAll(/(?:^|[^\w$.])import\s*(?:[\w$*{}\s,]+?\s*from\s*)?['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ...[...src.matchAll(/\bimport\s*\(\s*['"]?([^'")]*)/g)].map((m) => `import(${m[1]})`),
    ...[...src.matchAll(/\brequire\s*\(/g)].map(() => 'require'),
  ];
  return { specs, astro: /astro:/.test(src) };
}

test('islandImports lit import, import type, import(), require et astro:', () => {
  assert.deepEqual(islandImports("import { a, type B } from '../lib/contact/core.ts';").specs, ['../lib/contact/core.ts']);
  assert.deepEqual(islandImports("import '../x.ts';").specs, ['../x.ts']);
  assert.deepEqual(islandImports("const m = await import('./m.ts');").specs, ['import(./m.ts)']);
  assert.deepEqual(islandImports("const x = require('y');").specs, ['require']);
  assert.equal(islandImports("import { getCollection } from 'astro:content';").astro, true);
  assert.deepEqual(islandImports('// import interdit\nconst a = 1;').specs, []);
});

test('src/scripts/contact-form.ts n’importe que core.ts et track-events.ts (aucun astro:)', () => {
  assert.ok(existsSync(ISLAND), 'src/scripts/contact-form.ts absent');
  const { specs, astro } = islandImports(readFileSync(ISLAND, 'utf8'));
  assert.deepEqual(specs, ['../lib/contact/core.ts', '../lib/track-events.ts']);
  assert.equal(astro, false);
});

// — DOM factice —

/** Écritures de textContent faites après le montage (l'îlot ne doit poser que #contact-sending). */
let textWrites = [];

/** Sélecteurs simples utilisés par l'îlot : `.classe`, `tag[attr="valeur"]`, `[attr]`. */
function matches(el, selector) {
  if (selector.startsWith('.')) return (el.getAttribute('class') ?? '').split(/\s+/).includes(selector.slice(1));
  const m = selector.match(/^([a-z]*)\[([\w-]+)(?:="([^"]*)")?\]$/);
  assert.ok(m, `sélecteur non géré : ${selector}`);
  const [, tag, attr, value] = m;
  return (!tag || el.tag === tag) && el.hasAttribute(attr) && (value === undefined || el.getAttribute(attr) === value);
}

class FakeElement {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.parent = null;
    this.children = [];
    this.listeners = {};
    this.hidden = false;
    this._text = '';
    this.append(...children);
  }
  get textContent() {
    return this._text;
  }
  set textContent(value) {
    textWrites.push([this.id || this.tag, value]);
    this._text = value;
  }
  get id() {
    return this.attrs.get('id') ?? '';
  }
  get dataset() {
    return { field: this.attrs.get('data-field') };
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }
  removeAttribute(name) {
    this.attrs.delete(name);
  }
  hasAttribute(name) {
    return this.attrs.has(name);
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.tag === '#fragment') {
        this.append(...node.children);
        node.children = [];
        continue;
      }
      node.parent?.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren() {
    for (const child of this.children) child.parent = null;
    this.children = [];
  }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  *descendants() {
    for (const child of this.children) {
      yield child;
      yield* child.descendants();
    }
  }
  querySelectorAll(selector) {
    return [...this.descendants()].filter((el) => matches(el, selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  /** Sélecteur utilisé par l'îlot : `a[href^="#"]`. */
  closest(selector) {
    assert.equal(selector, 'a[href^="#"]');
    for (let n = this; n; n = n.parent) if (n.tag === 'a' && n.getAttribute('href')?.startsWith('#')) return n;
    return null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  focus(options) {
    assert.ok(this.tag !== 'h3' || this.getAttribute('tabindex') === '-1', 'titre focalisable');
    this.focusOptions = options;
    globalThis.document.activeElement = this;
  }
  scrollIntoView(options) {
    (this.scrolls ??= []).push(options);
  }
}
class FakeForm extends FakeElement {}
class FakeInput extends FakeElement {
  constructor(attrs) {
    super('input', attrs);
    this.value = '';
  }
}
class FakeSelect extends FakeElement {
  constructor(attrs) {
    super('select', attrs);
    this.value = 'unsure';
  }
}
class FakeTextArea extends FakeElement {
  constructor(attrs) {
    super('textarea', attrs);
    this.value = '';
  }
}
class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}
class FakeTemplate extends FakeElement {
  constructor(attrs, build) {
    super('template', attrs);
    this.content = { cloneNode: (deep) => (assert.equal(deep, true), new FakeElement('#fragment', {}, build())) };
  }
}

const summaryContent = () => [
  new FakeElement('div', { class: 'form-status' }, [
    new FakeElement('svg', { 'aria-hidden': 'true' }),
    new FakeElement('h3', {}),
    new FakeElement('ul', {}, [
      new FakeElement('li', { 'data-field': 'name' }, [new FakeElement('a', { href: '#contact-name' })]),
      new FakeElement('li', { 'data-field': 'phone' }, [new FakeElement('a', { href: '#contact-phone' })]),
    ]),
  ]),
];

const offlineContent = () => [
  new FakeElement('div', { class: 'form-status' }, [
    new FakeElement('svg', { 'aria-hidden': 'true' }),
    new FakeElement('h3', {}),
    new FakeElement('p', {}, [new FakeElement('a', { href: 'tel-link', 'data-track': 'call_click' })]),
  ]),
];

const SENDING_TEXT = 'Ouverture de WhatsApp…';

// Tables de #rs-data en fr (Contact.astro : serviceLabels / cityLabels).
const SERVICES = {
  cameras: { label: 'Caméras de surveillance', he: 'מצלמות אבטחה' },
  'smoke-detectors': { label: 'Détecteurs de fumée', he: 'גלאי עשן' },
  'smart-home': { label: 'Maison connectée', he: 'בית חכם' },
  unsure: { label: 'Pas encore sûr', he: 'עוד לא בטוח' },
};
// Story 4.2 : Ashdod, une des 13 villes ajoutées (même entrée que #rs-data de la page Contact fr).
const CITIES = { modiin: { label: 'Modiin', he: 'מודיעין' }, ashdod: { label: 'Ashdod', he: 'אשדוד' } };
const RS_DATA = { context: { id: 'contact', lang: 'fr', navSection: 'contact', indexable: false }, services: SERVICES, cities: {} };

let round = 0;

/**
 * rsData : objet sérialisé dans #rs-data, chaîne brute, ou null (bloc absent). search : `location.search`.
 * coarse : `(pointer: coarse)`. blocked : window.open renvoie null. city : valeur initiale du champ ville.
 */
async function mountIsland({ withForm = true, rsData = RS_DATA, search = '', coarse = false, blocked = false, city: cityValue = '', online = true } = {}) {
  const docListeners = {};
  const winListeners = {};
  /** Journal ordonné : événements rs:track, window.open, location.assign. */
  const log = [];
  const name = new FakeInput({ id: 'contact-name', required: '' });
  const phone = new FakeInput({ id: 'contact-phone', required: '' });
  const city = new FakeInput({ id: 'contact-city' });
  city.value = cityValue;
  const service = new FakeSelect({ id: 'contact-service' });
  const message = new FakeTextArea({ id: 'contact-message' });
  const nameError = new FakeElement('p', { id: 'contact-name-error', class: 'error' });
  const phoneError = new FakeElement('p', { id: 'contact-phone-error', class: 'error' });
  nameError.hidden = phoneError.hidden = true;
  const idle = new FakeElement('span', { class: 'submit-idle' }, [new FakeElement('svg', { 'aria-hidden': 'true' }), new FakeElement('span')]);
  const sendingText = new FakeElement('span');
  sendingText.textContent = SENDING_TEXT;
  const sendingLabel = new FakeElement('span', { class: 'submit-sending' }, [sendingText, new FakeElement('svg', { 'aria-hidden': 'true' })]);
  sendingLabel.hidden = true;
  // textContent d'un conteneur : texte de ses descendants (les SVG n'en ont pas).
  Object.defineProperty(sendingLabel, 'textContent', { get: () => `\n  ${SENDING_TEXT}\n  ` });
  const button = new FakeElement('button', { type: 'submit', class: 'submit' }, [idle, sendingLabel]);
  const sendingStatus = new FakeElement('p', { id: 'contact-sending', class: 'visually-hidden', role: 'status' });
  const offline = new FakeElement('div', { id: 'contact-offline', role: 'alert' });
  const offlineTemplate = new FakeTemplate({ id: 'contact-offline-template' }, offlineContent);
  const sentTitle = new FakeElement('h3', { id: 'contact-sent-title', class: 'status-title', tabindex: '-1' });
  const retry = new FakeElement('a', { id: 'contact-sent-retry', href: 'page-wa' });
  const sentCall = new FakeElement('a', { href: 'tel-link', 'data-track': 'call_click' });
  const sent = new FakeElement('div', { id: 'contact-sent', class: 'form-status sent' }, [
    new FakeElement('svg', { 'aria-hidden': 'true' }),
    sentTitle,
    new FakeElement('p', {}, [retry]),
    new FakeElement('p', {}, [sentCall]),
  ]);
  sent.hidden = true;
  const form = new FakeForm('form', { id: 'contact-form' }, [
    new FakeElement('div', {}, [name, nameError]),
    new FakeElement('div', {}, [phone, phoneError]),
    new FakeElement('div', {}, [city]),
    new FakeElement('div', {}, [service]),
    new FakeElement('div', {}, [message]),
    offline,
    offlineTemplate,
    button,
    sendingStatus,
  ]);
  form.noValidate = false;
  const summary = new FakeElement('div', { id: 'contact-errors', role: 'alert' });
  const template = new FakeTemplate({ id: 'contact-errors-template' }, summaryContent);
  const dataScript = new FakeElement('script', { id: 'rs-data', type: 'application/json' });
  dataScript.textContent = typeof rsData === 'string' ? rsData : JSON.stringify(rsData);
  const body = new FakeElement('body', {}, [...(rsData === null ? [] : [dataScript]), sent, summary, template, ...(withForm ? [form] : [])]);
  const byId = new Map([...body.descendants()].map((el) => [el.id, el]));
  const document = {
    activeElement: body,
    visibilityState: 'visible',
    body,
    getElementById: (id) => byId.get(id) ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => (docListeners[type] ??= []).push(fn),
    dispatchEvent: (event) => {
      assert.ok(event instanceof FakeCustomEvent);
      log.push(['event', event.type, event.detail]);
      return true;
    },
  };
  const popup = { opener: 'contact' };
  Object.assign(globalThis, {
    document,
    location: { href: `https://rs.example/fr/contact/${search}`, search, assign: (href) => log.push(['assign', href]) },
    window: {
      open: (...args) => (log.push(['open', ...args]), blocked ? null : popup),
      matchMedia: (query) => (assert.equal(query, '(pointer: coarse)'), { matches: coarse }),
      addEventListener: (type, fn) => (winListeners[type] ??= []).push(fn),
    },
    CustomEvent: FakeCustomEvent,
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLFormElement: FakeForm,
    HTMLInputElement: FakeInput,
    HTMLSelectElement: FakeSelect,
    HTMLTextAreaElement: FakeTextArea,
    HTMLTemplateElement: FakeTemplate,
  });
  const nav = { onLine: online };
  // Le global `navigator` de Node est un accesseur : redéfini à chaque montage.
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  textWrites = [];
  await import(`${ISLAND_URL}?case=${++round}`);
  const submit = () => {
    const event = { type: 'submit', target: form, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of form.listeners.submit ?? []) fn(event);
    return event;
  };
  const click = (target, init = {}) => {
    const event = { type: 'click', target, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...init, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (let n = target; n; n = n.parent) for (const fn of n.listeners.click ?? []) fn(event);
    for (const fn of docListeners.click ?? []) fn(event);
    return event;
  };
  const links = () => [...summary.descendants()].filter((el) => el.tag === 'a');
  const events = () => log.filter(([kind]) => kind === 'event').map(([, type, detail]) => (assert.equal(type, 'rs:track'), detail));
  const navigations = () => log.filter(([kind]) => kind !== 'event');
  /** Page cachée ou visible (visibilitychange sur document). */
  const visibility = (state) => {
    document.visibilityState = state;
    for (const fn of docListeners.visibilitychange ?? []) fn({ type: 'visibilitychange' });
  };
  const pageshow = (persisted) => {
    for (const fn of winListeners.pageshow ?? []) fn({ type: 'pageshow', persisted });
  };
  /** État d'envoi : [aria-disabled, libellé d'origine visible, libellé d'envoi visible, texte de la région status]. */
  const sending = () => [button.getAttribute('aria-disabled'), !idle.hidden, !sendingLabel.hidden, sendingStatus.textContent];
  return {
    form, name, phone, city, service, message, nameError, phoneError, summary, button, body, document, docListeners, winListeners,
    submit, click, links, log, events, navigations, popup, nav, sent, sentTitle, retry, offline, sendingStatus, visibility, pageshow, sending,
  };
}

/** État d'erreur d'un champ : [aria-invalid, aria-describedby, message visible]. */
const state = (input, message) => [input.getAttribute('aria-invalid'), input.getAttribute('aria-describedby'), !message.hidden];
const ERROR = (id) => ['true', `${id}-error`, true];
const CLEAN = [null, null, false];

test('îlot : noValidate posé ; seul submit écouté sur le formulaire, rien sur les champs, click sur le résumé et Réessayer', async () => {
  const dom = await mountIsland();
  assert.equal(dom.form.noValidate, true);
  assert.deepEqual(Object.keys(dom.form.listeners), ['submit']);
  for (const el of [dom.name, dom.phone, dom.city, dom.button]) assert.deepEqual(Object.keys(el.listeners), [], el.id || el.tag);
  assert.deepEqual(Object.keys(dom.summary.listeners), ['click']);
  assert.deepEqual(Object.keys(dom.retry.listeners), ['click']);
  assert.deepEqual(Object.keys(dom.docListeners), ['visibilitychange']);
  assert.deepEqual(Object.keys(dom.winListeners), ['pageshow']);
});

test('îlot : sans #contact-form, ne fait rien', async () => {
  const dom = await mountIsland({ withForm: false });
  assert.deepEqual(Object.keys(dom.summary.listeners), []);
  assert.equal(dom.form.noValidate, false);
});

test('îlot : deux erreurs → 2 champs aria-invalid, 2 messages, résumé à 2 liens, focus Nom, saisies intactes', async () => {
  const dom = await mountIsland();
  dom.phone.value = '12345';
  dom.city.value = 'Modiin';
  const event = dom.submit();
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(state(dom.name, dom.nameError), ERROR('contact-name'));
  assert.deepEqual(state(dom.phone, dom.phoneError), ERROR('contact-phone'));
  assert.deepEqual(dom.links().map((a) => a.getAttribute('href')), ['#contact-name', '#contact-phone']);
  assert.equal(dom.summary.children[0].getAttribute('class'), 'form-status');
  assert.equal(dom.document.activeElement, dom.name);
  assert.deepEqual([dom.name.value, dom.phone.value, dom.city.value], ['', '12345', 'Modiin']);
  // Renvoi identique : le résumé est remplacé, pas empilé.
  dom.submit();
  assert.equal(dom.summary.children.length, 1);
  assert.equal(dom.links().length, 2);
});

test('îlot : une erreur (téléphone vide) → erreur Téléphone seule, pas de résumé, focus Téléphone', async () => {
  const dom = await mountIsland();
  dom.name.value = 'דנה';
  assert.equal(dom.submit().defaultPrevented, true);
  assert.deepEqual(state(dom.name, dom.nameError), CLEAN);
  assert.deepEqual(state(dom.phone, dom.phoneError), ERROR('contact-phone'));
  assert.equal(dom.summary.children.length, 0);
  assert.equal(dom.document.activeElement, dom.phone);
  assert.deepEqual([dom.name.value, dom.phone.value], ['דנה', '']);
});

test('îlot : correction du Nom puis renvoi → erreur Nom retirée, résumé retiré, focus Téléphone', async () => {
  const dom = await mountIsland();
  dom.phone.value = '12345';
  dom.submit();
  dom.name.value = 'Dana';
  dom.submit();
  assert.deepEqual(state(dom.name, dom.nameError), CLEAN);
  assert.ok(!dom.name.hasAttribute('aria-invalid') && !dom.name.hasAttribute('aria-describedby'));
  assert.deepEqual(state(dom.phone, dom.phoneError), ERROR('contact-phone'));
  assert.equal(dom.summary.children.length, 0);
  assert.equal(dom.document.activeElement, dom.phone);
});

test('îlot : formulaire valide → aucune erreur, aucun résumé, envoi empêché, valeurs intactes, WhatsApp ouvert', async () => {
  const dom = await mountIsland();
  dom.submit();
  dom.name.value = ' Dana ';
  dom.phone.value = '+972 50 123 4567';
  const before = dom.document.activeElement;
  assert.equal(dom.submit().defaultPrevented, true);
  assert.deepEqual(state(dom.name, dom.nameError), CLEAN);
  assert.deepEqual(state(dom.phone, dom.phoneError), CLEAN);
  assert.equal(dom.summary.children.length, 0);
  assert.equal(dom.document.activeElement, before, 'focus inchangé');
  assert.deepEqual([dom.name.value, dom.phone.value], [' Dana ', '+972 50 123 4567']);
  assert.equal(dom.navigations().length, 1);
});

test('îlot : clic sur le lien Téléphone du résumé → preventDefault, focus Téléphone ; clic hors lien sans effet', async () => {
  const dom = await mountIsland();
  dom.submit();
  const [nameLink, phoneLink] = dom.links();
  const event = dom.click(phoneLink);
  assert.equal(event.defaultPrevented, true);
  assert.equal(dom.document.activeElement, dom.phone);
  dom.click(nameLink);
  assert.equal(dom.document.activeElement, dom.name);
  const title = [...dom.summary.descendants()].find((el) => el.tag === 'h3');
  dom.document.activeElement = dom.body;
  assert.equal(dom.click(title).defaultPrevented, false);
  assert.equal(dom.document.activeElement, dom.body);
});

// — Story 2.3 : présélection, message, ouverture, événements —

const fill = (dom, { name = 'Dana', phone = '050-123-4567', city = '', message = '' } = {}) => {
  dom.name.value = name;
  dom.phone.value = phone;
  dom.city.value = city;
  dom.message.value = message;
};

test('présélection : ?service=cameras → select cameras ; inconnu ou absent → select intact (unsure)', async () => {
  for (const [search, expected] of [['?service=cameras', 'cameras'], ['?service=xyz', 'unsure'], ['', 'unsure'], ['?service=toString', 'unsure'], ['?service=__proto__', 'unsure']]) {
    const dom = await mountIsland({ search });
    assert.equal(dom.service.value, expected, search);
  }
});

test('présélection : from_service_param vrai pour un code connu, faux pour un code inconnu ou absent', async () => {
  for (const [search, expected] of [['?service=cameras', true], ['?service=unsure', true], ['?service=xyz', false], ['', false]]) {
    const dom = await mountIsland({ search });
    fill(dom);
    dom.submit();
    assert.equal(dom.events()[0].data.from_service_param, expected, search);
  }
});

test('présélection : ?city= connu → champ vide prérempli ; champ déjà rempli intact ; code inconnu ignoré', async () => {
  const rsData = { ...RS_DATA, cities: CITIES };
  assert.equal((await mountIsland({ rsData, search: '?city=modiin' })).city.value, 'Modiin');
  assert.equal((await mountIsland({ rsData, search: '?city=modiin', city: 'Lod' })).city.value, 'Lod');
  assert.equal((await mountIsland({ rsData, search: '?city=xyz' })).city.value, '');
  assert.equal((await mountIsland({ rsData, search: '?city=constructor' })).city.value, '');
});

test('envoi valide sur desktop : window.open(waHref attendu, _blank), opener retiré, form_submit avant', async () => {
  const dom = await mountIsland({ search: '?service=cameras' });
  fill(dom, { name: ' Dana ', city: 'מודיעין', message: '6 caméras' });
  dom.submit();
  const href = waHref({ serviceHe: 'מצלמות אבטחה', cityHe: 'מודיעין', lines: formLines({ name: 'Dana', phone: '050-123-4567', message: '6 caméras' }), quote: true });
  assert.deepEqual(dom.log, [
    ['event', 'rs:track', { name: 'form_submit', data: { lang: 'fr', service: 'cameras', from_service_param: true, city_filled: true } }],
    ['open', href, '_blank'],
  ]);
  assert.equal(dom.popup.opener, null);
  assert.deepEqual([dom.name.value, dom.city.value, dom.message.value, dom.service.value], [' Dana ', 'מודיעין', '6 caméras', 'cameras']);
});

test('envoi valide : unsure et ville libre hors liste → message sans service, ville telle quelle', async () => {
  const dom = await mountIsland();
  fill(dom, { city: ' Lod ' });
  dom.submit();
  const href = waHref({ cityHe: 'Lod', lines: formLines({ name: 'Dana', phone: '050-123-4567', message: '' }), quote: true });
  assert.deepEqual(dom.navigations(), [['open', href, '_blank']]);
  assert.deepEqual(dom.events(), [{ name: 'form_submit', data: { lang: 'fr', service: 'unsure', from_service_param: false, city_filled: true } }]);
});

test('envoi valide : ville venue de ?city= → hébreu par code ; service choisi à la main', async () => {
  const dom = await mountIsland({ rsData: { ...RS_DATA, cities: CITIES }, search: '?city=modiin' });
  fill(dom, { city: dom.city.value });
  dom.service.value = 'smoke-detectors';
  dom.submit();
  const href = waHref({ serviceHe: 'גלאי עשן', cityHe: 'מודיעין', lines: formLines({ name: 'Dana', phone: '050-123-4567', message: '' }), quote: true });
  assert.deepEqual(dom.navigations(), [['open', href, '_blank']]);
  assert.deepEqual(dom.events()[0].data, { lang: 'fr', service: 'smoke-detectors', from_service_param: false, city_filled: true });
});

test('story 4.2 : ?city=ashdod → champ « Ashdod », message WhatsApp « …הצעת מחיר באשדוד. »', async () => {
  const dom = await mountIsland({ rsData: { ...RS_DATA, cities: CITIES }, search: '?city=ashdod' });
  assert.equal(dom.city.value, 'Ashdod');
  fill(dom, { city: dom.city.value });
  dom.submit();
  const href = waHref({ cityHe: 'אשדוד', lines: formLines({ name: 'Dana', phone: '050-123-4567', message: '' }), quote: true });
  assert.deepEqual(dom.navigations(), [['open', href, '_blank']]);
  assert.ok(decodeURIComponent(href).includes('הצעת מחיר באשדוד.'), 'message WhatsApp');
});

test('envoi valide sur appareil tactile : location.assign dans le même onglet, rien d’ouvert', async () => {
  const dom = await mountIsland({ coarse: true });
  fill(dom, { city: '   ' });
  dom.submit();
  const href = waHref({ lines: formLines({ name: 'Dana', phone: '050-123-4567', message: '' }), quote: true });
  assert.deepEqual(dom.log.map(([kind]) => kind), ['event', 'assign']);
  assert.deepEqual(dom.navigations(), [['assign', href]]);
  assert.equal(dom.events()[0].data.city_filled, false);
});

test('envoi valide « pas encore sûr » sans ville : la phrase de demande de devis reste (décision D5)', async () => {
  const dom = await mountIsland();
  fill(dom, { city: '' });
  dom.submit();
  const [[, href]] = dom.navigations();
  assert.equal(
    decodeURIComponent(href.slice(href.indexOf('?text=') + '?text='.length)),
    'שלום RS SYSTEM, הגעתי מהאתר. אשמח לקבל הצעת מחיר.\nשם: Dana\nטלפון: 050-123-4567\nהודעה: —',
  );
});

test('envoi valide sur desktop, popup bloquée : location.assign après window.open', async () => {
  const dom = await mountIsland({ blocked: true });
  fill(dom);
  dom.submit();
  const href = waHref({ lines: formLines({ name: 'Dana', phone: '050-123-4567', message: '' }), quote: true });
  assert.deepEqual(dom.navigations(), [['open', href, '_blank'], ['assign', href]]);
});

test('form_error à l’envoi invalide (champs joints par ,), rien n’est ouvert ; puis form_submit une fois corrigé', async () => {
  const dom = await mountIsland();
  fill(dom, { name: '', phone: '12345', message: 'secret' });
  dom.submit();
  assert.deepEqual(dom.events(), [{ name: 'form_error', data: { lang: 'fr', fields: 'name,phone' } }]);
  assert.deepEqual(dom.navigations(), []);
  dom.name.value = 'Dana';
  dom.submit();
  assert.deepEqual(dom.events()[1], { name: 'form_error', data: { lang: 'fr', fields: 'phone' } });
  dom.phone.value = '050-123-4567';
  dom.submit();
  assert.deepEqual(dom.events().map((d) => d.name), ['form_error', 'form_error', 'form_submit']);
  assert.deepEqual(Object.keys(dom.events()[2].data), ['lang', 'service', 'from_service_param', 'city_filled']);
});

test('aucun détail ne contient le nom, le téléphone, la ville saisie ou le message', async () => {
  const dom = await mountIsland({ search: '?service=smart-home' });
  fill(dom, { name: 'Yossi Cohen', phone: '', city: 'Rehovot', message: 'Deux caméras au portail' });
  dom.submit();
  dom.phone.value = '+972 50 123 4567';
  dom.submit();
  const serialized = JSON.stringify(dom.events());
  for (const secret of ['Yossi', 'Cohen', '972', '123', 'Rehovot', 'caméras', 'portail']) assert.ok(!serialized.includes(secret), secret);
  assert.equal(dom.events().length, 2);
});

test('sans #rs-data (absent ou illisible) : validation intacte, rien n’est ouvert, aucun événement, select intact', async () => {
  for (const rsData of [null, '{oops', '{}', JSON.stringify({ context: { lang: 'fr' } })]) {
    const dom = await mountIsland({ rsData, search: '?service=cameras' });
    assert.equal(dom.service.value, 'unsure', String(rsData));
    dom.submit();
    assert.deepEqual(state(dom.name, dom.nameError), ERROR('contact-name'));
    assert.equal(dom.document.activeElement, dom.name);
    fill(dom);
    dom.submit();
    assert.deepEqual(state(dom.name, dom.nameError), CLEAN);
    assert.deepEqual(dom.log, [], String(rsData));
  }
});

// — Story 2.4 : envoi, retour, Réessayer, hors ligne —

const IDLE = [null, true, false, ''];
const SENDING = ['true', false, true, SENDING_TEXT];
const values = (dom) => [dom.name.value, dom.phone.value, dom.city.value, dom.message.value, dom.service.value];
const FILLED = { name: ' Dana ', phone: '050-123-4567', city: 'Lod', message: 'Deux caméras' };
const FILLED_VALUES = [' Dana ', '050-123-4567', 'Lod', 'Deux caméras', 'unsure'];

test('envoi valide en ligne : aria-disabled, libellé d’envoi, région status remplie, window.open ; focus inchangé', async () => {
  const dom = await mountIsland();
  fill(dom, FILLED);
  dom.document.activeElement = dom.button;
  dom.submit();
  assert.deepEqual(dom.sending(), SENDING);
  assert.equal(dom.button.hasAttribute('disabled'), false);
  assert.equal(dom.document.activeElement, dom.button);
  assert.deepEqual(dom.navigations().map(([kind]) => kind), ['open']);
  assert.deepEqual(values(dom), FILLED_VALUES);
  assert.equal(dom.sent.hidden, true);
  mock.timers.tick(3000);
});

test('double envoi dans les 3 s : ignoré (1 form_submit, 1 ouverture) ; après 3 s, bouton actif, pas de confirmation', async () => {
  const dom = await mountIsland();
  fill(dom);
  dom.submit();
  mock.timers.tick(2999);
  dom.name.value = '';
  assert.equal(dom.submit().defaultPrevented, true);
  assert.equal(dom.nameError.hidden, true, 'aucune validation pendant l’envoi');
  assert.equal(dom.events().length, 1);
  assert.equal(dom.navigations().length, 1);
  assert.deepEqual(dom.sending(), SENDING);
  mock.timers.tick(1);
  assert.deepEqual(dom.sending(), IDLE);
  assert.equal(dom.sent.hidden, true);
  // Bouton de nouveau actif : un envoi est accepté.
  dom.name.value = 'Dana';
  dom.submit();
  assert.equal(dom.navigations().length, 2);
  mock.timers.tick(3000);
});

test('retour (hidden puis visible) : confirmation visible, focus sur son titre, bouton actif, saisies intactes, Réessayer = même lien', async () => {
  const dom = await mountIsland({ search: '?service=cameras' });
  fill(dom, FILLED);
  dom.submit();
  const href = dom.navigations()[0][1];
  dom.visibility('hidden');
  assert.equal(dom.sent.hidden, true);
  dom.visibility('visible');
  assert.equal(dom.sent.hidden, false);
  assert.equal(dom.document.activeElement, dom.sentTitle);
  // Recette epic 2 (D6) : le bloc est amené à l'écran, puis le focus est posé sans second défilement.
  assert.deepEqual(dom.sent.scrolls, [{ block: 'nearest' }]);
  assert.deepEqual(dom.sentTitle.focusOptions, { preventScroll: true });
  assert.deepEqual(dom.sending(), IDLE);
  assert.deepEqual(values(dom), [...FILLED_VALUES.slice(0, 4), 'cameras']);
  assert.equal(dom.retry.getAttribute('href'), href);
  // Minuteur annulé : rien ne change à 3 s ; retour suivant sans nouvel envoi sans effet.
  mock.timers.tick(3000);
  assert.deepEqual(dom.sending(), IDLE);
  dom.document.activeElement = dom.body;
  dom.visibility('hidden');
  dom.visibility('visible');
  assert.equal(dom.document.activeElement, dom.body);
});

test('retour par pageshow persisted : confirmation ; pageshow non persisted sans effet', async () => {
  const dom = await mountIsland({ coarse: true });
  fill(dom);
  dom.submit();
  dom.pageshow(false);
  assert.equal(dom.sent.hidden, true);
  assert.deepEqual(dom.sending(), SENDING);
  dom.pageshow(true);
  assert.equal(dom.sent.hidden, false);
  assert.equal(dom.document.activeElement, dom.sentTitle);
  assert.deepEqual(dom.sending(), IDLE);
});

test('visible sans hidden préalable, ou sans envoi : rien', async () => {
  const dom = await mountIsland();
  dom.visibility('hidden');
  dom.visibility('visible');
  dom.pageshow(true);
  assert.equal(dom.sent.hidden, true);
  fill(dom);
  dom.submit();
  dom.visibility('visible');
  assert.equal(dom.sent.hidden, true);
  assert.notEqual(dom.document.activeElement, dom.sentTitle);
  mock.timers.tick(3000);
});

test('Réessayer : clic principal → openWhatsApp(même lien), aucun événement, retour de nouveau attendu ; clic modifié natif', async () => {
  const dom = await mountIsland();
  fill(dom);
  dom.submit();
  const href = dom.navigations()[0][1];
  dom.visibility('hidden');
  dom.visibility('visible');
  const before = dom.events().length;
  const event = dom.click(dom.retry);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(dom.navigations(), [['open', href, '_blank'], ['open', href, '_blank']]);
  assert.equal(dom.events().length, before);
  dom.document.activeElement = dom.body;
  dom.visibility('hidden');
  dom.visibility('visible');
  assert.equal(dom.document.activeElement, dom.sentTitle);
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    assert.equal(dom.click(dom.retry, init).defaultPrevented, false, JSON.stringify(init));
  }
  assert.equal(dom.navigations().length, 2);
});

test('Réessayer sur appareil tactile : même onglet', async () => {
  const dom = await mountIsland({ coarse: true });
  fill(dom);
  dom.submit();
  dom.pageshow(true);
  dom.click(dom.retry);
  const href = dom.navigations()[0][1];
  assert.deepEqual(dom.navigations(), [['assign', href], ['assign', href]]);
});

test('hors ligne : bloc alerte dans #contact-offline, rien d’ouvert, aucun form_submit, pas d’état d’envoi ; renvoi en ligne → bloc retiré, WhatsApp ouvert', async () => {
  const dom = await mountIsland({ online: false });
  fill(dom, FILLED);
  dom.document.activeElement = dom.button;
  dom.submit();
  assert.equal(dom.offline.children.length, 1);
  assert.equal(dom.offline.children[0].getAttribute('class'), 'form-status');
  assert.ok([...dom.offline.descendants()].some((el) => el.tag === 'a' && el.getAttribute('data-track') === 'call_click'));
  assert.deepEqual(dom.log, []);
  assert.deepEqual(dom.sending(), IDLE);
  assert.equal(dom.document.activeElement, dom.button);
  assert.deepEqual(values(dom), FILLED_VALUES);
  // Second envoi hors ligne : bloc remplacé, pas empilé.
  dom.submit();
  assert.equal(dom.offline.children.length, 1);
  dom.nav.onLine = true;
  dom.submit();
  assert.equal(dom.offline.children.length, 0);
  assert.deepEqual(dom.navigations().map(([kind]) => kind), ['open']);
  assert.deepEqual(dom.events().map((d) => d.name), ['form_submit']);
  mock.timers.tick(3000);
});

test('hors ligne, formulaire invalide : erreurs 2.2, aucun bloc hors ligne', async () => {
  const dom = await mountIsland({ online: false });
  dom.submit();
  assert.equal(dom.offline.children.length, 0);
  assert.deepEqual(dom.events().map((d) => d.name), ['form_error']);
});

test('envoi invalide après une confirmation : confirmation cachée, #contact-offline vide, form_error', async () => {
  const dom = await mountIsland();
  fill(dom);
  dom.submit();
  dom.visibility('hidden');
  dom.visibility('visible');
  assert.equal(dom.sent.hidden, false);
  dom.phone.value = '12345';
  dom.submit();
  assert.equal(dom.sent.hidden, true);
  assert.equal(dom.offline.children.length, 0);
  assert.deepEqual(dom.events().map((d) => d.name), ['form_submit', 'form_error']);
  assert.equal(dom.phone.value, '12345');
});

test('aucun texte posé par l’îlot hors copie du libellé d’envoi dans #contact-sending', async () => {
  const dom = await mountIsland();
  fill(dom);
  dom.submit();
  mock.timers.tick(3000);
  dom.submit();
  dom.visibility('hidden');
  dom.visibility('visible');
  dom.nav.onLine = false;
  dom.submit();
  assert.ok(textWrites.length > 0);
  for (const [id, value] of textWrites) {
    assert.equal(id, 'contact-sending');
    assert.ok(value === SENDING_TEXT || value === '', value);
  }
});

test('attente expirée : page non cachée dans les 3 s après l’envoi → hidden puis visible plus tard sans confirmation, focus inchangé', async () => {
  const dom = await mountIsland();
  fill(dom);
  dom.submit();
  mock.timers.tick(3000);
  dom.document.activeElement = dom.body;
  dom.visibility('hidden');
  dom.visibility('visible');
  assert.equal(dom.sent.hidden, true);
  assert.equal(dom.document.activeElement, dom.body);
});

test('attente expirée après Réessayer : même délai de 3 s', async () => {
  const dom = await mountIsland();
  fill(dom);
  dom.submit();
  dom.visibility('hidden');
  dom.visibility('visible');
  dom.click(dom.retry);
  mock.timers.tick(3000);
  dom.document.activeElement = dom.body;
  dom.visibility('hidden');
  dom.visibility('visible');
  assert.equal(dom.document.activeElement, dom.body);
});
