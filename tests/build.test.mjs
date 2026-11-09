// Stories 1.3 à 1.9, 2.1 à 2.3 : sortie réelle du build, sur une branche puis sur main (registre, layout Base.astro).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { waHref } from '../src/lib/contact/core.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LANGS = ['he', 'en', 'ru', 'fr'];
const HOMES = LANGS.map((lang) => `${lang}/index.html`);
const PROBES = ['en/path-probe/index.html', 'fr/test-de-chemin/index.html', 'he/בדיקת-נתיב/index.html', 'ru/проверка-пути/index.html'];
// Story 2.1 : page Contact, slugs des décisions de l'epic 2.
const CONTACT_SLUGS = { he: 'צור-קשר', en: 'contact', ru: 'контакты', fr: 'contact' };
const CONTACTS = LANGS.map((lang) => `${lang}/${CONTACT_SLUGS[lang]}/index.html`);
const dirs = [];

// Étapes du script `build` de package.json : `astro build`, puis chaque `node <script>` lancé sur le dossier
// de sortie. build() les rejoue telles quelles, pour que le test et le build réel ne divergent pas.
const BUILD_STEPS = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.build.split(' && ');
const NODE_STEPS = BUILD_STEPS.slice(1).map((step) => {
  const m = step.match(/^node (\S+)$/);
  if (!m) throw new Error(`package.json build : étape inattendue « ${step} »`);
  return m[1];
});

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
  // Post-build et contrôles de package.json (story 1.9), dans son ordre.
  for (const script of NODE_STEPS) {
    execFileSync(process.execPath, [script, out], { cwd: ROOT, env, stdio: 'pipe' });
  }
  return out;
}

test('package.json build : astro build, headers.mjs, not-found.mjs puis noindex.mjs, dans cet ordre', () => {
  assert.deepEqual(BUILD_STEPS, [
    'astro build',
    'node scripts/postbuild/headers.mjs',
    'node scripts/postbuild/not-found.mjs',
    'node scripts/checks/noindex.mjs',
  ]);
});

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
  ['home', 'path-probe', 'contact'].map((id) => [id, { title: metaField(id, 'title'), description: metaField(id, 'description') }]),
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
  contact: Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/${encodeURIComponent(CONTACT_SLUGS[lang])}/`])),
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

/** Story 1.7 (FR19, UX-DR33, D1), story 2.1 : footer avec `contact` seul actif (colonne RS SYSTEM = Contact). */
function assertFooter(footer, lang, where) {
  const dict = I18N[lang];
  const contact = dict['footer.col.contact'];
  const company = dict['footer.col.company'];
  // Trois <nav> : la colonne RS SYSTEM (seul lien : Contact), la colonne Contact, puis le sélecteur ; aucun <nav> légal.
  const navs = footer.match(/<nav\b[^>]*>/g) ?? [];
  assert.equal(navs.length, 3, `${where} : <nav> du footer ${navs}`);
  assert.match(navs[0], new RegExp(`^<nav aria-label="${company}"[\\s>]`), `${where} : <nav> RS SYSTEM`);
  assert.match(navs[1], new RegExp(`^<nav aria-label="${contact}"[\\s>]`), `${where} : <nav> Contact`);
  assert.ok(!navs.some((n) => n.includes(`aria-label="${dict['footer.legal-label']}"`)), `${where} : <nav> légal`);
  const companyCol = footer.slice(footer.indexOf(navs[0]), footer.indexOf('</nav>'));
  assert.equal(companyCol.match(/<h2\b[^>]*>([^<]*)<\/h2>/)?.[1], company, `${where} : <h2> RS SYSTEM`);
  const companyLinks = [...companyCol.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(companyLinks, [[PAGE_HREFS.contact[lang], dict['nav.contact']]], `${where} : liens RS SYSTEM`);
  const col = footer.slice(footer.indexOf(navs[1]), footer.indexOf('</nav>', footer.indexOf(navs[1])));
  assert.equal(col.match(/<h2\b[^>]*>([^<]*)<\/h2>/)?.[1], contact, `${where} : <h2> Contact`);
  assert.equal(footer.match(/<h2[\s>]/g)?.length, 2, `${where} : <h2> du footer`);
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
  // Ordre de lecture : colonnes, puis ligne basse, puis sélecteur.
  assert.ok(footer.indexOf(navs[1]) < footer.indexOf('<p') && footer.indexOf('<p') < footer.indexOf(navs[2]), `${where} : ordre du footer`);
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
  // Story 2.1 : seul autre dir= de la page Contact, dir="ltr" sur le champ téléphone.
  const withoutIsolates = html.replaceAll(PHONE_BDI, '').replace(BASELINE_BDI, '').replace(RATING_BDI, '');
  const phoneField = id === 'contact' ? /<input id="contact-phone"[^>]*>/ : /$^/;
  assert.equal(withoutIsolates.replace(phoneField, '').match(/\sdir=/g)?.length, 1, `${where} : dir= en double`);
  assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}" data-page-id="${id}"[\\s>]`), where);
  // AD-13 : un seul #rs-data, qui vaut { context } ; story 2.3 (AD-5) : sur Contact, { context, services, cities },
  // `services` = les 7 codes dans l'ordre (libellé dans la langue + hébreu), `cities` vide avant l'epic 4.
  assert.equal(html.match(/\sid="rs-data"/g)?.length, 1, `${where} : #rs-data absent ou en double`);
  const json = html.match(/<script type="application\/json" id="rs-data">([\s\S]*?)<\/script>/)?.[1];
  if (id === 'contact') {
    const data = JSON.parse(json);
    assert.deepEqual(Object.keys(data), ['context', 'services', 'cities'], `${where} : clés de #rs-data`);
    assert.deepEqual(data.context, { id, lang, navSection: 'contact', indexable }, `${where} : context`);
    assert.deepEqual(Object.keys(data.services), SERVICE_ORDER, `${where} : codes de services`);
    for (const code of SERVICE_ORDER) {
      assert.deepEqual(data.services[code], { label: serviceLabel(code, lang), he: serviceLabel(code, 'he') }, `${where} : service ${code}`);
    }
    assert.deepEqual(data.cities, {}, `${where} : cities`);
  } else {
    assert.deepEqual(JSON.parse(json), { context: { id, lang, indexable } }, where);
  }
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
  // Panneau #mobile-menu après la barre. Story 2.1 : `contact` seul id de nav actif, donc trois <nav> dans
  // le header : liens de la barre (avant le panneau), puis dans le panneau les mêmes liens et le sélecteur.
  assert.equal(header.match(/\sid="mobile-menu"/g)?.length, 1, `${where} : #mobile-menu`);
  const menu = header.slice(header.indexOf(' id="mobile-menu"'));
  assert.ok(header.indexOf(' id="mobile-menu"') > header.indexOf('<button'), `${where} : panneau pas après le bouton`);
  assert.equal(header.match(/<nav[\s>]/g)?.length, 3, `${where} : <nav> du header`);
  assert.equal(menu.match(/<nav[\s>]/g)?.length, 2, `${where} : <nav> du panneau`);
  const navLabel = I18N[lang]['nav.main-label'];
  const mainNavs = [...header.matchAll(new RegExp(`<nav aria-label="${navLabel}"[^>]*>([\\s\\S]*?)</nav>`, 'g'))];
  assert.equal(mainNavs.length, 2, `${where} : <nav> principaux`);
  for (const [, inner] of mainNavs) {
    const links = [...inner.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)];
    assert.equal(links.length, 1, `${where} : liens du <nav> principal`);
    assert.equal(attr(`<a${links[0][1]}>`, 'href'), PAGE_HREFS.contact[lang], `${where} : href Contact du header`);
    assert.equal(links[0][2], I18N[lang]['nav.contact'], `${where} : libellé Contact du header`);
    assert.equal(attr(`<a${links[0][1]}>`, 'aria-current'), id === 'contact' ? 'page' : undefined, `${where} : aria-current Contact`);
  }
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
  assertIcons(html, where);
}

