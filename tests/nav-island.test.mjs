// Story 1.6 (AD-14, FR17, UX-DR11) : îlot du menu mobile. Source sans import hors du module pur track-events.ts
// (story 7.1), aucune donnée de build ; comportement (bouton, Échap, tap dehors, lien) sur un DOM factice minimal.
// Story 7.1 (AD-6, FR34) : `language_switch` émis par CustomEvent('rs:track') au clic dans un sélecteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ISLAND = join(ROOT, 'src/scripts/nav.ts');

/** Retire les commentaires // et /* *\/ (le texte des commentaires peut citer « import »). */
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Violations d'un source d'îlot : tout import (statique, dynamique, require) ou module astro:. */
function findIslandImports(code) {
  const src = stripComments(code);
  const errors = [];
  if (/(?:^|[^\w$.])import\s*[\s{*'"(\w]/m.test(src)) errors.push('import');
  if (/\brequire\s*\(/.test(src)) errors.push('require');
  if (/astro:/.test(src)) errors.push('astro:');
  return errors;
}

test('findIslandImports détecte import, import(), require et astro:', () => {
  assert.deepEqual(findIslandImports("import { t } from '../lib/i18n';"), ['import']);
  assert.deepEqual(findIslandImports("import '../x.ts';"), ['import']);
  assert.deepEqual(findIslandImports("const m = await import('./m.ts');"), ['import']);
  assert.deepEqual(findIslandImports("import { getCollection } from 'astro:content';"), ['import', 'astro:']);
  assert.deepEqual(findIslandImports("const x = require('y');"), ['require']);
  assert.deepEqual(findIslandImports('// aucun import ici\nconst a = 1;'), []);
});

test('src/scripts/nav.ts existe et n’importe que ../lib/track-events.ts (story 7.1)', () => {
  assert.ok(existsSync(ISLAND), 'src/scripts/nav.ts absent');
  const code = readFileSync(ISLAND, 'utf8');
  const specs = [...stripComments(code).matchAll(/(?:^|[^\w$.])import\b[\s\S]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(specs, ['../lib/track-events.ts']);
  // Hors de cet import : aucun autre import, require ni astro:.
  const rest = stripComments(code).replace(/import\s*\{[^}]*\}\s*from\s*'\.\.\/lib\/track-events\.ts';/, '');
  assert.deepEqual(findIslandImports(rest), []);
});

// Présence de l'îlot dans le build (<script type="module"> qui vise mobile-menu) : tests/build.test.mjs,
// qui réutilise son build (deux `astro build` en parallèle se disputent le cache .astro).

// — Comportement de l'îlot (matrice I/O : Échap, tap dehors), sur un DOM factice minimal —
// L'îlot s'exécute à l'import : chaque cas l'importe à neuf (?case=n) après avoir posé les globaux.

class FakeNode {
  constructor() {
    this.parent = null;
    this.children = [];
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
    return this;
  }
  contains(node) {
    for (let n = node; n; n = n.parent) if (n === this) return true;
    return false;
  }
}

class FakeElement extends FakeNode {
  constructor(tag, attrs = {}) {
    super();
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.listeners = {};
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }
  hasAttribute(name) {
    return this.attrs.has(name);
  }
  toggleAttribute(name, force) {
    if (force) this.attrs.set(name, '');
    else this.attrs.delete(name);
    return Boolean(force);
  }
  /** Sélecteurs utilisés par l'îlot : `header`, `a[href]`, `[data-lang-switcher]`. */
  closest(selector) {
    const match = (el) =>
      selector === 'a[href]'
        ? el.tag === 'a' && el.hasAttribute('href')
        : selector === '[data-lang-switcher]'
          ? el.hasAttribute('data-lang-switcher')
          : el.tag === selector;
    for (let n = this; n instanceof FakeElement; n = n.parent) if (match(n)) return n;
    return null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  focus() {
    globalThis.document.activeElement = this;
  }
}

let round = 0;

async function mountIsland(search = '', initialSearch = '', { lang = 'he', pageId = 'cameras' } = {}) {
  const listeners = {};
  /** Événements rs:track émis par l'îlot (détail). */
  const tracked = [];
  const button = new FakeElement('button', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'mobile-menu' });
  const link = new FakeElement('a', { href: '/fr/' });
  const panel = new FakeElement('div', { id: 'mobile-menu' }).append(new FakeElement('nav').append(link));
  const header = new FakeElement('header').append(new FakeElement('div').append(button), panel);
  const main = new FakeElement('main');
  const body = new FakeElement('body');
  body.append(header, main);
  const html = new FakeElement('html', { lang, 'data-page-id': pageId }).append(body);
  for (const el of [body, html]) {
    el.style = {};
    el.classList = new Set();
  }
  // Liens des deux sélecteurs de langues (menu et footer), cibles de la recopie de location.search.
  // Story 7.1 : chaque série dans son <nav data-lang-switcher> (menu puis footer), langue de la page en aria-current.
  const switcherLinks = ['he', 'en', 'ru', 'fr', 'he', 'en', 'ru', 'fr'].map(
    (l) => new FakeElement('a', { href: `/${l}/`, hreflang: l, ...(l === lang ? { 'aria-current': 'true' } : {}) }),
  );
  for (const el of switcherLinks) el.search = initialSearch;
  const menuSwitcher = new FakeElement('nav', { 'data-lang-switcher': 'mobile_menu' }).append(...switcherLinks.slice(0, 4));
  const footerSwitcher = new FakeElement('nav', { 'data-lang-switcher': 'footer' }).append(...switcherLinks.slice(4));
  const document = {
    activeElement: body,
    body,
    documentElement: html,
    querySelector: (sel) => (sel === 'button[aria-controls="mobile-menu"]' ? button : null),
    getElementById: (id) => (id === 'mobile-menu' ? panel : null),
    querySelectorAll: (sel) => (sel === '[data-lang-switcher] a[hreflang]' ? switcherLinks : []),
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    dispatchEvent: (event) => {
      assert.ok(event instanceof CustomEvent);
      assert.equal(event.type, 'rs:track');
      tracked.push(event.detail);
      return true;
    },
  };
  Object.assign(globalThis, { document, location: { search }, Node: FakeNode, Element: FakeElement });
  await import(`${ISLAND_URL}?case=${++round}`);
  // Clic : écouteurs de l'élément puis remontée jusqu'au document (comme le navigateur).
  const click = (target) => {
    const event = { type: 'click', target };
    for (let n = target; n instanceof FakeElement; n = n.parent) for (const fn of n.listeners.click ?? []) fn(event);
    for (const fn of listeners.click ?? []) fn(event);
  };
  const key = (k) => {
    for (const fn of listeners.keydown ?? []) fn({ type: 'keydown', key: k });
  };
  // Le focus quitte `from` pour `to` (null = hors document) : focusout sur `from`, remonté aux ancêtres.
  const blur = (from, to) => {
    const event = { type: 'focusout', target: from, relatedTarget: to };
    for (let n = from; n instanceof FakeElement; n = n.parent) for (const fn of n.listeners.focusout ?? []) fn(event);
  };
  const open = () => button.getAttribute('aria-expanded') === 'true';
  return { button, link, panel, header, main, body, html, document, switcherLinks, menuSwitcher, footerSwitcher, tracked, click, key, blur, open };
}

const ISLAND_URL = new URL('../src/scripts/nav.ts', import.meta.url).href;

test('îlot : tap sur le bouton ouvre (aria-expanded, data-menu-open), focus sur le bouton ; second tap ferme', async () => {
  const dom = await mountIsland();
  dom.click(dom.button);
  assert.equal(dom.open(), true);
  assert.ok(dom.header.hasAttribute('data-menu-open'));
  assert.equal(dom.document.activeElement, dom.button);
  dom.click(dom.button);
  assert.equal(dom.open(), false);
  assert.ok(!dom.header.hasAttribute('data-menu-open'));
});

test('îlot : menu ouvert + Échap → fermé, focus rendu au bouton ; Échap menu fermé sans effet', async () => {
  const dom = await mountIsland();
  dom.click(dom.button);
  dom.document.activeElement = dom.link;
  dom.key('Escape');
  assert.equal(dom.open(), false);
  assert.ok(!dom.header.hasAttribute('data-menu-open'));
  assert.equal(dom.document.activeElement, dom.button);
  dom.document.activeElement = dom.body;
  dom.key('Escape');
  assert.equal(dom.document.activeElement, dom.body, 'Échap menu fermé ne déplace pas le focus');
  dom.click(dom.button);
  dom.key('Enter');
  assert.equal(dom.open(), true, 'autre touche : reste ouvert');
});

test('îlot : tap dans <main> ferme ; tap dans le panneau hors lien garde ouvert ; lien du panneau ferme', async () => {
  const dom = await mountIsland();
  dom.click(dom.button);
  dom.click(dom.main);
  assert.equal(dom.open(), false, 'tap dehors');
  dom.click(dom.button);
  dom.click(dom.panel);
  assert.equal(dom.open(), true, 'tap dans le panneau');
  dom.click(dom.link);
  assert.equal(dom.open(), false, 'lien suivi');
});

test('îlot : focus qui quitte le panneau pour <main> ferme ; vers le bouton, dans le panneau ou null : reste ouvert', async () => {
  const dom = await mountIsland();
  dom.click(dom.button);
  dom.blur(dom.link, null);
  assert.equal(dom.open(), true, 'relatedTarget null');
  dom.blur(dom.link, dom.button);
  assert.equal(dom.open(), true, 'vers le bouton');
  dom.blur(dom.link, dom.panel);
  assert.equal(dom.open(), true, 'dans le panneau');
  dom.blur(dom.link, dom.main);
  assert.equal(dom.open(), false, 'vers <main>');
  assert.ok(!dom.header.hasAttribute('data-menu-open'));
});

test('îlot : n’écrit jamais sur le body ni sur <html> (défilement non verrouillé)', async () => {
  const dom = await mountIsland();
  const snapshot = () => [dom.body, dom.html].map((el) => [[...el.attrs], { ...el.style }, [...el.classList]]);
  const before = snapshot();
  dom.click(dom.button);
  dom.key('Escape');
  dom.click(dom.button);
  dom.click(dom.main);
  dom.click(dom.button);
  dom.blur(dom.link, dom.main);
  assert.deepEqual(snapshot(), before);
});

// — Story 1.7 (AD-14) : recopie de location.search sur les 8 liens des sélecteurs —

test('îlot : ?service=cameras&utm_source=van recopié sur les 8 liens de sélecteur', async () => {
  const dom = await mountIsland('?service=cameras&utm_source=van');
  assert.equal(dom.switcherLinks.length, 8);
  for (const link of dom.switcherLinks) assert.equal(link.search, '?service=cameras&utm_source=van');
});

test('îlot : sans paramètre, liens de sélecteur inchangés', async () => {
  const dom = await mountIsland('', '?keep');
  for (const link of dom.switcherLinks) assert.equal(link.search, '?keep');
});

// — Story 7.1 (AD-6, FR34) : language_switch au clic dans un sélecteur —

test('îlot : clic sur ru du footer, page he cameras → language_switch { page, from, to, placement: footer }', async () => {
  const dom = await mountIsland();
  dom.click(dom.switcherLinks[6]);
  assert.deepEqual(dom.tracked, [{ name: 'language_switch', data: { page: 'cameras', from: 'he', to: 'ru', placement: 'footer' } }]);
});

test('îlot : clic sur en du menu mobile, page fr city:modiin → placement mobile_menu', async () => {
  const dom = await mountIsland('', '', { lang: 'fr', pageId: 'city:modiin' });
  dom.click(dom.switcherLinks[1]);
  assert.deepEqual(dom.tracked, [{ name: 'language_switch', data: { page: 'city:modiin', from: 'fr', to: 'en', placement: 'mobile_menu' } }]);
});

test('îlot : clic sur la langue courante (aria-current), menu ou footer → aucun événement', async () => {
  const dom = await mountIsland();
  dom.click(dom.switcherLinks[0]);
  dom.click(dom.switcherLinks[4]);
  assert.deepEqual(dom.tracked, []);
});

test('îlot : clics hors sélecteur (bouton, lien du panneau, <main>) → aucun événement', async () => {
  const dom = await mountIsland();
  dom.click(dom.button);
  dom.click(dom.link);
  dom.click(dom.main);
  assert.deepEqual(dom.tracked, []);
});

test('îlot : avec ?utm_source=van&utm_medium=qr, la requête est recopiée et language_switch n’en porte rien', async () => {
  const dom = await mountIsland('?utm_source=van&utm_medium=qr');
  for (const link of dom.switcherLinks) assert.equal(link.search, '?utm_source=van&utm_medium=qr');
  dom.click(dom.switcherLinks[5]);
  assert.deepEqual(dom.tracked, [{ name: 'language_switch', data: { page: 'cameras', from: 'he', to: 'en', placement: 'footer' } }]);
});
