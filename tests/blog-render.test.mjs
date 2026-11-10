// Story 6.1 (FR12, FR23, FR25, FR31, UX-DR25, UX-DR27, UX-DR31, AD-2, AD-9, AD-11, décision D1 de l'epic 6) : rendu de la
// page article et des cartes « autres articles ». Aucune fixture n'entre dans le dépôt : le build est rejoué HORS du dépôt
// (copie de src/, public/ et de la configuration dans un dossier temporaire), avec 2 articles fixtures en plus du premier
// article (catégorie `cameras` avec une photo copiée de src/assets/photos/ dans src/assets/blog/ de la copie, et
// `smoke-detectors`). Puis, dans la même copie : sans ru.md, puis avec un lien littéral /fr/… → build en échec citant le
// fichier. Le dossier est supprimé à la fin.
// Story 6.2 (FR11, NFR1, UX-DR25, UX-DR31, AD-2, AD-3) : index du blog (vedette, grille en h2, pas de bloc contact), fil
// d'Ariane lié, « בלוג » courant sur l'article ; une fixture ancienne `featured: true` devient la vedette ; 26 articles
// fictifs (générés dans la copie) → pages 1, 2, 3 (12, 12, 1 cartes), pas de page 4 ; sans aucun article → ni index ni
// lien vers le slug du blog. Rien n'est écrit dans le dépôt.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkShare, imageInfo } from '../scripts/checks/share.mjs';
import { FEATURED_PHOTO_SIZES } from '../src/lib/photos.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LANGS = ['he', 'en', 'ru', 'fr'];
const I18N = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(join(ROOT, `src/i18n/${l}.json`), 'utf8'))]));
const FIRST = { id: 'how-many-smoke-detectors', fr: 'combien-de-detecteurs-de-fumee' };
const BLOG_SLUGS = { he: 'בלוג', en: 'blog', ru: 'блог', fr: 'blog' };
const REPO_POSTS = readdirSync(join(ROOT, 'src/content/posts')).sort();

const work = mkdtempSync(join(tmpdir(), 'rs-blog-'));
after(() => rmSync(work, { recursive: true, force: true }));

