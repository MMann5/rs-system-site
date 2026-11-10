// Story 6.1 (FR12, FR23, FR25, FR31, UX-DR25, UX-DR27, UX-DR31, AD-2, AD-9, AD-11, décision D1 de l'epic 6) : rendu de la
// page article et des cartes « autres articles ». Aucune fixture n'entre dans le dépôt : le build est rejoué HORS du dépôt
// (copie de src/, public/ et de la configuration dans un dossier temporaire), avec 2 articles fixtures en plus du premier
// article (catégorie `cameras` avec une photo copiée de src/assets/photos/ dans src/assets/blog/ de la copie, et
// `smoke-detectors`). Puis, dans la même copie : sans ru.md, puis avec un lien littéral /fr/… → build en échec citant le
// fichier. Le dossier est supprimé à la fin.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LANGS = ['he', 'en', 'ru', 'fr'];
const I18N = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(join(ROOT, `src/i18n/${l}.json`), 'utf8'))]));
const FIRST = { id: 'how-many-smoke-detectors', fr: 'combien-de-detecteurs-de-fumee' };

const work = mkdtempSync(join(tmpdir(), 'rs-blog-'));
after(() => rmSync(work, { recursive: true, force: true }));

/** Article fixture : meta.yaml + 4 .md (titre « {Titre} {lang} »), `alt` si `image`. */
function writePost(id, { category, date, image, title }) {
  const dir = join(work, 'src/content/posts', id);
  mkdirSync(dir, { recursive: true });
  const slugs = LANGS.map((l) => `  ${l}: '${id}-${l}'`).join('\n');
  writeFileSync(join(dir, 'meta.yaml'), `date: '${date}'\ncategory: ${category}\n${image ? `image: ${image}\n` : ''}slugs:\n${slugs}\nenabled: true\n`);
  for (const l of LANGS) {
    const alt = image ? `alt: 'Photo de test ${l}'\n` : '';
    writeFileSync(
      join(dir, `${l}.md`),
      `---\ntitle: '${title} ${l}'\nlede: 'Chapeau ${l}'\nmeta:\n  title: '${title} ${l} · RS SYSTEM'\n  description: 'Chapeau ${l}'\n${alt}---\n\n## Section\n\nTexte de test.\n`,
    );
  }
}