/** Story 1.9 (FR39) : les 3 liens d'icônes dans le <head>. */
const ICONS = [
  '<link rel="icon" type="image/png" sizes="32x32" href="/rs-icon-32.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/rs-icon-180.png">',
  '<link rel="manifest" href="/manifest.webmanifest">',
];
function assertIcons(html, where) {
  const head = html.slice(0, html.indexOf('</head>'));
  for (const icon of ICONS) assert.equal(head.split(icon).length - 1, 1, `${where} : ${icon}`);
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
  assert.equal(links.length, 4, `${where} : liens du bloc`);
  assert.equal(attr(`<a${links[0][1]}>`, 'href'), 'tel:+972509565669', `${where} : numéro`);
  assert.equal(attr(`<a${links[0][1]}>`, 'data-track'), 'call_click', `${where} : numéro data-track`);
  assert.equal(attr(`<a${links[0][1]}>`, 'data-placement'), 'contact_band', `${where} : numéro data-placement`);
  assert.equal(links[0][2], PHONE_BDI, `${where} : numéro du bloc`);
  assertTextLink(links[1], 'tel:+972509565669', dict['action.call'], 'call_click', 'contact_band', `${where} : bloc Appeler`);
  assertTextLink(links[2], waHref(), dict['action.whatsapp'], 'whatsapp_click', 'contact_band', `${where} : bloc WhatsApp`);
  // Story 2.1 (FR21, FR29) : 3e action « Laisser ses coordonnées » vers Contact, sans paramètre (accueil sans service).
  assertTextLink(links[3], PAGE_HREFS.contact[lang], escaped(dict['contact-band.leave-details']), undefined, undefined, `${where} : bloc leave-details`);
  assert.ok(!attr(`<a${links[3][1]}>`, 'href').includes('?'), `${where} : leave-details sans paramètre`);
  for (const [, attrs] of links.slice(1)) assert.match(attrs, /\sclass="text-link night"/, `${where} : ton nuit`);
  const order = [h2.index, score.index, line.index, zone.index, links[0].index, links[1].index, links[2].index, links[3].index];
  assert.deepEqual(order, [...order].sort((a, b) => a - b), `${where} : ordre du bloc`);
  // Aucun lien Zones (areas inactif), aucun placeholder dans le bloc.
  assert.ok(!band.includes('data-placeholder'), `${where} : placeholder dans le bloc`);
}

/** Texte HTML échappé par Astro (apostrophe, esperluette). */
const escaped = (text) => text.replaceAll('&', '&amp;').replaceAll("'", '&#39;');
const NOT_FOUND_FILES = ['404.html', ...LANGS.map((lang) => `${lang}/404.html`)];

