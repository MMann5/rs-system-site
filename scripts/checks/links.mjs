// AD-3, AD-2, AD-11 : tout lien interne, canonique et hreflang répond 200 sans 3xx.
// Collecte dans chaque .html de dist/ les attributs href, src et srcset internes (chemin qui commence
// par / sans //, ou URL absolue sur l'origine de SITE_URL), plus les <loc> et xhtml:link href de
// dist/sitemap.xml. dist/ est servi par wrangler dev (règles Cloudflare réelles) ; chaque URL unique,
// sans ? ni #, doit répondre 200 (redirect: 'manual'). Un href="#id" exige un id="id" dans la même page.
// Usage : node scripts/checks/links.mjs [dossier]  (défaut : dist/ du dépôt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_URL } from '../../src/lib/env.ts';
import { isMain, rel, report, REPO_ROOT, rootArg, walk } from './report.mjs';
import { serve } from './serve.mjs';

const ATTR = /\s(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
const ID_ATTR = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
const RAW_TEXT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Garde la balise ouvrante de <script>/<style> (src, href) mais vide leur contenu. */
const stripRawText = (html) => html.replace(RAW_TEXT, (m, tag) => `${m.match(/^<[^>]*>/)[0]}</${tag}>`);

/** Chemin interne (sans ? ni #) d'une URL, ou null si elle est externe ou non vérifiable. */
export function internalPath(value, siteUrl) {
  const v = value.trim();
  if (v.startsWith('/') && !v.startsWith('//')) return v.split(/[?#]/)[0] || '/';
  if (siteUrl && /^https?:\/\//i.test(v)) {
    let url;
    try {
      url = new URL(v);
    } catch {
      return null;
    }
    if (url.origin === new URL(siteUrl).origin) return url.pathname;
  }
  return null;
}

/** URL candidates d'une valeur d'attribut (srcset : une par source). */
const candidates = (name, value) =>
  name.toLowerCase() === 'srcset'
    ? value.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean)
    : [value];

/**
 * Parcourt dist/ : `{ urls: Map<chemin, page>, failures }`. `failures` porte les ancres sans cible.
 * `page` est le fichier (relatif à dist/) où le chemin apparaît en premier.
 */
export function collectLinks(dist, siteUrl = SITE_URL) {
  const urls = new Map();
  const failures = [];
  const add = (path, page) => {
    if (path !== null && !urls.has(path)) urls.set(path, page);
  };
  const pages = walk(dist).filter((p) => p.endsWith('.html')).sort();
  for (const file of pages) {
    const page = rel(dist, file);
    const html = stripRawText(readFileSync(file, 'utf8'));
    const ids = new Set([...html.matchAll(ID_ATTR)].map((m) => decodeEntities(m[1] ?? m[2] ?? m[3])));
    for (const m of html.matchAll(ATTR)) {
      const name = m[1];
      const value = decodeEntities(m[2] ?? m[3] ?? m[4]);
      if (name.toLowerCase() === 'href' && value.startsWith('#') && value.length > 1) {
        let id = value.slice(1);
        try {
          id = decodeURIComponent(id);
        } catch {}
        if (!ids.has(id)) failures.push(`${page} : ancre ${value} sans id="${id}" dans la page`);
        continue;
      }
      for (const url of candidates(name, value)) add(internalPath(decodeEntities(url), siteUrl), page);
    }
  }
  const sitemap = join(dist, 'sitemap.xml');
  if (existsSync(sitemap)) {
    const xml = readFileSync(sitemap, 'utf8');
    for (const m of xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)) add(internalPath(decodeEntities(m[1]), siteUrl), 'sitemap.xml');
    for (const m of xml.matchAll(/<xhtml:link\b[^>]*\shref\s*=\s*"([^"]*)"/g)) add(internalPath(decodeEntities(m[1]), siteUrl), 'sitemap.xml');
  }
  return { urls, failures };
}

/** Échecs HTTP des chemins `urls` (Map chemin → page) sur un serveur déjà lancé (`origin`). */
export async function findBrokenLinks(origin, urls, concurrency = 8) {
  const failures = [];
  const queue = [...urls.entries()];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [path, page] = item;
      let res;
      try {
        res = await fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
        await res.arrayBuffer();
      } catch (error) {
        failures.push(`${path} : ${error.message} (requête échouée, dans ${page})`);
        continue;
      }
      if (res.status === 200) continue;
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      failures.push(`${path} : statut ${res.status}${location ? ` → ${location}` : ''} (attendu 200, dans ${page})`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return failures.sort();
}

/** Contrôle complet : ancres, puis chaque URL interne servie par wrangler dev. */
export async function checkLinks(dist, { siteUrl = SITE_URL } = {}) {
  const { urls, failures } = collectLinks(dist, siteUrl);
  const server = await serve(dist);
  try {
    return [...failures, ...(await findBrokenLinks(server.origin, urls))];
  } finally {
    await server.close();
  }
}

if (isMain(import.meta.url)) {
  const dist = rootArg(join(REPO_ROOT, 'dist'));
  if (!existsSync(dist)) report('links', [`${dist} : absent, lancer npm run build d’abord`]);
  report('links', await checkLinks(dist));
}
