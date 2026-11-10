// AD-4, AD-2, AD-11 : complétude des 4 langues.
// - src/i18n/ contient exactement {he,en,ru,fr}.json, acceptés par buildDictionary (mêmes clés) ;
// - les pages de src/content/pages/*.yaml (id = nom du fichier) sont acceptées par buildRegistry,
//   sur une branche comme sur main (4 slugs par id, `(lang, chemin)` uniques) ;
// - story 4.1 : les villes de src/content/cities/*.yaml entrent au même registre (`city:{id}` sous `areas`,
//   `inheritActive: false`, comme src/lib/routes/index.ts) et chacune référence une région connue de
//   src/content/regions/*.yaml, ancres uniques (buildAreas). Dossiers absents = aucune ville, aucune région.
// - story 4.3 : les avis de src/content/reviews/*.yaml et leurs références dans les villes passent buildReviews
//   (≤ 2 avis par ville, avis connu et unique, avis de la ville, localité = la ville ou une voisine).
//   Dossier absent = aucun avis.
// - story 5.2 : les pages légales de src/content/legal/{id}/ (meta.yaml + {he,en,ru,fr}.md) passent buildLegal (page active
//   avec ses 4 .md, `pending` ⇔ corps vide, .md rangé sous un meta.yaml) et entrent au registre après les pages fixes,
//   comme src/lib/routes/index.ts. Dossier absent = aucune page légale.
// - story 6.1 : les articles de src/content/posts/{id}/ (meta.yaml + {he,en,ru,fr}.md) passent leurs schémas et buildPosts
//   (article actif avec ses 4 .md, .md rangé sous un meta.yaml, `alt` ⇔ image, image de src/assets/blog/ présente, règle
//   image / catégorie D1, corps non vide) et entrent au registre après les villes (`post:{id}` sous `blog`,
//   `inheritActive: false`), comme src/lib/routes/index.ts. Dossier absent = aucun article.
// - story 6.2 : `blog` n'est actif que si blog.yaml l'autorise ET qu'au moins 1 article est actif (blogActive), et les pages
//   `blog-page:{n}` (n ≥ 2, blogPageSources des actifs) entrent au registre après les articles, comme src/lib/routes/index.ts.
// Les messages de buildDictionary, buildRegistry, buildAreas, buildReviews, buildLegal et buildPosts sont repris tels quels.
// Usage : node scripts/checks/completeness.mjs [racine]  (défaut : racine du dépôt).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { buildAreas, buildReviews, citySources } from '../../src/lib/areas/core.ts';
import { BLOG_ID, BLOG_IMAGES_DIR, blogActive, blogPageSources, buildPosts, POSTS_DIR, postSources } from '../../src/lib/blog/core.ts';
import { buildDictionary } from '../../src/lib/i18n/core.ts';
import { buildLegal, LEGAL_DIR } from '../../src/lib/legal/core.ts';
import { LANGS } from '../../src/lib/langs.ts';
import { legalDocSchema, legalMetaSchema, postDocSchema, postMetaSchema } from '../../src/lib/page-schema.ts';
import { buildRegistry } from '../../src/lib/routes/core.ts';
import { isMain, report, REPO_ROOT, rootArg } from './report.mjs';

const I18N = 'src/i18n';
const PAGES = 'src/content/pages';
const CITIES = 'src/content/cities';
const REGIONS = 'src/content/regions';
const REVIEWS = 'src/content/reviews';
const messages = (error) => String(error?.message ?? error).split('\n');

function checkI18n(root, failures) {
  const dir = join(root, I18N);
  if (!existsSync(dir)) return failures.push(`${I18N}/ : dossier absent`);
  const expected = new Set(LANGS.map((lang) => `${lang}.json`));
  const sources = [];
  for (const name of readdirSync(dir).sort()) {
    if (!expected.has(name)) {
      failures.push(`${I18N}/${name} : fichier inattendu (attendu ${[...expected].join(', ')})`);
      continue;
    }
    try {
      sources.push({ id: name.replace(/\.json$/, ''), data: JSON.parse(readFileSync(join(dir, name), 'utf8')) });
    } catch (error) {
      failures.push(`${I18N}/${name} : JSON invalide (${messages(error)[0]})`);
    }
  }
  try {
    buildDictionary(sources);
  } catch (error) {
    for (const line of messages(error)) failures.push(`${I18N}/ : ${line}`);
  }
}

/** `{ id, data }` des `*.yaml` de `dir` (id = nom du fichier) ; dossier absent → []. */
function readYamlDir(root, dir, failures) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs).filter((n) => n.endsWith('.yaml')).sort()) {
    try {
      out.push({ id: name.replace(/\.yaml$/, ''), data: parse(readFileSync(join(abs, name), 'utf8')) ?? {} });
    } catch (error) {
      failures.push(`${dir}/${name} : YAML invalide (${messages(error)[0]})`);
    }
  }
  return out;
}

/** Villes pour le registre ; régions (connues, ancres uniques) et avis (buildReviews) vérifiés au passage. */
function checkAreas(root, failures) {
  const regions = readYamlDir(root, REGIONS, failures);
  const cities = readYamlDir(root, CITIES, failures);
  const reviews = readYamlDir(root, REVIEWS, failures);
  try {
    buildAreas(regions, cities);
  } catch (error) {
    for (const line of messages(error)) failures.push(line);
  }
  try {
    buildReviews(reviews, cities.map(({ id, data }) => ({ ...data, id })));
  } catch (error) {
    for (const line of messages(error)) failures.push(line);
  }
  return cities.map(({ id, data }) => ({ id, slugs: data.slugs }));
}

