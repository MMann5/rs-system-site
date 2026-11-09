// Story 4.3 (FR41, UX-DR24, AD-7, décisions D3 et D4) : rendu des avis Midrag sur une page ville.
// D3 : aucun avis réel dans le dépôt. Le build de recette est rejoué HORS du dépôt : copie de src/, public/ et de la
// configuration dans un dossier temporaire, 2 avis de test référencés par Modiin dans cette copie, `astro build`
// dans la copie (rien n'est écrit dans src/ ni dist/ du dépôt), puis le dossier est supprimé.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const I18N = Object.fromEntries(
  ['he', 'fr'].map((lang) => [lang, JSON.parse(readFileSync(join(ROOT, 'src/i18n', `${lang}.json`), 'utf8'))]),
);
const MODIIN = { he: 'מודיעין', fr: 'Modiin' };
const REVIEWS = [
  { id: 'rendu-test-a', quote: 'ציטוט בדיקה ראשון', author: 'בודק א', translation: 'TRADUCTION-DE-TEST-JAMAIS-AFFICHEE' },
  { id: 'rendu-test-b', quote: 'ציטוט בדיקה שני', author: 'בודק ב' },
];
// Ordre de `reviews:` volontairement inverse de l'ordre alphabétique des fichiers.
const ORDER = ['rendu-test-b', 'rendu-test-a'];

const work = mkdtempSync(join(tmpdir(), 'rs-reviews-'));
after(() => rmSync(work, { recursive: true, force: true }));

function buildCopy() {
  for (const entry of ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    cpSync(join(ROOT, entry), join(work, entry), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'), 'dir');
  // Cache Astro propre à la copie : le cache par défaut (node_modules/.astro, partagé par le lien) contient le magasin
  // de contenus ; des builds parallèles (autres tests de rendu, build.test) se le disputeraient.
  const config = join(work, 'astro.config.mjs');
  const source = readFileSync(config, 'utf8');
  assert.match(source, /^  output: 'static',$/m, 'astro.config.mjs : output attendu');
  writeFileSync(config, source.replace(/^  output: 'static',$/m, "  cacheDir: './.astro-cache',\n  output: 'static',"));
  for (const r of REVIEWS) {
    const lines = [`quote: '${r.quote}'`, "lang: 'he'", `author: '${r.author}'`, `locality: '${MODIIN.he}'`, "city: 'modiin'"];
    if (r.translation) lines.push(`translations: { fr: '${r.translation}' }`);
    writeFileSync(join(work, 'src/content/reviews', `${r.id}.yaml`), `${lines.join('\n')}\n`);
  }
  const cityFile = join(work, 'src/content/cities/modiin.yaml');
  const city = readFileSync(cityFile, 'utf8');
  assert.match(city, /^reviews: \[\]$/m, 'modiin.yaml : reviews: [] attendu (D3)');
  writeFileSync(cityFile, city.replace(/^reviews: \[\]$/m, `reviews: [${ORDER.map((id) => `'${id}'`).join(', ')}]`));
  const env = { ...process.env };
  for (const key of ['WORKERS_CI_BRANCH', 'SITE_URL', 'DOMAIN_LIVE']) delete env[key];
  execFileSync(join(work, 'node_modules/.bin/astro'), ['build'], { cwd: work, env, stdio: 'pipe' });
  return join(work, 'dist');
}

test('avis Midrag (D4) : 2 avis hébreux sur Modiin, rendus en langue d\'origine sur les pages fr et he', { timeout: 300_000 }, () => {
  const dist = buildCopy();
  const byId = Object.fromEntries(REVIEWS.map((r) => [r.id, r]));
  for (const [lang, file] of [['fr', 'fr/zones/modiin/index.html'], ['he', 'he/אזורים/מודיעין/index.html']]) {
    const where = `modiin (${lang})`;
    const html = readFileSync(join(dist, file), 'utf8');
    const main = (html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '').replace(/ data-astro-cid-[\w-]+(?:="")?/g, '');
    const section = main.match(/<section class="section section-alt reveal" aria-label="([^"]*)">([\s\S]*?)<\/section>/);
    assert.ok(section, `${where} : section avis`);
    assert.equal(section[1], I18N[lang]['city.reviews.label'].replace('{city}', MODIIN[lang]), `${where} : aria-label`);
    assert.ok(!/<h[1-6]\b/.test(section[2]), `${where} : sans titre`);
    assert.ok(
      main.indexOf('city-services-title') < section.index && section.index < main.indexOf('city-neighbors-title'),
      `${where} : entre services et localités`,
    );
    const figures = [...section[2].matchAll(/<figure class="review" lang="([^"]*)" dir="([^"]*)"><blockquote class="quote">([^<]*)<\/blockquote><figcaption class="caption">([^<]*)<\/figcaption><\/figure>/g)];
    assert.equal(section[2].match(/<figure\b/g)?.length, 2, `${where} : 2 figures`);
    assert.deepEqual(
      figures.map((m) => m.slice(1)),
      ORDER.map((id) => ['he', 'rtl', `„${byId[id].quote}”`, `${byId[id].author} · ${MODIIN.he} · מידרג`]),
      `${where} : figures dans l'ordre de reviews:`,
    );
    assert.ok(!html.includes(REVIEWS[0].translation), `${where} : traduction jamais affichée`);
  }
});
