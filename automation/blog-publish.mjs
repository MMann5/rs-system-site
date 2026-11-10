// Story 6.5 (FR37, AD-11, AD-12, décision D4 de l'epic 6, DW-25) : publication automatique des PR `blog-auto` après 48 h
// et sentinelle qui alerte Mike si la routine se tait.
// Lancé uniquement par .github/workflows/blog-automerge.yml et blog-watchdog.yml (chaque jour à 06:00 UTC), depuis `main`.
// Fonctions de décision pures exportées et testées sans réseau (tests/blog-publish.test.mjs) ; le client GitHub reçoit
// `fetch` en paramètre. Ce n'est pas une porte de build : ni `npm run lint` ni la CI ne le lancent.
//
// Usage :
//   node automation/blog-publish.mjs automerge
//   node automation/blog-publish.mjs watchdog
// Environnement : GITHUB_TOKEN (jeton du workflow), GITHUB_REPOSITORY (`propriétaire/dépôt`), WATCHDOG_ASSIGNEE (watchdog),
// GITHUB_STEP_SUMMARY (facultatif : résumé du job). Le jeton n'est jamais écrit, journalisé ni cité.
// Code de sortie 1 si une PR éligible n'a pas été fusionnée (automerge) ou en cas d'erreur.
import { appendFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { isMain } from '../scripts/checks/report.mjs';
import { POSTS_DIR } from '../src/lib/blog/core.ts';
import { scopeErrors } from './blog-routine.mjs';

const HOUR = 60 * 60 * 1000;

/** Âge minimal d'une PR `blog-auto` avant fusion automatique (FR37). */
export const MIN_AGE_MS = 48 * HOUR;
/** Silence de la routine au-delà duquel le watchdog ouvre une issue (FR37). */
export const SILENCE_MS = 8 * 24 * HOUR;
/** Attente maximale du contrôle `ci` sur la tête d'une PR. */
export const CI_TIMEOUT_MS = 30 * 60 * 1000;
/** Attente maximale de la nouvelle tête après `update-branch`. */
export const UPDATE_TIMEOUT_MS = 2 * 60 * 1000;
export const CI_POLL_MS = 30 * 1000;
export const UPDATE_POLL_MS = 10 * 1000;

export const BASE_BRANCH = 'main';
export const LABEL = 'blog-auto';
export const HOLD_LABEL = 'hold';
/** Nom du contrôle exigé par la protection de `main` (job `ci` de ci.yml, application GitHub Actions). */
export const CI_CHECK = 'ci';
export const CI_WORKFLOW = 'ci.yml';
export const CI_APP_SLUG = 'github-actions';
export const MERGE_METHOD = 'merge';
/** Marqueur des issues ouvertes par le watchdog (repérage, pas de doublon). */
export const WATCHDOG_MARKER = '<!-- blog-watchdog -->';
export const WATCHDOG_TITLE = 'Blog : aucune PR blog-auto depuis 8 jours';

export const GITHUB_API = 'https://api.github.com';
const MAX_PAGES = 10;

/** Erreur d'un appel à l'API GitHub : statut HTTP (0 si réseau), message sans jeton. */
export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Raison pour laquelle une PR éligible n'est pas fusionnée (code 1). */
class Failure extends Error {}
/** Raison pour laquelle une PR n'est plus éligible pendant la passe (simple ligne, code 0). */
class Skip extends Error {}

// — Décisions pures —

const labelNames = (pr) => (Array.isArray(pr?.labels) ? pr.labels.map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean) : []);
const createdMs = (item) => {
  const ms = Date.parse(item?.created_at ?? '');
  return Number.isNaN(ms) ? null : ms;
};

