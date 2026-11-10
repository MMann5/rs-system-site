// Story 7.2 (FR38, FR39, AD-9, AD-11, décisions D3 et D4 de l'epic 7) : aperçus de partage et données structurées
// de chaque page HTML de dist/.
// - <head> : og:title (= <title>), og:description et twitter:description (= meta description, absentes avec elle),
//   og:type (`article` pour un article), og:url (= canonique, absente avec elle), og:site_name, og:locale de la langue
//   + les 3 autres en og:locale:alternate, og:image (+ width 1200, height 630, type), twitter:card, twitter:title,
//   twitter:image (= og:image) ;
// - image référencée : présente dans dist/, PNG ou JPEG de 1200 × 630, type annoncé exact, ≤ 300 Ko ;
// - JSON-LD : au plus un <script type="application/ld+json">, aucun sur la 404 ; graphe validé par le schéma
//   ci-dessous (types attendus selon <html data-page-id>, propriétés requises, `@type` connus, propriétés interdites
//   par D3, téléphone de src/lib/contact/core.ts).
// Usage : node scripts/checks/share.mjs [dossier]  (défaut : dist/ du dépôt).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PHONE_E164 } from '../../src/lib/contact/core.ts';
import { SITE_URL } from '../../src/lib/env.ts';
import { LANGS } from '../../src/lib/langs.ts';
import { OG_LOCALES } from '../../src/lib/share.ts';
import { decodeEntities } from './links.mjs';
import { isMain, rel, report, REPO_ROOT, rootArg, walk } from './report.mjs';

/** Limite d'aperçu de WhatsApp. */
export const MAX_IMAGE_BYTES = 300 * 1024;
const WIDTH = 1200;
const HEIGHT = 630;
const NOT_FOUND_ID = 'not-found';
/** Pages du modèle Service avec fil d'Ariane (Entrepreneurs n'en a pas, EXPERIENCE.md › Référencement). */
const SERVICE_IDS = ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom'];

/** Propriétés requises de chaque `@type` connu. */
export const SCHEMA = {
  LocalBusiness: ['name', 'telephone', 'url', 'logo'],
  Service: ['name', 'description', 'url', 'provider', 'areaServed'],
  Article: ['headline', 'description', 'datePublished', 'image', 'inLanguage', 'author', 'publisher'],
  BreadcrumbList: ['itemListElement'],
  ListItem: ['position', 'name', 'item'],
  City: ['name'],
  ContactPoint: ['telephone', 'contactType'],
};
/** Propriétés requises en plus sur un nœud de premier niveau du graphe (l'entreprise citée ailleurs en est dispensée). */
const TOP_REQUIRED = { LocalBusiness: ['areaServed'] };
/** D3 : jamais d'adresse postale, de note ni d'avis. */
export const FORBIDDEN = ['address', 'aggregateRating', 'review'];
/** Propriétés dont la valeur doit être un nœud (ou une liste de nœuds) d'un type donné. */
const LINKS = {
  provider: 'LocalBusiness',
  author: 'LocalBusiness',
  publisher: 'LocalBusiness',
  areaServed: 'City',
  contactPoint: 'ContactPoint',
  itemListElement: 'ListItem',
};

