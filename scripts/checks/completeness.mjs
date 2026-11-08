// AD-4, AD-2, AD-11 : complétude des 4 langues.
// - src/i18n/ contient exactement {he,en,ru,fr}.json, acceptés par buildDictionary (mêmes clés) ;
// - les pages de src/content/pages/*.yaml (id = nom du fichier) sont acceptées par buildRegistry,
//   sur une branche comme sur main (4 slugs par id, `(lang, chemin)` uniques).
// Les messages de buildDictionary et de buildRegistry sont repris tels quels.
// Usage : node scripts/checks/completeness.mjs [racine]  (défaut : racine du dépôt).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { buildDictionary } from '../../src/lib/i18n/core.ts';
import { LANGS } from '../../src/lib/langs.ts';
import { buildRegistry } from '../../src/lib/routes/core.ts';
import { isMain, report, REPO_ROOT, rootArg } from './report.mjs';

const I18N = 'src/i18n';
const PAGES = 'src/content/pages';
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

function checkRoutes(root, failures) {
  const dir = join(root, PAGES);
  if (!existsSync(dir)) return failures.push(`${PAGES}/ : dossier absent`);
  const sources = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.yaml')).sort()) {
    try {
      const data = parse(readFileSync(join(dir, name), 'utf8')) ?? {};
      sources.push({ id: name.replace(/\.yaml$/, ''), slugs: data.slugs, enabled: data.enabled, previewOnly: data.previewOnly });
    } catch (error) {
      failures.push(`${PAGES}/${name} : YAML invalide (${messages(error)[0]})`);
    }
  }
  const seen = new Set();
  for (const isMainBranch of [false, true]) {
    try {
      buildRegistry(sources, { isMainBranch });
    } catch (error) {
      for (const line of messages(error)) {
        if (seen.has(line)) continue;
        seen.add(line);
        failures.push(`${PAGES}/ : ${line}`);
      }
    }
  }
}

/** Échecs `{fichier} : {raison}` de complétude (chemins relatifs à `root`). */
export function findCompletenessErrors(root) {
  const failures = [];
  checkI18n(root, failures);
  checkRoutes(root, failures);
  return failures;
}

if (isMain(import.meta.url)) report('completeness', findCompletenessErrors(rootArg(REPO_ROOT)));