/** Éligibilité d'une PR à la fusion automatique : `{ eligible: true }` ou `{ eligible: false, reason }`. */
export function prEligibility(pr, { now, repo }) {
  const labels = labelNames(pr);
  if (pr?.state !== 'open') return { eligible: false, reason: 'PR non ouverte' };
  if (!labels.includes(LABEL)) return { eligible: false, reason: `sans étiquette ${LABEL}` };
  if (labels.includes(HOLD_LABEL)) return { eligible: false, reason: `retenue (étiquette ${HOLD_LABEL})` };
  if (pr?.base?.ref !== BASE_BRANCH) return { eligible: false, reason: `ne vise pas ${BASE_BRANCH}` };
  if (!pr?.head?.repo?.full_name || pr.head.repo.full_name !== repo) return { eligible: false, reason: 'tête dans un autre dépôt (fork)' };
  const created = createdMs(pr);
  if (created === null) return { eligible: false, reason: 'date de création illisible' };
  const age = now - created;
  if (age < MIN_AGE_MS) return { eligible: false, reason: `trop jeune (${Math.floor(age / HOUR)} h sur 48 h)` };
  return { eligible: true };
}

const POST_PATH_RE = new RegExp(`^${POSTS_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/`);

/** Id de l'unique dossier `src/content/posts/{id}/` touché par le diff, sinon `null` (zéro ou plusieurs). */
export function postIdFromFiles(files) {
  const ids = new Set(files.map((f) => POST_PATH_RE.exec(f)?.[1]).filter(Boolean));
  return ids.size === 1 ? [...ids][0] : null;
}

/**
 * Raisons de refus du périmètre (DW-25) : un seul article, ses 5 fichiers et sa photo, tous ajoutés, rien d'autre. `[]` si OK.
 * `entries` : fichiers du diff, `{ filename, status, previous_filename? }` (API GitHub) ou chemins (statut `added`).
 */
export function prScopeErrors(entries) {
  const list = entries.map((e) => (typeof e === 'string' ? { filename: e, status: 'added' } : e));
  // La routine ne fait qu'ajouter un article : modifier, supprimer ou renommer un fichier est refusé.
  const statusErrors = list
    .filter((e) => e.status !== 'added')
    .map((e) => `fichier ${e.previous_filename ? `${e.previous_filename} → ` : ''}${e.filename} au statut ${e.status} (seul un ajout est permis)`);
  const files = list.flatMap((e) => [e.filename, e.previous_filename].filter(Boolean));
  const ids = [...new Set(files.map((f) => POST_PATH_RE.exec(f)?.[1]).filter(Boolean))].sort();
  if (ids.length === 0) return [`aucun dossier ${POSTS_DIR}/{id}/ dans le diff`];
  if (ids.length > 1) return [`plusieurs articles dans le diff : ${ids.join(', ')}`];
  return [...statusErrors, ...scopeErrors(files, ids[0]).map((file) => `hors périmètre de l'article ${ids[0]} : ${file}`)];
}

/**
 * Verdict du dernier contrôle `ci` (GitHub Actions, plus grand `id`) posé sur la tête `sha` :
 * `success`, `failure` (toute autre conclusion), `pending` (en cours) ou `absent`.
 */
export function ciVerdict(checkRuns, sha) {
  const runs = (Array.isArray(checkRuns) ? checkRuns : []).filter(
    (r) => r?.name === CI_CHECK && r?.head_sha === sha && (r?.app == null || r.app.slug === CI_APP_SLUG),
  );
  if (runs.length === 0) return 'absent';
  const last = runs.reduce((a, b) => (b.id > a.id ? b : a));
  if (last.status !== 'completed') return 'pending';
  return last.conclusion === 'success' ? 'success' : 'failure';
}

/** Auteur des issues du watchdog (jeton du workflow) : une issue marquée par quelqu'un d'autre n'est pas la sienne. */
export const WATCHDOG_AUTHOR = 'github-actions[bot]';
const isWatchdogIssue = (issue) => issue?.user?.login === WATCHDOG_AUTHOR && !issue?.pull_request && issue?.state === 'open' && typeof issue?.body === 'string' && issue.body.includes(WATCHDOG_MARKER);

