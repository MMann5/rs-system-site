// Story 6.4 (FR36, AD-11, AD-12, décisions D1, D4, D5, D6 de l'epic 6) : outil des gestes mécaniques de la routine
// hebdomadaire de rédaction (pas à pas : automation/routine-prompt.md ; consignes : automation/blog-routine.md).
// Logique pure exportée et testée sans réseau (tests/blog-routine-tool.test.mjs) ; les appels Pexels reçoivent `fetch`
// en paramètre. Ce n'est pas une porte de build : il n'est lancé ni par `npm run lint` ni par la CI.
//
// Usage :
//   node automation/blog-routine.mjs plan [--open-prs fichier.json] [--now ISO]
//   node automation/blog-routine.mjs photo-search --query "…"
//   node automation/blog-routine.mjs photo-download --photo <id Pexels> --post <id article> --category <code>
//   node automation/blog-routine.mjs scope --post <id article>
// `plan` et `photo-search` écrivent du JSON sur stdout. Erreur : message en français sur stderr, code 1.
// La clé Pexels est lue uniquement dans PEXELS_API_KEY ; elle n'est jamais écrite, journalisée ni citée.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DRAWN_CATEGORY, POST_CATEGORIES } from '../src/lib/page-schema.ts';
import { BLOG_IMAGES_DIR, POSTS_DIR } from '../src/lib/blog/core.ts';
import { isMain } from '../scripts/checks/report.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const ROUTINE_DOC = 'automation/blog-routine.md';
export const TIME_ZONE = 'Asia/Jerusalem';
/** Délai entre l'exécution et la publication (D4 : dimanche → mardi). */
export const PUBLISH_DELAY_DAYS = 2;

export const PEXELS_API = 'https://api.pexels.com/v1';
export const PEXELS_HOSTS = ['api.pexels.com', 'images.pexels.com'];
export const MIN_WIDTH = 1920;
export const MAX_DOWNLOAD_WIDTH = 2400;
export const MIN_RATIO = 1.3;
export const MAX_RATIO = 1.9;
export const MAX_BYTES = 5 * 1024 * 1024;

/** Fichiers qu'une exécution a le droit de toucher, pour l'article `id`. */
export const POST_FILES = ['meta.yaml', 'he.md', 'en.md', 'ru.md', 'fr.md'];

const POST_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHOTO_ID_RE = /^\d+$/;

/** Erreur destinée à l'utilisateur de l'outil (message en français, sans secret). */
export class RoutineError extends Error {}

// — Dates (D4) —

/** Date `AAAA-MM-JJ` de l'instant `instant` dans le fuseau Asia/Jerusalem. */
export function jerusalemDate(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RoutineError(`instant invalide : ${String(instant)}`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Date ISO `iso` + `n` jours (calendrier, sans fuseau). */
export function addDays(iso, n) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RoutineError(`date ISO AAAA-MM-JJ attendue : ${iso}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + n));
  return date.toISOString().slice(0, 10);
}

// — Sujets (D5, blog-routine.md §11) —

/** Lignes de la table des sujets : `| n | sujet | `catégorie` | `id` |` (même forme que tests/blog-routine.test.mjs). */
export function parseTopics(markdown) {
  return [...markdown.matchAll(/^\| (\d+) \| ([^|]+?) \| `([a-z-]+)` \| `([a-z0-9-]+)` \|$/gm)].map(([, n, title, category, id]) => ({
    n: Number(n),
    title,
    category,
    id,
  }));
}

/** Vrai si `text` contient `id` comme mot entier (pas comme morceau d'un autre id). */
const mentionsId = (text, id) => typeof text === 'string' && new RegExp(`(?:^|[^a-z0-9-])${id}(?:$|[^a-z0-9-])`).test(text);

/** Chemins des fichiers d'une PR (`gh pr list --json files` : `{ path }`, ou chaînes). */
const prPaths = (pr) => (Array.isArray(pr?.files) ? pr.files.map((f) => (typeof f === 'string' ? f : f?.path)).filter(Boolean) : []);

/** Vrai si une PR ouverte porte déjà l'article `id` (fichiers, titre ou branche). */
export function prCarriesTopic(pr, id) {
  const dir = `${POSTS_DIR}/${id}/`;
  return prPaths(pr).some((path) => path.startsWith(dir)) || mentionsId(pr?.title, id) || mentionsId(pr?.headRefName, id);
}

/** Premier sujet non traité : ni dossier dans posts/, ni PR blog-auto ouverte qui le porte. `null` si liste épuisée. */
export function pickTopic(topics, existingIds, openPrs = []) {
  const existing = new Set(existingIds);
  return topics.find((t) => !existing.has(t.id) && !openPrs.some((pr) => prCarriesTopic(pr, t.id))) ?? null;
}

/** Plan d'une exécution : dates, branche, sujet, photo attendue. */
export function planRun({ instant, topics, existingIds, openPrs = [] }) {
  const runDate = jerusalemDate(instant);
  const topic = pickTopic(topics, existingIds, openPrs);
  return {
    runDate,
    publishDate: addDays(runDate, PUBLISH_DELAY_DAYS),
    branch: `blog/${runDate}`,
    topic,
    // Liste épuisée : la routine choisit le sujet, donc la catégorie, donc la photo (§11, D1).
    photo: topic ? topic.category !== DRAWN_CATEGORY : null,
  };
}

// — Pexels (blog-routine.md §8, D1) —

/** Lève si `url` n'est pas une adresse https d'un hôte permis. */
export function assertPexelsUrl(url, hosts = PEXELS_HOSTS) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new RoutineError(`adresse Pexels invalide : ${String(url)}`);
  }
  if (parsed.protocol !== 'https:' || !hosts.includes(parsed.hostname)) {
    throw new RoutineError(`hôte refusé : ${parsed.protocol}//${parsed.hostname} (permis : ${hosts.join(', ')})`);
  }
  return parsed;
}

/** Vrai si une photo Pexels convient : horizontale, ≥ 1920 px de large, rapport 1,3 à 1,9, original sur images.pexels.com. */
export function photoFits(photo) {
  const { width, height } = photo ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || height <= 0) return false;
  const ratio = width / height;
  if (width <= height || width < MIN_WIDTH || ratio < MIN_RATIO || ratio > MAX_RATIO) return false;
  try {
    assertPexelsUrl(photo.src?.original, ['images.pexels.com']);
    return true;
  } catch {
    return false;
  }
}

