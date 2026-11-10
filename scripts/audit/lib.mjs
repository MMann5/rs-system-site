// Story 7.3 (NFR1–NFR6, UX-DR5) : fonctions de décision de l'audit de lancement, pures (aucun navigateur).
// Les volets navigateur (scrims.mjs, perf.mjs, a11y.mjs) mesurent ; ce module décide et met en forme.
// Testé par tests/audit.test.mjs (`node --test`).
import { readFileSync } from 'node:fs';
import { walk, rel } from '../checks/report.mjs';

export const LANGS = ['he', 'en', 'ru', 'fr'];

/** Un modèle par type de page (epics.md › Story 7.3), choisi par `data-page-id`. */
export const TEMPLATE_IDS = [
  'home',
  'cameras',
  'contractors',
  'areas',
  'city:modiin',
  'about',
  'contact',
  'blog',
  'post:how-many-smoke-detectors',
  'privacy',
  'not-found',
];

/** Seuils (spec 7.3 › Always). */
export const SCRIM_MIN = 0.62;
export const SCRIM_TOLERANCE = 0.005;
export const SCRIM_BELOW_LINK = 32;
export const PERF = {
  lcp: 2500,
  cls: 0.1,
  tbt: 200,
  inp: 200,
  total: 1_500_000,
  fonts: 120_000,
  scripts: 30_000,
};
export const IMAGE_BUDGET = {
  heroDesktop: 250_000,
  heroMobile: 120_000,
  photo: 180_000,
  card: 60_000,
};
export const TARGET_MIN = 44;

const HTML_TAG = /<html\b([^>]*)>/i;
const attr = (attrs, name) => attrs.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1];

/** `{ lang, id }` lus sur la balise `<html>` d'une page, ou null. */
export function pageMeta(html) {
  const attrs = html.match(HTML_TAG)?.[1];
  if (attrs === undefined) return null;
  const lang = attr(attrs, 'lang');
  const id = attr(attrs, 'data-page-id');
  return lang && id ? { lang, id } : null;
}

/** Chemin du site d'un fichier de dist/ (relatif, séparateur /) : `fr/a-propos/index.html` → `/fr/a-propos/`. */
export const sitePath = (file) => `/${file.replace(/(^|\/)index\.html$/, '$1')}`;

/** Chemin servi par wrangler (`html_handling` : `/fr/404.html` → `/fr/404`), encodé pour une URL. */
export const servedPath = (path) => encodeURI(path.replace(/\.html$/, ''));

/**
 * Pages-modèles de `dist` : `{ [id]: { [lang]: chemin } }`, lues dans `data-page-id` et `lang` de `<html>`.
 * Seules les pages sous `/{lang}/` comptent (la 404 racine est ignorée). Lève une erreur si un modèle manque.
 */
export function templatePages(dist, ids = TEMPLATE_IDS) {
  const wanted = new Set(ids);
  const out = Object.fromEntries(ids.map((id) => [id, {}]));
  for (const file of walk(dist).filter((p) => p.endsWith('.html')).sort()) {
    const path = rel(dist, file);
    const meta = pageMeta(readFileSync(file, 'utf8'));
    if (!meta || !wanted.has(meta.id) || !path.startsWith(`${meta.lang}/`)) continue;
    out[meta.id][meta.lang] ??= sitePath(path);
  }
  const missing = ids.flatMap((id) => LANGS.filter((lang) => !out[id][lang]).map((lang) => `${id} · ${lang}`));
  if (missing.length > 0) throw new Error(`pages-modèles absentes de dist/ : ${missing.join(', ')}`);
  return out;
}

/** Pages de `dist` qui portent au moins un bloc `data-surface="photo"` : `[{ id, lang, path, blocks }]`. */
export function photoPages(dist) {
  const rows = [];
  for (const file of walk(dist).filter((p) => p.endsWith('.html')).sort()) {
    const path = rel(dist, file);
    const html = readFileSync(file, 'utf8');
    const meta = pageMeta(html);
    const blocks = (html.match(/\sdata-surface="photo"/g) ?? []).length;
    if (!meta || blocks === 0 || !path.startsWith(`${meta.lang}/`)) continue;
    rows.push({ id: meta.id, lang: meta.lang, path: sitePath(path), blocks });
  }
  return rows;
}

// — Scrims (UX-DR5, DESIGN.md › Elevation) —