/**
 * Décision du watchdog : `open` (silence, aucune issue ouverte), `close` (reprise, issues à fermer), `none`.
 * `prs` : PR `blog-auto` de tous états ; `issues` : issues ouvertes du dépôt.
 */
export function watchdogDecision({ prs, issues, now }) {
  const dated = (prs ?? []).map((pr) => ({ pr, ms: createdMs(pr) })).filter((x) => x.ms !== null);
  const latest = dated.length ? dated.reduce((a, b) => (b.ms > a.ms ? b : a)) : null;
  const open = (issues ?? []).filter(isWatchdogIssue);
  const silent = !latest || now - latest.ms >= SILENCE_MS;
  const base = { latest: latest?.pr ?? null, issues: open };
  if (silent) return { ...base, action: open.length ? 'none' : 'open', reason: open.length ? 'silence, issue déjà ouverte' : 'silence' };
  return { ...base, action: open.length ? 'close' : 'none', reason: open.length ? 'reprise' : 'routine active' };
}

/** Texte de l'issue du watchdog. */
export function watchdogIssueBody(latest, now) {
  const since = latest
    ? `Dernière PR \`${LABEL}\` : #${latest.number} « ${latest.title ?? ''} », ouverte le ${String(latest.created_at).slice(0, 10)} (il y a ${Math.floor((now - createdMs(latest)) / (24 * HOUR))} jours).`
    : `La routine n'a ouvert aucune PR encore (étiquette \`${LABEL}\`).`;
  return [
    WATCHDOG_MARKER,
    `La routine hebdomadaire du blog n'a ouvert aucune PR \`${LABEL}\` depuis 8 jours.`,
    '',
    since,
    '',
    'À vérifier :',
    '- la tâche planifiée Claude Code (planning activé, quota de l’abonnement, clé `PEXELS_API_KEY`) ;',
    '- son dernier journal d’exécution ;',
    '- `automation/routine-prompt.md` (fiche de configuration et prompt).',
    '',
    'Cette issue est fermée automatiquement à la prochaine PR `blog-auto`. Aucune autre issue n’est ouverte tant qu’elle reste ouverte.',
  ].join('\n');
}

// — Client GitHub —

const nextLink = (header) => /<([^>]+)>;\s*rel="next"/.exec(header ?? '')?.[1] ?? null;

