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
// Les messages de buildDictionary, buildRegistry, buildAreas et buildReviews sont repris tels quels.
// Usage : node scripts/checks/completeness.mjs [racine]  (défaut : racine du dépôt).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { buildAreas, buildReviews, citySources } from '../../src/lib/areas/core.ts';
import { buildDictionary } from '../../src/lib/i18n/core.ts';
import { LANGS } from '../../src/lib/langs.ts';
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

function checkRoutes(root, failures, cities) {
  const dir = join(root, PAGES);
  if (!existsSync(dir)) return failures.push(`${PAGES}/ : dossier absent`);
  const sources = readYamlDir(root, PAGES, failures).map(({ id, data }) => ({
    id,
    slugs: data.slugs,
    enabled: data.enabled,
    previewOnly: data.previewOnly,
  }));
  sources.push(...citySources(cities));
  const seen = new Set();
  for (const isMainBranch of [false, true]) {
    try {
      buildRegistry(sources, { isMainBranch });
    } catch (error) {
      for (const line of messages(error)) {
        if (seen.has(line)) continue;
        seen.add(line);
        failures.push(`${line.includes('« city:') ? CITIES : PAGES}/ : ${line}`);
      }
    }
  }
}

/** Échecs `{fichier} : {raison}` de complétude (chemins relatifs à `root`). */
export function findCompletenessErrors(root) {
  const failures = [];
  checkI18n(root, failures);
  checkRoutes(root, failures, checkAreas(root, failures));
  return failures;
}

if (isMain(import.meta.url)) report('completeness', findCompletenessErrors(rootArg(REPO_ROOT)));