/** Candidats d'une réponse de recherche Pexels, dans l'ordre de pertinence de Pexels. */
export function pexelsCandidates(searchJson) {
  const photos = Array.isArray(searchJson?.photos) ? searchJson.photos : [];
  return photos.filter(photoFits).map((p) => ({
    id: p.id,
    width: p.width,
    height: p.height,
    ratio: Math.round((p.width / p.height) * 100) / 100,
    alt: p.alt ?? '',
    page: p.url ?? '',
    preview: p.src?.large ?? p.src?.medium ?? '',
  }));
}

/** Largeur et hauteur lues dans l'en-tête SOF d'un JPEG, ou `null` si les octets ne sont pas un JPEG lisible. */
export function jpegSize(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    while (b[i] === 0xff) i += 1; // octets de bourrage
    const marker = b[i];
    i += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null; // fin ou données avant tout SOF
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // marqueurs sans longueur
    if (i + 1 >= b.length) return null;
    const length = (b[i] << 8) | b[i + 1];
    if (length < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 6 >= b.length) return null;
      const height = (b[i + 3] << 8) | b[i + 4];
      const width = (b[i + 5] << 8) | b[i + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += length;
  }
  return null;
}

const requireKey = (key) => {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new RoutineError('PEXELS_API_KEY absente : la clé Pexels doit être fournie dans l’environnement de la tâche planifiée');
  }
  return key.trim();
};

/** Appel HTTP vers un hôte Pexels permis, sans redirection, sans jamais citer la clé dans l'erreur. */
async function pexelsFetch(fetchImpl, url, init, what) {
  assertPexelsUrl(url);
  let response;
  try {
    response = await fetchImpl(url, { ...init, redirect: 'error' });
  } catch (error) {
    const reason = error instanceof RoutineError ? error.message : 'réseau ou redirection refusée';
    throw new RoutineError(`${what} : Pexels injoignable (${reason})`);
  }
  if (!response || !response.ok) throw new RoutineError(`${what} : Pexels a répondu HTTP ${response?.status ?? '?'}`);
  return response;
}

const readJson = async (response, what) => {
  try {
    return await response.json();
  } catch {
    throw new RoutineError(`${what} : réponse Pexels illisible (JSON attendu)`);
  }
};

