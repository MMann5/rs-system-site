// Story 6.5 (FR37, AD-12, D4 de l'epic 6, DW-25) : automation/blog-publish.mjs, fusion automatique des PR `blog-auto`
// et sentinelle. Aucun appel réseau : faux client GitHub (enregistre les écritures), `fetch` simulé, horloge simulée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CI_TIMEOUT_MS,
  GitHubError,
  MIN_AGE_MS,
  SILENCE_MS,
  WATCHDOG_MARKER,
  ciVerdict,
  githubClient,
  postIdFromFiles,
  prEligibility,
  prScopeErrors,
  redact,
  runAutomerge,
  runCli,
  runWatchdog,
  watchdogDecision,
} from '../automation/blog-publish.mjs';

const REPO = 'owner/site';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-10T06:00:00Z');
const ID = 'choosing-home-cameras';
const FILES = [
  `src/content/posts/${ID}/meta.yaml`,
  ...['he', 'en', 'ru', 'fr'].map((l) => `src/content/posts/${ID}/${l}.md`),
  `src/assets/blog/${ID}.jpg`,
];

const iso = (ms) => new Date(ms).toISOString();
const pr = (over = {}) => ({
  number: 7,
  node_id: 'PR_node7',
  title: 'Blog : caméras',
  state: 'open',
  draft: false,
  created_at: iso(NOW - 49 * HOUR),
  labels: [{ name: 'blog-auto' }],
  base: { ref: 'main' },
  head: { sha: 'aaaaaaa1', ref: 'blog/2026-11-08', repo: { full_name: REPO } },
  ...over,
});
const run = (id, sha, status, conclusion = null) => ({ id, name: 'ci', head_sha: sha, status, conclusion, app: { slug: 'github-actions' } });
const green = (sha, id = 1) => [run(id, sha, 'completed', 'success')];

/**
 * Faux client GitHub. `checks[sha]` : réponses successives (la dernière se répète). `writes` : appels d'écriture.
 * Crochets : `onUpdate(state)`, `onDispatch(state)`, `onSleep(state)`, `mergeError`.
 */
function fakeGh({ prs = [pr()], files = {}, behind = {}, checks = {}, onUpdate, onDispatch, mergeError } = {}) {
  const state = { prs: structuredClone(prs), checks: structuredClone(checks), writes: [], reads: 0 };
  const find = (n) => state.prs.find((p) => p.number === n);
  const gh = {
    repo: REPO,
    listOpenPullRequests: async () => structuredClone(state.prs.filter((p) => p.state === 'open')),
    getPullRequest: async (n) => structuredClone(find(n)),
    listPullRequestFiles: async (n) => files[n] ?? FILES,
    compare: async (_base, head) => ({ behind_by: behind[head] ?? 0 }),
    listCheckRuns: async (sha) => {
      const queue = state.checks[sha] ?? [];
      if (queue.length === 0) return [];
      return Array.isArray(queue[0]) ? (queue.length > 1 ? queue.shift() : queue[0]) : queue;
    },
    markReadyForReview: async (id) => {
      state.writes.push(['ready', id]);
    },
    updateBranch: async (n, sha) => {
      state.writes.push(['update', n, sha]);
      onUpdate?.(state, find(n));
    },
    dispatchWorkflow: async (file, ref, inputs) => {
      state.writes.push(['dispatch', file, ref, inputs]);
      onDispatch?.(state);
    },
    mergePullRequest: async (n, sha) => {
      if (mergeError) throw mergeError;
      state.writes.push(['merge', n, sha]);
    },
  };
  return { gh, state };
}

/** Horloge simulée : `sleep` avance le temps ; `onSleep` peut modifier l'état. */
function clock(start = NOW, onSleep) {
  let t = start;
  return { now: () => t, sleep: async (ms) => { t += ms; onSleep?.(); }, elapsed: () => t - start };
}

const automerge = async (fake, c = clock()) => runAutomerge({ gh: fake.gh, now: c.now, sleep: c.sleep });

// — Fonctions pures —