/** Types de premier niveau attendus pour la page `id` (EXPERIENCE.md › Référencement, D3). */
export function expectedTypes(id) {
  if (id === 'home' || id === 'contact') return ['LocalBusiness'];
  if (SERVICE_IDS.includes(id)) return ['Service', 'BreadcrumbList'];
  if (id === 'contractors') return ['Service'];
  if (id.startsWith('city:')) return ['LocalBusiness', 'BreadcrumbList'];
  if (id.startsWith('post:')) return ['Article', 'BreadcrumbList'];
  return [];
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function validateNode(node, path, top, failures) {
  if (!isObject(node)) return failures.push(`${path} : nœud attendu`);
  const type = node['@type'];
  if (!Object.hasOwn(SCHEMA, type)) return failures.push(`${path} : @type inconnu « ${type ?? ''} »`);
  for (const prop of FORBIDDEN) if (Object.hasOwn(node, prop)) failures.push(`${path} (${type}) : propriété interdite « ${prop} » (D3)`);
  const required = [...SCHEMA[type], ...(top ? (TOP_REQUIRED[type] ?? []) : [])];
  for (const prop of required) if (empty(node[prop])) failures.push(`${path} (${type}) : propriété requise « ${prop} » absente`);
  if (Object.hasOwn(node, 'telephone') && node.telephone !== PHONE_E164) failures.push(`${path} (${type}) : telephone « ${node.telephone} » au lieu de ${PHONE_E164}`);
  for (const [prop, value] of Object.entries(node)) {
    if (prop.startsWith('@')) continue;
    const children = Array.isArray(value) ? value : [value];
    children.forEach((child, i) => {
      const where = `${path}.${prop}${Array.isArray(value) ? `[${i}]` : ''}`;
      if (Object.hasOwn(LINKS, prop)) {
        if (!isObject(child) || child['@type'] !== LINKS[prop]) failures.push(`${where} : ${LINKS[prop]} attendu`);
      }
      if (isObject(child)) validateNode(child, where, false, failures);
    });
  }
  if (type === 'BreadcrumbList' && Array.isArray(node.itemListElement)) {
    node.itemListElement.forEach((item, i) => {
      if (isObject(item) && item.position !== i + 1) failures.push(`${path}.itemListElement[${i}] : position ${item.position} au lieu de ${i + 1}`);
    });
    if (node.itemListElement.length < 2) failures.push(`${path} (BreadcrumbList) : moins de 2 éléments`);
  }
  return failures;
}

/** Raisons d'échec du JSON-LD (objet déjà lu) de la page `id`. */
export function validateJsonLd(data, id) {
  const failures = [];
  if (!isObject(data) || data['@context'] !== 'https://schema.org' || !Array.isArray(data['@graph'])) {
    return ['JSON-LD : { "@context": "https://schema.org", "@graph": [...] } attendu'];
  }
  const graph = data['@graph'];
  graph.forEach((node, i) => validateNode(node, `@graph[${i}]`, true, failures));
  const types = graph.map((node) => node?.['@type']);
  const expected = expectedTypes(id);
  if (types.join(',') !== expected.join(',')) failures.push(`JSON-LD : types [${types.join(', ')}] au lieu de [${expected.join(', ')}]`);
  if (id === 'contact' && !graph.some((node) => node?.['@type'] === 'LocalBusiness' && isObject(node.contactPoint))) {
    failures.push('JSON-LD : LocalBusiness sans contactPoint sur Contact');
  }
  return failures;
}

/** Dimensions d'un PNG ou d'un JPEG (lecture des en-têtes), ou undefined. */
export function imageInfo(buffer) {
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { type: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) return undefined;
      const marker = buffer[i + 1];
      // SOF0 à SOF15, sauf DHT (C4), JPG (C8) et DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'image/jpeg', width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
      }
      i += 2 + buffer.readUInt16BE(i + 2);
    }
  }
  return undefined;
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'));
  return m ? decodeEntities(m[1]) : undefined;
};