/** Client REST + GraphQL minimal ; `fetch` injecté ; erreurs avec statut, sans jeton. */
export function githubClient({ token, repo, fetch: fetchImpl = globalThis.fetch, api = GITHUB_API }) {
  if (typeof token !== 'string' || token.trim() === '') throw new GitHubError(0, 'GITHUB_TOKEN absent');
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo))) throw new GitHubError(0, `GITHUB_REPOSITORY invalide : ${String(repo)}`);
  const secret = token.trim();
  const clean = (text) => String(text).split(secret).join('[jeton masqué]');
  const headers = {
    Authorization: `Bearer ${secret}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'rs-system-blog-publish',
  };

  async function send(method, url, body) {
    if (!url.startsWith(`${api}/`)) throw new GitHubError(0, `${method} : adresse refusée hors de l'API GitHub`);
    const label = `${method} ${url.slice(api.length)}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
      });
    } catch (error) {
      throw new GitHubError(0, clean(`${label} : GitHub injoignable (${error?.message ?? error})`));
    }
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      throw new GitHubError(response.status, clean(`${label} : HTTP ${response.status}${json?.message ? ` ${json.message}` : ''}`));
    }
    return { json, link: response.headers.get('link') };
  }

  const path = (p) => `${api}/repos/${repo}${p}`;
  const request = async (method, p, body) => (await send(method, path(p), body)).json;
  /** GET paginé (lien `next`), au plus MAX_PAGES pages ; `pick` extrait le tableau d'une page. */
  async function paginate(p, pick = (j) => j) {
    const items = [];
    let url = path(p);
    for (let page = 0; url && page < MAX_PAGES; page += 1) {
      const { json, link } = await send('GET', url);
      items.push(...(pick(json) ?? []));
      url = nextLink(link);
    }
    return items;
  }
  async function graphql(query, variables) {
    const { json } = await send('POST', `${api}/graphql`, { query, variables });
    if (Array.isArray(json?.errors) && json.errors.length) {
      throw new GitHubError(200, clean(`GraphQL : ${json.errors.map((e) => e?.message).join(' ; ')}`));
    }
    return json?.data;
  }

  return {
    repo,
    request,
    graphql,
    /** Plus anciennes d'abord : après un retard, les articles partent dans l'ordre. */
    listOpenPullRequests: () => paginate(`/pulls?state=open&base=${BASE_BRANCH}&sort=created&direction=asc&per_page=100`),
    getPullRequest: (n) => request('GET', `/pulls/${n}`),
    /** Fichiers du diff : `{ filename, status, previous_filename? }` (ancien nom des renommages compris). */
    listPullRequestFiles: async (n) =>
      (await paginate(`/pulls/${n}/files?per_page=100`)).map(({ filename, status, previous_filename }) => ({
        filename,
        status,
        ...(previous_filename ? { previous_filename } : {}),
      })),
    markReadyForReview: (nodeId) =>
      graphql('mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }', { id: nodeId }),
    compare: (base, head) => request('GET', `/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`),
    updateBranch: (n, expectedHeadSha) => request('PUT', `/pulls/${n}/update-branch`, { expected_head_sha: expectedHeadSha }),
    listCheckRuns: (sha) => paginate(`/commits/${sha}/check-runs?check_name=${CI_CHECK}&per_page=100`, (j) => j?.check_runs),
    dispatchWorkflow: (file, ref, inputs) => request('POST', `/actions/workflows/${file}/dispatches`, { ref, inputs }),
    mergePullRequest: (n, sha) => request('PUT', `/pulls/${n}/merge`, { sha, merge_method: MERGE_METHOD }),
    /** PR `blog-auto` de tous états (API issues : les PR y portent `pull_request`), plus récentes d'abord. */
    listBlogAutoPullRequests: async () =>
      (await paginate(`/issues?labels=${LABEL}&state=all&sort=created&direction=desc&per_page=100`)).filter((i) => i.pull_request),
    listOpenIssues: async () => (await paginate('/issues?state=open&per_page=100')).filter((i) => !i.pull_request),
    createIssue: (issue) => request('POST', '/issues', issue),
    commentIssue: (n, body) => request('POST', `/issues/${n}/comments`, { body }),
    closeIssue: (n) => request('PATCH', `/issues/${n}`, { state: 'closed', state_reason: 'completed' }),
  };
}

// — Automerge —

/** Attend le verdict du contrôle `ci` sur `sha` ; lance ci.yml (blog_auto) sur `ref` s'il est absent. */
async function waitForCi({ gh, sha, ref, now, sleep }) {
  const deadline = now() + CI_TIMEOUT_MS;
  let dispatched = false;
  for (;;) {
    const verdict = ciVerdict(await gh.listCheckRuns(sha), sha);
    if (verdict === 'success') return;
    if (verdict === 'failure') throw new Failure(`contrôle ${CI_CHECK} rouge sur ${sha.slice(0, 7)}`);
    if (verdict === 'absent' && !dispatched) {
      await gh.dispatchWorkflow(CI_WORKFLOW, ref, { blog_auto: 'true' });
      dispatched = true;
    }
    if (now() >= deadline) throw new Failure(`contrôle ${CI_CHECK} toujours ${verdict === 'absent' ? 'absent' : 'en cours'} après 30 min sur ${sha.slice(0, 7)}`);
    await sleep(CI_POLL_MS);
  }
}

/** Attend que la tête de la PR change après `update-branch`. */
async function waitForNewHead({ gh, number, oldSha, now, sleep }) {
  const deadline = now() + UPDATE_TIMEOUT_MS;
  for (;;) {
    await sleep(UPDATE_POLL_MS);
    const pr = await gh.getPullRequest(number);
    if (pr?.head?.sha && pr.head.sha !== oldSha) return pr.head.sha;
    if (now() >= deadline) throw new Failure(`tête inchangée 2 min après la mise à jour avec ${BASE_BRANCH}`);
  }
}

const assertScope = (files) => {
  const errors = prScopeErrors(files);
  if (errors.length) throw new Failure(`périmètre refusé\n${errors.map((e) => `    - ${e}`).join('\n')}`);
};

/** Traite une PR éligible ; rend le SHA fusionné. Lève Failure (non fusionnée) ou Skip (plus éligible). */
async function publish({ gh, pr, now, sleep }) {
  assertScope(await gh.listPullRequestFiles(pr.number));
  if (pr.draft) await gh.markReadyForReview(pr.node_id);
  let head = pr.head.sha;
  const cmp = await gh.compare(BASE_BRANCH, head);
  if (Number(cmp?.behind_by) > 0) {
    await gh.updateBranch(pr.number, head);
    head = await waitForNewHead({ gh, number: pr.number, oldSha: head, now, sleep });
  }
  await waitForCi({ gh, sha: head, ref: pr.head.ref, now, sleep });
  // Relecture juste avant la fusion : périmètre de la tête vérifiée, étiquettes, tête inchangée.
  assertScope(await gh.listPullRequestFiles(pr.number));
  const fresh = await gh.getPullRequest(pr.number);
  const labels = labelNames(fresh);
  if (fresh?.state !== 'open') throw new Skip('PR fermée pendant la passe');
  if (labels.includes(HOLD_LABEL)) throw new Skip(`retenue (étiquette ${HOLD_LABEL} posée pendant la passe)`);
  if (!labels.includes(LABEL)) throw new Skip(`étiquette ${LABEL} retirée pendant la passe`);
  if (fresh?.head?.sha !== head) throw new Failure(`tête modifiée pendant la passe (${head.slice(0, 7)} → ${String(fresh?.head?.sha).slice(0, 7)})`);
  await gh.mergePullRequest(pr.number, head);
  return head;
}

/**
 * Passe quotidienne de fusion automatique. `now()` rend l'instant en ms ; `sleep(ms)` attend.
 * Rend `{ results: [{ number, status: merged|ignored|failed, reason }], lines, exitCode }`.
 */
export async function runAutomerge({ gh, now = Date.now, sleep = delay, log = () => {} }) {
  const results = [];
  const prs = (await gh.listOpenPullRequests()).filter((pr) => labelNames(pr).includes(LABEL));
  for (const pr of prs) {
    const name = `#${pr.number} « ${pr.title ?? ''} »`;
    const eligibility = prEligibility(pr, { now: now(), repo: gh.repo });
    let result;
    if (!eligibility.eligible) {
      result = { number: pr.number, status: 'ignored', reason: eligibility.reason };
    } else {
      try {
        const sha = await publish({ gh, pr, now, sleep });
        result = { number: pr.number, status: 'merged', reason: `fusionnée (${sha.slice(0, 7)})` };
      } catch (error) {
        if (error instanceof Skip) result = { number: pr.number, status: 'ignored', reason: error.message };
        else if (error instanceof Failure || error instanceof GitHubError) result = { number: pr.number, status: 'failed', reason: error.message };
        else throw error;
      }
    }
    const word = { merged: 'fusionnée', ignored: 'ignorée', failed: 'NON FUSIONNÉE' }[result.status];
    result.line = `${name} : ${word}${result.status === 'merged' ? '' : ` : ${result.reason}`}`;
    log(result.line);
    results.push(result);
  }
  if (prs.length === 0) log(`aucune PR ${LABEL} ouverte`);
  const exitCode = results.some((r) => r.status === 'failed') ? 1 : 0;
  return { results, lines: results.length ? results.map((r) => r.line) : [`aucune PR ${LABEL} ouverte`], exitCode };
}

