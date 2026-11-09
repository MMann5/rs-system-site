// Story 5.2 (UX-DR26, AD-2, décision A3 de l'epic 5) : rendu de Prose.astro sur un texte légal fourni (pending: false).
// A3 : la fixture n'est jamais générée dans dist/ du dépôt. Le build est rejoué HORS du dépôt : copie de src/, public/ et
// de la configuration dans un dossier temporaire, src/content/legal/privacy/fr.md remplacé par la fixture dans cette
// copie, `astro build` dans la copie, puis le dossier est supprimé.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FR = JSON.parse(readFileSync(join(ROOT, 'src/i18n/fr.json'), 'utf8'));
const IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const FIXTURE = `---
pending: false
---

## Données collectées

Texte de test avec **mot important** et un [lien interne](page:about).

### Durée de conservation

- premier point
- second point

1. première étape
2. seconde étape

<figure><img src="${IMG}" alt="image de test" width="1" height="1"><figcaption>Légende de test</figcaption></figure>

> Citation de test.
`;

const work = mkdtempSync(join(tmpdir(), 'rs-prose-'));
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
  const file = join(work, 'src/content/legal/privacy/fr.md');
  assert.match(readFileSync(file, 'utf8'), /^pending: true$/m, 'privacy/fr.md : pending: true attendu');
  writeFileSync(file, FIXTURE);
  const env = { ...process.env };
  for (const key of ['WORKERS_CI_BRANCH', 'SITE_URL', 'DOMAIN_LIVE']) delete env[key];
  execFileSync(join(work, 'node_modules/.bin/astro'), ['build'], { cwd: work, env, stdio: 'pipe' });
  return join(work, 'dist');
}

function servedCss(html, out) {
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(([, href]) => readFileSync(join(out, href), 'utf8'));
  css.push(...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]));
  return css.join('\n');
}

test('Prose.astro (A3) : h2, h3, listes, strong, lien page: résolu, figure + figcaption, blockquote, sans numérotation', { timeout: 300_000 }, () => {
  const out = buildCopy();
  const html = readFileSync(join(out, 'fr/confidentialite/index.html'), 'utf8');
  const main = (html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '').replace(/ data-astro-cid-[\w-]+(?:="[^"]*")?/g, '');
  const prose = main.match(/^<section class="legal" aria-labelledby="legal-title"><div class="column"><h1 id="legal-title" class="title">[^<]*<\/h1><div class="(prose[^"]*)">([\s\S]*)<\/div><\/div><\/section>$/);
  assert.ok(prose, `colonne de prose : ${main.slice(0, 300)}`);
  assert.equal(prose[1], 'prose', 'pas de classe numbered');
  const body = prose[2];
  assert.match(body, /<h2[^>]*>Données collectées<\/h2>/, 'h2');
  assert.match(body, /<h3[^>]*>Durée de conservation<\/h3>/, 'h3');
  assert.match(body, /<strong>mot important<\/strong>/, 'strong');
  assert.match(body, /<a href="\/fr\/a-propos\/">lien interne<\/a>/, 'lien page:about résolu');
  assert.ok(!body.includes('page:'), 'aucun page: restant');
  assert.match(body, /<ul>\s*<li>premier point<\/li>\s*<li>second point<\/li>\s*<\/ul>/, 'ul');
  assert.match(body, /<ol>\s*<li>première étape<\/li>\s*<li>seconde étape<\/li>\s*<\/ol>/, 'ol');
  assert.match(body, /<figure><img src="[^"]+" alt="image de test"[^>]*><figcaption>Légende de test<\/figcaption><\/figure>/, 'figure + figcaption');
  assert.match(body, /<blockquote>\s*<p>Citation de test\.<\/p>\s*<\/blockquote>/, 'blockquote');
  // Ordre du Markdown conservé.
  const order = ['<h2', '<strong>', '<h3', '<ul>', '<ol>', '<figure>', '<blockquote>'].map((s) => body.indexOf(s));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'ordre');
  // Texte fourni : aucun placeholder juridique, aucun placeholder dans <main> (privacy n'a pas de référent).
  assert.ok(!html.includes(FR['legal.placeholder']), 'placeholder juridique absent');
  assert.ok(!main.includes('data-placeholder'), 'aucun placeholder dans <main>');
  // CSS servie : article-body, filet de citation, liste à indentation logique, option de numérotation.
  const flat = servedCss(html, out).replace(/\s+/g, ' ').replace(/\[data-astro-cid-[\w-]+\]/g, '');
  /** Déclarations de la règle `selector` (ordre indifférent : le minifieur réordonne les propriétés). */
  const rule = (selector) => {
    const escapedSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, ' ?');
    const m = flat.match(new RegExp(`(?:^|[}\\s])${escapedSel} ?\\{([^}]*)\\}`));
    assert.ok(m, `règle ${selector}`);
    return m[1].split(';').map((d) => d.trim().replace(/: ?/, ':'));
  };
  const has = (selector, decls) => {
    const got = rule(selector);
    for (const d of decls) assert.ok(got.includes(d), `${selector} : ${d} absent de ${got.join(';')}`);
  };
  has('.prose', ['font-size:var(--type-article-body-size)', 'line-height:var(--type-article-body-leading)']);
  has('.prose blockquote', ['border-inline-start:var(--prose-quote-rule) solid var(--color-signal-blue)', 'font-size:var(--type-body-lg-size)', 'margin-inline:0']);
  has('.prose ul,.prose ol', ['padding-inline-start:var(--prose-list-indent)']);
  has('.prose h2', ['font-size:var(--type-h2-size)']);
  has('.prose h3', ['font-size:var(--type-h3-size)']);
  has('.prose strong', ['font-weight:700']);
  has('.prose a', ['color:var(--color-link)', 'text-decoration:underline']);
  has('.prose figcaption', ['color:var(--color-ink-muted)', 'font-size:var(--type-small-size)']);
  has('.prose figure img', ['max-inline-size:100%', 'block-size:auto']);
  has('.prose.numbered', ['counter-reset:prose-section']);
  has('.prose.numbered h2:before', ['counter-increment:prose-section', 'content:counter(prose-section) ". "']);
});
