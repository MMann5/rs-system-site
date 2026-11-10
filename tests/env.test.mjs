import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIndexable, isMainBranch, UMAMI_SCRIPT_SRC, umamiScript } from '../src/lib/env.ts';

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

test('isMainBranch : vrai seulement sur main', () => {
  assert.equal(isMainBranch({}), false);
  assert.equal(isMainBranch({ WORKERS_CI_BRANCH: 'feature/epic-1' }), false);
  assert.equal(isMainBranch({ WORKERS_CI_BRANCH: 'main' }), true);
});

// Story 7.1 (AD-10) : script Umami Cloud seulement si indexable et id de site fourni au build.
const LIVE = { WORKERS_CI_BRANCH: 'main', DOMAIN_LIVE: 'true' };

test('umamiScript : indexable avec id → script Umami Cloud et id', () => {
  assert.equal(UMAMI_SCRIPT_SRC, 'https://cloud.umami.is/script.js');
  assert.deepEqual(umamiScript({ ...LIVE, UMAMI_WEBSITE_ID: 'abc-123' }), { src: UMAMI_SCRIPT_SRC, websiteId: 'abc-123' });
  assert.deepEqual(umamiScript({ ...LIVE, UMAMI_WEBSITE_ID: '  abc-123 ' }), { src: UMAMI_SCRIPT_SRC, websiteId: 'abc-123' });
});

test('umamiScript : non indexable (local, aperçu, main sans domaine) → aucun script, même avec un id', () => {
  for (const env of [{}, { WORKERS_CI_BRANCH: 'feature/x', DOMAIN_LIVE: 'true' }, { WORKERS_CI_BRANCH: 'main' }]) {
    assert.equal(umamiScript({ ...env, UMAMI_WEBSITE_ID: 'abc-123' }), undefined, JSON.stringify(env));
  }
});

test('umamiScript : indexable sans id (absent, vide, espaces) → aucun script, sans erreur', () => {
  assert.equal(umamiScript(LIVE), undefined);
  assert.equal(umamiScript({ ...LIVE, UMAMI_WEBSITE_ID: '' }), undefined);
  assert.equal(umamiScript({ ...LIVE, UMAMI_WEBSITE_ID: '   ' }), undefined);
});