// — Watchdog —

/** Passe quotidienne du watchdog. Rend `{ action, issue, lines, exitCode }`. */
export async function runWatchdog({ gh, now = Date.now, log = () => {}, assignee }) {
  const at = now();
  const decision = watchdogDecision({ prs: await gh.listBlogAutoPullRequests(), issues: await gh.listOpenIssues(), now: at });
  const lines = [];
  const say = (line) => {
    lines.push(line);
    log(line);
  };
  let issue = null;
  if (decision.action === 'open') {
    const body = watchdogIssueBody(decision.latest, at);
    try {
      issue = await gh.createIssue({ title: WATCHDOG_TITLE, body, ...(assignee ? { assignees: [assignee] } : {}) });
    } catch (error) {
      if (!(error instanceof GitHubError) || !assignee || error.status !== 422) throw error;
      say(`assignation à ${assignee} refusée (HTTP ${error.status}) : issue ouverte sans assignation`);
      issue = await gh.createIssue({ title: WATCHDOG_TITLE, body });
    }
    say(`silence de la routine : issue #${issue?.number} ouverte`);
  } else if (decision.action === 'close') {
    for (const open of decision.issues) {
      const pr = decision.latest;
      await gh.commentIssue(open.number, `La routine a repris : PR #${pr.number} ouverte le ${String(pr.created_at).slice(0, 10)}. Issue fermée automatiquement.`);
      await gh.closeIssue(open.number);
      say(`routine active (PR #${pr.number}) : issue #${open.number} commentée et fermée`);
    }
  } else if (decision.issues.length) {
    say(`silence de la routine : issue #${decision.issues[0].number} déjà ouverte, rien de plus`);
  } else {
    say(decision.latest ? `routine active : dernière PR #${decision.latest.number} du ${String(decision.latest.created_at).slice(0, 10)}` : 'rien à faire');
  }
  return { action: decision.action, issue, lines, exitCode: 0 };
}

