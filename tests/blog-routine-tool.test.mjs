// Story 6.4 (FR36, AD-12, décisions D1, D4, D5, D6 de l'epic 6) : automation/blog-routine.mjs, outil des gestes
// mécaniques de la routine hebdomadaire. Aucun appel réseau : `fetch` simulé, fixtures, dossiers temporaires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  downloadPhoto,
  jerusalemDate,
  jpegSize,
  parseTopics,
  pexelsCandidates,
  pickTopic,
  planRun,
  redact,
  runCli,
  scopeErrors,
  searchPhotos,
} from '../automation/blog-routine.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TOOL = join(ROOT, 'automation/blog-routine.mjs');
const TOPICS = parseTopics(readFileSync(join(ROOT, 'automation/blog-routine.md'), 'utf8'));
const SEARCH = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/pexels-search.json'), 'utf8'));
const KEY = 'test-key-do-not-leak-7f3a9c';
const EXISTING = ['how-many-smoke-detectors'];

// — JPEG minimal construit en mémoire : SOI, APP0, SOF0 (hauteur, largeur), EOI. —
function jpeg(width, height) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const photoJson = (id, over = {}) => ({ ...SEARCH.photos.find((p) => p.id === id), ...over });

/** `fetch` simulé : enregistre les appels, répond selon l'hôte et le chemin. */
function fakeFetch({ photo = photoJson(1001), image = jpeg(2400, 1600), apiStatus = 200, imageStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const { hostname, pathname } = new URL(url);
    if (hostname === 'api.pexels.com') {
      const body = pathname.startsWith('/v1/search') ? SEARCH : photo;
      return new Response(JSON.stringify(body), { status: apiStatus, headers: { 'content-type': 'application/json' } });
    }
    if (hostname === 'images.pexels.com') return new Response(image, { status: imageStatus });
    throw new Error(`hôte inattendu ${hostname}`);
  };
  return { fetch, calls };
}

const tempRoot = () => mkdtempSync(join(tmpdir(), 'blog-routine-'));
const target = (root, id = 'choosing-home-cameras') => join(root, 'src/assets/blog', `${id}.jpg`);

async function rejectsWithoutKey(promise, pattern) {
  const error = await promise.then(
    () => assert.fail('erreur attendue'),
    (e) => e,
  );
  assert.match(error.message, pattern);
  assert.ok(!error.message.includes(KEY), `la clé ne doit pas apparaître : ${error.message}`);
  return error;
}

// — Dates (D4) —

test('plan normal : 2026-11-15T05:00Z → runDate 15, publication 17, branche blog/2026-11-15, sujet n° 1 avec photo', () => {
  const plan = planRun({ instant: new Date('2026-11-15T05:00:00Z'), topics: TOPICS, existingIds: EXISTING });
  assert.equal(plan.runDate, '2026-11-15');
  assert.equal(plan.publishDate, '2026-11-17');
  assert.equal(plan.branch, 'blog/2026-11-15');
  assert.equal(plan.topic.n, 1);
  assert.equal(plan.topic.id, 'choosing-home-cameras');
  assert.equal(plan.topic.category, 'cameras');
  assert.equal(plan.photo, true);
});

test('fuseau : 2026-11-14T22:30Z est déjà le 15 à Jérusalem ; heure d’été aussi', () => {
  assert.equal(jerusalemDate(new Date('2026-11-14T22:30:00Z')), '2026-11-15');
  assert.equal(jerusalemDate(new Date('2026-11-14T21:59:00Z')), '2026-11-14');
  assert.equal(jerusalemDate(new Date('2026-07-04T21:30:00Z')), '2026-07-05'); // UTC+3
  assert.equal(planRun({ instant: new Date('2026-11-14T22:30:00Z'), topics: TOPICS, existingIds: EXISTING }).runDate, '2026-11-15');
});