/** Story 1.9 (FR15, UX-DR15, AD-3, AD-10, AD-13) : une page 404 en `lang`. */
function assertNotFound(html, lang, where) {
  const dict = I18N[lang];
  assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}" data-page-id="not-found"[\\s>]`), `${where} : <html>`);
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes('<meta name="robots" content="noindex">'), `${where} : noindex`);
  assert.equal(head.match(/<title>(.*?)<\/title>/)?.[1], escaped(dict['not-found.meta-title']), `${where} : <title>`);
  assert.ok(!head.includes('name="description"'), `${where} : description`);
  assert.ok(!head.includes('rel="canonical"'), `${where} : canonique`);
  assert.ok(!head.includes('hreflang'), `${where} : hreflang`);
  assert.ok(!/http-equiv="refresh"/i.test(html), `${where} : meta refresh`);
  assertIcons(html, where);
  // Un seul h1, le titre de la 404.
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${where} : <h1>`);
  assert.equal(html.match(/<h1 id="page-title"[^>]*>([^<]*)<\/h1>/)?.[1], escaped(dict['not-found.title']), `${where} : h1`);
  // Héros typographique : arcs décoratifs.
  const main = html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  assert.match(main, /^<section class="hero-typo" aria-labelledby="page-title" data-surface="navy"[\s>]/, `${where} : héros typographique`);
  const svgs = main.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/g) ?? [];
  assert.equal(svgs.length, 1, `${where} : <svg>`);
  assert.match(svgs[0], /^<svg aria-hidden="true"/, `${where} : svg aria-hidden`);
  assert.equal(svgs[0].match(/<path\b[^>]*\spathLength="1"/g)?.length, 3, `${where} : 3 arcs`);
  // Numéro, Appeler, WhatsApp (404), puis Accueil et Contact (story 2.1) ; areas inactif.
  const links = [...main.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 5, `${where} : liens de la 404`);
  assert.equal(attr(`<a${links[0][1]}>`, 'href'), 'tel:+972509565669', `${where} : numéro`);
  assert.equal(attr(`<a${links[0][1]}>`, 'data-track'), 'call_click', `${where} : numéro data-track`);
  assert.equal(attr(`<a${links[0][1]}>`, 'data-placement'), '404', `${where} : numéro data-placement`);
  assert.equal(links[0][2], PHONE_BDI, `${where} : numéro`);
  assertTextLink(links[1], 'tel:+972509565669', dict['action.call'], 'call_click', '404', `${where} : Appeler`);
  assertTextLink(links[2], waHref(), dict['action.whatsapp'], 'whatsapp_click', '404', `${where} : WhatsApp`);
  assertTextLink(links[3], `/${lang}/`, escaped(dict['not-found.home']), undefined, undefined, `${where} : Accueil`);
  assertTextLink(links[4], PAGE_HREFS.contact[lang], escaped(dict['nav.contact']), undefined, undefined, `${where} : Contact`);
  for (const [, attrs] of links.slice(1)) assert.match(attrs, /\sclass="text-link night"/, `${where} : ton nuit`);
  // Aucun lien de header actif, pas de bloc contact.
  assert.ok(!html.includes('aria-current="page"'), `${where} : aria-current="page"`);
  assert.ok(!html.includes('class="band"'), `${where} : bloc contact`);
  // Sélecteurs : 8 liens vers les accueils, aria-current="true" sur la langue de la page.
  const switcher = [...html.matchAll(/<a\b([^>]*\shreflang="[^"]*"[^>]*)>([^<]*)<\/a>/g)];
  assert.equal(switcher.length, 8, `${where} : liens des sélecteurs`);
  switcher.forEach(([, attrs], i) => {
    const l = LANGS[i % 4];
    assert.match(attrs, new RegExp(`^ href="/${l}/"\\s`), `${where} : sélecteur ${l}`);
    assert.equal(/\saria-current="true"/.test(attrs), l === lang, `${where} : aria-current ${l}`);
  });
  const footer = html.match(/<footer[\s>][\s\S]*?<\/footer>/)?.[0] ?? '';
  assertFooter(footer, lang, where);
  const json = html.match(/<script type="application\/json" id="rs-data">([\s\S]*?)<\/script>/)?.[1];
  assert.deepEqual(JSON.parse(json), { context: { id: 'not-found', lang, indexable: false } }, `${where} : #rs-data`);
}

/** Story 1.9 : les 5 pages 404 (racine en hébreu), plus de dossier {lang}/404/. */
function assertNotFoundPages(out) {
  for (const file of NOT_FOUND_FILES) {
    assert.ok(existsSync(join(out, file)), `${file} absent`);
    const lang = file === '404.html' ? 'he' : file.split('/')[0];
    assertNotFound(readFileSync(join(out, file), 'utf8'), lang, file);
  }
  for (const lang of LANGS) assert.ok(!existsSync(join(out, lang, '404')), `${lang}/404/ présent`);
}