/** Frontmatter YAML (`---` … `---`) et corps d'un .md ; sans frontmatter : `{}` et le texte entier. */
function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)([\s\S]*)$/);
  return m ? { data: parse(m[1]) ?? {}, body: m[2] } : { data: {}, body: text };
}

const zodLines = (error) => error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`).join(' ; ');

/** Pages légales pour le registre ; complétude (buildLegal) et schémas des meta.yaml et frontmatters vérifiés au passage. */
function checkLegal(root, failures) {
  const abs = join(root, LEGAL_DIR);
  if (!existsSync(abs)) return [];
  const metas = [];
  const docs = [];
  for (const entry of readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const id = entry.name;
    for (const name of readdirSync(join(abs, id)).sort()) {
      const file = `${LEGAL_DIR}/${id}/${name}`;
      let text;
      try {
        text = readFileSync(join(abs, id, name), 'utf8');
      } catch {
        continue;
      }
      try {
        if (name === 'meta.yaml') {
          const result = legalMetaSchema.safeParse(parse(text) ?? {});
          if (result.success) metas.push({ id, data: result.data });
          else failures.push(`${file} : schéma invalide (${zodLines(result.error)})`);
        } else if (name.endsWith('.md')) {
          const { data, body } = splitFrontmatter(text);
          const result = legalDocSchema.safeParse(data);
          if (result.success) docs.push({ id: `${id}/${name.replace(/\.md$/, '')}`, pending: result.data.pending, body });
          else failures.push(`${file} : frontmatter invalide (${zodLines(result.error)})`);
        }
      } catch (error) {
        failures.push(`${file} : YAML invalide (${messages(error)[0]})`);
      }
    }
  }
  try {
    buildLegal(metas, docs);
  } catch (error) {
    for (const line of messages(error)) failures.push(line);
  }
  return metas.map(({ id, data }) => ({ id, slugs: data.slugs, enabled: data.enabled }));
}

/** Articles pour le registre ; schémas des meta.yaml et frontmatters, puis complétude (buildPosts) vérifiés au passage. */
function checkPosts(root, failures) {
  const abs = join(root, POSTS_DIR);
  if (!existsSync(abs)) return { sources: [], activeCount: 0 };
  const imagesDir = join(root, BLOG_IMAGES_DIR);
  const images = existsSync(imagesDir) ? readdirSync(imagesDir) : [];
  const metas = [];
  const docs = [];
  for (const entry of readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const id = entry.name;
    for (const name of readdirSync(join(abs, id)).sort()) {
      const file = `${POSTS_DIR}/${id}/${name}`;
      let text;
      try {
        text = readFileSync(join(abs, id, name), 'utf8');
      } catch {
        continue;
      }
      try {
        if (name === 'meta.yaml') {
          const result = postMetaSchema.safeParse(parse(text) ?? {});
          if (result.success) metas.push({ id, data: result.data });
          else failures.push(`${file} : schéma invalide (${zodLines(result.error)})`);
        } else if (name.endsWith('.md')) {
          const { data, body } = splitFrontmatter(text);
          const result = postDocSchema.safeParse(data);
          if (result.success) docs.push({ id: `${id}/${name.replace(/\.md$/, '')}`, data: result.data, body });
          else failures.push(`${file} : frontmatter invalide (${zodLines(result.error)})`);
        }
      } catch (error) {
        failures.push(`${file} : YAML invalide (${messages(error)[0]})`);
      }
    }
  }
  try {
    buildPosts(metas, docs, images);
  } catch (error) {
    for (const line of messages(error)) failures.push(line);
  }
  const posts = metas.map(({ id, data }) => ({ id, meta: data }));
  const active = posts.filter((p) => p.meta.enabled);
  return { sources: [...postSources(posts), ...blogPageSources(active)], activeCount: active.length };
}

function checkRoutes(root, failures, cities, legal, { sources: posts, activeCount }) {
  const dir = join(root, PAGES);
  if (!existsSync(dir)) return failures.push(`${PAGES}/ : dossier absent`);
  const sources = readYamlDir(root, PAGES, failures).map(({ id, data }) => ({
    id,
    slugs: data.slugs,
    enabled: id === BLOG_ID ? blogActive(data.enabled === true, activeCount) : data.enabled,
    previewOnly: data.previewOnly,
  }));
  sources.push(...legal, ...citySources(cities), ...posts);
  const legalIds = legal.map(({ id }) => `« ${id} »`);
  const dirOf = (line) =>
    line.includes('« city:') ? CITIES : line.includes('« post:') || line.includes('« blog-page:') ? POSTS_DIR : legalIds.some((id) => line.includes(id)) ? LEGAL_DIR : PAGES;
  const seen = new Set();
  for (const isMainBranch of [false, true]) {
    try {
      buildRegistry(sources, { isMainBranch });
    } catch (error) {
      for (const line of messages(error)) {
        if (seen.has(line)) continue;
        seen.add(line);
        failures.push(`${dirOf(line)}/ : ${line}`);
      }
    }
  }
}

/** Échecs `{fichier} : {raison}` de complétude (chemins relatifs à `root`). */
export function findCompletenessErrors(root) {
  const failures = [];
  checkI18n(root, failures);
  const cities = checkAreas(root, failures);
  const legal = checkLegal(root, failures);
  checkRoutes(root, failures, cities, legal, checkPosts(root, failures));
  return failures;
}

if (isMain(import.meta.url)) report('completeness', findCompletenessErrors(rootArg(REPO_ROOT)));
