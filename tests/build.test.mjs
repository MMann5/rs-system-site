// Stories 1.3 à 1.8 : sortie réelle du build, sur une branche puis sur main (registre, layout Base.astro).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waHref } from '../src/lib/contact/core.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LANGS = ['he', 'en', 'ru', 'fr'];
const HOMES = LANGS.map((lang) => `${lang}/index.html`);
const PROBES = ['en/path-probe/index.html', 'fr/test-de-chemin/index.html', 'he/בדיקת-נתיב/index.html', 'ru/проверка-пути/index.html'];
const dirs = [];

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function build(extraEnv) {
  const out = mkdtempSync(join(tmpdir(), 'rs-build-'));
  dirs.push(out);
  const env = { ...process.env, ...extraEnv };
  if (!extraEnv.WORKERS_CI_BRANCH) delete env.WORKERS_CI_BRANCH;
  if (!extraEnv.SITE_URL) delete env.SITE_URL;
  if (!extraEnv.DOMAIN_LIVE) delete env.DOMAIN_LIVE;
  execFileSync('npx', ['astro', 'build', '--outDir', out], { cwd: ROOT, env, stdio: 'pipe' });
  return out;
}

function indexFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name === 'index.html')
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/').normalize('NFC'))
    .sort();
}

/** `meta.<field>` par langue, lu dans src/content/pages/<id>.yaml. */
function metaField(id, field) {
  const yaml = readFileSync(join(ROOT, `src/content/pages/${id}.yaml`), 'utf8');
  const block = yaml.match(new RegExp(`^  ${field}:\\n((?: {4}\\w\\w: '.*'\\n)+)`, 'm'))?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/^ {4}(\w\w): '(.*)'$/gm)].map((m) => [m[1], m[2]]));
}

const META = Object.fromEntries(
  ['home', 'path-probe'].map((id) => [id, { title: metaField(id, 'title'), description: metaField(id, 'description') }]),
);
const titles = META.home.title;