/** Story 2.1 (FR13, FR28, FR33, UX-DR28, D1 à D4) : page Contact en `lang`. */
const FIELDS = [
  { tag: 'input', id: 'contact-name', label: 'form.name.label', attrs: { type: 'text', autocomplete: 'name', required: '', 'aria-required': 'true' }, optional: false },
  { tag: 'input', id: 'contact-phone', label: 'form.phone.label', attrs: { type: 'tel', dir: 'ltr', autocomplete: 'tel', required: '', 'aria-required': 'true' }, optional: false },
  { tag: 'input', id: 'contact-city', label: 'form.city.label', attrs: { type: 'text', autocomplete: 'address-level2' }, optional: true },
  { tag: 'select', id: 'contact-service', label: 'form.service.label', attrs: {}, optional: true },
  { tag: 'textarea', id: 'contact-message', label: 'form.message.label', attrs: { rows: '4', maxlength: '1000', enterkeyhint: 'send' }, optional: true },
];
const SERVICE_ORDER = ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom', 'crane-cameras', 'unsure'];
const SERVICES = parse(readFileSync(join(ROOT, 'src/content/services.yaml'), 'utf8'));
/** Libellé du service `code` en `lang`, lu dans src/content/services.yaml. */
const serviceLabel = (code, lang) => SERVICES.find((entry) => entry.id === code)?.label[lang];
/** Attribut booléen ou valué présent dans une balise ouvrante (`required` rendu sans valeur). */
const hasAttr = (tag, name, value) => (value === '' ? new RegExp(`\\s${name}(?:="")?[\\s>]`).test(tag) : attr(tag, name) === value);

/** Story 2.1 (FR33, NFR9) : sans JS, le CSS de la page masque le bloc formulaire (`@media (scripting: none)`). */
function assertFormHiddenWithoutJs(html, out, where) {
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(([, href]) => readFileSync(join(out, href), 'utf8'));
  css.push(...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]));
  assert.match(css.join('\n'), /@media \(scripting: ?none\)\s*\{\s*\.form-block(?:\[data-astro-cid-[\w-]+\])?\s*\{\s*display: ?none;?\s*\}/, `${where} : bloc formulaire non masqué sans JS`);
}

/** Story 2.2 : icône d'alerte `aria-hidden` (cercle + « ! »). */
const ALERT_ICON = /^<svg class="[\w-]+-icon"[^>]*\saria-hidden="true"[^>]*><circle\b[^>]*><\/circle><path\b[^>]*><\/path><\/svg>/;

/** Story 2.4 : bloc de confirmation, juste après le h2 (contenu sans <div> imbriqué au-delà de status-body). */
const SENT_BLOCK = /^<div id="contact-sent"[^>]*>[\s\S]*?<\/div><\/div>/;
/** Story 2.4 : icône coche `aria-hidden` (un seul tracé). */
const CHECK_ICON = /^<svg class="status-icon"[^>]*\saria-hidden="true"[^>]*><path\b[^>]*><\/path><\/svg>/;
/** Chiffre de délai dans un texte (« 24 h », « 2 heures »…) : interdit dans les textes des états. */
const DELAY_DIGIT = /\d/;

