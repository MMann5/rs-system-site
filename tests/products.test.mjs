// Pages produits : sources du registre (chemin sous la page service, activité héritée) et contrôle des scènes rendues.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkScenes, productSources, sortProducts } from '../src/lib/products/core.ts';
import { buildRegistry } from '../src/lib/routes/core.ts';

const slugs = (s) => ({ he: s, en: s, ru: s, fr: s });
const prod = (id, over = {}) => ({ id, data: { slugs: slugs(id), enabled: true, parent: 'cameras', order: 1, scene: { inside: { parts: ['a', 'b', 'c'] } }, ...over } });
const scene = (frames = 4, labels = 3) => ({
  frames,
  steps: [[0, 0.1], [0.2, 0.3], [0.4, 0.7], [0.8, 1]],
  labels: { range: [0.6, 0.8], portrait: Array(labels).fill([0.5, 0.5]), landscape: Array(labels).fill([0.5, 0.5]) },
  size: { portrait: [720, 1280], landscape: [1600, 900] },
});
const frames = (n = 4) => ({ portrait: Array(n).fill('p.webp'), landscape: Array(n).fill('l.webp') });

test('produits triés par ordre puis par id', () => {
  const sorted = sortProducts([prod('b', { order: 2 }), prod('c', { order: 1 }), prod('a', { order: 2 })]);
  assert.deepEqual(sorted.map((p) => p.id), ['c', 'a', 'b']);
});

test('produit sous sa page service : chemin imbriqué, inactif si la page est inactive', () => {
  const pages = [
    { id: 'home', slugs: slugs(''), enabled: true },
    { id: 'cameras', slugs: slugs('cameras'), enabled: true },
    { id: 'intercom', slugs: slugs('intercom'), enabled: false },
  ];
  const reg = buildRegistry([...pages, ...productSources([prod('bullet'), prod('door', { parent: 'intercom' }), prod('alarm', { parent: undefined })])], { isMainBranch: true });
  assert.equal(reg.url('product:bullet', 'fr'), '/fr/cameras/bullet/');
  assert.equal(reg.url('product:alarm', 'he'), '/he/alarm/');
  assert.equal(reg.isEnabled('product:door'), false);
});

test('scène cohérente : aucune erreur', () => {
  checkScenes([prod('bullet')], new Map([['bullet', scene()]]), new Map([['bullet', frames()]]));
});

test('scène absente, images manquantes ou étiquettes en trop : le build échoue', () => {
  assert.throws(() => checkScenes([prod('bullet')], new Map(), new Map()), /scène non rendue/);
  assert.throws(() => checkScenes([prod('bullet')], new Map([['bullet', scene(5)]]), new Map([['bullet', frames(4)]])), /4 images portrait, 5 attendues/);
  assert.throws(() => checkScenes([prod('bullet')], new Map([['bullet', scene(4, 2)]]), new Map([['bullet', frames()]])), /3 pièces nommées, 2 ancres/);
});

test('produit désactivé : sa scène n’est pas exigée', () => {
  checkScenes([prod('bullet', { enabled: false })], new Map(), new Map());
});

test('message WhatsApp d’une page produit : le nom du produit remplace le service', async () => {
  const { pageWaInput } = await import('../src/lib/contact/table.ts');
  const table = { cameras: { label: 'Caméras', he: 'מצלמות אבטחה' } };
  assert.deepEqual(pageWaInput({ service: 'cameras', product: 'מצלמה חיצונית' }, table, {}), { serviceHe: 'מצלמה חיצונית' });
  assert.deepEqual(pageWaInput({ service: 'cameras' }, table, {}), { serviceHe: 'מצלמות אבטחה' });
});
