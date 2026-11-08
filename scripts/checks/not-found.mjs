// AD-3, AD-11 : présence de dist/404.html et des 4 dist/{lang}/404.html, puis, dist/ servi par
// wrangler dev, `/{lang}/rs-gate-introuvable/` répond 404 sans 3xx avec `<html lang="{lang}"`, et
// `/rs-gate-introuvable/` répond 404 en hébreu. Lecture seule (le déplacement est scripts/postbuild/not-found.mjs).
// Usage : node scripts/checks/not-found.mjs [dossier]  (défaut : dist/ du dépôt).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LANGS } from '../../src/lib/langs.ts';
import { isMain, report, REPO_ROOT, rootArg } from './report.mjs';
import { serve } from './serve.mjs';

export const PROBE = 'rs-gate-introuvable';

/** Fichiers 404 attendus, relatifs à dist/. */
export const NOT_FOUND_FILES = ['404.html', ...LANGS.map((lang) => `${lang}/404.html`)];

/** Échecs : fichiers 404 absents de `dist`. */
export function findMissingNotFound(dist) {
  return NOT_FOUND_FILES.filter((file) => !existsSync(join(dist, file))).map((file) => `${file} : 404 absente`);
}

/** Échecs HTTP sur un serveur déjà lancé (`origin`). */
export async function findNotFoundHttpErrors(origin) {
  const failures = [];
  const cases = [...LANGS.map((lang) => ({ path: `/${lang}/${PROBE}/`, lang })), { path: `/${PROBE}/`, lang: 'he' }];
  for (const { path, lang } of cases) {
    let res;
    let body;
    try {
      res = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      body = await res.text();
    } catch (error) {
      failures.push(`${path} : ${error.message} (requête échouée)`);
      continue;
    }
    if (res.status !== 404) {
      const location = res.headers.get('location');
      failures.push(`${path} : statut ${res.status}${location ? ` → ${location}` : ''} (attendu 404 sans redirection)`);
      continue;
    }
    const htmlLang = body.match(/<html\b[^>]*\blang="([^"]*)"/i)?.[1];
    if (htmlLang !== lang) failures.push(`${path} : <html lang="${htmlLang ?? ''}"> (attendu ${lang})`);
  }
  return failures;
}

/** Contrôle complet : fichiers, puis HTTP par wrangler dev si les 5 fichiers existent. */
export async function checkNotFound(dist) {
  const missing = findMissingNotFound(dist);
  if (missing.length > 0) return missing;
  const server = await serve(dist);
  try {
    return await findNotFoundHttpErrors(server.origin);
  } finally {
    await server.close();
  }
}

if (isMain(import.meta.url)) {
  const dist = rootArg(join(REPO_ROOT, 'dist'));
  if (!existsSync(dist)) report('not-found', [`${dist} : absent, lancer npm run build d’abord`]);
  report('not-found', await checkNotFound(dist));
}
