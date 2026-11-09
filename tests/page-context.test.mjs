// Story 1.4 (AD-13) : contexte de page et sérialisation de #rs-data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPageContext, serializeRsData } from '../src/lib/page-context.ts';
import { INDEXABLE } from '../src/lib/env.ts';

const throwsCtx = (fn) => assert.throws(fn, /^Error: page-context : /);

test('contexte minimal : id, lang, indexable, sans clé optionnelle', () => {
  const ctx = createPageContext({ id: 'home', lang: 'he' }, { indexable: false });
  assert.deepEqual(ctx, { id: 'home', lang: 'he', indexable: false });
  assert.deepEqual(Object.keys(ctx).sort(), ['id', 'indexable', 'lang']);
});

test('contexte complet : service, ville et section recopiés', () => {
  const ctx = createPageContext(
    { id: 'city:modiin', lang: 'fr', service: 'cameras', city: 'modiin', navSection: 'cameras' },
    { indexable: true },
  );
  assert.deepEqual(ctx, { id: 'city:modiin', lang: 'fr', service: 'cameras', city: 'modiin', navSection: 'cameras', indexable: true });
});

test('indexable par défaut = INDEXABLE', () => {
  assert.equal(createPageContext({ id: 'home', lang: 'en' }).indexable, INDEXABLE);
});

test('langue invalide ou id vide : lève « page-context : »', () => {
  throwsCtx(() => createPageContext({ id: 'home', lang: 'de' }));
  throwsCtx(() => createPageContext({ id: '', lang: 'he' }));
});

test('sérialisation : { context, ...tables }, < échappé, JSON.parse rend l’objet', () => {
  const ctx = createPageContext({ id: 'home', lang: 'he' }, { indexable: false });
  const services = { cameras: { label: '</script><script>alert(1)</script>', he: 'מצלמות' } };
  const json = serializeRsData(ctx, { services });
  assert.ok(json.startsWith('{"context":'), json);
  assert.ok(!json.includes('<'), json);
  assert.ok(json.includes('\\u003c/script>'), json);
  assert.deepEqual(JSON.parse(json), { context: ctx, services });
  assert.deepEqual(Object.keys(JSON.parse(json)), ['context', 'services']);
});

test('sérialisation sans tables : { context } seul', () => {
  const ctx = createPageContext({ id: 'home', lang: 'ru' }, { indexable: false });
  assert.deepEqual(JSON.parse(serializeRsData(ctx)), { context: ctx });
});

test('sérialisation : clé « context » dans les tables → lève', () => {
  const ctx = createPageContext({ id: 'home', lang: 'he' }, { indexable: false });
  throwsCtx(() => serializeRsData(ctx, { context: {} }));
});