/** Recherche Pexels (photos horizontales) → candidats filtrés. */
export async function searchPhotos({ query, key, fetch: fetchImpl = globalThis.fetch, perPage = 40 }) {
  const apiKey = requireKey(key);
  if (typeof query !== 'string' || query.trim() === '') throw new RoutineError('recherche vide : --query "…" attendu');
  const url = new URL(`${PEXELS_API}/search`);
  url.search = new URLSearchParams({ query: query.trim(), orientation: 'landscape', size: 'large', per_page: String(perPage) }).toString();
  const response = await pexelsFetch(fetchImpl, url.href, { headers: { Authorization: apiKey } }, 'recherche');
  return pexelsCandidates(await readJson(response, 'recherche'));
}

/**
 * Télécharge la photo Pexels `photoId` pour l'article `postId` dans src/assets/blog/{postId}.jpg (sous `root`).
 * Refuse `smoke-detectors` (D1). N'écrit rien tant que tous les contrôles ne sont pas passés.
 */
export async function downloadPhoto({ photoId, postId, category, key, fetch: fetchImpl = globalThis.fetch, root = ROOT }) {
  if (category === DRAWN_CATEGORY) {
    throw new RoutineError(`pas de photo pour la catégorie ${DRAWN_CATEGORY} : le site affiche le détecteur dessiné (D1)`);
  }
  if (!POST_CATEGORIES.includes(category)) throw new RoutineError(`catégorie inconnue : ${String(category)} (attendu : ${POST_CATEGORIES.join(', ')})`);
  if (!POST_ID_RE.test(String(postId))) throw new RoutineError(`id d'article invalide : ${String(postId)} (kebab : minuscules, chiffres, tirets)`);
  if (!PHOTO_ID_RE.test(String(photoId))) throw new RoutineError(`id de photo Pexels invalide : ${String(photoId)} (nombre attendu)`);
  const apiKey = requireKey(key);

  const meta = await pexelsFetch(fetchImpl, `${PEXELS_API}/photos/${photoId}`, { headers: { Authorization: apiKey } }, `photo ${photoId}`);
  const photo = await readJson(meta, `photo ${photoId}`);
  assertPexelsUrl(photo?.src?.original, ['images.pexels.com']);
  if (!photoFits(photo)) {
    throw new RoutineError(
      `photo ${photoId} refusée : ${photo?.width}×${photo?.height}, il faut une photo horizontale d'au moins ${MIN_WIDTH} px de large, rapport ${MIN_RATIO} à ${MAX_RATIO}`,
    );
  }

  const imageUrl = new URL(photo.src.original);
  imageUrl.search = new URLSearchParams({ auto: 'compress', cs: 'tinysrgb', fm: 'jpg', w: String(Math.min(photo.width, MAX_DOWNLOAD_WIDTH)) }).toString();
  // Le CDN d'images n'a pas besoin de la clé : elle n'est envoyée qu'à api.pexels.com.
  const image = await pexelsFetch(fetchImpl, imageUrl.href, {}, `téléchargement ${photoId}`);
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new RoutineError(`photo ${photoId} refusée : ${bytes.length} octets, ${MAX_BYTES} au plus`);
  const size = jpegSize(bytes);
  if (!size) throw new RoutineError(`photo ${photoId} refusée : le fichier reçu n'est pas un JPEG lisible`);
  if (size.width < MIN_WIDTH) throw new RoutineError(`photo ${photoId} refusée : ${size.width} px de large reçus, ${MIN_WIDTH} au moins`);

  const dir = join(root, BLOG_IMAGES_DIR);
  mkdirSync(dir, { recursive: true });
  const file = `${BLOG_IMAGES_DIR}/${postId}.jpg`;
  writeFileSync(join(root, file), bytes);
  return { file, image: `${postId}.jpg`, width: size.width, height: size.height, bytes: bytes.length, page: photo.url ?? '' };
}

// — Périmètre (blog-routine.md §1 et §10) —

/** Fichiers hors du périmètre de l'article `id` : ses 5 fichiers et sa photo, rien d'autre. */
export function scopeErrors(files, id) {
  const allowed = new Set([...POST_FILES.map((name) => `${POSTS_DIR}/${id}/${name}`), `${BLOG_IMAGES_DIR}/${id}.jpg`]);
  return [...new Set(files)].filter((file) => !allowed.has(file)).sort();
}

const git = (root, args) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const nulList = (out) => out.split('\0').filter(Boolean);

/** Branche courante et fichiers modifiés par rapport à origin/main (commits, index, arbre, non suivis). */
export function gitChanges(root = ROOT) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const base = git(root, ['merge-base', 'origin/main', 'HEAD']).trim();
  const changed = nulList(git(root, ['diff', '--name-only', '--no-renames', '-z', base]));
  const untracked = nulList(git(root, ['ls-files', '--others', '--exclude-standard', '-z']));
  return { branch, files: [...new Set([...changed, ...untracked])].sort() };
}

