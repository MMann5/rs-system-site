// Story 6.5 (FR37, AD-11, AD-12, D4 de l'epic 6) : workflows blog-automerge.yml, blog-watchdog.yml et extension de
// ci.yml (workflow_dispatch). Lecture YAML seulement, aucun appel réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const ROOT = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(`.github/workflows/${name}`, ROOT), 'utf8');
const load = (name) => ({ text: read(name), doc: parse(read(name)) });

const AUTOMERGE = load('blog-automerge.yml');
const WATCHDOG = load('blog-watchdog.yml');
const CI = load('ci.yml');

const onlyJob = (doc) => {
  const jobs = Object.values(doc.jobs);
  assert.equal(jobs.length, 1);
  return jobs[0];
};
const runs = (job) => job.steps.filter((s) => s.run).map((s) => s.run.trim());

for (const [name, wf, perms, command] of [
  ['blog-automerge.yml', AUTOMERGE, { contents: 'write', 'pull-requests': 'write', actions: 'write', checks: 'read' }, 'node automation/blog-publish.mjs automerge'],
  ['blog-watchdog.yml', WATCHDOG, { contents: 'read', issues: 'write', 'pull-requests': 'read' }, 'node automation/blog-publish.mjs watchdog'],
]) {
  test(`${name} : chaque jour à 06:00 UTC (D4) et lancement manuel`, () => {
    assert.deepEqual(wf.doc.on.schedule, [{ cron: '0 6 * * *' }]);
    assert.ok('workflow_dispatch' in wf.doc.on);
    assert.deepEqual(Object.keys(wf.doc.on).sort(), ['schedule', 'workflow_dispatch']);
  });

  test(`${name} : permissions minimales exactes, concurrence sans annulation`, () => {
    assert.deepEqual(wf.doc.permissions, {});
    assert.deepEqual(onlyJob(wf.doc).permissions, perms);
    assert.equal(wf.doc.concurrency['cancel-in-progress'], false);
    assert.ok(wf.doc.concurrency.group);
  });

  test(`${name} : checkout de main seulement, npm ci, puis la commande`, () => {
    const job = onlyJob(wf.doc);
    const checkout = job.steps.find((s) => String(s.uses).startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, 'main');
    assert.ok(!/github\.event\.pull_request|head\.sha|head_ref|head\.ref/.test(wf.text), 'aucune tête de PR');
    assert.deepEqual(runs(job), ['npm ci', command]);
    const step = job.steps.find((s) => s.run?.trim() === command);
    assert.equal(step.env.GITHUB_TOKEN, '${{ secrets.GITHUB_TOKEN }}');
  });

  test(`${name} : aucun secret autre que GITHUB_TOKEN`, () => {
    const secrets = [...wf.text.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    assert.ok(secrets.length > 0);
    assert.deepEqual([...new Set(secrets)], ['GITHUB_TOKEN']);
  });
}

test('blog-watchdog.yml : issue assignée au propriétaire du dépôt', () => {
  const step = onlyJob(WATCHDOG.doc).steps.find((s) => s.run?.includes('watchdog'));
  assert.equal(step.env.WATCHDOG_ASSIGNEE, '${{ github.repository_owner }}');
});

test('ci.yml : pull_request et push inchangés, workflow_dispatch avec blog_auto booléen (défaut false)', () => {
  assert.deepEqual(CI.doc.on.pull_request, { types: ['opened', 'synchronize', 'reopened', 'labeled', 'unlabeled'] });
  assert.deepEqual(CI.doc.on.push, { branches: ['main'] });
  const input = CI.doc.on.workflow_dispatch.inputs.blog_auto;
  assert.equal(input.type, 'boolean');
  assert.equal(input.default, false);
});

test('ci.yml : job toujours nommé ci (contexte exigé par la protection), BLOG_AUTO cite l’étiquette et inputs.blog_auto', () => {
  assert.deepEqual(Object.keys(CI.doc.jobs), ['ci']);
  const expr = CI.doc.jobs.ci.env.BLOG_AUTO;
  assert.ok(expr.includes("contains(github.event.pull_request.labels.*.name, 'blog-auto')"));
  assert.ok(expr.includes('inputs.blog_auto'));
  assert.equal(CI.doc.jobs.ci.name ?? 'ci', 'ci');
  assert.deepEqual(CI.doc.permissions, { contents: 'read' });
});