function setup() {
  for (const entry of ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    cpSync(join(ROOT, entry), join(work, entry), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'), 'dir');
  // Cache Astro propre à la copie (comme prose-render) : pas de magasin de contenus partagé entre builds parallèles.
  const config = join(work, 'astro.config.mjs');
  const source = readFileSync(config, 'utf8');
  assert.match(source, /^  output: 'static',$/m, 'astro.config.mjs : output attendu');
  writeFileSync(config, source.replace(/^  output: 'static',$/m, "  cacheDir: './.astro-cache',\n  output: 'static',"));
  mkdirSync(join(work, 'src/assets/blog'), { recursive: true });
  copyFileSync(join(ROOT, 'src/assets/photos/cameras-dome.jpg'), join(work, 'src/assets/blog/fixture-dome.jpg'));
  writePost('fixture-cameras', { category: 'cameras', date: '2026-10-01', image: 'fixture-dome.jpg', title: 'Caméras fixture' });
  writePost('fixture-smoke', { category: 'smoke-detectors', date: '2026-09-01', title: 'Détecteur fixture' });
}

const env = () => {
  const out = { ...process.env };
  for (const key of ['WORKERS_CI_BRANCH', 'SITE_URL', 'DOMAIN_LIVE']) delete out[key];
  return out;
};

function build() {
  rmSync(join(work, 'dist'), { recursive: true, force: true });
  execFileSync(join(work, 'node_modules/.bin/astro'), ['build'], { cwd: work, env: env(), stdio: 'pipe' });
  return join(work, 'dist');
}

/** Build attendu en échec : sortie (stdout + stderr) de l'erreur. */
function failingBuild() {
  try {
    build();
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  return assert.fail('le build aurait dû échouer');
}

const mainOf = (html) => (html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '').replace(/ data-astro-cid-[\w-]+(?:="[^"]*")?/g, '');
/** Balise <img> entière, guillemets compris. */
const IMG_TAG = /<img\b(?:[^>"]|"[^"]*")*>/g;
const decode = (href) => decodeURIComponent(href.replaceAll('&amp;', '&'));

test('page article et cartes (fixtures hors dépôt), puis build en échec sans ru.md ou avec un lien littéral', { timeout: 600_000 }, () => {
  setup();
  const out = build();

  // — Premier article (smoke-detectors), en français —
  const html = readFileSync(join(out, 'fr/blog', FIRST.fr, 'index.html'), 'utf8');
  const main = mainOf(html);
  const fr = I18N.fr;
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, 'un seul h1');
  assert.ok(!main.includes('class="band"'), 'pas de bloc contact standard');
  assert.ok(!main.includes('data-placeholder'), 'aucun placeholder dans <main>');
  // Ordre : fil d'Ariane · h1 · chapeau · date + lecture · média · corps numéroté · encart · autres articles.
  const order = ['class="crumb"', '<h1', 'class="lede"', 'class="meta"', 'class="media"', 'class="prose numbered"', '<aside', 'class="related"'].map((s) => main.indexOf(s));
  assert.ok(order.every((i) => i >= 0), `blocs présents : ${order}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'ordre des blocs');
  // Fil d'Ariane sans lien tant que `blog` est désactivé ; catégorie = libellé du service.
  const crumb = main.match(/<p class="crumb">([\s\S]*?)<\/p>/)?.[1] ?? '';
  assert.equal(crumb, `<span>${fr['nav.blog']}</span><span aria-hidden="true"> › </span><span>Détecteurs de fumée</span>`);
  assert.match(main, /<p class="meta"><time datetime="2026-11-10">10 novembre 2026<\/time> · \d+ min de lecture<\/p>/, 'date et temps de lecture');
  // Média D1 : détecteur dessiné aria-hidden, pas de photo.
  const media = main.match(/<div class="media">([\s\S]*?)<\/div><\/div><div class="body">/)?.[1] ?? '';
  assert.match(media, /^<div class="detector lg fit" aria-hidden="true">/, `détecteur : ${media.slice(0, 120)}`);
  assert.ok(!media.includes('<picture'), 'pas de photo');
  // h2 numérotés par compteur CSS, jamais tapés.
  const prose = main.match(/<div class="prose numbered">([\s\S]*?)<\/div><\/div><aside/)?.[1] ?? '';
  assert.ok((prose.match(/<h2\b/g) ?? []).length >= 4, 'sections h2');
  assert.ok(!/<h2[^>]*>\s*\d/.test(prose), 'numéro tapé');
  assert.match(prose, /<a href="\/fr\/detecteurs-de-fumee\/">/, 'lien page:smoke-detectors résolu');
  // Encart : h2 traduit, tel:, WhatsApp avec le service hébreu, 3 liens article_box.
  const aside = main.match(/<aside class="wrap" aria-labelledby="article-box-title">([\s\S]*?)<\/aside>/)?.[1] ?? '';
  assert.match(aside, new RegExp(`<h2 id="article-box-title" class="title">${fr['post.contact.title'].replace("'", '&#39;').replace('?', '\\?')}</h2>`));
  assert.equal(aside.match(/data-placement="article_box"/g)?.length, 3, '3 liens article_box');
  assert.equal(aside.match(/href="tel:\+972509565669"/g)?.length, 2, 'deux liens d\'appel');
  const wa = aside.match(/href="(https:\/\/wa\.me\/[^"]+)"/)?.[1];
  assert.ok(wa && decode(wa).includes('הצעת מחיר לגלאי עשן.'), `WhatsApp avec le service : ${wa && decode(wa)}`);
  // Autres articles : même catégorie d'abord (fixture-smoke), puis le plus récent (fixture-cameras), cartes = un lien.
  const related = main.match(/<section class="related"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
  assert.match(related, new RegExp(`<h2 id="related-title" class="related-title">${fr['post.related.title']}</h2>`));
  const cards = [...related.matchAll(/<a href="([^"]*)" class="card">([\s\S]*?)<\/a>/g)];
  assert.deepEqual(cards.map((c) => c[1]), ['/fr/blog/fixture-smoke-fr/', '/fr/blog/fixture-cameras-fr/'], 'ordre des cartes');
  assert.match(cards[0][2], /<div class="detector sm fit" aria-hidden="true">/, 'carte détecteur');
  assert.match(cards[0][2], /<span class="category">Détecteurs de fumée<\/span><h3 class="title">Détecteur fixture fr<\/h3><time class="date" datetime="2026-09-01">1 septembre 2026<\/time>/);
  // `alt=""` est émis en attribut nu `alt` (valeur vide) par Astro. Balises lues guillemets compris (`sizes` contient « >= »).
  const imgs = related.match(IMG_TAG) ?? [];
  assert.equal(imgs.length, 1, 'une photo de carte');
  assert.ok(cards[1][2].includes('<picture>') && cards[1][2].includes(imgs[0]), 'photo dans la carte cameras');
  assert.match(imgs[0], /\salt(?:="")?[\s>]/, 'carte photo alt=""');
  assert.match(cards[1][2], /<span class="category">Caméras de surveillance<\/span>/);

  // — Article fixture à photo (cameras), en hébreu —
  const he = readFileSync(join(out, 'he', 'בלוג', 'fixture-cameras-he', 'index.html'), 'utf8');
  const heMain = mainOf(he);
  const heMedia = heMain.match(/<div class="media">([\s\S]*?)<\/div><\/div><div class="body">/)?.[1] ?? '';
  assert.ok(heMedia.startsWith('<picture>') && heMedia.endsWith('</picture>'), `photo d'article : ${heMedia.slice(0, 200)}`);
  const heImg = heMedia.match(IMG_TAG)?.[0] ?? '';
  assert.match(heImg, /\salt="Photo de test he"/, 'alt du .md');
  assert.match(heImg, /\sfetchpriority="high"/, 'photo d\'article prioritaire');
  assert.equal(he.match(/<title>(.*?)<\/title>/)?.[1], 'Caméras fixture he · RS SYSTEM', '<title> = meta.title');
  const heWa = heMain.match(/href="(https:\/\/wa\.me\/[^"]+)"/)?.[1];
  assert.ok(heWa && decode(heWa).includes('הצעת מחיר למצלמות אבטחה.'), 'WhatsApp : service de la catégorie');
  const heCards = [...heMain.matchAll(/<a href="([^"]*)" class="card">/g)].map((m) => decodeURIComponent(m[1]));
  assert.deepEqual(heCards, ['/he/בלוג/כמה-גלאי-עשן-צריך-בדירה/', '/he/בלוג/fixture-smoke-he/'], 'sans même catégorie : les plus récents');
  // Index du blog jamais généré.
  for (const l of LANGS) assert.throws(() => readFileSync(join(out, l, { he: 'בלוג', en: 'blog', ru: 'блог', fr: 'blog' }[l], 'index.html')), `index ${l}`);

  // — Article actif sans ru.md → build en échec citant le fichier —
  const ru = join(work, 'src/content/posts', FIRST.id, 'ru.md');
  const ruText = readFileSync(ru, 'utf8');
  rmSync(ru);
  assert.match(failingBuild(), new RegExp(`src/content/posts/${FIRST.id}/ru\\.md : fichier manquant`));
  writeFileSync(ru, ruText);

  // — Lien interne littéral dans un .md → build en échec citant le fichier —
  const frFile = join(work, 'src/content/posts/fixture-smoke/fr.md');
  writeFileSync(frFile, `${readFileSync(frFile, 'utf8')}\nVoir [contact](/fr/contact/).\n`);
  assert.match(failingBuild(), /src\/content\/posts\/fixture-smoke\/fr\.md : lien « \/fr\/contact\/ » refusé/);
});