test('prEligibility : 48 h pile éligible, 47 h 59 trop jeune, hold, fork, base, étiquette', () => {
  const ok = (p) => prEligibility(p, { now: NOW, repo: REPO });
  assert.deepEqual(ok(pr({ created_at: iso(NOW - MIN_AGE_MS) })), { eligible: true });
  assert.match(ok(pr({ created_at: iso(NOW - 47 * HOUR - 59 * 60 * 1000) })).reason, /trop jeune/);
  assert.match(ok(pr({ labels: [{ name: 'blog-auto' }, { name: 'hold' }] })).reason, /hold/);
  assert.match(ok(pr({ head: { sha: 'x', ref: 'blog/x', repo: { full_name: 'other/site' } } })).reason, /fork/);
  assert.match(ok(pr({ head: { sha: 'x', ref: 'blog/x', repo: null } })).reason, /fork/);
  assert.match(ok(pr({ base: { ref: 'dev' } })).reason, /main/);
  assert.match(ok(pr({ labels: [] })).reason, /blog-auto/);
  assert.match(ok(pr({ created_at: 'n/a' })).reason, /illisible/);
});

test('postIdFromFiles et prScopeErrors : un seul article, ses fichiers et sa photo (DW-25)', () => {
  assert.equal(postIdFromFiles(FILES), ID);
  assert.deepEqual(prScopeErrors(FILES), []);
  assert.equal(postIdFromFiles(['README.md']), null);
  assert.match(prScopeErrors(['README.md'])[0], /aucun dossier/);
  const two = [...FILES, 'src/content/posts/other-post/he.md'];
  assert.equal(postIdFromFiles(two), null);
  assert.match(prScopeErrors(two)[0], /plusieurs articles.*choosing-home-cameras, other-post/);
  const out = prScopeErrors([...FILES, 'scripts/checks/editorial.mjs', `src/content/posts/${ID}/extra.md`]);
  assert.deepEqual(out, [
    `hors périmètre de l'article ${ID} : scripts/checks/editorial.mjs`,
    `hors périmètre de l'article ${ID} : src/content/posts/${ID}/extra.md`,
  ]);
});

test('prScopeErrors : fichier modifié ou supprimé dans le dossier de l’article refusé (la routine ne fait qu’ajouter)', () => {
  const added = FILES.map((filename) => ({ filename, status: 'added' }));
  assert.deepEqual(prScopeErrors(added), []);
  const modified = [...added.slice(1), { filename: FILES[0], status: 'modified' }];
  assert.deepEqual(prScopeErrors(modified), [`fichier ${FILES[0]} au statut modified (seul un ajout est permis)`]);
  const removed = [...added.slice(0, 5), { filename: FILES[5], status: 'removed' }];
  assert.match(prScopeErrors(removed).join('\n'), /src\/assets\/blog\/choosing-home-cameras\.jpg au statut removed/);
  // Renommage : statut refusé et ancien nom toujours contrôlé.
  const renamed = [...added.slice(1), { filename: FILES[0], status: 'renamed', previous_filename: 'scripts/checks/editorial.mjs' }];
  const errors = prScopeErrors(renamed);
  assert.ok(errors.some((e) => /statut renamed/.test(e)));
  assert.ok(errors.includes(`hors périmètre de l'article ${ID} : scripts/checks/editorial.mjs`));
});

