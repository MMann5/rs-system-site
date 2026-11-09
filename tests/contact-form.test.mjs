// Story 2.2 (FR28, FR33, UX-DR29, AD-14) : îlot du formulaire de Contact. Source qui n'importe que le noyau
// pur ../lib/contact/core.ts ; comportement (validation à l'envoi, ARIA, focus, résumé, liens) sur un DOM
// factice minimal. L'îlot s'exécute à l'import : chaque cas l'importe à neuf (?case=n) après avoir posé
// les globaux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

test('src/scripts/contact-form.ts n’importe que ../lib/contact/core.ts (aucun astro:)', () => {
  assert.ok(existsSync(ISLAND), 'src/scripts/contact-form.ts absent');
  const { specs, astro } = islandImports(readFileSync(ISLAND, 'utf8'));
  assert.deepEqual(specs, ['../lib/contact/core.ts']);
  assert.equal(astro, false);
});

// — DOM factice —

class FakeElement {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.parent = null;
    this.children = [];
    this.listeners = {};
    this.hidden = false;
    this.append(...children);
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
  /** Sélecteur utilisé par l'îlot : `[data-field]`. */
  querySelectorAll(selector) {
    assert.equal(selector, '[data-field]');
    return [...this.descendants()].filter((el) => el.hasAttribute('data-field'));
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
  focus() {
    globalThis.document.activeElement = this;
  }
}
class FakeForm extends FakeElement {}
class FakeInput extends FakeElement {
  constructor(attrs) {
    super('input', attrs);
    this.value = '';
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

let round = 0;

async function mountIsland({ withForm = true } = {}) {
  const docListeners = {};
  const name = new FakeInput({ id: 'contact-name', required: '' });
  const phone = new FakeInput({ id: 'contact-phone', required: '' });
  const city = new FakeInput({ id: 'contact-city' });
  const nameError = new FakeElement('p', { id: 'contact-name-error', class: 'error' });
  const phoneError = new FakeElement('p', { id: 'contact-phone-error', class: 'error' });
  nameError.hidden = phoneError.hidden = true;
  const button = new FakeElement('button', { type: 'submit' });
  const form = new FakeForm('form', { id: 'contact-form' }, [
    new FakeElement('div', {}, [name, nameError]),
    new FakeElement('div', {}, [phone, phoneError]),
    new FakeElement('div', {}, [city]),
    button,
  ]);
  form.noValidate = false;
  const summary = new FakeElement('div', { id: 'contact-errors', role: 'alert' });
  const template = new FakeTemplate({ id: 'contact-errors-template' }, summaryContent);
  const body = new FakeElement('body', {}, [summary, template, ...(withForm ? [form] : [])]);
  const byId = new Map([...body.descendants()].map((el) => [el.id, el]));
  const document = {
    activeElement: body,
    body,
    getElementById: (id) => byId.get(id) ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => (docListeners[type] ??= []).push(fn),
  };
  Object.assign(globalThis, {
    document,
    location: { href: 'https://rs.example/fr/contact/', search: '' },
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLFormElement: FakeForm,
    HTMLInputElement: FakeInput,
    HTMLTemplateElement: FakeTemplate,
  });
  await import(`${ISLAND_URL}?case=${++round}`);
  const submit = () => {
    const event = { type: 'submit', target: form, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of form.listeners.submit ?? []) fn(event);
    return event;
  };
  const click = (target) => {
    const event = { type: 'click', target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (let n = target; n; n = n.parent) for (const fn of n.listeners.click ?? []) fn(event);
    for (const fn of docListeners.click ?? []) fn(event);
    return event;
  };
  const links = () => [...summary.descendants()].filter((el) => el.tag === 'a');
  return { form, name, phone, city, nameError, phoneError, summary, button, body, document, docListeners, submit, click, links };
}

/** État d'erreur d'un champ : [aria-invalid, aria-describedby, message visible]. */
const state = (input, message) => [input.getAttribute('aria-invalid'), input.getAttribute('aria-describedby'), !message.hidden];
const ERROR = (id) => ['true', `${id}-error`, true];
const CLEAN = [null, null, false];

test('îlot : noValidate posé ; seul submit écouté sur le formulaire, rien sur les champs, click sur le résumé', async () => {
  const dom = await mountIsland();
  assert.equal(dom.form.noValidate, true);
  assert.deepEqual(Object.keys(dom.form.listeners), ['submit']);
  for (const el of [dom.name, dom.phone, dom.city, dom.button]) assert.deepEqual(Object.keys(el.listeners), [], el.id || el.tag);
  assert.deepEqual(Object.keys(dom.summary.listeners), ['click']);
  assert.deepEqual(Object.keys(dom.docListeners), []);
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

test('îlot : formulaire valide → aucune erreur, aucun résumé, envoi empêché, valeurs intactes', async () => {
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
