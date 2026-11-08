// Stories 1.3 à 1.7 : sortie réelle du build, sur une branche puis sur main (registre, layout Base.astro).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
  assert.equal(html.replaceAll(PHONE_BDI, '').replace(BASELINE_BDI, '').match(/\sdir=/g)?.length, 1, `${where} : dir= en double`);
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
