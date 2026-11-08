import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIndexable } from '../src/lib/env.ts';

test('build local sans variable : non indexable', () => {
  assert.equal(isIndexable({}), false);
});

test('aperçu de PR : non indexable', () => {
  assert.equal(isIndexable({ WORKERS_CI_BRANCH: 'feature/x', DOMAIN_LIVE: 'true' }), false);
});

test('main sans domaine : non indexable', () => {
  assert.equal(isIndexable({ WORKERS_CI_BRANCH: 'main' }), false);
});

test('main avec domaine : indexable', () => {
  assert.equal(isIndexable({ WORKERS_CI_BRANCH: 'main', DOMAIN_LIVE: 'true' }), true);
});