/** Story 2.4 (FR33, UX-DR29, AD-5, AD-6) : états d'envoi, de retour et hors ligne, rendus au build et cachés. */
function assertContactStates(block, form, dict, wa, tel, where) {
  // Confirmation : cachée, juste après le h2 et avant #contact-errors.
  const afterTitle = block.slice(block.indexOf('</h2>') + '</h2>'.length);
  const sent = afterTitle.match(SENT_BLOCK)?.[0] ?? '';
  assert.ok(sent, `${where} : #contact-sent juste après le h2`);
  assert.match(afterTitle.slice(sent.length), /^<div id="contact-errors"/, `${where} : #contact-sent avant #contact-errors`);
  const sentTag = sent.match(/^<div\b[^>]*>/)[0];
  assert.equal(attr(sentTag, 'class'), 'form-status sent', `${where} : classes de #contact-sent`);
  assert.ok(hasAttr(sentTag, 'hidden', ''), `${where} : #contact-sent caché`);
  const sentBody = sent.slice(sentTag.length);
  assert.match(sentBody, CHECK_ICON, `${where} : icône coche`);
  const h3 = sentBody.match(/<h3\b([^>]*)>([^<]*)<\/h3>/);
  assert.equal(attr(`<h3${h3?.[1]}>`, 'id'), 'contact-sent-title', `${where} : id du titre`);
  assert.equal(attr(`<h3${h3?.[1]}>`, 'tabindex'), '-1', `${where} : tabindex du titre`);
  assert.equal(h3?.[2], escaped(dict['form.sent.title']), `${where} : titre de la confirmation`);
  const paras = [...sentBody.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  assert.equal(paras.length, 3, `${where} : paragraphes de la confirmation`);
  assert.equal(paras[0], escaped(dict['form.sent.text']), `${where} : texte de la confirmation`);
  const retry = paras[1].match(new RegExp(`^${escaped(dict['form.sent.retry-question']).replace(/[?]/g, '\\$&')} <a\\b([^>]*)>([\\s\\S]*?)</a>$`));
  assert.ok(retry, `${where} : question puis lien Réessayer ${paras[1]}`);
  assert.equal(attr(`<a${retry[1]}>`, 'id'), 'contact-sent-retry', `${where} : id de Réessayer`);
  assertTextLink(retry, wa, escaped(dict['form.sent.retry']), undefined, undefined, `${where} : Réessayer`);
  const call = paras[2].match(/^<a\b([^>]*)>([\s\S]*?)<\/a>$/);
  assertTextLink(call, tel, `${escaped(dict['form.sent.call'])} ${PHONE_BDI}`, 'call_click', 'contact_page', `${where} : appel de la confirmation`);
  // Hors ligne : région role="alert" vide juste avant le <template>, lui-même juste avant le bouton.
  const offline = form.match(/<div id="contact-offline"([^>]*)><\/div><template id="contact-offline-template"[^>]*>([\s\S]*?)<\/template><button\b/);
  assert.ok(offline, `${where} : #contact-offline vide puis <template> juste avant le bouton`);
  assert.equal(attr(`<div${offline[1]}>`, 'role'), 'alert', `${where} : role de #contact-offline`);
  assert.ok(!hasAttr(`<div${offline[1]}>`, 'hidden', ''), `${where} : #contact-offline jamais caché`);
  assert.match(offline[2], /^<div class="form-status"[^>]*>/, `${where} : bloc hors ligne form-status`);
  const offlineBody = offline[2].replace(/^<div class="form-status"[^>]*>/, '');
  assert.match(offlineBody, ALERT_ICON, `${where} : icône du bloc hors ligne`);
  assert.equal(offlineBody.match(/<h3 class="status-title"[^>]*>([^<]*)<\/h3>/)?.[1], escaped(dict['form.offline.title']), `${where} : titre hors ligne`);
  const offlineCall = offlineBody.match(/<p\b[^>]*><a\b([^>]*)>([\s\S]*?)<\/a><\/p>/);
  assertTextLink(offlineCall, tel, `${escaped(dict['form.offline.call'])} ${PHONE_BDI}`, 'call_click', 'contact_page', `${where} : appel hors ligne`);
  // Bouton : libellé d'origine (icône + form.submit) puis libellé d'envoi caché (form.sending + trois points).
  const button = form.match(/<button\b[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? '';
  const idle = button.match(/^<span class="submit-idle"[^>]*>(<svg\b[^>]*\saria-hidden="true"[^>]*>[\s\S]*?<\/svg>)<span\b[^>]*>([^<]*)<\/span><\/span>/);
  assert.ok(idle, `${where} : .submit-idle (icône puis libellé)`);
  assert.equal(idle[2], dict['form.submit'], `${where} : libellé du bouton`);
  const sending = button.slice(idle[0].length).match(/^<span class="submit-sending"([^>]*)><span\b[^>]*>([^<]*)<\/span>(<svg\b[^>]*>[\s\S]*?<\/svg>)<\/span>$/);
  assert.ok(sending, `${where} : .submit-sending après .submit-idle`);
  assert.ok(hasAttr(`<span${sending[1]}>`, 'hidden', ''), `${where} : .submit-sending caché`);
  assert.equal(sending[2], dict['form.sending'], `${where} : libellé d'envoi`);
  assert.match(sending[3], /\saria-hidden="true"/, `${where} : points aria-hidden`);
  assert.equal(sending[3].match(/<circle\b/g)?.length, 3, `${where} : trois points`);
  assert.ok(!/<animate|animation/.test(sending[3]), `${where} : points animés`);
  // Région status vide juste après le bouton.
  assert.match(form, /<\/button><p id="contact-sending" class="visually-hidden" role="status"[^>]*><\/p>/, `${where} : #contact-sending vide après le bouton`);
  // Aucun délai promis : aucun chiffre dans les textes des états.
  for (const key of ['form.sending', 'form.sent.title', 'form.sent.text', 'form.sent.retry-question', 'form.sent.retry', 'form.sent.call', 'form.offline.title', 'form.offline.call']) {
    assert.ok(dict[key], `${where} : clé ${key}`);
    assert.ok(!DELAY_DIGIT.test(dict[key]), `${where} : chiffre dans ${key}`);
  }
}

/** Story 2.2 (FR33, UX-DR29) : résumé d'erreurs, messages sous Nom et Téléphone, îlot du formulaire. */
function assertContactErrors(html, block, form, dict, out, where) {
  // #contact-errors (role="alert", vide) puis <template>, entre le bloc de confirmation (story 2.4) et le <form>.
  const afterTitle = block.slice(block.indexOf('</h2>') + '</h2>'.length).replace(SENT_BLOCK, '');
  assert.match(afterTitle, /^<div id="contact-errors" role="alert"(?: data-astro-cid-[\w-]+)?><\/div><template id="contact-errors-template"[^>]*>/, `${where} : #contact-errors puis <template> après le h2`);
  const template = afterTitle.match(/<template id="contact-errors-template"[^>]*>([\s\S]*?)<\/template><form\b/)?.[1] ?? '';
  assert.ok(template, `${where} : <template> juste avant le <form>`);
  assert.match(template, /^<div class="form-status"[^>]*>/, `${where} : bloc form-status`);
  const status = template.replace(/^<div class="form-status"[^>]*>/, '');
  assert.match(status, ALERT_ICON, `${where} : icône 24px du résumé`);
  assert.equal(status.match(/<h3 class="status-title"[^>]*>([^<]*)<\/h3>/)?.[1], escaped(dict['form.errors.title']), `${where} : h3 du résumé`);
  const items = [...status.matchAll(/<li data-field="(\w+)"[^>]*><a href="([^"]*)"[^>]*>([^<]*)<\/a><\/li>/g)].map((m) => m.slice(1));
  assert.deepEqual(items, [['name', '#contact-name', escaped(dict['form.name.error'])], ['phone', '#contact-phone', escaped(dict['form.phone.error'])]], `${where} : liens du résumé`);
  // Messages cachés juste après leur champ, icône aria-hidden puis texte traduit.
  for (const [id, key] of [['contact-name', 'form.name.error'], ['contact-phone', 'form.phone.error']]) {
    const m = form.match(new RegExp(`<input id="${id}"[^>]*>(<p\\b[^>]*>)([\\s\\S]*?)</p></div>`));
    assert.ok(m, `${where} : message juste après #${id}`);
    assert.equal(attr(m[1], 'id'), `${id}-error`, `${where} : id du message de ${id}`);
    assert.equal(attr(m[1], 'class'), 'error', `${where} : classe du message de ${id}`);
    assert.ok(hasAttr(m[1], 'hidden', ''), `${where} : message de ${id} caché`);
    assert.match(m[2], ALERT_ICON, `${where} : icône du message de ${id}`);
    assert.equal(m[2].replace(ALERT_ICON, '').match(/^<span\b[^>]*>([^<]*)<\/span>$/)?.[1], escaped(dict[key]), `${where} : texte du message de ${id}`);
  }
  assert.equal(form.match(/class="error"/g)?.length, 2, `${where} : messages d'erreur (champs facultatifs sans message)`);
  assert.ok(!/\saria-(?:invalid|describedby)=/.test(html), `${where} : aria-invalid / aria-describedby au build`);
  // Îlot du formulaire embarqué (<script type="module"> inline ou src) qui vise #contact-errors.
  const modules = [...html.matchAll(/<script type="module"(?:\s+src="([^"]+)")?[^>]*>([\s\S]*?)<\/script>/g)];
  const code = modules.map(([, src, inline]) => (src ? readFileSync(join(out, src), 'utf8') : inline)).join('\n');
  assert.match(code, /contact-errors/, `${where} : îlot du formulaire absent`);
  // La région role="alert" n'est jamais masquée (sinon le contenu inséré n'est pas annoncé de façon fiable).
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(([, href]) => readFileSync(join(out, href), 'utf8'));
  css.push(...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]));
  for (const [, selector, body] of css.join('\n').matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (selector.includes('#contact-errors')) assert.ok(!/display:\s*none/.test(body), `${where} : #contact-errors masqué par « ${selector.trim()} »`);
  }
}

function assertContact(html, lang, out) {
  const where = `contact (${lang})`;
  const dict = I18N[lang];
  const tel = 'tel:+972509565669';
  const main = html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  // Ordre de <main> : héros, puis section formulaire ; aucun bloc contact.
  assert.match(main, /^<section class="hero" aria-labelledby="contact-title"[\s>]/, `${where} : héros en tête`);
  const hero = main.match(/^<section class="hero"[\s\S]*?<\/section>/)?.[0] ?? '';
  const rest = main.slice(hero.length);
  assert.match(rest, /^<section class="form-section"[\s>]/, `${where} : section formulaire après le héros`);
  assert.equal(main.match(/<section[\s>]/g)?.length, 2, `${where} : sections de <main>`);
  assert.ok(!html.includes('class="band"'), `${where} : bloc contact`);
  // Héros : h1, numéro géant, Appeler › WhatsApp › (ton clair, contact_page).
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${where} : <h1>`);
  assert.equal(hero.match(/<h1 id="contact-title"[^>]*>([^<]*)<\/h1>/)?.[1], escaped(dict['contact.title']), `${where} : h1`);
  const heroLinks = [...hero.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(heroLinks.length, 3, `${where} : liens du héros`);
  assert.equal(attr(`<a${heroLinks[0][1]}>`, 'href'), tel, `${where} : numéro`);
  assert.equal(attr(`<a${heroLinks[0][1]}>`, 'class'), 'phone', `${where} : classe du numéro`);
  assert.equal(attr(`<a${heroLinks[0][1]}>`, 'data-track'), 'call_click', `${where} : numéro data-track`);
  assert.equal(attr(`<a${heroLinks[0][1]}>`, 'data-placement'), 'contact_page', `${where} : numéro data-placement`);
  assert.equal(heroLinks[0][2], PHONE_BDI, `${where} : numéro en <bdi>`);
  assertTextLink(heroLinks[1], tel, dict['action.call'], 'call_click', 'contact_page', `${where} : héros Appeler`);
  assertTextLink(heroLinks[2], waHref(), dict['action.whatsapp'], 'whatsapp_click', 'contact_page', `${where} : héros WhatsApp`);
  for (const [, attrs] of heroLinks.slice(1)) assert.match(attrs, /\sclass="text-link light"/, `${where} : ton clair`);
  // Bloc formulaire : h2 (D1) puis <form> sans action.
  const block = rest.match(/<div class="form-block"[^>]*>([\s\S]*?<\/form>)<\/div>/)?.[1] ?? '';
  assert.ok(block, `${where} : bloc formulaire`);
  assert.equal(block.match(/^<h2 class="form-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(dict['form.title']), `${where} : h2`);
  const formTag = block.match(/<form\b[^>]*>/)?.[0] ?? '';
  assert.ok(formTag && attr(formTag, 'action') === undefined, `${where} : <form> sans action ${formTag}`);
  assert.equal(attr(formTag, 'id'), 'contact-form', `${where} : id du <form>`);
  assert.equal(attr(formTag, 'name'), undefined, `${where} : <form> sans name`);
  const form = block.slice(block.indexOf(formTag));
  assertContactErrors(html, block, form, dict, out, where);
  assertContactStates(block, form, dict, waHref(), tel, where);
  // 5 champs dans l'ordre, label for au-dessus, attributs de FR28, aucun name/value/placeholder.
  const controls = [...form.matchAll(/<(input|select|textarea)\b[^>]*>/g)];
  assert.deepEqual(controls.map((m) => attr(m[0], 'id')), FIELDS.map((f) => f.id), `${where} : ordre des champs`);
  for (const [i, field] of FIELDS.entries()) {
    const tag = controls[i][0];
    assert.equal(controls[i][1], field.tag, `${where} : ${field.id} balise`);
    for (const [name, value] of Object.entries(field.attrs)) assert.ok(hasAttr(tag, name, value), `${where} : ${field.id} ${name} dans ${tag}`);
    if (!field.optional) assert.ok(!/\sdir=/.test(tag) || field.id === 'contact-phone', `${where} : ${field.id} dir`);
    if (field.optional) assert.ok(!/\srequired[\s=>]/.test(tag) && !/\saria-required=/.test(tag), `${where} : ${field.id} facultatif`);
    for (const forbidden of ['name', 'value', 'placeholder']) assert.equal(attr(tag, forbidden), undefined, `${where} : ${field.id} ${forbidden}`);
    const label = form.match(new RegExp(`<label for="${field.id}"[^>]*>([\\s\\S]*?)</label>`));
    assert.ok(label, `${where} : <label for="${field.id}">`);
    assert.ok(label.index < controls[i].index, `${where} : label de ${field.id} pas au-dessus`);
    const optional = `<span class="optional"[^>]*>${escaped(dict['form.optional']).replace(/[()]/g, '\\$&')}</span>`;
    const text = escaped(dict[field.label]).replace(/[?()]/g, '\\$&');
    assert.match(label[1], new RegExp(`^${text}${field.optional ? ` ${optional}` : ''}$`), `${where} : label de ${field.id} ${label[1]}`);
  }
  assert.equal(form.split(`>${dict['form.optional']}</span>`).length - 1, 3, `${where} : « ${dict['form.optional']} » × 3`);
  assert.ok(!/\s(?:value|placeholder|name)=/.test(form.replace(/<option\b[^>]*>/g, '')), `${where} : value/placeholder/name dans le formulaire`);
  // Les 7 options dans l'ordre des codes, `unsure` sélectionné, libellés de services.yaml.
  const select = form.match(/<select\b[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? '';
  const options = [...select.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)];
  assert.deepEqual(options.map(([, a]) => attr(`<option${a}>`, 'value')), SERVICE_ORDER, `${where} : options`);
  assert.deepEqual(options.map(([, , label]) => label), SERVICE_ORDER.map((code) => escaped(serviceLabel(code, lang))), `${where} : libellés des options`);
  options.forEach(([, a], i) => assert.equal(/\sselected[\s=>]|\sselected$/.test(a), SERVICE_ORDER[i] === 'unsure', `${where} : selected ${SERVICE_ORDER[i]}`));
  // Bouton : submit, surface accent, icône aria-hidden puis libellé (D2) ; note dessous, sans lien (privacy inactif).
  const button = form.match(/<button\b([^>]*)>([\s\S]*?)<\/button>/);
  assert.ok(button, `${where} : bouton`);
  assert.equal(attr(`<button${button[1]}>`, 'type'), 'submit', `${where} : type du bouton`);
  assert.equal(attr(`<button${button[1]}>`, 'data-surface'), 'accent', `${where} : surface du bouton`);
  // Icône et libellé (D2) dans .submit-idle : vérifiés par assertContactStates (story 2.4).
  assert.ok(!/\sdisabled[\s=>]/.test(`<button${button[1]}>`), `${where} : bouton disabled`);
  assert.ok(form.indexOf('<button') > controls.at(-1).index, `${where} : bouton après les champs`);
  const note = form.slice(form.indexOf('</button>')).match(/<p class="note"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.equal(note, escaped(dict['form.note']), `${where} : note`);
  // <noscript> juste après le bloc formulaire : Appeler › WhatsApp ›.
  const afterBlock = rest.slice(rest.indexOf('</form></div>') + '</form></div>'.length);
  assert.match(afterBlock, /^<noscript>/, `${where} : <noscript> après le bloc formulaire`);
  const noscript = afterBlock.match(/^<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? '';
  const noscriptLinks = [...noscript.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(noscriptLinks.length, 2, `${where} : liens du <noscript>`);
  assertTextLink(noscriptLinks[0], tel, dict['action.call'], 'call_click', 'contact_page', `${where} : noscript Appeler`);
  assertTextLink(noscriptLinks[1], waHref(), dict['action.whatsapp'], 'whatsapp_click', 'contact_page', `${where} : noscript WhatsApp`);
  // Colonne d'infos : 5 paires dt/dd, dans l'ordre.
  const dl = afterBlock.match(/<dl class="info"[^>]*>([\s\S]*?)<\/dl>/)?.[1] ?? '';
  const pairs = [...dl.matchAll(/<dt\b[^>]*>([^<]*)<\/dt><dd\b[^>]*>([\s\S]*?)<\/dd>/g)];
  assert.deepEqual(pairs.map(([, dt]) => dt), ['phone', 'whatsapp', 'email', 'zone', 'hours'].map((k) => escaped(dict[`contact.info.${k}`])), `${where} : libellés des infos`);
  const [phone, wa, email, zone, hours] = pairs.map(([, , dd]) => dd);
  const phoneLink = phone.match(/^<a\b([^>]*)>([\s\S]*?)<\/a>$/);
  assert.equal(attr(`<a${phoneLink?.[1]}>`, 'href'), tel, `${where} : info téléphone`);
  assert.equal(attr(`<a${phoneLink?.[1]}>`, 'data-track'), 'call_click', `${where} : info téléphone data-track`);
  assert.equal(attr(`<a${phoneLink?.[1]}>`, 'data-placement'), 'contact_page', `${where} : info téléphone data-placement`);
  assert.equal(phoneLink?.[2], PHONE_BDI, `${where} : info téléphone en <bdi>`);
  assertTextLink(wa.match(/^<a\b([^>]*)>([\s\S]*?)<\/a>$/), waHref(), escaped(dict['contact.info.whatsapp-link']), 'whatsapp_click', 'contact_page', `${where} : info WhatsApp`);
  assert.match(email, new RegExp(`^<span data-placeholder(?:="")?>\\[${escaped(dict['placeholder.email'])}\\]</span>$`), `${where} : placeholder e-mail`);
  assert.equal(zone, escaped(dict['contact.zone']), `${where} : zone`);
  assert.match(hours, new RegExp(`^<span data-placeholder(?:="")?>\\[${escaped(dict['placeholder.hours'])}\\]</span>$`), `${where} : placeholder horaires`);
  assert.equal(dl.match(/data-placeholder/g)?.length, 2, `${where} : placeholders de la colonne`);
  assert.ok(!html.includes('mailto:'), `${where} : mailto:`);
  // Tables services / cities de #rs-data vérifiées par assertLayout (story 2.3) ; aucun data-umami-*.
  assert.ok(!html.includes('data-umami'), `${where} : data-umami-*`);
}

/** Story 1.9 (FR39), story 2.1 : sitemap (4 <url> de Contact puis 4 de l'accueil, 5 xhtml:link chacun), robots.txt, icônes et manifeste. */
function assertSeoFiles(out, site, indexable) {
  const xml = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  assert.equal(blocks.length, 8, 'sitemap : <url>');
  blocks.forEach((block, i) => {
    const hrefs = PAGE_HREFS[i < 4 ? 'contact' : 'home'];
    const lang = LANGS[i % 4];
    assert.equal(block.match(/<loc>([^<]*)<\/loc>/)?.[1], `${site}${hrefs[lang]}`, `sitemap : loc ${i} ${lang}`);
    const links = [...block.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]*)" href="([^"]*)"\/>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(links, [...LANGS.map((l) => [l, `${site}${hrefs[l]}`]), ['x-default', `${site}${hrefs.he}`]], `sitemap : xhtml:link ${i} ${lang}`);
  });
  assert.ok(!xml.includes('404') && !/path-probe|%D7%91|%D0%BF/.test(xml), 'sitemap : 404 ou path-probe');
  const robots = readFileSync(join(out, 'robots.txt'), 'utf8');
  assert.equal(robots, `User-agent: *\n${indexable ? 'Allow: /' : 'Disallow: /'}\n\nSitemap: ${site}/sitemap.xml\n`, 'robots.txt');
  for (const icon of ['rs-icon-32.png', 'rs-icon-180.png', 'rs-icon-512.png']) assert.ok(existsSync(join(out, icon)), `${icon} absent`);
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(manifest.icons, [{ src: '/rs-icon-512.png', sizes: '512x512', type: 'image/png' }], 'manifeste : icône 512');
}

test('build de branche : 4 accueils + 4 Contact + 4 path-probe, layout Base (lang/dir, #rs-data, évitement, repères, hreflang relatifs), _redirects', { timeout: 120_000 }, () => {
  const out = build({});
  assert.deepEqual(indexFiles(out), [...HOMES, ...CONTACTS, ...PROBES].sort());
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
  for (const [i, file] of CONTACTS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'contact', LANGS[i], out);
    assertContact(html, LANGS[i], out);
    assertFormHiddenWithoutJs(html, out, file);
  }
  assertNotFoundPages(out);
  assertSeoFiles(out, '', false);
});

test('build de main indexable avec SITE_URL : 4 accueils + 4 Contact, sans noindex, canonique et hreflang absolus', { timeout: 120_000 }, () => {
  const out = build({ WORKERS_CI_BRANCH: 'main', DOMAIN_LIVE: 'true', SITE_URL: 'https://rs.example' });
  assert.deepEqual(indexFiles(out), [...HOMES, ...CONTACTS].sort());
  assert.ok(!existsSync(join(out, 'index.html')));
  for (const lang of LANGS) {
    assertLayout(readFileSync(join(out, lang, 'index.html'), 'utf8'), 'home', lang, out, 'https://rs.example', true);
  }
  for (const [i, file] of CONTACTS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'contact', LANGS[i], out, 'https://rs.example', true);
    assertContact(html, LANGS[i], out);
    assertFormHiddenWithoutJs(html, out, file);
  }
  // Story 1.9 : les 5 404 restent en noindex sur un build indexable ; sitemap et robots absolus.
  assertNotFoundPages(out);
  assertSeoFiles(out, 'https://rs.example', true);
});