/** Canaux `[r, g, b]` d'une couleur `#rrggbb`. */
export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`couleur illisible : ${hex}`);
  return m.slice(1).map((h) => parseInt(h, 16));
}

/** Opacité du scrim déduite d'un canal `v` sur photo blanche, `c` étant le canal du scrim : (255 − v) / (255 − c). */
export const scrimAlpha = (v, c) => (255 - v) / (255 - c);

/**
 * Opacité minimale sur des pixels `[r, g, b]` : par pixel, le canal le moins opaque (estimation prudente),
 * puis le minimum. `null` sans pixel.
 */
export function minAlpha(pixels, scrimRgb) {
  let min = null;
  for (const [r, g, b] of pixels) {
    const a = Math.min(scrimAlpha(r, scrimRgb[0]), scrimAlpha(g, scrimRgb[1]), scrimAlpha(b, scrimRgb[2]));
    if (min === null || a < min) min = a;
  }
  return min;
}

/** Opacité minimale de chaque boîte, pixels de `image` (raw RGB(A), origine `clip`). */
export function measure(image, clip, boxes, scrimRgb) {
  const { data, info } = image;
  const results = [];
  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x - clip.x));
    const y0 = Math.max(0, Math.floor(box.y - clip.y));
    const x1 = Math.min(info.width, Math.ceil(box.x + box.w - clip.x));
    const y1 = Math.min(info.height, Math.ceil(box.y + box.h - clip.y));
    const pixels = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * info.width + x) * info.channels;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
    results.push({ name: box.name, alpha: minAlpha(pixels, scrimRgb), pixels: pixels.length });
  }
  return results;
}

/** Vrai si l'opacité tient le plancher, tolérance comprise. */
export const scrimOk = (alpha, min = SCRIM_MIN) => alpha !== null && alpha >= min - SCRIM_TOLERANCE;

/**
 * Échec d'un bloc photo (`worst` = boîte la moins opaque `{ name, alpha }`, ou null sans boîte mesurée), nommant page,
 * langue, largeur, extrême d'animation et bloc ; null si le plancher tient.
 */
export function scrimFailure({ id, lang, width, extreme, block, worst }) {
  const where = `${id} · ${lang} · ${width} px · ${extreme} · ${block}`;
  if (worst === null) return `${where} : aucune boîte de texte mesurée`;
  return scrimOk(worst.alpha) ? null : `${where} : opacité ${worst.alpha.toFixed(3)} < ${SCRIM_MIN} sous ${worst.name}`;
}

// — Accessibilité —

/** Défauts de la suite des niveaux de titres (1–6, ordre du DOM) : un seul h1, aucun saut en descendant. */
export function headingIssues(levels) {
  const issues = [];
  const h1 = levels.filter((l) => l === 1).length;
  if (h1 !== 1) issues.push(`${h1} h1 (un seul attendu)`);
  let prev = 1;
  for (const level of levels) {
    if (level > prev + 1) issues.push(`saut de niveau h${prev} → h${level}`);
    prev = level;
  }
  return issues;
}

/**
 * Lien au milieu d'une phrase (exempté de la taille de cible, WCAG 2.5.8) : un `<a>` en `display: inline` dont le
 * bloc parent porte du texte hors de tout lien ou bouton.
 */
export const isInlineLink = ({ tag, display, siblingText }) =>
  tag === 'a' && display === 'inline' && siblingText.trim().length > 0;

/** Cibles trop petites : `rects` = `[{ name, width, height, inline }]`, les liens en phrase exemptés. */
export function targetIssues(rects, min = TARGET_MIN) {
  return rects
    .filter((r) => !r.inline && (r.width < min - 0.5 || r.height < min - 0.5))
    .map((r) => `cible ${Math.round(r.width)} × ${Math.round(r.height)} px < ${min} : ${r.name}`);
}

// — Performance (NFR3–NFR6) —

const auditValue = (lhr, id) => lhr.audits?.[id]?.numericValue;

/** Octets transférés par type de ressource (`font`, `script`), depuis resource-summary ou network-requests. */
function bytesByType(lhr, type) {
  const summary = lhr.audits?.['resource-summary']?.details?.items;
  const row = summary?.find((item) => item.resourceType === type);
  if (row) return row.transferSize;
  const requests = lhr.audits?.['network-requests']?.details?.items;
  if (!requests) return undefined;
  const wanted = type === 'font' ? 'Font' : 'Script';
  return requests.filter((r) => r.resourceType === wanted).reduce((sum, r) => sum + (r.transferSize ?? 0), 0);
}