const HOME_LABEL = { he: 'RS SYSTEM, דף הבית', en: 'RS SYSTEM, home', ru: 'RS SYSTEM, главная', fr: 'RS SYSTEM, accueil' };
const PHONE_BDI = '<bdi dir="ltr">050-956-5669</bdi>';
const SKIP_LINK = { he: 'דלגו לתוכן', en: 'Skip to content', ru: 'Перейти к содержимому', fr: 'Aller au contenu' };
const PAGE_HREFS = {
  home: Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/`])),
  'path-probe': Object.fromEntries(
    PROBES.map((file) => [file.split('/')[0], `/${file.split('/')[0]}/${encodeURIComponent(file.split('/')[1])}/`]),
  ),
};
// Story 1.6 : chaînes i18n du menu, du sélecteur et de la barre mobile.
const MENU_LABEL = { he: 'תפריט', en: 'Menu', ru: 'Меню', fr: 'Menu' };
const SWITCHER_LABEL = { he: 'שפה', en: 'Language', ru: 'Язык', fr: 'Langue' };
const LANG_NAME = { he: 'עברית', en: 'English', ru: 'Русский', fr: 'Français' };
const CALL_LABEL = { he: 'התקשרו', en: 'Call', ru: 'Позвонить', fr: 'Appeler' };
const WA_LABEL = { he: 'וואטסאפ', en: 'WhatsApp', ru: 'WhatsApp', fr: 'WhatsApp' };
/** Liens du sélecteur de langues (seuls `<a>` porteurs de hreflang dans le <body>). */
const SWITCHER_LINK = /<a\b[^>]*\shreflang="[^"]*"[^>]*>/g;
// Story 1.7 : chaînes i18n du footer, lues dans src/i18n (mêmes clés dans les 4 fichiers).
const I18N = Object.fromEntries(LANGS.map((lang) => [lang, JSON.parse(readFileSync(join(ROOT, `src/i18n/${lang}.json`), 'utf8'))]));
/** Baseline hébraïque isolée en RTL dans la ligne basse du footer hors hébreu (seul autre lang=/dir=). */
const BASELINE_BDI = /<bdi lang="he" dir="rtl"[^>]*>/g;
/** Story 1.8 : note Midrag du bloc contact, isolée en LTR (seul autre dir= avec le numéro). */
const RATING_BDI = /<bdi dir="ltr"[^>]*>[\d.,]+<\/bdi>/g;
const FOCUSABLE = /<(?:a\b[^>]*\shref=|button\b|input\b|select\b|textarea\b|[a-z][\w-]*\b[^>]*\stabindex=)[^>]*>/i;

/** Story 1.7 (FR19, UX-DR33, D1) : footer pendant l'epic 1 (aucune page de colonne ni légale active). */
function assertFooter(footer, lang, where) {
  const dict = I18N[lang];
  const contact = dict['footer.col.contact'];
  // Deux <nav> : la colonne Contact (seule colonne rendue) et le sélecteur ; aucun <nav> légal.
  const navs = footer.match(/<nav\b[^>]*>/g) ?? [];
  assert.equal(navs.length, 2, `${where} : <nav> du footer ${navs}`);
  assert.match(navs[0], new RegExp(`^<nav aria-label="${contact}"[\\s>]`), `${where} : <nav> Contact`);
  assert.ok(!navs.some((n) => n.includes(`aria-label="${dict['footer.legal-label']}"`)), `${where} : <nav> légal`);
  const col = footer.slice(footer.indexOf(navs[0]), footer.indexOf('</nav>'));
  assert.equal(col.match(/<h2\b[^>]*>([^<]*)<\/h2>/)?.[1], contact, `${where} : <h2> Contact`);
  assert.equal(footer.match(/<h2[\s>]/g)?.length, 1, `${where} : <h2> du footer`);
  // Numéro : lien d'appel mesuré (AD-5, AD-6), isolé en LTR.
  const calls = [...col.matchAll(/<a href="tel:\+972509565669"([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(calls.length, 1, `${where} : lien d'appel du footer`);
  assert.match(calls[0][1], /\sdata-track="call_click"/, `${where} : data-track footer`);
  assert.match(calls[0][1], /\sdata-placement="footer"/, `${where} : data-placement footer`);
  assert.equal(calls[0][2], PHONE_BDI, `${where} : contenu du lien d'appel du footer`);
  // E-mail en placeholder (D1), sans mailto: ; phrase de zone en texte simple.
  assert.equal(col.match(/<span data-placeholder(?:="")?>([^<]*)<\/span>/)?.[1], `[${dict['placeholder.email']}]`, `${where} : placeholder e-mail`);
  assert.ok(!footer.includes('mailto:'), `${where} : mailto:`);
  assert.match(col, new RegExp(`>${dict['contact.zone']}</li>`), `${where} : phrase de zone`);
  // Ligne basse : © · baseline hébraïque (isolée en RTL hors hébreu).
  const baseline = I18N.he['site.tagline'];
  const tagline = lang === 'he' ? baseline : `<bdi lang="he" dir="rtl"[^>]*>${baseline}</bdi>`;
  assert.match(footer, new RegExp(`<p\\b[^>]*>${dict['footer.copyright']} · ${tagline}</p>`), `${where} : ligne basse`);
  // Ordre de lecture : colonne, puis ligne basse, puis sélecteur.
  assert.ok(footer.indexOf(navs[0]) < footer.indexOf('<p') && footer.indexOf('<p') < footer.indexOf(navs[1]), `${where} : ordre du footer`);
}