// — CLI —

const existingPostIds = (root) => {
  const dir = join(root, POSTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
};

const readOpenPrs = (file) => {
  if (!file) return [];
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new RoutineError(`--open-prs : fichier JSON illisible (${file}) : ${error.message}`);
  }
  if (!Array.isArray(data)) throw new RoutineError('--open-prs : tableau JSON attendu (sortie de gh pr list --json number,title,headRefName,files)');
  return data;
};

const need = (values, name) => {
  const value = values[name];
  if (typeof value !== 'string' || value.trim() === '') throw new RoutineError(`option --${name} obligatoire`);
  return value.trim();
};

/** Exécute la sous-commande ; rend le texte à écrire sur stdout. */
export async function runCli(argv, { env = process.env, fetch: fetchImpl = globalThis.fetch, root = ROOT } = {}) {
  const [command, ...rest] = argv;
  const options = {
    plan: { 'open-prs': { type: 'string' }, now: { type: 'string' } },
    'photo-search': { query: { type: 'string' } },
    'photo-download': { photo: { type: 'string' }, post: { type: 'string' }, category: { type: 'string' } },
    scope: { post: { type: 'string' } },
  }[command];
  if (!options) throw new RoutineError(`sous-commande inconnue : ${command ?? '(aucune)'} (attendu : plan, photo-search, photo-download, scope)`);
  let values;
  try {
    ({ values } = parseArgs({ args: rest, options, strict: true, allowPositionals: false }));
  } catch (error) {
    throw new RoutineError(`${command} : ${error.message}`);
  }

  if (command === 'plan') {
    const instant = values.now ? new Date(values.now) : new Date();
    if (Number.isNaN(instant.getTime())) throw new RoutineError(`--now : instant ISO invalide : ${values.now}`);
    const topics = parseTopics(readFileSync(join(root, ROUTINE_DOC), 'utf8'));
    if (topics.length === 0) throw new RoutineError(`${ROUTINE_DOC} : table des sujets (§11) introuvable`);
    const plan = planRun({ instant, topics, existingIds: existingPostIds(root), openPrs: readOpenPrs(values['open-prs']) });
    return `${JSON.stringify(plan, null, 2)}\n`;
  }
  if (command === 'photo-search') {
    const query = need(values, 'query');
    const candidates = await searchPhotos({ query, key: env.PEXELS_API_KEY, fetch: fetchImpl });
    return `${JSON.stringify({ query, candidates }, null, 2)}\n`;
  }
  if (command === 'photo-download') {
    const result = await downloadPhoto({
      photoId: need(values, 'photo'),
      postId: need(values, 'post'),
      category: need(values, 'category'),
      key: env.PEXELS_API_KEY,
      fetch: fetchImpl,
      root,
    });
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  // scope
  const id = need(values, 'post');
  if (!POST_ID_RE.test(id)) throw new RoutineError(`id d'article invalide : ${id}`);
  let changes;
  try {
    changes = gitChanges(root);
  } catch (error) {
    throw new RoutineError(`scope : git a échoué (origin/main à jour ? lancer git fetch origin main) : ${String(error.stderr ?? error.message).trim()}`);
  }
  if (changes.branch === 'main') throw new RoutineError('scope : la branche courante est main ; la routine travaille sur blog/{date}, jamais sur main');
  if (!/^blog\/\d{4}-\d{2}-\d{2}$/.test(changes.branch)) {
    throw new RoutineError(`scope : branche courante « ${changes.branch} » refusée ; la routine travaille sur une branche blog/AAAA-MM-JJ`);
  }
  const outside = scopeErrors(changes.files, id);
  if (outside.length > 0) {
    throw new RoutineError(`scope : ${outside.length} fichier(s) hors du périmètre de l'article ${id}\n${outside.map((f) => `  - ${f}`).join('\n')}`);
  }
  return `scope : OK (${changes.files.length} fichier(s) sur ${changes.branch}, tous dans le périmètre de ${id})\n`;
}

/** Retire toute occurrence de la clé d'un message (dernier filet : aucun message ne doit la contenir). */
export const redact = (message, key) => (key && key.trim() ? message.split(key.trim()).join('[clé masquée]') : message);

if (isMain(import.meta.url)) {
  try {
    process.stdout.write(await runCli(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof RoutineError ? error.message : `erreur inattendue : ${error?.message ?? error}`;
    process.stderr.write(`blog-routine : ${redact(message, process.env.PEXELS_API_KEY)}\n`);
    process.exitCode = 1;
  }
}