/** `{ values, failures }` d'un rapport Lighthouse (LCP, CLS, TBT, poids total, polices, scripts). */
export function perfVerdict(lhr) {
  const values = {
    lcp: auditValue(lhr, 'largest-contentful-paint'),
    cls: auditValue(lhr, 'cumulative-layout-shift'),
    tbt: auditValue(lhr, 'total-blocking-time'),
    total: auditValue(lhr, 'total-byte-weight'),
    fonts: bytesByType(lhr, 'font'),
    scripts: bytesByType(lhr, 'script'),
  };
  const failures = [];
  if (lhr.runtimeError) failures.push(`Lighthouse : ${lhr.runtimeError.code} ${lhr.runtimeError.message ?? ''}`.trim());
  const units = { lcp: 'ms', cls: '', tbt: 'ms', total: 'o', fonts: 'o', scripts: 'o' };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'number' || Number.isNaN(value)) failures.push(`${key} non mesuré`);
    else if (value > PERF[key]) failures.push(`${key} ${fmt(value)}${units[key] && ` ${units[key]}`} > ${fmt(PERF[key])}`);
  }
  return { values, failures };
}

/** Échec INP (ms, `null` = aucune interaction ≥ 16 ms), ou null. */
export const inpIssue = (inp) => (inp !== null && inp > PERF.inp ? `INP ${Math.round(inp)} ms > ${PERF.inp}` : null);

/** Plafond d'une image selon son rôle (`hero`, `card`, `photo`) et la largeur de la fenêtre. */
export function imageBudget(kind, viewport) {
  if (kind === 'hero') return viewport >= 1440 ? IMAGE_BUDGET.heroDesktop : IMAGE_BUDGET.heroMobile;
  return kind === 'card' ? IMAGE_BUDGET.card : IMAGE_BUDGET.photo;
}

/** Échec d'une image (`{ kind, url, bytes }`) à la largeur `viewport`, ou null. */
export function imageVerdict({ kind, url, bytes }, viewport) {
  const budget = imageBudget(kind, viewport);
  return bytes > budget ? `image ${kind} ${fmt(bytes)} o > ${fmt(budget)} à ${viewport} px : ${url}` : null;
}

// — Rapport —

const fmt = (n) =>
  typeof n !== 'number' ? String(n ?? '—') : Number.isInteger(n) ? n.toLocaleString('fr-FR').replace(/ /g, ' ') : String(Math.round(n * 1000) / 1000);

const cell = (v) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Tableau Markdown de `rows` sur `columns` (`[{ key, label }]`). */
export function markdownTable(columns, rows) {
  const head = `| ${columns.map((c) => c.label).join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((c) => cell(typeof row[c.key] === 'number' ? fmt(row[c.key]) : row[c.key])).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

/**
 * Rapport Markdown : `results` = `{ generatedAt, origin, volets: { [nom]: { title, columns, rows, failures, notes } } }`.
 * Un échec par ligne sous chaque volet, puis le tableau des mesures.
 */
export function renderReport(results) {
  const volets = Object.entries(results.volets ?? {});
  const total = volets.reduce((sum, [, v]) => sum + v.failures.length, 0);
  const out = [
    '# Audit de lancement',
    '',
    `Généré le ${results.generatedAt} sur ${results.origin} (build de dist/ servi par wrangler dev).`,
    '',
    total === 0 ? '**Verdict : OK, aucun échec.**' : `**Verdict : ${total} échec(s).**`,
  ];
  for (const [name, v] of volets) {
    out.push('', `## ${v.title ?? name}`, '');
    out.push(v.failures.length === 0 ? 'Aucun échec.' : `${v.failures.length} échec(s) :`);
    for (const f of v.failures) out.push(`- ${f}`);
    for (const note of v.notes ?? []) out.push('', `> ${note}`);
    if (v.rows.length > 0) out.push('', markdownTable(v.columns, v.rows));
  }
  return `${out.join('\n')}\n`;
}

/** Nombre total d'échecs des volets. */
export const failureCount = (results) => Object.values(results.volets ?? {}).reduce((sum, v) => sum + v.failures.length, 0);