test('automerge : article déjà publié modifié dans le même dossier → pas de fusion, code 1', async () => {
  const files = [...FILES.slice(1).map((filename) => ({ filename, status: 'added' })), { filename: FILES[0], status: 'modified' }];
  const fake = fakeGh({ files: { 7: files }, checks: { aaaaaaa1: green('aaaaaaa1') } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.exitCode, 1);
  assert.match(report.lines[0], /statut modified/);
});

test('ciVerdict : dernier contrôle ci (plus grand id) sur la tête exacte, GitHub Actions seulement', () => {
  assert.equal(ciVerdict([], 's'), 'absent');
  assert.equal(ciVerdict(green('other'), 's'), 'absent');
  assert.equal(ciVerdict([{ ...run(1, 's', 'completed', 'success'), name: 'build' }], 's'), 'absent');
  assert.equal(ciVerdict([{ ...run(1, 's', 'completed', 'success'), app: { slug: 'evil-app' } }], 's'), 'absent');
  assert.equal(ciVerdict(green('s'), 's'), 'success');
  assert.equal(ciVerdict([run(1, 's', 'in_progress')], 's'), 'pending');
  assert.equal(ciVerdict([run(1, 's', 'completed', 'failure')], 's'), 'failure');
  assert.equal(ciVerdict([run(1, 's', 'completed', 'cancelled')], 's'), 'failure');
  assert.equal(ciVerdict([run(2, 's', 'completed', 'failure'), run(5, 's', 'completed', 'success')], 's'), 'success');
  assert.equal(ciVerdict([run(5, 's', 'completed', 'failure'), run(2, 's', 'completed', 'success')], 's'), 'failure');
});

// — Automerge : matrice —

test('éligible, verte : fusion avec sha = tête', async () => {
  const fake = fakeGh({ checks: { aaaaaaa1: green('aaaaaaa1') } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, [['merge', 7, 'aaaaaaa1']]);
  assert.equal(report.exitCode, 0);
  assert.equal(report.results[0].status, 'merged');
});

test('trop jeune (47 h 59) : ignorée, aucun appel d’écriture, code 0', async () => {
  const fake = fakeGh({ prs: [pr({ created_at: iso(NOW - 47 * HOUR - 59 * 60 * 1000) })], checks: { aaaaaaa1: green('aaaaaaa1') } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.exitCode, 0);
  assert.equal(report.results[0].status, 'ignored');
  assert.match(report.lines[0], /ignorée/);
});

test('retenue (hold) : ignorée, aucun appel d’écriture', async () => {
  const fake = fakeGh({ prs: [pr({ labels: [{ name: 'blog-auto' }, { name: 'hold' }] })], checks: { aaaaaaa1: green('aaaaaaa1') } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.exitCode, 0);
});

test('PR sans blog-auto : jamais touchée', async () => {
  const fake = fakeGh({ prs: [pr({ labels: [] })], checks: { aaaaaaa1: green('aaaaaaa1') } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, []);
  assert.deepEqual(report.results, []);
  assert.equal(report.exitCode, 0);
});

test('brouillon (50 h) : passée en prête puis fusionnée', async () => {
  const fake = fakeGh({ prs: [pr({ draft: true, created_at: iso(NOW - 50 * HOUR) })], checks: { aaaaaaa1: green('aaaaaaa1') } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, [['ready', 'PR_node7'], ['merge', 7, 'aaaaaaa1']]);
  assert.equal(report.exitCode, 0);
});

test('en retard (behind 3) : update-branch, nouvelle tête, dispatch ci (blog_auto), attente, fusion si vert', async () => {
  const fake = fakeGh({
    behind: { aaaaaaa1: 3 },
    checks: { aaaaaaa1: green('aaaaaaa1') },
    onUpdate: (_s, p) => {
      p.head.sha = 'bbbbbbb2';
    },
    onDispatch: (s) => {
      s.checks.bbbbbbb2 = [[run(9, 'bbbbbbb2', 'queued')], [run(9, 'bbbbbbb2', 'in_progress')], green('bbbbbbb2', 9)];
    },
  });
  const c = clock();
  const report = await automerge(fake, c);
  assert.deepEqual(fake.state.writes, [
    ['update', 7, 'aaaaaaa1'],
    ['dispatch', 'ci.yml', 'blog/2026-11-08', { blog_auto: 'true' }],
    ['merge', 7, 'bbbbbbb2'],
  ]);
  assert.equal(report.exitCode, 0);
  assert.ok(c.elapsed() < CI_TIMEOUT_MS);
});

test('en retard, tête inchangée après 2 min : échec, pas de fusion, code 1', async () => {
  const fake = fakeGh({ behind: { aaaaaaa1: 3 }, checks: { aaaaaaa1: green('aaaaaaa1') } });
  const c = clock();
  const report = await automerge(fake, c);
  assert.deepEqual(fake.state.writes, [['update', 7, 'aaaaaaa1']]);
  assert.equal(report.exitCode, 1);
  assert.match(report.results[0].reason, /tête inchangée/);
  assert.ok(c.elapsed() >= 2 * 60 * 1000);
});

test('rouge : pas de fusion, pas de relance de CI, code 1', async () => {
  const fake = fakeGh({ checks: { aaaaaaa1: [run(1, 'aaaaaaa1', 'completed', 'failure')] } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.exitCode, 1);
  assert.match(report.lines[0], /NON FUSIONNÉE.*rouge/);
});

test('CI trop longue (en cours après 30 min) : pas de fusion, code 1', async () => {
  const fake = fakeGh({ checks: { aaaaaaa1: [run(1, 'aaaaaaa1', 'in_progress')] } });
  const c = clock();
  const report = await automerge(fake, c);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.exitCode, 1);
  assert.match(report.results[0].reason, /30 min/);
  assert.ok(c.elapsed() >= CI_TIMEOUT_MS);
});

test('CI absente : un seul dispatch, puis délai dépassé si rien ne vient', async () => {
  const fake = fakeGh({});
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, [['dispatch', 'ci.yml', 'blog/2026-11-08', { blog_auto: 'true' }]]);
  assert.equal(report.exitCode, 1);
});

test('hold posé pendant l’attente : relecture avant fusion, pas de fusion, ignorée, code 0', async () => {
  let fake;
  const c = clock(NOW, () => {
    fake.state.prs[0].labels.push({ name: 'hold' });
  });
  fake = fakeGh({ checks: { aaaaaaa1: [[run(1, 'aaaaaaa1', 'in_progress')], green('aaaaaaa1')] } });
  const report = await automerge(fake, c);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.results[0].status, 'ignored');
  assert.match(report.results[0].reason, /hold/);
  assert.equal(report.exitCode, 0);
});

test('tête modifiée pendant l’attente : pas de fusion, code 1', async () => {
  let fake;
  const c = clock(NOW, () => {
    fake.state.prs[0].head.sha = 'ccccccc3';
  });
  fake = fakeGh({ checks: { aaaaaaa1: [[run(1, 'aaaaaaa1', 'in_progress')], green('aaaaaaa1')] } });
  const report = await automerge(fake, c);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.exitCode, 1);
});

test('hors périmètre (scripts/checks/editorial.mjs) : pas de fusion, fichiers listés, code 1', async () => {
  const fake = fakeGh({ files: { 7: [...FILES, 'scripts/checks/editorial.mjs'] }, checks: { aaaaaaa1: green('aaaaaaa1') } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.exitCode, 1);
  assert.match(report.lines[0], /scripts\/checks\/editorial\.mjs/);
});

test('deux articles : pas de fusion, code 1', async () => {
  const fake = fakeGh({ files: { 7: [...FILES, 'src/content/posts/other-post/meta.yaml'] }, checks: { aaaaaaa1: green('aaaaaaa1') } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.exitCode, 1);
  assert.match(report.lines[0], /plusieurs articles/);
});

test('fork : ignorée, aucun appel d’écriture', async () => {
  const fake = fakeGh({ prs: [pr({ head: { sha: 'aaaaaaa1', ref: 'blog/x', repo: { full_name: 'evil/site' } } })], checks: { aaaaaaa1: green('aaaaaaa1') } });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, []);
  assert.equal(report.results[0].status, 'ignored');
  assert.equal(report.exitCode, 0);
});

test('fusion refusée (API 405) : statut cité, code 1', async () => {
  const fake = fakeGh({ checks: { aaaaaaa1: green('aaaaaaa1') }, mergeError: new GitHubError(405, 'PUT /pulls/7/merge : HTTP 405 Base branch was modified') });
  const report = await automerge(fake);
  assert.equal(report.exitCode, 1);
  assert.match(report.results[0].reason, /405/);
});

test('une PR en échec n’empêche pas de traiter les autres', async () => {
  const bad = pr({ number: 8, node_id: 'PR_node8', head: { sha: 'ddddddd4', ref: 'blog/2026-11-01', repo: { full_name: REPO } } });
  const fake = fakeGh({
    prs: [bad, pr()],
    checks: { ddddddd4: [run(3, 'ddddddd4', 'completed', 'failure')], aaaaaaa1: green('aaaaaaa1') },
  });
  const report = await automerge(fake);
  assert.deepEqual(fake.state.writes, [['merge', 7, 'aaaaaaa1']]);
  assert.deepEqual(report.results.map((r) => r.status), ['failed', 'merged']);
  assert.equal(report.exitCode, 1);
});

// — Watchdog —

const bpr = (number, ageMs) => ({ number, title: `Blog ${number}`, created_at: iso(NOW - ageMs), pull_request: {} });
const wissue = (number = 3, login = 'github-actions[bot]') => ({ number, state: 'open', title: 'Blog : …', body: `${WATCHDOG_MARKER}\ntexte`, user: { login } });

test('watchdogDecision : silence, jamais, doublon, reprise, borne', () => {
  const d = (prs, issues = []) => watchdogDecision({ prs, issues, now: NOW }).action;
  assert.equal(d([bpr(1, 9 * DAY)]), 'open');
  assert.equal(d([]), 'open');
  assert.equal(d([bpr(1, 9 * DAY)], [wissue()]), 'none');
  assert.equal(d([bpr(1, 2 * DAY)], [wissue()]), 'close');
  assert.equal(d([bpr(1, 7 * DAY + 23 * HOUR)]), 'none');
  assert.equal(d([bpr(1, SILENCE_MS)]), 'open');
  // La plus récente compte, quel que soit l'ordre ; une issue sans marqueur n'est pas la sienne.
  assert.equal(d([bpr(1, 30 * DAY), bpr(2, DAY)]), 'none');
  assert.equal(d([bpr(1, 9 * DAY)], [{ number: 4, state: 'open', body: 'autre', user: { login: 'github-actions[bot]' } }]), 'open');
  // Marqueur posé par quelqu'un d'autre (dépôt public) : ignoré, l'alerte part et l'issue n'est pas fermée.
  assert.equal(d([bpr(1, 9 * DAY)], [wissue(5, 'someone')]), 'open');
  assert.equal(d([bpr(1, 2 * DAY)], [wissue(5, 'someone')]), 'none');
});

function fakeWatchdogGh({ prs = [], issues = [], assignError } = {}) {
  const writes = [];
  const gh = {
    repo: REPO,
    listBlogAutoPullRequests: async () => prs,
    listOpenIssues: async () => issues,
    createIssue: async (issue) => {
      if (assignError && issue.assignees) throw assignError;
      writes.push(['create', issue]);
      return { number: 42 };
    },
    commentIssue: async (n, body) => writes.push(['comment', n, body]),
    closeIssue: async (n) => writes.push(['close', n]),
  };
  return { gh, writes };
}
const watchdog = (fake, assignee = 'MMann5') => runWatchdog({ gh: fake.gh, now: () => NOW, assignee });

test('watchdog silence (9 jours, pas d’issue) : issue ouverte, assignée, marquée', async () => {
  const fake = fakeWatchdogGh({ prs: [bpr(5, 9 * DAY)] });
  const report = await watchdog(fake);
  assert.equal(fake.writes.length, 1);
  const [, issue] = fake.writes[0];
  assert.deepEqual(issue.assignees, ['MMann5']);
  assert.ok(issue.body.startsWith(WATCHDOG_MARKER));
  assert.match(issue.body, /#5/);
  assert.equal(report.exitCode, 0);
});

test('watchdog jamais : issue avec « aucune PR encore »', async () => {
  const fake = fakeWatchdogGh();
  await watchdog(fake);
  assert.match(fake.writes[0][1].body, /aucune PR encore/);
});

test('watchdog : assignation refusée → issue sans assignation', async () => {
  const fake = fakeWatchdogGh({ assignError: new GitHubError(422, 'POST /issues : HTTP 422 Validation Failed') });
  const report = await watchdog(fake);
  assert.equal(fake.writes.length, 1);
  assert.equal(fake.writes[0][1].assignees, undefined);
  assert.match(report.lines.join('\n'), /sans assignation/);
});

test('watchdog : autre erreur que 422 (410 issues désactivées) relancée, pas de deuxième appel', async () => {
  const fake = fakeWatchdogGh({ assignError: new GitHubError(410, 'POST /issues : HTTP 410 Issues are disabled') });
  await assert.rejects(watchdog(fake), (e) => e.status === 410);
  assert.deepEqual(fake.writes, []);
});

test('watchdog doublon : silence + issue marquée ouverte → rien', async () => {
  const fake = fakeWatchdogGh({ prs: [bpr(5, 9 * DAY)], issues: [wissue()] });
  const report = await watchdog(fake);
  assert.deepEqual(fake.writes, []);
  assert.equal(report.action, 'none');
});

test('watchdog reprise : PR il y a 2 jours + issue ouverte → commentaire puis fermeture', async () => {
  const fake = fakeWatchdogGh({ prs: [bpr(6, 2 * DAY)], issues: [wissue(3)] });
  await watchdog(fake);
  assert.deepEqual(fake.writes.map((w) => w.slice(0, 2)), [['comment', 3], ['close', 3]]);
  assert.match(fake.writes[0][2], /#6/);
});

test('watchdog borne : dernière PR il y a 7 j 23 h → rien', async () => {
  const fake = fakeWatchdogGh({ prs: [bpr(5, 7 * DAY + 23 * HOUR)] });
  await watchdog(fake);
  assert.deepEqual(fake.writes, []);
});

// — Client GitHub (fetch simulé) —

const TOKEN = 'ghs_test-token-do-not-leak-9b2';

function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const route = routes(String(url), init);
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status ?? 200, headers: route.headers ?? {} });
  };
  return { fetch, calls };
}

test('githubClient : en-tête Authorization, pagination par lien next, corps JSON', async () => {
  const { fetch, calls } = fakeFetch((url) => {
    if (url.endsWith('/pulls?state=open&base=main&sort=created&direction=asc&per_page=100')) {
      return { body: [{ number: 1 }], headers: { link: `<https://api.github.com/repos/${REPO}/pulls?state=open&page=2>; rel="next"` } };
    }
    if (url.endsWith('page=2')) return { body: [{ number: 2 }] };
    return { body: { merged: true } };
  });
  const gh = githubClient({ token: TOKEN, repo: REPO, fetch });
  assert.deepEqual((await gh.listOpenPullRequests()).map((p) => p.number), [1, 2]);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(calls[0].url.endsWith(`/repos/${REPO}/pulls?state=open&base=main&sort=created&direction=asc&per_page=100`), 'plus anciennes d’abord');
  await gh.mergePullRequest(7, 'abc');
  const merge = calls.at(-1);
  assert.equal(merge.init.method, 'PUT');
  assert.ok(merge.url.endsWith(`/repos/${REPO}/pulls/7/merge`));
  assert.deepEqual(JSON.parse(merge.init.body), { sha: 'abc', merge_method: 'merge' });
});

test('githubClient : lien next hors de l’API GitHub refusé (le jeton ne part pas ailleurs)', async () => {
  const { fetch, calls } = fakeFetch(() => ({ body: [], headers: { link: '<https://evil.example/steal>; rel="next"' } }));
  const gh = githubClient({ token: TOKEN, repo: REPO, fetch });
  await assert.rejects(gh.listOpenPullRequests(), /hors de l'API GitHub/);
  assert.equal(calls.length, 1);
});

test('githubClient : erreur avec statut, sans jeton', async () => {
  const { fetch } = fakeFetch(() => ({ status: 405, body: { message: `Merge refused for ${TOKEN}` } }));
  const gh = githubClient({ token: TOKEN, repo: REPO, fetch });
  const error = await gh.mergePullRequest(7, 'abc').catch((e) => e);
  assert.ok(error instanceof GitHubError);
  assert.equal(error.status, 405);
  assert.match(error.message, /HTTP 405/);
  assert.ok(!error.message.includes(TOKEN));
});

test('githubClient : réseau en panne → statut 0, sans jeton', async () => {
  const gh = githubClient({ token: TOKEN, repo: REPO, fetch: async () => { throw new Error(`boom ${TOKEN}`); } });
  const error = await gh.getPullRequest(1).catch((e) => e);
  assert.equal(error.status, 0);
  assert.ok(!error.message.includes(TOKEN));
});

test('githubClient : GraphQL markPullRequestReadyForReview, erreurs GraphQL levées', async () => {
  let body;
  const { fetch } = fakeFetch((url, init) => {
    body = JSON.parse(init.body);
    return { body: { errors: [{ message: 'not allowed' }] } };
  });
  const gh = githubClient({ token: TOKEN, repo: REPO, fetch });
  await assert.rejects(gh.markReadyForReview('PR_x'), /GraphQL : not allowed/);
  assert.match(body.query, /markPullRequestReadyForReview/);
  assert.deepEqual(body.variables, { id: 'PR_x' });
});

test('githubClient : fichiers du diff (anciens noms compris), check-runs, dispatch, PR blog-auto, issues', async () => {
  const { fetch, calls } = fakeFetch((url) => {
    if (url.includes('/files')) return { body: [{ filename: 'a', status: 'added', sha: 'x' }, { filename: 'b', status: 'renamed', previous_filename: 'old' }] };
    if (url.includes('/check-runs')) return { body: { check_runs: [run(1, 's', 'completed', 'success')] } };
    if (url.includes('/issues?labels=')) return { body: [{ number: 1, pull_request: {} }, { number: 2 }] };
    if (url.includes('/issues?state=open')) return { body: [{ number: 3 }, { number: 4, pull_request: {} }] };
    return { status: 204 };
  });
  const gh = githubClient({ token: TOKEN, repo: REPO, fetch });
  assert.deepEqual(await gh.listPullRequestFiles(7), [
    { filename: 'a', status: 'added' },
    { filename: 'b', status: 'renamed', previous_filename: 'old' },
  ]);
  assert.equal((await gh.listCheckRuns('s'))[0].conclusion, 'success');
  assert.ok(calls.at(-1).url.includes('/commits/s/check-runs?check_name=ci'));
  await gh.dispatchWorkflow('ci.yml', 'blog/2026-11-08', { blog_auto: 'true' });
  assert.ok(calls.at(-1).url.endsWith(`/repos/${REPO}/actions/workflows/ci.yml/dispatches`));
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { ref: 'blog/2026-11-08', inputs: { blog_auto: 'true' } });
  assert.deepEqual((await gh.listBlogAutoPullRequests()).map((i) => i.number), [1]);
  assert.deepEqual((await gh.listOpenIssues()).map((i) => i.number), [3]);
});

test('githubClient : compare, update-branch, commentaire et fermeture d’issue (méthode, URL, corps)', async () => {
  const { fetch, calls } = fakeFetch(() => ({ body: {} }));
  const gh = githubClient({ token: TOKEN, repo: REPO, fetch });
  const last = () => ({ method: calls.at(-1).init.method, url: calls.at(-1).url, body: calls.at(-1).init.body && JSON.parse(calls.at(-1).init.body) });
  await gh.compare('main', 'abc');
  assert.deepEqual(last(), { method: 'GET', url: `https://api.github.com/repos/${REPO}/compare/main...abc`, body: undefined });
  await gh.updateBranch(7, 'abc');
  assert.deepEqual(last(), { method: 'PUT', url: `https://api.github.com/repos/${REPO}/pulls/7/update-branch`, body: { expected_head_sha: 'abc' } });
  await gh.commentIssue(3, 'reprise');
  assert.deepEqual(last(), { method: 'POST', url: `https://api.github.com/repos/${REPO}/issues/3/comments`, body: { body: 'reprise' } });
  await gh.closeIssue(3);
  const close = last();
  assert.equal(close.method, 'PATCH');
  assert.equal(close.url, `https://api.github.com/repos/${REPO}/issues/3`);
  assert.equal(close.body.state, 'closed');
});

test('githubClient : jeton ou dépôt absents refusés', () => {
  assert.throws(() => githubClient({ token: '', repo: REPO, fetch: async () => {} }), /GITHUB_TOKEN absent/);
  assert.throws(() => githubClient({ token: TOKEN, repo: 'nope', fetch: async () => {} }), /GITHUB_REPOSITORY invalide/);
});

test('runCli : sous-commande inconnue refusée ; redact masque le jeton', async () => {
  await assert.rejects(runCli(['publish'], { env: { GITHUB_TOKEN: TOKEN, GITHUB_REPOSITORY: REPO } }), /sous-commande inconnue/);
  assert.equal(redact(`x ${TOKEN} y`, TOKEN), 'x [jeton masqué] y');
});

test('runCli watchdog : bout à bout sur fetch simulé, issue assignée à WATCHDOG_ASSIGNEE', async () => {
  const { fetch, calls } = fakeFetch((url, init) => {
    if (init.method === 'POST' && url.endsWith('/issues')) return { status: 201, body: { number: 9 } };
    return { body: [] };
  });
  const code = await runCli(['watchdog'], { env: { GITHUB_TOKEN: TOKEN, GITHUB_REPOSITORY: REPO, WATCHDOG_ASSIGNEE: 'MMann5' }, fetch, now: () => NOW, log: () => {} });
  assert.equal(code, 0);
  const create = calls.find((c) => c.init.method === 'POST');
  assert.deepEqual(JSON.parse(create.init.body).assignees, ['MMann5']);
});