// — CLI —

const writeSummary = (env, title, lines) => {
  if (!env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(env.GITHUB_STEP_SUMMARY, `## ${title}\n\n${lines.map((l) => `- ${l.replace(/\n/g, '\n  ')}`).join('\n')}\n`);
};

/** Exécute la sous-commande ; rend le code de sortie. */
export async function runCli(argv, { env = process.env, fetch: fetchImpl = globalThis.fetch, now = Date.now, sleep = delay, log = console.log } = {}) {
  const [command] = argv;
  if (command !== 'automerge' && command !== 'watchdog') {
    throw new GitHubError(0, `sous-commande inconnue : ${command ?? '(aucune)'} (attendu : automerge, watchdog)`);
  }
  const gh = githubClient({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPOSITORY, fetch: fetchImpl });
  if (command === 'automerge') {
    const report = await runAutomerge({ gh, now, sleep, log });
    writeSummary(env, 'Publication automatique du blog', report.lines);
    return report.exitCode;
  }
  const report = await runWatchdog({ gh, now, log, assignee: env.WATCHDOG_ASSIGNEE?.trim() || undefined });
  writeSummary(env, 'Sentinelle du blog', report.lines);
  return report.exitCode;
}

/** Retire toute occurrence du jeton d'un message (dernier filet). */
export const redact = (message, token) => (token && token.trim() ? String(message).split(token.trim()).join('[jeton masqué]') : String(message));

if (isMain(import.meta.url)) {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof GitHubError ? error.message : `erreur inattendue : ${error?.message ?? error}`;
    const text = `blog-publish : ${redact(message, process.env.GITHUB_TOKEN)}`;
    process.stderr.write(`${text}\n`);
    try {
      writeSummary(process.env, 'blog-publish : erreur', [redact(message, process.env.GITHUB_TOKEN)]);
    } catch {
      // résumé facultatif
    }
    process.exitCode = 1;
  }
}