/** Article fixture : meta.yaml + 4 .md (titre « {Titre} {lang} »), `alt` si `image`. */
function writePost(id, { category, date, image, title, featured = false }) {
  const dir = join(work, 'src/content/posts', id);
  mkdirSync(dir, { recursive: true });
  const slugs = LANGS.map((l) => `  ${l}: '${id}-${l}'`).join('\n');
  writeFileSync(join(dir, 'meta.yaml'), `date: '${date}'\ncategory: ${category}\n${image ? `image: ${image}\n` : ''}slugs:\n${slugs}\nenabled: true\n${featured ? 'featured: true\n' : ''}`);
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
/** Fichier `index.html` de la page `segments` (bruts) en `lang` dans `out`. */
const page = (out, lang, ...segments) => readFileSync(join(out, lang, ...segments, 'index.html'), 'utf8');
/** Liens des cartes (`class="card"`) d'un <main>, dans l'ordre. */
const cardHrefs = (main) => [...main.matchAll(/<a href="([^"]*)" class="card">/g)].map((m) => decodeURIComponent(m[1]));
const featuredHrefs = (main) => [...main.matchAll(/<a href="([^"]*)" class="featured">/g)].map((m) => decodeURIComponent(m[1]));
/** Lien « בלוג » du header (barre) : attributs. */
const headerBlogLink = (html, lang) => html.match(new RegExp(`<a href="/${lang}/${encodeURIComponent(BLOG_SLUGS[lang])}/" class="nav-link"([^>]*)>`))?.[1];

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
  // Story 6.2 : fil d'Ariane = <nav aria-label>, lien vers l'index de la langue ; catégorie = libellé du service.
  const crumb = main.match(/<nav class="crumb" aria-label="([^"]*)">([\s\S]*?)<\/nav>/);
  assert.equal(crumb?.[1], fr['post.breadcrumb-label']);
  assert.equal(crumb?.[2], `<a href="/fr/blog/" class="crumb-link">${fr['nav.blog']}</a><span aria-hidden="true"> › </span><span>Détecteurs de fumée</span>`);
  // « בלוג » courant sur l'article (navSection blog).
  assert.match(headerBlogLink(html, 'fr') ?? '', /\saria-current="page"/, 'Blog courant dans le header');
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

  // — Story 7.2 : aperçus et JSON-LD du build fixture ; article à photo → JPEG 1200 × 630 recadré, = Article.image —
  assert.deepEqual(checkShare(out, undefined), [], 'share');
  const photoPost = page(out, 'fr', 'blog', 'fixture-cameras-fr');
  const ogImage = photoPost.match(/<meta property="og:image" content="([^"]*)">/)?.[1] ?? '';
  // fixture-dome.jpg est une copie octet pour octet de cameras-dome.jpg : Vite ne garde qu'un fichier source et le
  // nomme d'après le premier importé ; les deux noms désignent la photo de l'article (la carte détecteur est exclue).
  assert.match(ogImage, /^\/_astro\/(?:fixture|cameras)-dome\.[\w-]+\.jpe?g$/, `og:image ${ogImage}`);
  assert.deepEqual(imageInfo(readFileSync(join(out, ogImage))), { type: 'image/jpeg', width: 1200, height: 630 }, 'og:image 1200 × 630');
  const ld = JSON.parse(photoPost.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}');
  assert.equal(ld['@graph']?.find((node) => node['@type'] === 'Article')?.image, ogImage, 'Article.image = og:image');

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

  // — Story 6.2 : index (3 articles) : h1 unique, vedette = le plus récent, grille de 2 cartes h2, ni bloc contact ni pagination —
  for (const l of LANGS) {
    const index = page(out, l, BLOG_SLUGS[l]);
    const iMain = mainOf(index);
    const where = `index ${l}`;
    assert.equal(index.match(/<h1[\s>]/g)?.length, 1, `${where} : un seul h1`);
    assert.equal(iMain.match(/<h1 class="title">([^<]*)<\/h1>/)?.[1], I18N[l]['nav.blog'], `${where} : h1`);
    assert.equal(featuredHrefs(iMain).length, 1, `${where} : une vedette`);
    assert.ok(featuredHrefs(iMain)[0].endsWith(`/${{ he: 'כמה-גלאי-עשן-צריך-בדירה', en: 'how-many-smoke-detectors', ru: 'сколько-датчиков-дыма-нужно', fr: FIRST.fr }[l]}/`), `${where} : vedette`);
    assert.deepEqual(cardHrefs(iMain), [`/${l}/${BLOG_SLUGS[l]}/fixture-cameras-${l}/`, `/${l}/${BLOG_SLUGS[l]}/fixture-smoke-${l}/`], `${where} : grille`);
    assert.equal(iMain.match(/<h2 class="title">/g)?.length, 3, `${where} : titres h2 (vedette + 2 cartes)`);
    assert.ok(!/<h3\b/.test(iMain), `${where} : pas de h3`);
    assert.ok(iMain.indexOf('class="featured"') < iMain.indexOf('class="grid"'), `${where} : vedette avant la grille`);
    assert.ok(!iMain.includes('class="band"') && !iMain.includes('contact-band'), `${where} : pas de bloc contact`);
    assert.ok(!iMain.includes('class="pagination"'), `${where} : pas de pagination`);
    assert.match(headerBlogLink(index, l) ?? '', /\saria-current="page"/, `${where} : Blog courant`);
  }
  const frIndex = mainOf(page(out, 'fr', 'blog'));
  // Vedette : photo absente (smoke-detectors) → détecteur dessiné ; titre h2, chapeau, date.
  assert.match(frIndex, /<a href="[^"]*" class="featured"><div class="media"><div class="detector sm fit" aria-hidden="true">/, 'vedette : détecteur');
  assert.match(frIndex, /<span class="category">Détecteurs de fumée<\/span><h2 class="title">Combien de détecteurs[^<]*<\/h2><p class="lede">[^<]+<\/p><time class="date" datetime="2026-11-10">10 novembre 2026<\/time>/, 'texte de la vedette');
  // Carte photo de la grille : lazy (seule la vedette est prioritaire).
  const gridImg = frIndex.match(IMG_TAG)?.[0] ?? '';
  assert.match(gridImg, /\sloading="lazy"/, 'carte de la grille en lazy');
  assert.equal(page(out, 'fr', 'blog').match(/<title>(.*?)<\/title>/)?.[1], 'Blog · RS SYSTEM');
  assert.ok(!existsSync(join(out, 'fr/blog/2')), 'pas de page 2');

  // — featured : une fixture ancienne épinglée devient la vedette, le plus récent passe dans la grille —
  writePost('fixture-smoke', { category: 'smoke-detectors', date: '2026-09-01', title: 'Détecteur fixture', featured: true });
  const pinned = mainOf(page(build(), 'fr', 'blog'));
  assert.deepEqual(featuredHrefs(pinned), ['/fr/blog/fixture-smoke-fr/'], 'vedette épinglée');
  assert.deepEqual(cardHrefs(pinned), [`/fr/blog/${FIRST.fr}/`, '/fr/blog/fixture-cameras-fr/'], 'grille sans la vedette');
  writePost('fixture-smoke', { category: 'smoke-detectors', date: '2026-09-01', title: 'Détecteur fixture' });

  // — Vedette à photo : fixture-cameras épinglée → seule image prioritaire de la page, alt vide, sizes de la vedette —
  writePost('fixture-cameras', { category: 'cameras', date: '2026-10-01', image: 'fixture-dome.jpg', title: 'Caméras fixture', featured: true });
  const photoIndex = page(build(), 'fr', 'blog');
  const photoMain = mainOf(photoIndex);
  assert.deepEqual(featuredHrefs(photoMain), ['/fr/blog/fixture-cameras-fr/'], 'vedette à photo');
  const featuredImg = photoMain.match(/<a href="[^"]*" class="featured">([\s\S]*?)<\/a>/)?.[1].match(IMG_TAG)?.[0] ?? '';
  assert.match(featuredImg, /\sloading="eager"/, 'vedette eager');
  assert.match(featuredImg, /\sfetchpriority="high"/, 'vedette prioritaire');
  assert.equal(featuredImg.match(/\ssizes="([^"]*)"/)?.[1].replaceAll('&gt;', '>'), FEATURED_PHOTO_SIZES, 'sizes de la vedette');
  assert.match(featuredImg, /\salt(?:="")?[\s>]/, 'vedette alt=""');
  assert.equal(photoIndex.match(/fetchpriority="high"/g)?.length, 1, 'une seule image prioritaire');
  writePost('fixture-cameras', { category: 'cameras', date: '2026-10-01', image: 'fixture-dome.jpg', title: 'Caméras fixture' });

  // — Interrupteur coupé (blog.yaml enabled: false) avec des articles actifs : articles construits, blog absent —
  const blogYaml = join(work, 'src/content/pages/blog.yaml');
  const blogYamlText = readFileSync(blogYaml, 'utf8');
  assert.match(blogYamlText, /^enabled: true$/m);
  writeFileSync(blogYaml, blogYamlText.replace(/^enabled: true$/m, 'enabled: false'));
  const off = build();
  for (const l of LANGS) {
    const article = page(off, l, BLOG_SLUGS[l], `fixture-cameras-${l}`);
    assert.match(mainOf(article), /<p class="crumb"><span>[^<]+<\/span>/, `${l} : fil d'Ariane sans lien`);
    assert.ok(!existsSync(join(off, l, BLOG_SLUGS[l], 'index.html')), `${l} : pas d'index`);
    assert.ok(!existsSync(join(off, l, BLOG_SLUGS[l], '2')), `${l} : pas de page 2`);
    const blogHref = `href="/${l}/${encodeURIComponent(BLOG_SLUGS[l])}/"`;
    for (const html of [page(off, l), page(off, l, { he: 'צור-קשר', en: 'contact', ru: 'контакты', fr: 'contact' }[l]), article]) {
      assert.ok(!html.includes(blogHref), `${l} : lien vers l'index du blog`);
    }
  }
  const offSitemap = decodeURIComponent(readFileSync(join(off, 'sitemap.xml'), 'utf8'));
  for (const l of LANGS) assert.ok(!offSitemap.includes(`/${l}/${BLOG_SLUGS[l]}/</loc>`), `sitemap : index ${l}`);
  writeFileSync(blogYaml, blogYamlText);

  // — 26 articles actifs (23 fictifs de plus, dans la copie) → 3 pages : 12, 12, 1 cartes ; pas de page 4 —
  const extra = Array.from({ length: 23 }, (_, i) => `fixture-${String(i + 1).padStart(2, '0')}`);
  extra.forEach((id, i) => writePost(id, { category: 'smoke-detectors', date: `2026-08-${String(28 - i).padStart(2, '0')}`, title: `Fictif ${id}` }));
  const paged = build();
  for (const l of LANGS) {
    const slug = BLOG_SLUGS[l];
    const pages = [page(paged, l, slug), page(paged, l, slug, '2'), page(paged, l, slug, '3')].map(mainOf);
    assert.deepEqual(pages.map((m) => cardHrefs(m).length), [12, 12, 1], `${l} : cartes par page`);
    assert.deepEqual(pages.map((m) => featuredHrefs(m).length), [1, 0, 0], `${l} : vedette sur la page 1 seulement`);
    assert.ok(!existsSync(join(paged, l, slug, '4')), `${l} : pas de page 4`);
    const all = pages.flatMap(cardHrefs);
    assert.equal(new Set(all).size, 25, `${l} : 25 cartes distinctes`);
    assert.equal(all.at(-1), `/${l}/${slug}/${extra.at(-1)}-${l}/`, `${l} : le plus ancien en dernier`);
    const label = I18N[l]['blog.pagination.label'];
    const pageLabel = (n) => I18N[l]['blog.pagination.page'].replace('{n}', String(n));
    const href = (n) => (n === 1 ? `/${l}/${encodeURIComponent(slug)}/` : `/${l}/${encodeURIComponent(slug)}/${n}/`);
    pages.forEach((m, i) => {
      const n = i + 1;
      const nav = m.match(/<nav class="pagination" aria-label="([^"]*)">([\s\S]*?)<\/nav>/);
      assert.equal(nav?.[1], label, `${l} p${n} : <nav aria-label>`);
      const items = [...nav[2].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1]);
      assert.deepEqual(
        items,
        [1, 2, 3].map((k) =>
          k === n
            ? `<span class="number current" aria-current="page">${k}</span>`
            : `<a href="${href(k)}" class="number" aria-label="${pageLabel(k)}">${k}</a>`,
        ),
        `${l} p${n} : numéros`,
      );
      const next = nav[2].match(/<a href="([^"]*)" class="text-link light">([^<]*)<span aria-hidden="true">\u00a0\u203a<\/span><\/a>/);
      if (n < 3) assert.deepEqual([next?.[1], next?.[2]], [href(n + 1), I18N[l]['blog.pagination.next']], `${l} p${n} : page suivante ›`);
      else assert.equal(next, null, `${l} p${n} : pas de page suivante`);
    });
  }
  // Page 2 : titre d'onglet, canonique et 5 hreflang propres à la page.
  const fr2 = page(paged, 'fr', 'blog', '2');
  assert.equal(fr2.match(/<title>(.*?)<\/title>/)?.[1], I18N.fr['blog.page-title'].replace('{n}', '2'));
  assert.deepEqual([...fr2.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((m) => m[1]), ['/fr/blog/2/']);
  const alternates = [...fr2.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)">/g)].map((m) => [m[1], decodeURIComponent(m[2])]);
  assert.deepEqual(alternates, [['he', '/he/בלוג/2/'], ['en', '/en/blog/2/'], ['ru', '/ru/блог/2/'], ['fr', '/fr/blog/2/'], ['x-default', '/he/בלוג/2/']]);
  assert.match(headerBlogLink(fr2, 'fr') ?? '', /\saria-current="page"/, 'Blog courant sur la page 2');
  const sitemap = decodeURIComponent(readFileSync(join(paged, 'sitemap.xml'), 'utf8'));
  for (const n of [2, 3]) assert.ok(sitemap.includes(`<loc>/he/בלוג/${n}/</loc>`), `sitemap : page ${n}`);
  for (const id of extra) rmSync(join(work, 'src/content/posts', id), { recursive: true });

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

  // — Aucun article : index non généré, aucun lien vers le slug du blog (header, menu, footer) —
  rmSync(join(work, 'src/content/posts'), { recursive: true });
  mkdirSync(join(work, 'src/content/posts'));
  const empty = build();
  for (const l of LANGS) {
    assert.ok(!existsSync(join(empty, l, BLOG_SLUGS[l])), `${l} : dossier du blog`);
    const blogHref = `href="/${l}/${encodeURIComponent(BLOG_SLUGS[l])}/`;
    for (const html of [page(empty, l), page(empty, l, { he: 'צור-קשר', en: 'contact', ru: 'контакты', fr: 'contact' }[l])]) {
      assert.ok(!html.includes(blogHref), `${l} : lien vers le blog`);
    }
  }
  assert.ok(!readFileSync(join(empty, 'sitemap.xml'), 'utf8').includes(`/fr/blog/`), 'sitemap sans blog');

  // Rien n'est écrit dans le dépôt.
  assert.deepEqual(readdirSync(join(ROOT, 'src/content/posts')).sort(), REPO_POSTS, 'src/content/posts du dépôt inchangé');
});