test('fin de mois et d’année : 2026-12-30 + 2 → 2027-01-01 ; février bissextile', () => {
  assert.equal(addDays('2026-12-30', 2), '2027-01-01');
  assert.equal(addDays('2026-11-29', 2), '2026-12-01');
  assert.equal(addDays('2028-02-28', 2), '2028-03-01');
  assert.equal(planRun({ instant: new Date('2026-12-30T08:00:00Z'), topics: TOPICS, existingIds: EXISTING }).publishDate, '2027-01-01');
  assert.throws(() => addDays('30/12/2026', 2), /AAAA-MM-JJ/);
});

// — Sujets (D5) —

test('parseTopics lit la vraie table §11 de blog-routine.md', () => {
  assert.ok(TOPICS.length >= 6);
  assert.deepEqual(TOPICS.map((t) => t.n), TOPICS.map((_, i) => i + 1));
  assert.deepEqual(TOPICS[0], { n: 1, title: 'איך בוחרים מצלמות אבטחה לבית פרטי', category: 'cameras', id: 'choosing-home-cameras' });
  assert.equal(TOPICS[6].category, 'smoke-detectors');
});

test('sujet déjà fait : dossier choosing-home-cameras → sujet n° 2', () => {
  assert.equal(pickTopic(TOPICS, [...EXISTING, 'choosing-home-cameras']).n, 2);
});

test('PR blog-auto ouverte : fichier, titre ou branche portant l’id → sujet suivant', () => {
  const done = [...EXISTING, 'choosing-home-cameras'];
  const byFile = [{ number: 7, title: 'Blog : article', headRefName: 'blog/2026-11-08', files: [{ path: 'src/content/posts/when-to-replace-building-intercom/he.md', additions: 1, deletions: 0 }] }];
  assert.equal(pickTopic(TOPICS, done, byFile).n, 3);
  assert.equal(pickTopic(TOPICS, done, [{ title: 'Blog : when-to-replace-building-intercom', headRefName: 'blog/2026-11-08', files: [] }]).n, 3);
  assert.equal(pickTopic(TOPICS, done, [{ title: 'x', headRefName: 'blog/when-to-replace-building-intercom', files: [] }]).n, 3);
  // Un fichier d'un autre article ou la photo seule ne compte pas ; une PR sans `files` non plus.
  assert.equal(pickTopic(TOPICS, done, [{ title: 'x', headRefName: 'blog/2026-11-08', files: ['src/content/posts/other/he.md'] }]).n, 2);
  assert.equal(pickTopic(TOPICS, done, [{ number: 9 }]).n, 2);
});

test('liste épuisée → topic null, photo null', () => {
  const plan = planRun({ instant: new Date('2026-11-15T05:00:00Z'), topics: TOPICS, existingIds: TOPICS.map((t) => t.id) });
  assert.equal(plan.topic, null);
  assert.equal(plan.photo, null);
});

