// Story 7.1 (AD-6, AD-10, FR34, FR35, NFR8) : îlot de mesure src/scripts/track.ts, seul à appeler Umami.
// DOM factice + faux Umami injecté (aucun réseau) : chaque ligne de la matrice I/O de la spec, propriétés exactes
// envoyées (aucune autre clé), file d'attente vidée au `load` du script Umami, rappel `done` unique.
// L'îlot s'exécute à l'import : chaque cas l'importe à neuf (?case=n) après avoir posé les globaux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ISLAND_URL = new URL('../src/scripts/track.ts', import.meta.url).href;
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('track.ts n’importe que ../lib/track-events.ts', () => {
  const src = stripComments(readFileSync(fileURLToPath(ISLAND_URL), 'utf8'));
  const specs = [...src.matchAll(/(?:^|[^\w$.])import\b[\s\S]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(specs, ['../lib/track-events.ts']);
  assert.doesNotMatch(src, /\brequire\s*\(|astro:|\bimport\s*\(/);
});

test('AD-6 : aucun autre fichier de src/ ne parle à Umami (umami.track, window.umami)', () => {
  const files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
  const offenders = files(join(ROOT, 'src'))
    .filter((f) => /\.(?:ts|astro|js|mjs)$/.test(f))
    .filter((f) => /\bumami\s*(?:\??\.)\s*track\b|window\.umami\b|\bumami\?:/.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => relative(ROOT, f).split(sep).join('/'));
  assert.deepEqual(offenders, ['src/scripts/track.ts']);
});

// — DOM factice —

class FakeElement {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.parent = null;
    this.listeners = {};
    for (const child of children) child.parent = this;
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) {
    return this.attrs.has(name);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  fire(type) {
    for (const fn of this.listeners[type] ?? []) fn({ type, target: this });
  }
  /** Seul sélecteur utilisé par l'îlot : `a[data-track][data-placement]`. */
  closest(selector) {
    assert.equal(selector, 'a[data-track][data-placement]');
    for (let n = this; n; n = n.parent) if (n.tag === 'a' && n.hasAttribute('data-track') && n.hasAttribute('data-placement')) return n;
    return null;
  }
}

/** Faux Umami : journal des appels ; `mode` = resolve | reject | throw | sync. */
function fakeUmami(mode = 'resolve') {
  const calls = [];
  return {
    calls,
    track(name, data) {
      calls.push([name, data]);
      if (mode === 'throw') throw new Error('umami');
      if (mode === 'reject') return Promise.reject(new Error('réseau'));
      if (mode === 'sync') return undefined;
      return Promise.resolve();
    },
  };
}

let round = 0;

/**
 * umami : faux Umami posé sur window avant l'import (ou undefined). script : script Umami présent dans le <head>.
 * lang, pageId : attributs de <html>. search : location.search.
 */
async function mountIsland({ umami, script = umami !== undefined, lang = 'he', pageId = 'cameras', search = '', readyState = 'loading' } = {}) {
  const listeners = {};
  const umamiScript = script ? new FakeElement('script', { src: 'https://cloud.umami.is/script.js', 'data-website-id': 'test-id' }) : null;
  const html = new FakeElement('html', { lang, 'data-page-id': pageId });
  const document = {
    readyState,
    documentElement: html,
    querySelector: (sel) => (assert.equal(sel, 'script[data-website-id]'), umamiScript),
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
  };
  const window = umami ? { umami } : {};
  const location = { href: `https://rs.example/he/${search}`, search };
  Object.assign(globalThis, { document, window, location, Element: FakeElement });
  await import(`${ISLAND_URL}?case=${++round}`);
  const click = (target) => {
    for (const fn of listeners.click ?? []) fn({ type: 'click', target });
  };
  const emit = (detail) => {
    const event = new CustomEvent('rs:track', { detail });
    for (const fn of listeners['rs:track'] ?? []) fn(event);
  };
  return { window, document, location, umamiScript, click, emit, listeners };
}

/** Lien mesuré (enfant `span`, cible réelle d'un clic sur le libellé). */
function link(attrs) {
  const span = new FakeElement('span');
  const a = new FakeElement('a', attrs, [span]);
  return { a, span };
}

/** Laisse passer les microtâches (résolution / rejet de umami.track). */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Rappel qui compte ses appels. */
function counter() {
  const done = () => {
    done.count += 1;
  };
  done.count = 0;
  return done;
}

const SUBMIT = { lang: 'he', service: 'cameras', from_service_param: true, city_filled: false };

test('clic mesuré : call_click hero → umami.track une fois avec { page, lang, placement } exactement', async () => {
  const umami = fakeUmami();
  const dom = await mountIsland({ umami });
  const { span } = link({ href: 'x', 'data-track': 'call_click', 'data-placement': 'hero' });
  dom.click(span);
  assert.deepEqual(umami.calls, [['call_click', { page: 'cameras', lang: 'he', placement: 'hero' }]]);
});

test('clic mesuré : whatsapp_click sur chacun des 10 emplacements, page ville en russe', async () => {
  const umami = fakeUmami();
  await mountIsland({ umami, lang: 'ru', pageId: 'city:modiin' }).then((dom) => {
    const placements = ['header', 'hero', 'tile', 'mobile_bar', 'contact_band', 'contact_page', 'article_box', 'footer', '404', 'mobile_menu'];
    for (const placement of placements) dom.click(link({ 'data-track': 'whatsapp_click', 'data-placement': placement }).a);
    assert.deepEqual(umami.calls, placements.map((placement) => ['whatsapp_click', { page: 'city:modiin', lang: 'ru', placement }]));
  });
});

test('valeur hors liste ou absente : rien envoyé, sans exception', async () => {
  const umami = fakeUmami();
  const dom = await mountIsland({ umami });
  dom.click(link({ 'data-track': 'call_click', 'data-placement': 'sidebar' }).a);
  dom.click(link({ 'data-track': 'phone_click', 'data-placement': 'hero' }).a);
  dom.click(link({ 'data-track': 'form_submit', 'data-placement': 'hero' }).a);
  dom.click(link({ 'data-track': 'call_click' }).a);
  dom.click(link({ 'data-placement': 'hero' }).a);
  dom.click(new FakeElement('div'));
  dom.click(null);
  dom.click({ notAnElement: true });
  assert.deepEqual(umami.calls, []);
});

test('Réessayer (2.4) : lien sans data-track → aucun événement', async () => {
  const umami = fakeUmami();
  const dom = await mountIsland({ umami });
  dom.click(link({ id: 'contact-sent-retry', href: 'wa-link' }).span);
  assert.deepEqual(umami.calls, []);
});

test('rs:track form_submit : { page, lang, ...data } exactement, puis done une fois à la résolution', async () => {
  const umami = fakeUmami();
  const dom = await mountIsland({ umami, lang: 'fr', pageId: 'contact' });
  const done = counter();
  dom.emit({ name: 'form_submit', data: { ...SUBMIT, lang: 'fr' }, done });
  assert.deepEqual(umami.calls, [['form_submit', { page: 'contact', lang: 'fr', service: 'cameras', from_service_param: true, city_filled: false }]]);
  assert.equal(done.count, 0, 'pas avant la résolution');
  await settle();
  assert.equal(done.count, 1);
});

test('rs:track : done aussi si umami.track rejette, lève, ou rend autre chose qu’une promesse ; jamais deux fois', async () => {
  for (const mode of ['reject', 'throw', 'sync']) {
    const umami = fakeUmami(mode);
    const dom = await mountIsland({ umami });
    const done = counter();
    dom.emit({ name: 'form_submit', data: SUBMIT, done });
    await settle();
    assert.equal(done.count, 1, mode);
    assert.equal(umami.calls.length, 1, mode);
  }
});

test('rs:track : un done qui lève ne casse pas l’îlot', async () => {
  const umami = fakeUmami('sync');
  const dom = await mountIsland({ umami });
  dom.emit({ name: 'form_submit', data: SUBMIT, done: () => {
    throw new Error('appelant');
  } });
  dom.emit({ name: 'form_error', data: { lang: 'he', fields: 'phone' } });
  assert.deepEqual(umami.calls.map(([name]) => name), ['form_submit', 'form_error']);
});

test('rs:track form_error : { page, lang, fields } exactement', async () => {
  const umami = fakeUmami();
  const dom = await mountIsland({ umami });
  dom.emit({ name: 'form_error', data: { lang: 'he', fields: 'name,phone' } });
  assert.deepEqual(umami.calls, [['form_error', { page: 'cameras', lang: 'he', fields: 'name,phone' }]]);
});

test('rs:track language_switch : { page, lang, from, to, placement } exactement ; emplacement hors liste : rien', async () => {
  const umami = fakeUmami();
  const dom = await mountIsland({ umami });
  dom.emit({ name: 'language_switch', data: { page: 'cameras', from: 'he', to: 'ru', placement: 'footer' } });
  assert.deepEqual(umami.calls, [['language_switch', { page: 'cameras', lang: 'he', from: 'he', to: 'ru', placement: 'footer' }]]);
  dom.emit({ name: 'language_switch', data: { page: 'cameras', from: 'he', to: 'ru', placement: 'header' } });
  assert.equal(umami.calls.length, 1);
});

test('NFR8 : champs hors liste du détail (nom, téléphone, ville, message, href, objets) jamais envoyés', async () => {
  const umami = fakeUmami();
  const dom = await mountIsland({ umami });
  dom.emit({
    name: 'form_submit',
    data: { ...SUBMIT, name: 'Dana', phone: '050-123-4567', city: 'Lod', message: 'secret', href: 'wa-link', nested: { a: 1 } },
  });
  dom.emit({ name: 'form_error', data: { lang: 'he', fields: { phone: '050' } } });
  assert.deepEqual(umami.calls, [
    ['form_submit', { page: 'cameras', lang: 'he', service: 'cameras', from_service_param: true, city_filled: false }],
    ['form_error', { page: 'cameras', lang: 'he' }],
  ]);
  const serialized = JSON.stringify(umami.calls);
  for (const secret of ['Dana', '050-123-4567', 'Lod', 'secret', 'wa-link']) assert.ok(!serialized.includes(secret), secret);
});

test('rs:track invalide (nom inconnu, call_click, sans data, détail nul) : rien envoyé, chaque done appelé une fois', async () => {
  const umami = fakeUmami();
  const dom = await mountIsland({ umami });
  const dones = [counter(), counter(), counter()];
  dom.emit({ name: 'page_view', data: {}, done: dones[0] });
  dom.emit({ name: 'call_click', data: { placement: 'hero' }, done: dones[1] });
  dom.emit({ name: 'form_submit', done: dones[2] });
  dom.emit(null);
  dom.emit(undefined);
  assert.deepEqual(umami.calls, []);
  assert.deepEqual(dones.map((d) => d.count), [1, 1, 1]);
});

test('Umami absent (non indexable, aucun script) : rien envoyé, done appelé tout de suite, aucune exception', async () => {
  const dom = await mountIsland({ umami: undefined, script: false });
  const done = counter();
  dom.emit({ name: 'form_submit', data: SUBMIT, done });
  assert.equal(done.count, 1);
  dom.click(link({ 'data-track': 'call_click', 'data-placement': 'hero' }).a);
  assert.equal(dom.window.umami, undefined);
});

test('script Umami déjà passé (bloqué) avant l’îlot, readyState interactive : done tout de suite, rien envoyé ni gardé', async () => {
  const dom = await mountIsland({ umami: undefined, script: true, readyState: 'interactive' });
  const done = counter();
  dom.emit({ name: 'form_submit', data: SUBMIT, done });
  assert.equal(done.count, 1, 'done immédiat');
  // Un load tardif ne renvoie rien : la file est vide.
  const umami = fakeUmami();
  dom.window.umami = umami;
  dom.umamiScript.fire('load');
  assert.deepEqual(umami.calls, []);
  assert.equal(done.count, 1);
});

test('Umami pas encore chargé : événements gardés puis envoyés dans l’ordre au load du script, done à la résolution', async () => {
  const dom = await mountIsland({ umami: undefined, script: true });
  const done = counter();
  dom.click(link({ 'data-track': 'call_click', 'data-placement': 'header' }).a);
  dom.emit({ name: 'form_submit', data: SUBMIT, done });
  assert.equal(done.count, 0, 'en attente du script');
  const umami = fakeUmami();
  dom.window.umami = umami;
  dom.umamiScript.fire('load');
  assert.deepEqual(umami.calls, [
    ['call_click', { page: 'cameras', lang: 'he', placement: 'header' }],
    ['form_submit', { page: 'cameras', lang: 'he', ...SUBMIT }],
  ]);
  await settle();
  assert.equal(done.count, 1);
  // Après le load : envoi direct.
  dom.click(link({ 'data-track': 'whatsapp_click', 'data-placement': 'footer' }).a);
  assert.equal(umami.calls.length, 3);
});

test('file : au-delà de 20, les plus anciens sont perdus (leur done appelé) ; les 20 derniers envoyés au load', async () => {
  const dom = await mountIsland({ umami: undefined, script: true });
  const dones = Array.from({ length: 25 }, counter);
  dones.forEach((done, i) => dom.emit({ name: 'form_error', data: { lang: 'he', fields: `f${i}` }, done }));
  assert.deepEqual(dones.map((d) => d.count), [1, 1, 1, 1, 1, ...Array(20).fill(0)]);
  const umami = fakeUmami('sync');
  dom.window.umami = umami;
  dom.umamiScript.fire('load');
  assert.deepEqual(umami.calls.map(([, data]) => data.fields), Array.from({ length: 20 }, (_, i) => `f${i + 5}`));
  assert.ok(dones.every((d) => d.count === 1));
});

test('script Umami en erreur (bloqué) : file abandonnée, done appelés, puis plus rien n’est gardé', async () => {
  const dom = await mountIsland({ umami: undefined, script: true });
  const done = counter();
  dom.emit({ name: 'form_submit', data: SUBMIT, done });
  dom.umamiScript.fire('error');
  assert.equal(done.count, 1);
  const later = counter();
  dom.emit({ name: 'form_submit', data: SUBMIT, done: later });
  assert.equal(later.count, 1, 'appel immédiat après l’échec du script');
});

test('load sans window.umami : file abandonnée, done appelés', async () => {
  const dom = await mountIsland({ umami: undefined, script: true });
  const done = counter();
  dom.emit({ name: 'form_submit', data: SUBMIT, done });
  dom.umamiScript.fire('load');
  assert.equal(done.count, 1);
});

test('FR35 : visite /he/?utm_source=van&utm_medium=qr → call_click envoyé, requête laissée dans l’URL, aucune propriété utm', async () => {
  const umami = fakeUmami();
  const dom = await mountIsland({ umami, search: '?utm_source=van&utm_medium=qr', pageId: 'home' });
  dom.click(link({ 'data-track': 'call_click', 'data-placement': 'hero' }).a);
  assert.deepEqual(umami.calls, [['call_click', { page: 'home', lang: 'he', placement: 'hero' }]]);
  assert.equal(dom.location.search, '?utm_source=van&utm_medium=qr');
  assert.equal(dom.location.href, 'https://rs.example/he/?utm_source=van&utm_medium=qr');
});