/** Chemin de dist/ d'une URL d'image (chemin depuis la racine, ou URL absolue sur SITE_URL), ou undefined. */
function imagePath(src, siteUrl) {
  let path = src;
  if (/^https?:\/\//i.test(src)) {
    if (!siteUrl || new URL(src).origin !== new URL(siteUrl).origin) return undefined;
    path = new URL(src).pathname;
  }
  if (!path.startsWith('/') || path.startsWith('//')) return undefined;
  return decodeURIComponent(path.split(/[?#]/)[0]);
}

/** Raisons d'échec d'une page HTML de `dist`. */
export function findShareFailures(html, dist, siteUrl = SITE_URL) {
  const failures = [];
  const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? '';
  const id = attr(htmlTag, 'data-page-id') ?? '';
  const lang = attr(htmlTag, 'lang') ?? '';
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const all = (kind, key) => metas.filter((tag) => attr(tag, kind) === key).map((tag) => attr(tag, 'content'));
  const one = (kind, key) => {
    const values = all(kind, key);
    if (values.length > 1) failures.push(`${key} en double`);
    return values[0];
  };
  const og = (key) => one('property', `og:${key}`);
  const tw = (key) => one('name', `twitter:${key}`);
  const expect = (key, actual, expected) => {
    if (actual !== expected) failures.push(`${key} « ${actual ?? '(absent)'} » au lieu de « ${expected ?? '(absent)'} »`);
  };

  const title = head.match(/<title>([^<]*)<\/title>/i)?.[1];
  const description = one('name', 'description');
  const canonical = head.match(/<link\b[^>]*\srel="canonical"[^>]*>/i)?.[0];
  expect('og:title', og('title'), title === undefined ? undefined : decodeEntities(title));
  expect('twitter:title', tw('title'), title === undefined ? undefined : decodeEntities(title));
  expect('og:description', og('description'), description);
  expect('twitter:description', tw('description'), description);
  expect('og:type', og('type'), id.startsWith('post:') ? 'article' : 'website');
  expect('og:url', og('url'), canonical === undefined ? undefined : attr(canonical, 'href'));
  expect('og:site_name', og('site_name'), 'RS SYSTEM');
  if (!LANGS.includes(lang)) failures.push(`<html lang="${lang}"> hors des 4 langues`);
  else {
    expect('og:locale', og('locale'), OG_LOCALES[lang]);
    const alternates = all('property', 'og:locale:alternate').sort();
    const others = LANGS.filter((l) => l !== lang).map((l) => OG_LOCALES[l]).sort();
    expect('og:locale:alternate', alternates.join(', '), others.join(', '));
  }
  expect('twitter:card', tw('card'), 'summary_large_image');
  const image = og('image');
  expect('twitter:image', tw('image'), image);
  expect('og:image:width', og('image:width'), String(WIDTH));
  expect('og:image:height', og('image:height'), String(HEIGHT));
  if (image === undefined) failures.push('og:image absente');
  else {
    const path = imagePath(image, siteUrl);
    const file = path === undefined ? undefined : join(dist, path);
    if (file === undefined) failures.push(`og:image « ${image} » hors du site`);
    else if (!existsSync(file)) failures.push(`og:image « ${image} » absente de dist/`);
    else {
      const info = imageInfo(readFileSync(file));
      const size = statSync(file).size;
      if (info === undefined) failures.push(`og:image « ${image} » : ni PNG ni JPEG`);
      else {
        if (info.width !== WIDTH || info.height !== HEIGHT) failures.push(`og:image « ${image} » : ${info.width} × ${info.height} au lieu de ${WIDTH} × ${HEIGHT}`);
        expect('og:image:type', og('image:type'), info.type);
      }
      if (size > MAX_IMAGE_BYTES) failures.push(`og:image « ${image} » : ${Math.round(size / 1024)} Ko (> 300 Ko)`);
    }
  }

  const scripts = [...html.matchAll(/<script\b[^>]*\stype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  if (scripts.length > 1) failures.push(`${scripts.length} scripts ld+json (un seul attendu)`);
  if (id === NOT_FOUND_ID) {
    if (scripts.length > 0) failures.push('JSON-LD sur la 404');
  } else if (scripts.length === 0) {
    if (expectedTypes(id).length > 0) failures.push(`JSON-LD absent (attendu : ${expectedTypes(id).join(', ')})`);
  } else {
    const raw = scripts[0];
    if (raw.includes('<')) failures.push('JSON-LD : « < » non échappé');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      failures.push(`JSON-LD illisible : ${error.message}`);
    }
    if (data !== undefined) failures.push(...validateJsonLd(data, id));
  }
  return failures;
}

/** Échecs `{page} : …` des pages .html de `dist`. */
export function checkShare(dist, siteUrl = SITE_URL) {
  return walk(dist)
    .filter((p) => p.endsWith('.html'))
    .sort()
    .flatMap((file) => findShareFailures(readFileSync(file, 'utf8'), dist, siteUrl).map((reason) => `${rel(dist, file)} : ${reason}`));
}

if (isMain(import.meta.url)) {
  const dist = rootArg(join(REPO_ROOT, 'dist'));
  if (!existsSync(dist)) report('share', [`${dist} : absent, lancer npm run build d’abord`]);
  report('share', checkShare(dist));
}