test('sujet smoke-detectors (n° 7) → photo false ; photo-download refuse', async () => {
  const done = TOPICS.slice(0, 6).map((t) => t.id);
  const plan = planRun({ instant: new Date('2026-11-15T05:00:00Z'), topics: TOPICS, existingIds: done });
  assert.equal(plan.topic.n, 7);
  assert.equal(plan.topic.category, 'smoke-detectors');
  assert.equal(plan.photo, false);
  const root = tempRoot();
  try {
    const { fetch, calls } = fakeFetch();
    await rejectsWithoutKey(downloadPhoto({ photoId: '1001', postId: plan.topic.id, category: 'smoke-detectors', key: KEY, fetch, root }), /D1/);
    assert.equal(calls.length, 0, 'aucun appel Pexels');
    assert.ok(!existsSync(join(root, 'src')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// — Pexels —

test('pexelsCandidates : garde les horizontales ≥ 1920 px, rapport 1,3–1,9, sur images.pexels.com', () => {
  const candidates = pexelsCandidates(SEARCH);
  assert.deepEqual(candidates.map((c) => c.id), [1001, 1002]);
  assert.equal(candidates[0].page, 'https://www.pexels.com/photo/security-camera-on-wall-at-night-1001/');
  assert.equal(candidates[0].ratio, 1.5);
  assert.ok(candidates[0].preview.startsWith('https://images.pexels.com/'));
  assert.deepEqual(pexelsCandidates({}), []);
  assert.deepEqual(pexelsCandidates(null), []);
});

test('jpegSize : lit la largeur du SOF ; refuse PNG et octets tronqués', () => {
  assert.deepEqual(jpegSize(jpeg(2400, 1600)), { width: 2400, height: 1600 });
  assert.equal(jpegSize(PNG), null);
  assert.equal(jpegSize(Uint8Array.from([0xff, 0xd8, 0xff])), null);
  assert.equal(jpegSize(new Uint8Array()), null);
});

test('searchPhotos : api.pexels.com, clé dans Authorization, orientation paysage', async () => {
  const { fetch, calls } = fakeFetch();
  const candidates = await searchPhotos({ query: 'security camera night', key: KEY, fetch });
  assert.deepEqual(candidates.map((c) => c.id), [1001, 1002]);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.hostname, 'api.pexels.com');
  assert.equal(url.searchParams.get('query'), 'security camera night');
  assert.equal(url.searchParams.get('orientation'), 'landscape');
  assert.equal(calls[0].init.headers.Authorization, KEY);
  assert.equal(calls[0].init.redirect, 'error');
  assert.ok(!calls[0].url.includes(KEY), 'clé jamais dans l’URL');
});

test('photo-download : écrit src/assets/blog/{id}.jpg, largeur w = min(largeur, 2400), clé seulement vers l’API', async () => {
  const root = tempRoot();
  try {
    const { fetch, calls } = fakeFetch();
    const result = await downloadPhoto({ photoId: '1001', postId: 'choosing-home-cameras', category: 'cameras', key: KEY, fetch, root });
    assert.equal(result.file, 'src/assets/blog/choosing-home-cameras.jpg');
    assert.equal(result.image, 'choosing-home-cameras.jpg');
    assert.equal(result.width, 2400);
    assert.equal(result.page, 'https://www.pexels.com/photo/security-camera-on-wall-at-night-1001/');
    assert.deepEqual(new Uint8Array(readFileSync(target(root))), jpeg(2400, 1600));
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[0].url).href, 'https://api.pexels.com/v1/photos/1001');
    assert.equal(calls[0].init.headers.Authorization, KEY);
    const img = new URL(calls[1].url);
    assert.equal(img.hostname, 'images.pexels.com');
    assert.equal(img.searchParams.get('w'), '2400');
    assert.ok(!JSON.stringify(calls[1].init).includes(KEY), 'pas de clé vers le CDN');
    assert.ok(!JSON.stringify(result).includes(KEY));

    // Photo de 1920 px : w = 1920 (pas d'agrandissement).
    const small = fakeFetch({ photo: photoJson(1002), image: jpeg(1920, 1080) });
    await downloadPhoto({ photoId: '1002', postId: 'choosing-home-cameras', category: 'cameras', key: KEY, fetch: small.fetch, root });
    assert.equal(new URL(small.calls[1].url).searchParams.get('w'), '1920');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const refusals = [
  ['clé absente', { key: '' }, {}, /PEXELS_API_KEY absente/, 0],
  ['clé faite d’espaces', { key: '   ' }, {}, /PEXELS_API_KEY absente/, 0],
  ['hôte refusé (src.original hors images.pexels.com)', {}, { photo: photoJson(1006) }, /hôte refusé/, 1],
  ['photo trop petite selon Pexels', {}, { photo: photoJson(1003) }, /refusée/, 1],
  ['photo verticale', {}, { photo: photoJson(1004) }, /refusée/, 1],
  ['rapport trop carré', {}, { photo: photoJson(1007) }, /refusée/, 1],
  ['image reçue trop petite (1600 px)', {}, { image: jpeg(1600, 1067) }, /1600 px/, 2],
  ['octets PNG', {}, { image: PNG }, /pas un JPEG/, 2],
  ['fichier de plus de 5 Mo', {}, { image: (() => { const b = new Uint8Array(5 * 1024 * 1024 + 1); b.set(jpeg(2400, 1600)); return b; })() }, /octets/, 2],
  ['Pexels HTTP 429', {}, { apiStatus: 429 }, /HTTP 429/, 1],
  ['Pexels HTTP 500 sur le CDN', {}, { imageStatus: 500 }, /HTTP 500/, 2],
  ['catégorie inconnue', { category: 'unsure' }, {}, /catégorie inconnue/, 0],
  ['id d’article invalide', { postId: '../evil' }, {}, /id d'article invalide/, 0],
  ['id de photo invalide', { photoId: '1001/../x' }, {}, /id de photo/, 0],
];

for (const [name, args, fetchOptions, pattern, expectedCalls] of refusals) {
  test(`photo-download refuse (${name}) : rien n’est écrit, message sans clé`, async () => {
    const root = tempRoot();
    try {
      const { fetch, calls } = fakeFetch(fetchOptions);
      await rejectsWithoutKey(
        downloadPhoto({ photoId: '1001', postId: 'choosing-home-cameras', category: 'cameras', key: KEY, fetch, root, ...args }),
        pattern,
      );
      assert.equal(calls.length, expectedCalls);
      assert.ok(!existsSync(target(root)), 'aucun fichier écrit');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('Pexels injoignable : l’erreur réseau (même si elle cite la clé) n’est pas recopiée', async () => {
  const fetch = async () => {
    throw new Error(`boom ${KEY}`);
  };
  await rejectsWithoutKey(searchPhotos({ query: 'camera', key: KEY, fetch }), /injoignable/);
  const root = tempRoot();
  try {
    await rejectsWithoutKey(downloadPhoto({ photoId: '1001', postId: 'choosing-home-cameras', category: 'cameras', key: KEY, fetch, root }), /injoignable/);
    assert.ok(!existsSync(target(root)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// — Périmètre —

test('scopeErrors : seuls les 5 fichiers de l’article et sa photo', () => {
  const ok = ['meta.yaml', 'he.md', 'en.md', 'ru.md', 'fr.md'].map((f) => `src/content/posts/choosing-home-cameras/${f}`);
  assert.deepEqual(scopeErrors([...ok, 'src/assets/blog/choosing-home-cameras.jpg'], 'choosing-home-cameras'), []);
  assert.deepEqual(scopeErrors([...ok, 'scripts/checks/editorial.mjs'], 'choosing-home-cameras'), ['scripts/checks/editorial.mjs']);
  assert.deepEqual(
    scopeErrors(['src/content/posts/how-many-smoke-detectors/he.md', 'src/content/posts/choosing-home-cameras/notes.md', 'src/assets/blog/other.jpg'], 'choosing-home-cameras'),
    ['src/assets/blog/other.jpg', 'src/content/posts/choosing-home-cameras/notes.md', 'src/content/posts/how-many-smoke-detectors/he.md'],
  );
});

test('scope (CLI, dépôt git temporaire) : refuse main, liste les fichiers hors périmètre, accepte l’article seul', async () => {
  const repo = tempRoot();
  const g = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, stdio: 'pipe' });
  const put = (rel, body = 'x\n') => {
    mkdirSync(join(repo, rel, '..'), { recursive: true });
    writeFileSync(join(repo, rel), body);
  };
  try {
    g('init', '-q', '-b', 'main');
    put('scripts/checks/editorial.mjs');
    put('README.md');
    g('add', '.');
    g('commit', '-q', '-m', 'base');
    g('update-ref', 'refs/remotes/origin/main', 'HEAD');

    await assert.rejects(runCli(['scope', '--post', 'choosing-home-cameras'], { root: repo }), /branche courante est main/);

    g('switch', '-q', '--detach', 'HEAD');
    await assert.rejects(runCli(['scope', '--post', 'choosing-home-cameras'], { root: repo }), /« HEAD » refusée/);

    g('checkout', '-q', '-b', 'blog/2026-11-15');
    put('src/content/posts/choosing-home-cameras/meta.yaml');
    g('add', '.');
    g('commit', '-q', '-m', 'article');
    put('src/content/posts/choosing-home-cameras/he.md'); // non suivi
    put('src/assets/blog/choosing-home-cameras.jpg');
    assert.match(await runCli(['scope', '--post', 'choosing-home-cameras'], { root: repo }), /scope : OK/);

    put('scripts/checks/editorial.mjs', 'modifié\n'); // arbre
    const error = await runCli(['scope', '--post', 'choosing-home-cameras'], { root: repo }).catch((e) => e);
    assert.match(error.message, /1 fichier\(s\) hors du périmètre/);
    assert.match(error.message, /scripts\/checks\/editorial\.mjs/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// — CLI —

test('CLI plan --now : code 0, JSON sur stdout', () => {
  const run = spawnSync(process.execPath, [TOOL, 'plan', '--now', '2026-11-15T05:00:00Z'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.equal(plan.branch, 'blog/2026-11-15');
  assert.equal(plan.publishDate, '2026-11-17');
  assert.ok(plan.topic === null || typeof plan.topic.id === 'string');
});

test('CLI plan --open-prs : lit la sortie de gh pr list', () => {
  const dir = tempRoot();
  try {
    const file = join(dir, 'prs.json');
    const first = pickTopic(TOPICS, EXISTING);
    writeFileSync(file, JSON.stringify([{ number: 3, title: 'x', headRefName: 'blog/2026-11-08', files: [{ path: `src/content/posts/${first.id}/meta.yaml` }] }]));
    const run = spawnSync(process.execPath, [TOOL, 'plan', '--now', '2026-11-15T05:00:00Z', '--open-prs', file], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.notEqual(JSON.parse(run.stdout).topic?.id, first.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI : erreurs en français sur stderr, code 1, jamais la clé', () => {
  const env = { ...process.env, PEXELS_API_KEY: '' };
  const cases = [
    [['plan', '--now', 'pas-une-date'], /instant ISO invalide/],
    [['inconnue'], /sous-commande inconnue/],
    [['photo-search'], /--query/],
    [['photo-search', '--query', 'camera'], /PEXELS_API_KEY absente/],
    [['photo-download', '--photo', '1', '--post', 'x', '--category', 'smoke-detectors'], /D1/],
  ];
  for (const [args, pattern] of cases) {
    const run = spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8', env });
    assert.equal(run.status, 1, args.join(' '));
    assert.equal(run.stdout, '');
    assert.match(run.stderr, pattern);
  }
  // Clé présente mais réponse refusée par une validation locale : la clé n'apparaît nulle part.
  const run = spawnSync(process.execPath, [TOOL, 'photo-download', '--photo', 'abc', '--post', 'choosing-home-cameras', '--category', 'cameras'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PEXELS_API_KEY: KEY },
  });
  assert.equal(run.status, 1);
  assert.ok(!run.stderr.includes(KEY) && !run.stdout.includes(KEY));
});

test('runCli photo-search : JSON des candidats, sans la clé', async () => {
  const { fetch } = fakeFetch();
  const out = await runCli(['photo-search', '--query', 'camera'], { env: { PEXELS_API_KEY: KEY }, fetch });
  const data = JSON.parse(out);
  assert.equal(data.query, 'camera');
  assert.deepEqual(data.candidates.map((c) => c.id), [1001, 1002]);
  assert.ok(!out.includes(KEY));
});

test('redact : masque chaque occurrence de la clé (rognée), ne change rien sans clé', () => {
  assert.equal(redact(`a ${KEY} b ${KEY}`, `  ${KEY} `), 'a [clé masquée] b [clé masquée]');
  assert.equal(redact(`a ${KEY}`, ''), `a ${KEY}`);
  assert.equal(redact(`a ${KEY}`, '   '), `a ${KEY}`);
  assert.equal(redact('message', undefined), 'message');
});

test('runCli plan lit src/content/posts/ de la racine : dossier choosing-home-cameras → sujet n° 2', async () => {
  const root = tempRoot();
  try {
    mkdirSync(join(root, 'automation'), { recursive: true });
    writeFileSync(join(root, 'automation/blog-routine.md'), readFileSync(join(ROOT, 'automation/blog-routine.md')));
    mkdirSync(join(root, 'src/content/posts/choosing-home-cameras'), { recursive: true });
    const plan = JSON.parse(await runCli(['plan', '--now', '2026-11-15T05:00:00Z'], { root }));
    assert.equal(plan.topic.id, 'when-to-replace-building-intercom');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