/** Story 1.4 : sortie du layout unique pour la page `id` en `lang` ; `out` = dossier du build, `site` = SITE_URL. */
function assertLayout(html, id, lang, out, site = '', indexable = false) {
  const where = `${id} (${lang})`;
  // Titre et description depuis le YAML de la page ; noindex si et seulement si non indexable.
  assert.deepEqual(Object.keys(META[id].title), LANGS, `${where} : meta.title`);
  assert.deepEqual(Object.keys(META[id].description), LANGS, `${where} : meta.description`);
  assert.equal(html.match(/<title>(.*?)<\/title>/)?.[1], META[id].title[lang], `${where} : <title>`);
  assert.equal(html.match(/<meta name="description" content="([^"]*)">/)?.[1], META[id].description[lang], `${where} : description`);
  assert.equal(html.includes('<meta name="robots" content="noindex">'), !indexable, `${where} : noindex`);
  // AD-7 : un seul lang= et un seul dir=, sur <html>, avec data-page-id (hors <bdi dir="ltr"> du numéro,
  // liens du sélecteur de langues, qui portent chacun lang + hreflang, et baseline du footer hors hébreu).
  assert.equal(html.match(BASELINE_BDI)?.length ?? 0, lang === 'he' ? 0 : 1, `${where} : bdi de la baseline`);
  assert.equal(html.replace(SWITCHER_LINK, '').replace(BASELINE_BDI, '').match(/\slang=/g)?.length, 1, `${where} : lang= en double`);
  assert.equal(html.replaceAll(PHONE_BDI, '').replace(BASELINE_BDI, '').replace(RATING_BDI, '').match(/\sdir=/g)?.length, 1, `${where} : dir= en double`);
  assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}" data-page-id="${id}"[\\s>]`), where);
  // AD-13 : un seul #rs-data, qui vaut { context }.
  assert.equal(html.match(/\sid="rs-data"/g)?.length, 1, `${where} : #rs-data absent ou en double`);
  const json = html.match(/<script type="application\/json" id="rs-data">([\s\S]*?)<\/script>/)?.[1];
  assert.deepEqual(JSON.parse(json), { context: { id, lang, indexable } }, where);
  // FR24 : premier élément focalisable du <body> = lien d'évitement vers #content.
  const body = html.slice(html.indexOf('<body'));
  const first = body.slice(body.indexOf('>') + 1).match(FOCUSABLE);
  assert.ok(first, `${where} : aucun élément focalisable`);
  assert.match(first[0], /^<a class="skip-link" href="#content"[\s>]/, `${where} : premier focalisable ${first[0]}`);
  const text = body.slice(body.indexOf('>') + 1 + first.index + first[0].length).match(/^([^<]*)<\/a>/)?.[1];
  assert.equal(text, SKIP_LINK[lang], where);
  // Repères.
  assert.equal(html.match(/<header[\s>]/g)?.length, 1, `${where} : <header>`);
  const header = html.match(/<header[\s>][\s\S]*?<\/header>/)?.[0] ?? '';
  assert.ok(header.includes(`<a href="${PAGE_HREFS.home[lang]}"`), `${where} : lien d'accueil du header`);
  // Story 1.5 : logo 50px dans le lien d'accueil, alt traduit.
  const home = header.match(new RegExp(`<a href="${PAGE_HREFS.home[lang]}"[^>]*>([\\s\\S]*?)</a>`))?.[1] ?? '';
  const img = home.match(/<img\b[^>]*>/)?.[0] ?? '';
  assert.match(img, /\sheight="50"[\s>]/, `${where} : logo à 50px`);
  assert.ok(img.includes(` alt="${HOME_LABEL[lang]}"`), `${where} : alt du logo ${img}`);
  // FR32, AD-5 : un seul lien d'appel, mesuré, numéro isolé en LTR sans espace.
  const calls = [...header.matchAll(/<a href="tel:\+972509565669"([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(calls.length, 1, `${where} : lien d'appel du header`);
  assert.match(calls[0][1], /\sdata-track="call_click"/, `${where} : data-track`);
  assert.match(calls[0][1], /\sdata-placement="header"/, `${where} : data-placement`);
  assert.equal(calls[0][2], PHONE_BDI, `${where} : contenu du lien d'appel`);
  // Story 1.6 (FR17, D4) : bouton menu après le numéro, même sans lien actif.
  const buttons = header.match(/<button\b[^>]*>/g) ?? [];
  assert.equal(buttons.length, 1, `${where} : bouton menu`);
  for (const attr of ['type="button"', 'aria-expanded="false"', 'aria-controls="mobile-menu"', `aria-label="${MENU_LABEL[lang]}"`]) {
    assert.ok(buttons[0].includes(` ${attr}`), `${where} : ${attr} absent de ${buttons[0]}`);
  }
  assert.ok(header.indexOf('<button') > header.indexOf('href="tel:'), `${where} : bouton pas après le numéro`);
  // Panneau #mobile-menu après la barre ; aucun id de nav actif pendant l'epic : un seul <nav> dans le
  // header, celui du sélecteur de langues, dans le panneau.
  assert.equal(header.match(/\sid="mobile-menu"/g)?.length, 1, `${where} : #mobile-menu`);
  const menu = header.slice(header.indexOf(' id="mobile-menu"'));
  assert.ok(header.indexOf(' id="mobile-menu"') > header.indexOf('<button'), `${where} : panneau pas après le bouton`);
  assert.equal(header.match(/<nav[\s>]/g)?.length, 1, `${where} : <nav> du header`);
  assert.equal(menu.match(/<nav[\s>]/g)?.length, 1, `${where} : <nav> hors du panneau`);
  assert.match(menu, new RegExp(`<nav aria-label="${SWITCHER_LABEL[lang]}"[^>]*\\sdata-lang-switcher[\\s>]`), `${where} : <nav> du sélecteur`);
  // Story 1.7 : deux sélecteurs (menu, footer), chacun <nav aria-label data-lang-switcher>.
  const switcherNavs = html.match(new RegExp(`<nav aria-label="${SWITCHER_LABEL[lang]}"[^>]*\\sdata-lang-switcher[\\s>]`, 'g')) ?? [];
  assert.equal(switcherNavs.length, 2, `${where} : <nav> de sélecteur`);
  const footer = html.match(/<footer[\s>][\s\S]*?<\/footer>/)?.[0] ?? '';
  // Sélecteurs : 8 liens (4 dans #mobile-menu, puis 4 dans <footer>), chaque série vers la même page,
  // ordre he, en, ru, fr, lang + hreflang, libellé dans sa langue, aria-current="true" sur la seule
  // langue de la page.
  const switcher = [...html.matchAll(/<a\b([^>]*\shreflang="[^"]*"[^>]*)>([^<]*)<\/a>/g)];
  assert.equal(switcher.length, 8, `${where} : liens des sélecteurs`);
  switcher.forEach(([, attrs, label], i) => {
    const l = LANGS[i % 4];
    const scope = i < 4 ? menu : footer;
    assert.match(attrs, new RegExp(`^ href="${PAGE_HREFS[id][l]}"\\s`), `${where} : href ${l}`);
    assert.match(attrs, new RegExp(`\\slang="${l}"\\s`), `${where} : lang ${l}`);
    assert.match(attrs, new RegExp(`\\shreflang="${l}"\\s`), `${where} : hreflang ${l}`);
    assert.equal(label, LANG_NAME[l], `${where} : libellé ${l}`);
    assert.equal(/\saria-current="true"/.test(attrs), l === lang, `${where} : aria-current ${l}`);
    assert.ok(scope.includes(`<a${attrs}>`), `${where} : lien ${l} n° ${i} hors de ${i < 4 ? '#mobile-menu' : '<footer>'}`);
  });
  assert.equal(menu.match(SWITCHER_LINK)?.length, 4, `${where} : liens du sélecteur du menu`);
  assert.equal(footer.match(SWITCHER_LINK)?.length, 4, `${where} : liens du sélecteur du footer`);
  assertFooter(footer, lang, where);
  assert.equal(html.match(/<main[\s>]/g)?.length, 1, `${where} : <main>`);
  assert.match(html, /<main id="content"[\s>]/, `${where} : main#content`);
  assert.equal(html.match(/<footer[\s>]/g)?.length, 1, `${where} : <footer>`);
  // Story 1.6 (FR18, FR31, AD-6) : barre mobile unique, après </footer> ; Appeler puis WhatsApp
  // (salutation seule : aucune page de l'epic n'a de service ni de ville).
  assert.equal(html.match(/\sclass="mobile-bar"/g)?.length, 1, `${where} : barre mobile`);
  const bar = html.slice(html.indexOf(' class="mobile-bar"'));
  assert.ok(html.indexOf(' class="mobile-bar"') > html.indexOf('</footer>'), `${where} : barre pas après </footer>`);
  const actions = [...bar.matchAll(/<a href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g)].slice(0, 2);
  assert.equal(actions[0]?.[1], 'tel:+972509565669', `${where} : lien Appeler`);
  assert.equal(actions[1]?.[1], waHref().replaceAll('&', '&amp;'), `${where} : lien WhatsApp`);
  for (const [[, , attrs, inner], event, label] of [[actions[0], 'call_click', CALL_LABEL[lang]], [actions[1], 'whatsapp_click', WA_LABEL[lang]]]) {
    assert.match(attrs, new RegExp(`\\sdata-track="${event}"`), `${where} : data-track ${event}`);
    assert.match(attrs, /\sdata-placement="mobile_bar"/, `${where} : data-placement ${event}`);
    assert.match(inner, /<svg\b[^>]*\saria-hidden="true"/, `${where} : icône ${event}`);
    assert.equal(inner.replace(/<[^>]*>/g, ''), label, `${where} : libellé ${event}`);
  }
  // AD-14 : îlot du menu embarqué (<script type="module"> inline ou src) qui vise #mobile-menu.
  const modules = [...html.matchAll(/<script type="module"(?:\s+src="([^"]+)")?[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(modules.length > 0, `${where} : aucun <script type="module">`);
  const code = modules.map(([, src, inline]) => (src ? readFileSync(join(out, src), 'utf8') : inline)).join('\n');
  assert.match(code, /mobile-menu/, `${where} : îlot du menu absent`);
  assert.match(actions[0][2], /\sdata-surface="navy"/, `${where} : surface Appeler`);
  assert.match(actions[1][2], /\sdata-surface="accent"/, `${where} : surface WhatsApp`);
  // FR39 : canonique et 5 hreflang (he, en, ru, fr, x-default → he de la même page).
  const hrefs = PAGE_HREFS[id];
  const canon = [...html.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((m) => m[1]);
  assert.deepEqual(canon, [site + hrefs[lang]], `${where} : canonique`);
  const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)">/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(alts, [...LANGS.map((l) => [l, site + hrefs[l]]), ['x-default', site + hrefs.he]], `${where} : hreflang`);
  assert.ok(!/[?]/.test([...canon, ...alts.map((a) => a[1])].join('')), `${where} : paramètre d'URL`);
}

/** Story 1.8 : attributs d'une balise ouvrante `tag` (chaîne). */
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const CHEVRON = '<span aria-hidden="true"[^>]*> ›</span>';

/** Lien « › » : href, data-track/data-placement (ou aucun), libellé puis chevron aria-hidden. */
function assertTextLink(match, href, label, track, placement, where) {
  assert.ok(match, `${where} : lien absent`);
  const [, attrs, inner] = match;
  assert.equal(attr(`<a${attrs}>`, 'href'), href.replaceAll('&', '&amp;'), `${where} : href`);
  assert.equal(attr(`<a${attrs}>`, 'data-track'), track, `${where} : data-track`);
  assert.equal(attr(`<a${attrs}>`, 'data-placement'), placement, `${where} : data-placement`);
  assert.match(inner, new RegExp(`^${label}${CHEVRON}$`), `${where} : libellé et chevron ${inner}`);
}

/** Story 1.8 (FR1, FR21, NFR4, UX-DR13, UX-DR19, D2, D3) : héros photo puis bloc contact de l'accueil. */
function assertHome(html, lang, out) {
  const where = `home (${lang})`;
  const dict = I18N[lang];
  const main = html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  // Héros en tête de <main>, puis le bloc contact ; plus de h1 site.name ni de baseline.
  assert.match(main, /^<section class="hero" aria-labelledby="hero-title" data-surface="photo"[\s>]/, `${where} : héros en tête`);
  const hero = main.match(/^<section class="hero"[\s\S]*?<\/section>/)?.[0] ?? '';
  const band = main.slice(hero.length);
  assert.match(band, /^<section class="band" aria-labelledby="contact-band-title" data-surface="navy"[\s>]/, `${where} : bloc après le héros`);
  assert.ok(band.trimEnd().endsWith('</section>') && band.match(/<section[\s>]/g)?.length === 1, `${where} : rien d'autre dans <main>`);
  // Un seul h1, celui du héros ; sous-titre.
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${where} : <h1>`);
  assert.equal(hero.match(/<h1 id="hero-title"[^>]*>([^<]*)<\/h1>/)?.[1], dict['home.hero.title'], `${where} : h1`);
  assert.equal(hero.match(/<p class="subtitle"[^>]*>([^<]*)<\/p>/)?.[1], dict['home.hero.subtitle'], `${where} : sous-titre`);
  // Liens du héros : Appeler puis WhatsApp, ton photo.
  const heroLinks = [...hero.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(heroLinks.length, 2, `${where} : liens du héros`);
  assertTextLink(heroLinks[0], 'tel:+972509565669', dict['action.call'], 'call_click', 'hero', `${where} : héros Appeler`);
  assertTextLink(heroLinks[1], waHref(), dict['action.whatsapp'], 'whatsapp_click', 'hero', `${where} : héros WhatsApp`);
  for (const [, attrs] of heroLinks) assert.match(attrs, /\sclass="text-link photo"/, `${where} : ton photo`);
  // <picture> : 3 sources 4:5 sous 700px, 2 sources paysage, puis <img> JPEG.
  const pictures = html.match(/<picture>[\s\S]*?<\/picture>/g) ?? [];
  assert.equal(pictures.length, 1, `${where} : <picture>`);
  assert.ok(hero.includes(pictures[0]), `${where} : <picture> hors du héros`);
  const sources = pictures[0].match(/<source\b[^>]*>/g) ?? [];
  assert.equal(sources.length, 5, `${where} : <source>`);
  const widthsOf = (srcset) => (srcset ?? '').split(', ').map((c) => Number(c.split(' ')[1]?.replace('w', '')));
  ['avif', 'webp', 'jpeg'].forEach((format, i) => {
    const tag = sources[i];
    assert.equal(attr(tag, 'media'), '(width < 700px)', `${where} : media ${format}`);
    assert.equal(attr(tag, 'type'), `image/${format}`, `${where} : type portrait ${format}`);
    assert.deepEqual(widthsOf(attr(tag, 'srcset')), [480, 768, 1080, 1440], `${where} : largeurs portrait ${format}`);
    assert.equal(attr(tag, 'sizes'), '100vw', `${where} : sizes portrait ${format}`);
    assert.equal(attr(tag, 'width'), '1440', `${where} : width portrait`);
    assert.equal(attr(tag, 'height'), '1800', `${where} : height portrait`);
  });
  ['avif', 'webp'].forEach((format, i) => {
    const tag = sources[3 + i];
    assert.equal(attr(tag, 'media'), undefined, `${where} : media paysage ${format}`);
    assert.equal(attr(tag, 'type'), `image/${format}`, `${where} : type paysage ${format}`);
    assert.deepEqual(widthsOf(attr(tag, 'srcset')), [480, 768, 1080, 1440, 1920, 2560], `${where} : largeurs paysage ${format}`);
    assert.equal(attr(tag, 'sizes'), '100vw', `${where} : sizes paysage ${format}`);
    assert.equal(attr(tag, 'width'), '2560', `${where} : width paysage`);
    assert.equal(attr(tag, 'height'), '1707', `${where} : height paysage`);
  });
  const img = pictures[0].match(/<img\b[^>]*>/)?.[0] ?? '';
  assert.ok(pictures[0].indexOf(img) > pictures[0].lastIndexOf('<source'), `${where} : <img> après les <source>`);
  assert.equal(attr(img, 'alt'), dict['home.hero.alt'], `${where} : alt`);
  assert.equal(attr(img, 'width'), '2560', `${where} : width img`);
  assert.equal(attr(img, 'height'), '1707', `${where} : height img`);
  assert.equal(attr(img, 'loading'), 'eager', `${where} : loading`);
  assert.equal(attr(img, 'fetchpriority'), 'high', `${where} : fetchpriority`);
  assert.equal(attr(img, 'decoding'), undefined, `${where} : decoding`);
  assert.equal(attr(img, 'sizes'), '100vw', `${where} : sizes img`);
  assert.match(attr(img, 'src') ?? '', /\.jpe?g$/, `${where} : src JPEG`);
  assert.deepEqual(widthsOf(attr(img, 'srcset')), [480, 768, 1080, 1440, 1920, 2560], `${where} : largeurs img`);
  // Aucun autre <img> de photo : le seul autre est le logo du header.
  const imgs = html.match(/<img\b[^>]*>/g) ?? [];
  assert.equal(imgs.length, 2, `${where} : <img>`);
  assert.ok((html.match(/<header[\s>][\s\S]*?<\/header>/)?.[0] ?? '').includes(imgs.find((i) => i !== img) ?? ''), `${where} : <img> hors header`);
  // Poids (NFR4) : paysage 1440w ≤ 250 000 octets, portrait 1080w ≤ 120 000 octets, en AVIF et WebP.
  const fileAt = (tag, width) => (attr(tag, 'srcset') ?? '').split(', ').find((c) => c.endsWith(` ${width}w`))?.split(' ')[0];
  for (const [tag, width, budget] of [[sources[0], 1080, 120_000], [sources[1], 1080, 120_000], [sources[3], 1440, 250_000], [sources[4], 1440, 250_000]]) {
    const file = fileAt(tag, width);
    assert.ok(file, `${where} : ${width}w absent`);
    const size = statSync(join(out, file)).size;
    assert.ok(size <= budget, `${where} : ${file} ${size} > ${budget}`);
  }
  // Bloc contact, dans l'ordre : h2 masqué, note, ligne, zone (texte simple), numéro, Appeler, WhatsApp.
  const h2 = band.match(/<h2 id="contact-band-title" class="visually-hidden"[^>]*>([^<]*)<\/h2>/);
  assert.equal(h2?.[1], dict['contact-band.title'], `${where} : h2 du bloc`);
  const score = band.match(/<p class="score"[^>]*><bdi dir="ltr"[^>]*>([^<]*)<\/bdi><\/p>/);
  assert.equal(score?.[1], lang === 'he' || lang === 'en' ? '9.94' : '9,94', `${where} : note`);
  const line = band.match(/<p class="rating-line"[^>]*>([^<]*)<\/p>/);
  assert.equal(line?.[1], dict['contact-band.midrag'], `${where} : ligne Midrag`);
  const zone = band.match(/<p class="zone"[^>]*>([^<]*)<\/p>/);
  assert.equal(zone?.[1], dict['contact.zone'], `${where} : zone`);
  const links = [...band.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 3, `${where} : liens du bloc`);
  assert.equal(attr(`<a${links[0][1]}>`, 'href'), 'tel:+972509565669', `${where} : numéro`);
  assert.equal(attr(`<a${links[0][1]}>`, 'data-track'), 'call_click', `${where} : numéro data-track`);
  assert.equal(attr(`<a${links[0][1]}>`, 'data-placement'), 'contact_band', `${where} : numéro data-placement`);
  assert.equal(links[0][2], PHONE_BDI, `${where} : numéro du bloc`);
  assertTextLink(links[1], 'tel:+972509565669', dict['action.call'], 'call_click', 'contact_band', `${where} : bloc Appeler`);
  assertTextLink(links[2], waHref(), dict['action.whatsapp'], 'whatsapp_click', 'contact_band', `${where} : bloc WhatsApp`);
  for (const [, attrs] of links.slice(1)) assert.match(attrs, /\sclass="text-link night"/, `${where} : ton nuit`);
  const order = [h2.index, score.index, line.index, zone.index, links[0].index, links[1].index, links[2].index];
  assert.deepEqual(order, [...order].sort((a, b) => a - b), `${where} : ordre du bloc`);
  // Aucun lien contact/areas ni « Laisser ses coordonnées », aucun placeholder dans le bloc.
  assert.ok(!band.includes(dict['contact-band.leave-details']), `${where} : leave-details`);
  assert.ok(!band.includes('data-placeholder'), `${where} : placeholder dans le bloc`);
}

test('build de branche : 4 accueils + 4 path-probe, layout Base (lang/dir, #rs-data, évitement, repères, hreflang relatifs), _redirects', { timeout: 120_000 }, () => {
  const out = build({});
  assert.deepEqual(indexFiles(out), [...HOMES, ...PROBES].sort());
  assert.ok(existsSync(join(out, '_redirects')), '_redirects absent');
  assert.ok(!existsSync(join(out, 'index.html')), 'index.html racine présent');
  assert.deepEqual(Object.keys(titles), LANGS);
  for (const lang of LANGS) {
    const html = readFileSync(join(out, lang, 'index.html'), 'utf8');
    assert.equal(html.match(/<title>(.*?)<\/title>/)?.[1], titles[lang]);
    assertLayout(html, 'home', lang, out);
    assertHome(html, lang, out);
  }
  for (const file of PROBES) {
    assertLayout(readFileSync(join(out, file), 'utf8'), 'path-probe', file.split('/')[0], out);
  }
});

test('build de main indexable avec SITE_URL : seulement les 4 accueils, sans noindex, canonique et hreflang absolus', { timeout: 120_000 }, () => {
  const out = build({ WORKERS_CI_BRANCH: 'main', DOMAIN_LIVE: 'true', SITE_URL: 'https://rs.example' });
  assert.deepEqual(indexFiles(out), [...HOMES].sort());
  assert.ok(!existsSync(join(out, 'index.html')));
  for (const lang of LANGS) {
    assertLayout(readFileSync(join(out, lang, 'index.html'), 'utf8'), 'home', lang, out, 'https://rs.example', true);
  }
});
