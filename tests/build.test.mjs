// Stories 1.3 à 1.9, 2.1 à 2.4, 3.1 à 3.5, 4.1 : sortie réelle du build, sur une branche puis sur main (registre, layout Base.astro).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { waHref } from '../src/lib/contact/core.ts';
import { buildCityTable, buildServiceTable, pageWaInput } from '../src/lib/contact/table.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LANGS = ['he', 'en', 'ru', 'fr'];
const HOMES = LANGS.map((lang) => `${lang}/index.html`);
const PROBES = ['en/path-probe/index.html', 'fr/test-de-chemin/index.html', 'he/בדיקת-נתיב/index.html', 'ru/проверка-пути/index.html'];
// Story 2.1 : page Contact, slugs des décisions de l'epic 2.
const CONTACT_SLUGS = { he: 'צור-קשר', en: 'contact', ru: 'контакты', fr: 'contact' };
const CONTACTS = LANGS.map((lang) => `${lang}/${CONTACT_SLUGS[lang]}/index.html`);
// Story 3.1 : page Caméras, slugs des décisions de l'epic 3.
const CAMERAS_SLUGS = { he: 'מצלמות', en: 'cameras', ru: 'камеры', fr: 'cameras' };
const CAMERAS = LANGS.map((lang) => `${lang}/${CAMERAS_SLUGS[lang]}/index.html`);
// Story 3.2 : page Détecteurs de fumée, slugs des décisions de l'epic 3.
const SMOKE_SLUGS = { he: 'גלאי-עשן', en: 'smoke-detectors', ru: 'датчики-дыма', fr: 'detecteurs-de-fumee' };
const SMOKES = LANGS.map((lang) => `${lang}/${SMOKE_SLUGS[lang]}/index.html`);
// Story 3.3 : pages Maison connectée et Interphone, slugs des décisions de l'epic 3.
const SMART_SLUGS = { he: 'בית-חכם', en: 'smart-home', ru: 'умный-дом', fr: 'maison-connectee' };
const SMARTS = LANGS.map((lang) => `${lang}/${SMART_SLUGS[lang]}/index.html`);
const INTERCOM_SLUGS = { he: 'אינטרקום', en: 'intercom', ru: 'домофон', fr: 'interphone' };
const INTERCOMS = LANGS.map((lang) => `${lang}/${INTERCOM_SLUGS[lang]}/index.html`);
// Story 3.4 : pages Réseaux et Pour les entrepreneurs, slugs des décisions de l'epic 3.
const NETWORK_SLUGS = { he: 'רשתות', en: 'networks', ru: 'сети', fr: 'reseaux' };
const NETWORKS = LANGS.map((lang) => `${lang}/${NETWORK_SLUGS[lang]}/index.html`);
const CONTRACTOR_SLUGS = { he: 'לקבלנים', en: 'contractors', ru: 'подрядчикам', fr: 'entrepreneurs' };
const CONTRACTORS = LANGS.map((lang) => `${lang}/${CONTRACTOR_SLUGS[lang]}/index.html`);
/** Stories 3.2 à 3.4 : ids des pages services actives (modèle Service), dans l'ordre de la colonne Services. */
const SERVICE_IDS = ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom'];
/** Story 3.4 : service du contexte de chaque page du modèle Service (= id, sauf Entrepreneurs → `crane-cameras`). */
const PAGE_SERVICE = { ...Object.fromEntries(SERVICE_IDS.map((sid) => [sid, sid])), contractors: 'crane-cameras' };
// Story 4.1 : pages ville sous le slug de `areas` (désactivée, jamais générée), dans l'ordre région puis ville.
const AREAS_SLUGS = { he: 'אזורים', en: 'areas', ru: 'районы', fr: 'zones' };
const CITY_DATA = Object.fromEntries(
  ['jerusalem', 'modiin'].map((cid) => [cid, parse(readFileSync(join(ROOT, `src/content/cities/${cid}.yaml`), 'utf8'))]),
);
const CITY_IDS = Object.keys(CITY_DATA);
const CITY_FILES = CITY_IDS.flatMap((cid) => LANGS.map((lang) => `${lang}/${AREAS_SLUGS[lang]}/${CITY_DATA[cid].slugs[lang]}/index.html`));
/** Table des villes en hébreu (message WhatsApp), comme src/lib/contact/labels.ts. */
const HE_CITIES = buildCityTable(CITY_IDS.map((cid) => ({ id: cid, name: CITY_DATA[cid].name })), 'he');
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
  ['home', 'path-probe', 'contact', 'cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom', 'contractors'].map((id) => [id, { title: metaField(id, 'title'), description: metaField(id, 'description') }]),
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
  cameras: Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/${encodeURIComponent(CAMERAS_SLUGS[lang])}/`])),
  'smoke-detectors': Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/${encodeURIComponent(SMOKE_SLUGS[lang])}/`])),
  'smart-home': Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/${encodeURIComponent(SMART_SLUGS[lang])}/`])),
  intercom: Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/${encodeURIComponent(INTERCOM_SLUGS[lang])}/`])),
  networks: Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/${encodeURIComponent(NETWORK_SLUGS[lang])}/`])),
  contractors: Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/${encodeURIComponent(CONTRACTOR_SLUGS[lang])}/`])),
  areas: Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/${encodeURIComponent(AREAS_SLUGS[lang])}/`])),
  ...Object.fromEntries(
    CITY_IDS.map((cid) => [
      `city:${cid}`,
      Object.fromEntries(LANGS.map((lang) => [lang, `/${lang}/${encodeURIComponent(AREAS_SLUGS[lang])}/${encodeURIComponent(CITY_DATA[cid].slugs[lang])}/`])),
    ]),
  ),
};
/** Stories 3.1 à 3.4 : ids actifs du header, dans l'ordre de nav.ts (HEADER_NAV_IDS). */
const HEADER_IDS = ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom', 'contractors', 'contact'];
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

/** Story 1.7 (FR19, UX-DR33, D1), stories 2.1, 3.1 à 3.4 : footer avec les 5 services, `contractors` et
 * `contact` seuls actifs (colonne Services = les 5 services dans l'ordre, colonne Pour les entreprises =
 * « Caméras de grue » → Entrepreneurs puis « sociétés de gestion » → Interphone, colonne RS SYSTEM = Contact). */
function assertFooter(footer, lang, where) {
  const dict = I18N[lang];
  const contact = dict['footer.col.contact'];
  const company = dict['footer.col.company'];
  const services = dict['footer.col.services'];
  const business = dict['footer.col.business'];
  // Cinq <nav> : Services, Pour les entreprises (Entrepreneurs puis Interphone), RS SYSTEM (seul lien : Contact), la
  // colonne Contact, puis le sélecteur ; ni Zones (page inactive), aucun <nav> légal.
  const navs = footer.match(/<nav\b[^>]*>/g) ?? [];
  assert.equal(navs.length, 5, `${where} : <nav> du footer ${navs}`);
  assert.match(navs[0], new RegExp(`^<nav aria-label="${services}"[\\s>]`), `${where} : <nav> Services`);
  assert.match(navs[1], new RegExp(`^<nav aria-label="${business}"[\\s>]`), `${where} : <nav> Pour les entreprises`);
  assert.match(navs[2], new RegExp(`^<nav aria-label="${company}"[\\s>]`), `${where} : <nav> RS SYSTEM`);
  assert.match(navs[3], new RegExp(`^<nav aria-label="${contact}"[\\s>]`), `${where} : <nav> Contact`);
  assert.ok(!navs.some((n) => n.includes(`aria-label="${dict['footer.legal-label']}"`)), `${where} : <nav> légal`);
  const column = (nav) => footer.slice(footer.indexOf(nav), footer.indexOf('</nav>', footer.indexOf(nav)));
  const linksOf = (col) => [...col.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
  const servicesCol = column(navs[0]);
  assert.equal(servicesCol.match(/<h2\b[^>]*>([^<]*)<\/h2>/)?.[1], services, `${where} : <h2> Services`);
  assert.deepEqual(linksOf(servicesCol), SERVICE_IDS.map((sid) => [PAGE_HREFS[sid][lang], dict[`nav.${sid}`]]), `${where} : liens Services`);
  const businessCol = column(navs[1]);
  assert.equal(businessCol.match(/<h2\b[^>]*>([^<]*)<\/h2>/)?.[1], escaped(business), `${where} : <h2> Pour les entreprises`);
  assert.deepEqual(
    linksOf(businessCol),
    [[PAGE_HREFS.contractors[lang], escaped(dict['nav.footer.crane-cameras'])], [PAGE_HREFS.intercom[lang], escaped(dict['nav.footer.management'])]],
    `${where} : liens Pour les entreprises`,
  );
  const companyCol = column(navs[2]);
  assert.equal(companyCol.match(/<h2\b[^>]*>([^<]*)<\/h2>/)?.[1], company, `${where} : <h2> RS SYSTEM`);
  assert.deepEqual(linksOf(companyCol), [[PAGE_HREFS.contact[lang], dict['nav.contact']]], `${where} : liens RS SYSTEM`);
  const col = column(navs[3]);
  assert.equal(col.match(/<h2\b[^>]*>([^<]*)<\/h2>/)?.[1], contact, `${where} : <h2> Contact`);
  assert.equal(footer.match(/<h2[\s>]/g)?.length, 4, `${where} : <h2> du footer`);
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
  assert.ok(footer.indexOf(navs[3]) < footer.indexOf('<p') && footer.indexOf('<p') < footer.indexOf(navs[4]), `${where} : ordre du footer`);
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
  // Recette epic 2 (D6) : numéro d'exemple du message téléphone, isolé sous le champ et dans le résumé.
  const exampleBdi = id === 'contact' ? /<bdi dir="ltr"(?: data-astro-cid-[\w-]+)?>050-123-4567<\/bdi>/g : /$^/;
  if (id === 'contact') assert.equal(html.match(exampleBdi)?.length, 2, `${where} : numéro d'exemple isolé 2 fois (résumé et champ)`);
  const withoutIsolates = html.replaceAll(PHONE_BDI, '').replace(BASELINE_BDI, '').replace(RATING_BDI, '').replace(exampleBdi, '');
  const phoneField = id === 'contact' ? /<input id="contact-phone"[^>]*>/ : /$^/;
  assert.equal(withoutIsolates.replace(phoneField, '').match(/\sdir=/g)?.length, 1, `${where} : dir= en double`);
  assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}" data-page-id="${id}"[\\s>]`), where);
  // AD-13 : un seul #rs-data, qui vaut { context } ; story 2.3 (AD-5) : sur Contact, { context, services, cities },
  // `services` = les 7 codes dans l'ordre (libellé dans la langue + hébreu) ; story 4.1 : `cities` = les villes
  // dans l'ordre région puis ville (nom dans la langue + hébreu).
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
    assert.deepEqual(Object.keys(data.cities), CITY_IDS, `${where} : codes de villes`);
    for (const cid of CITY_IDS) {
      assert.deepEqual(data.cities[cid], { label: CITY_DATA[cid].name[lang], he: CITY_DATA[cid].name.he }, `${where} : ville ${cid}`);
    }
  } else if (id.startsWith('city:')) {
    // Story 4.1 (AD-13) : le modèle City fixe la ville (id = code `?city=`) et la section de navigation `areas`.
    assert.deepEqual(JSON.parse(json), { context: { id, lang, city: id.slice(5), navSection: 'areas', indexable } }, where);
  } else if (Object.hasOwn(PAGE_SERVICE, id)) {
    // Stories 3.1 à 3.4 (AD-13) : le modèle Service fixe le service (Entrepreneurs : crane-cameras) et la section de
    // navigation (= id de la page).
    assert.deepEqual(JSON.parse(json), { context: { id, lang, service: PAGE_SERVICE[id], navSection: id, indexable } }, where);
  } else {
    assert.deepEqual(JSON.parse(json), { context: { id, lang, indexable } }, where);
  }
  const context = JSON.parse(json).context;
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
  // Panneau #mobile-menu après la barre. Stories 2.1, 3.1 à 3.4 : ids de nav actifs = HEADER_IDS ;
  // trois <nav> dans le header : liens de la barre (avant le panneau), puis dans le panneau les mêmes liens et le sélecteur.
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
    assert.equal(links.length, HEADER_IDS.length, `${where} : liens du <nav> principal`);
    HEADER_IDS.forEach((navId, i) => {
      assert.equal(attr(`<a${links[i][1]}>`, 'href'), PAGE_HREFS[navId][lang], `${where} : href ${navId} du header`);
      assert.equal(links[i][2], I18N[lang][`nav.${navId}`], `${where} : libellé ${navId} du header`);
      assert.equal(attr(`<a${links[i][1]}>`, 'aria-current'), id === navId ? 'page' : undefined, `${where} : aria-current ${navId}`);
    });
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
  // Story 1.6 (FR18, FR31, AD-6) : barre mobile unique, après </footer> ; Appeler puis WhatsApp.
  // Story 3.1 (report DW-3 de l'epic 1) : message = waHref(pageWaInput(contexte)), donc le libellé hébreu du
  // service sur une page service (« מצלמות אבטחה » sur Caméras), la salutation seule ailleurs.
  assert.equal(html.match(/\sclass="mobile-bar"/g)?.length, 1, `${where} : barre mobile`);
  const bar = html.slice(html.indexOf(' class="mobile-bar"'));
  assert.ok(html.indexOf(' class="mobile-bar"') > html.indexOf('</footer>'), `${where} : barre pas après </footer>`);
  const actions = [...bar.matchAll(/<a href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g)].slice(0, 2);
  assert.equal(actions[0]?.[1], 'tel:+972509565669', `${where} : lien Appeler`);
  const barWa = waHref(pageWaInput(context, HE_SERVICES, HE_CITIES));
  if (context.city) assert.ok(decodeURIComponent(barWa).includes(`הצעת מחיר ב${CITY_DATA[context.city].name.he}.`), `${where} : ville dans le message de la barre`);
  assert.equal(actions[1]?.[1], barWa.replaceAll('&', '&amp;'), `${where} : lien WhatsApp`);
  if (Object.hasOwn(PAGE_SERVICE, id)) assert.ok(decodeURIComponent(barWa).includes(serviceLabel(PAGE_SERVICE[id], 'he')), `${where} : service dans le message de la barre`);
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
/** Story 3.5 : balises ouvrantes `name`, guillemets compris (un `sizes` peut contenir « >= »). */
const tagsOf = (html, name) => html.match(new RegExp(`<${name}\\b(?:[^>"]|"[^"]*")*>`, 'g')) ?? [];
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

/** Story 3.5 : contenu de src/content/pages/home.yaml (bloc `home`). */
const HOME_PAGE = parse(readFileSync(join(ROOT, 'src/content/pages/home.yaml'), 'utf8')).home;
const GRID_SIZES = '(width >= 1076px) calc(50vw - 18px), calc(100vw - 24px)';
/**
 * Story 3.5 : tuiles de l'accueil, dans l'ordre de <main> : classes, titre, contenu YAML, point focal, fond et scrim
 * (tuiles sombres), liens attendus ([page ou href, clé i18n]), `sizes` et dimensions de la photo, mouvement.
 */
const HOME_TILES = [
  { cls: 'tile light feature', id: 'cameras-title', level: 'h2', content: () => HOME_PAGE.cameras, focus: 'dome', links: (lang) => [[PAGE_HREFS.cameras[lang], 'action.details'], [`${PAGE_HREFS.contact[lang]}?service=cameras`, 'action.quote']], sizes: 'min(1100px, calc(100vw - 68px))', land: ['2560', '1280'], portrait: ['1440', '1800'], motion: 'zoom' },
  { cls: 'tile dark crane-home', id: 'crane-title', level: 'h2', content: () => HOME_PAGE.crane, focus: 'crane', bg: 'tile-night', scrim: 'crane', links: (lang) => [[PAGE_HREFS.contractors[lang], 'action.details'], [`${PAGE_HREFS.contact[lang]}?service=crane-cameras`, 'action.quote-site']], sizes: 'calc(100vw - 24px)', land: ['2560', '1164'], portrait: ['1440', '1800'], motion: 'parallax' },
  { cls: 'tile dark grid', id: 'management-title', level: 'h3', content: () => HOME_PAGE.services.management, focus: 'building', bg: 'navy-deep', scrim: 'tile', links: (lang) => [[`${PAGE_HREFS.contact[lang]}?service=intercom`, 'action.site-visit']], sizes: GRID_SIZES, land: ['2560', '1280'], portrait: ['1440', '1800'], motion: 'zoom' },
  { cls: 'tile light grid', id: 'intercom-title', level: 'h3', content: () => HOME_PAGE.services.intercom, focus: 'intercom', links: (lang) => [[PAGE_HREFS.intercom[lang], 'action.details']], sizes: GRID_SIZES, land: ['2560', '1280'], portrait: ['1440', '1080'], motion: 'zoom' },
  { cls: 'tile light grid', id: 'smart-home-title', level: 'h3', content: () => HOME_PAGE.services['smart-home'], focus: 'switch', links: (lang) => [[PAGE_HREFS['smart-home'][lang], 'action.details']], sizes: GRID_SIZES, land: ['2560', '1280'], portrait: ['1440', '1080'], motion: 'zoom' },
  { cls: 'tile dark grid', id: 'networks-title', level: 'h3', content: () => HOME_PAGE.services.networks, focus: 'network', bg: 'tile-night', scrim: 'network', links: (lang) => [[PAGE_HREFS.networks[lang], 'action.details']], sizes: GRID_SIZES, land: ['2560', '1344'], portrait: ['1440', '1800'], motion: 'zoom' },
];

/** Story 3.5 (FR1, FR23, NFR4, UX-DR4, UX-DR16, UX-DR17, UX-DR34, D1 à D3) : tuiles, grille et tuile détecteur de l'accueil. */
function assertHomeTiles(html, main, pictures, lang, out, where) {
  const dict = I18N[lang];
  const tiles = main.match(/<section class="tile\b[\s\S]*?<\/section>/g) ?? [];
  assert.equal(tiles.length, HOME_TILES.length, `${where} : tuiles`);
  let linkCount = 0;
  HOME_TILES.forEach((def, i) => {
    const tile = tiles[i];
    const at = `${where} : tuile ${def.id}`;
    const content = def.content();
    const dark = def.cls.includes(' dark ');
    const tag = tile.match(/^<section\b[^>]*>/)[0];
    assert.equal(attr(tag, 'class'), def.cls, `${at} : classes`);
    assert.equal(attr(tag, 'aria-labelledby'), def.id, `${at} : aria-labelledby`);
    assert.equal(attr(tag, 'data-surface'), dark ? 'photo' : undefined, `${at} : data-surface`);
    const style = [`--photo-position: var(--photo-focus-${def.focus})`, ...(dark ? [`--tile-bg: var(--color-${def.bg}); --tile-scrim: var(--scrim-${def.scrim})`] : [])].join('; ');
    assert.equal(attr(tag, 'style'), style, `${at} : style`);
    // Texte : sur-titre (grue seulement), titre de niveau attendu, texte ; tous lus dans home.yaml.
    const block = tile.match(/<div class="content reveal"[^>]*>([\s\S]*?)<div class="links"/)?.[1] ?? '';
    assert.equal(block.match(/^<p class="eyebrow"[^>]*>([^<]*)<\/p>/)?.[1], content.eyebrow ? escaped(content.eyebrow[lang]) : undefined, `${at} : sur-titre`);
    assert.equal(block.match(new RegExp(`<${def.level} id="${def.id}" class="title"[^>]*>([^<]*)</${def.level}>`))?.[1], escaped(content.title[lang]), `${at} : titre`);
    assert.equal(block.match(/<p class="text"[^>]*>([^<]*)<\/p>/)?.[1], escaped(content.text[lang]), `${at} : texte`);
    // Liens « › » (2 au plus), dans l'ordre du canvas, sans data-track, ton photo sur sombre, clair sinon, tous avant la photo.
    const expected = def.links(lang);
    const links = [...tile.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    assert.equal(links.length, expected.length, `${at} : liens`);
    assert.ok(links.length <= 2, `${at} : plus de 2 liens`);
    expected.forEach(([href, key], j) => {
      assertTextLink(links[j], href, escaped(dict[key]), undefined, undefined, `${at} : lien ${key}`);
      assert.equal(attr(`<a${links[j][1]}>`, 'class'), `text-link ${dark ? 'photo' : 'light'}`, `${at} : ton du lien ${key}`);
      assert.ok(tile.indexOf(links[j][0]) < tile.indexOf('<picture'), `${at} : lien hors de l'image`);
    });
    linkCount += links.length;
    // Photo : une par tuile, lazy, `sizes` de sa taille, budgets NFR4 des tuiles (180 000 octets).
    assert.equal(tile.match(/<picture>/g)?.length, 1, `${at} : <picture>`);
    assert.ok(tile.includes(pictures[i]), `${at} : <picture> dans l'ordre`);
    assertServicePicture(pictures[i], { alt: content.alt[lang], sizes: def.sizes, land: def.land, portrait: def.portrait, priority: false, budgets: { land: 180_000, portrait: 180_000 } }, out, `${at} : photo`);
    assert.equal(attr(tagsOf(pictures[i], 'img')[0], 'class'), `photo ${def.motion}`, `${at} : mouvement de la photo`);
    if (def.id === 'crane-title') assertCraneMobile(pictures[i], html, out, at);
  });
  // Grille : section `services` avec h2 masqué (YAML), conteneur de la grille, 4 tuiles en h3.
  const services = main.slice(main.indexOf('<section class="services"'), main.indexOf('<section class="smoke'));
  assert.match(services, /^<section class="services" aria-labelledby="services-title"[\s>]/, `${where} : section services`);
  assert.equal(services.match(/<h2 id="services-title" class="visually-hidden"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(HOME_PAGE.services.title[lang]), `${where} : h2 masqué de la grille`);
  assert.match(services, /<\/h2><div class="services-grid"[^>]*><section class="tile dark grid"/, `${where} : conteneur de la grille`);
  assert.equal(services.match(/<section class="tile\b/g)?.length, 4, `${where} : 4 tuiles dans la grille`);
  assert.equal(services.match(/<h3[\s>]/g)?.length, 4, `${where} : 4 h3`);
  // Tuile détecteur : h2, texte, un seul lien « לפרטים › » vers Détecteurs (ton clair), puis détecteur md décoratif.
  const smoke = main.match(/<section class="smoke reveal"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(smoke, /^<section class="smoke reveal" aria-labelledby="smoke-title"[\s>]/, `${where} : tuile détecteur`);
  assert.equal(smoke.match(/<h2 id="smoke-title" class="title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(HOME_PAGE.smoke.title[lang]), `${where} : h2 détecteur`);
  assert.equal(smoke.match(/<p class="text"[^>]*>([^<]*)<\/p>/)?.[1], escaped(HOME_PAGE.smoke.text[lang]), `${where} : texte détecteur`);
  const smokeLinks = [...smoke.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(smokeLinks.length, 1, `${where} : liens de la tuile détecteur`);
  assertTextLink(smokeLinks[0], PAGE_HREFS['smoke-detectors'][lang], escaped(dict['action.details']), undefined, undefined, `${where} : tuile détecteur vers Détecteurs`);
  assert.equal(attr(`<a${smokeLinks[0][1]}>`, 'class'), 'text-link light', `${where} : ton du lien détecteur`);
  const detector = smoke.match(/<div class="detector\b[^"]*"[^>]*>/)?.[0] ?? '';
  assert.equal(attr(detector, 'class'), 'detector md', `${where} : détecteur md sans montée`);
  assert.equal(attr(detector, 'aria-hidden'), 'true', `${where} : détecteur aria-hidden`);
  assert.ok(smoke.indexOf(detector) > smoke.indexOf(smokeLinks[0][0]), `${where} : détecteur après le lien`);
  assert.ok(!/<picture[\s>]/.test(smoke), `${where} : photo dans la tuile détecteur`);
  assert.equal(linkCount + smokeLinks.length, 9, `${where} : 9 liens de tuiles`);
  // CSS servie : grille auto-fit, colonnes de 520px au moins et 2 au plus, joint et padding de 12px ; tailles des tuiles ; parallaxe de la grue.
  const css = servedCss(html, out);
  const flat = css.replace(/\s+/g, '');
  const grid = flat.match(/\.services-grid\[[^\]]*\]\{([^}]*)\}/)?.[1] ?? '';
  assert.match(grid, /grid-template-columns:repeat\(auto-fit,minmax\(max\(min\(100%,var\(--tile-grid-col-min\)\),\(100%-var\(--tile-gutter\)\)\/2\),1fr\)\)/, `${where} : colonnes de la grille`);
  assert.match(grid, /gap:var\(--tile-gutter\)/, `${where} : joint de la grille`);
  assert.match(grid, /padding:var\(--tile-gutter\)/, `${where} : padding de la grille`);
  // Photo non chargée : le fond de la tuile reste (claire surface-alt, sombre --tile-bg vérifié dans `style`).
  assert.match(flat, /\.light\[[^\]]*\]\{[^}]*background-color:var\(--color-surface-alt\)/, `${where} : fond des tuiles claires`);
  assert.match(flat, /\.dark\[[^\]]*\]\{[^}]*background-color:var\(--tile-bg\)/, `${where} : fond des tuiles sombres`);
  assert.match(flat, /\.crane-home\[[^\]]*\]\{[^}]*min-block-size:var\(--tile-crane-min-home\)/, `${where} : hauteur de la tuile grue`);
  assert.match(flat, /\.grid(?:\[[^\]]*\])?\.dark(?:\[[^\]]*\])?\{[^}]*min-block-size:var\(--tile-grid-min\)/, `${where} : hauteur des tuiles sombres de la grille`);
  assert.match(flat, /\.feature\[[^\]]*\]\.media\[[^\]]*\]\{[^}]*block-size:var\(--tile-feature-photo-height\)/, `${where} : cadre photo de la tuile caméras`);
  assert.match(flat, /\.parallax[^{]*\{[^}]*animation:[^;}]*tile-drift/, `${where} : parallaxe de la grue`);
  assert.match(flat, /img\.parallax[^{]*\{animation-timeline:view\(\)/, `${where} : timeline de la parallaxe`);
  assert.ok(!/animation:[^;}]*view\(\)/.test(css), `${where} : view() dans le raccourci animation`);
  assert.ok(![...tiles, smoke].some((block) => block.includes('data-track=')), `${where} : data-track dans une tuile`);
}

/** Story 1.8 (FR1, FR21, NFR4, UX-DR13, UX-DR19, D2, D3), story 3.5 (FR1, FR23, UX-DR4, UX-DR16, UX-DR17) :
 * héros photo, tuiles de services, tuile détecteur puis bloc contact de l'accueil. */
function assertHome(html, lang, out) {
  const where = `home (${lang})`;
  const dict = I18N[lang];
  const main = html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  // Story 3.5 : ordre de <main> (les tuiles de la grille sont dans la section `services`), rien d'autre.
  const sections = [...main.matchAll(/<section class="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ['hero', 'tile light feature', 'tile dark crane-home', 'services', 'tile dark grid', 'tile light grid', 'tile light grid', 'tile dark grid', 'smoke reveal', 'band'], `${where} : sections de <main>`);
  // Héros en tête de <main> ; plus de h1 site.name ni de baseline.
  assert.match(main, /^<section class="hero" aria-labelledby="hero-title" data-surface="photo"[\s>]/, `${where} : héros en tête`);
  const hero = main.match(/^<section class="hero"[\s\S]*?<\/section>/)?.[0] ?? '';
  const band = main.slice(main.indexOf('<section class="band"'));
  assert.match(band, /^<section class="band" aria-labelledby="contact-band-title" data-surface="navy"[\s>]/, `${where} : bloc contact`);
  assert.ok(band.trimEnd().endsWith('</section>') && band.match(/<section[\s>]/g)?.length === 1, `${where} : rien après le bloc contact`);
  // Un seul h1, celui du héros, puis aucun saut de niveau (footer compris) ; sous-titre.
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${where} : <h1>`);
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1, `${where} : premier titre ${levels}`);
  levels.forEach((level, i) => assert.ok(i === 0 || level <= levels[i - 1] + 1, `${where} : saut de titre ${levels}`));
  assert.equal(hero.match(/<h1 id="hero-title"[^>]*>([^<]*)<\/h1>/)?.[1], dict['home.hero.title'], `${where} : h1`);
  // Story 3.4 : HeroPhoto sans variante, rendu de l'accueil inchangé (pas de style, h1 hero-title, pas de sur-titre).
  assert.equal(attr(hero.match(/^<section\b[^>]*>/)?.[0] ?? '', 'style'), undefined, `${where} : style du héros`);
  assert.equal(attr(hero.match(/<h1 id="hero-title"[^>]*>/)?.[0] ?? '', 'class'), 'title', `${where} : classe du h1`);
  assert.ok(!hero.includes('class="eyebrow"'), `${where} : sur-titre dans le héros`);
  assert.equal(hero.match(/<p class="subtitle"[^>]*>([^<]*)<\/p>/)?.[1], dict['home.hero.subtitle'], `${where} : sous-titre`);
  // Liens du héros : Appeler puis WhatsApp, ton photo.
  const heroLinks = [...hero.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(heroLinks.length, 2, `${where} : liens du héros`);
  assertTextLink(heroLinks[0], 'tel:+972509565669', dict['action.call'], 'call_click', 'hero', `${where} : héros Appeler`);
  assertTextLink(heroLinks[1], waHref(), dict['action.whatsapp'], 'whatsapp_click', 'hero', `${where} : héros WhatsApp`);
  for (const [, attrs] of heroLinks) assert.match(attrs, /\sclass="text-link photo"/, `${where} : ton photo`);
  // <picture> : 3 sources 4:5 sous 700px, 2 sources paysage, puis <img> JPEG. Story 3.5 : héros puis 6 tuiles.
  const pictures = html.match(/<picture>[\s\S]*?<\/picture>/g) ?? [];
  assert.equal(pictures.length, 7, `${where} : <picture>`);
  assert.ok(hero.includes(pictures[0]), `${where} : <picture> hors du héros`);
  assert.equal(html.match(/\sfetchpriority="high"/g)?.length, 1, `${where} : une seule image prioritaire`);
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
  // Story 3.5 : un <img> par <picture> (héros + 6 tuiles), plus le logo du header.
  const imgs = tagsOf(html, 'img');
  assert.equal(imgs.length, 8, `${where} : <img>`);
  const photoImgs = pictures.map((pic) => tagsOf(pic, 'img')[0]);
  assert.ok((html.match(/<header[\s>][\s\S]*?<\/header>/)?.[0] ?? '').includes(imgs.find((i) => !photoImgs.includes(i)) ?? ''), `${where} : <img> hors header`);
  assertHomeTiles(html, main, pictures.slice(1), lang, out, where);
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
/** Table des services en hébreu (message WhatsApp), comme src/lib/contact/labels.ts. */
const HE_SERVICES = buildServiceTable(SERVICES, 'he');
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
  // Recette epic 2 (D6) : le numéro d'exemple du message téléphone est isolé dans un <bdi dir="ltr">.
  const EXAMPLE_BDI = /<bdi dir="ltr"(?: data-astro-cid-[\w-]+)?>\+?\d[\d .()-]*\d<\/bdi>/;
  const plain = (s) => s.replace(/<bdi dir="ltr"(?: data-astro-cid-[\w-]+)?>([^<]*)<\/bdi>/g, '$1');
  const items = [...status.matchAll(/<li data-field="(\w+)"[^>]*><a href="([^"]*)"[^>]*>((?:[^<]|<\/?bdi\b[^>]*>)*)<\/a><\/li>/g)].map((m) => m.slice(1));
  assert.match(items.find(([f]) => f === 'phone')?.[2] ?? '', EXAMPLE_BDI, `${where} : numéro d'exemple isolé dans le résumé`);
  assert.ok(!/<bdi\b/.test(items.find(([f]) => f === 'name')?.[2] ?? ''), `${where} : aucun isolement dans le lien Nom`);
  for (const item of items) item[2] = plain(item[2]);
  assert.deepEqual(items, [['name', '#contact-name', escaped(dict['form.name.error'])], ['phone', '#contact-phone', escaped(dict['form.phone.error'])]], `${where} : liens du résumé`);
  // Messages cachés juste après leur champ, icône aria-hidden puis texte traduit.
  for (const [id, key] of [['contact-name', 'form.name.error'], ['contact-phone', 'form.phone.error']]) {
    const m = form.match(new RegExp(`<input id="${id}"[^>]*>(<p\\b[^>]*>)([\\s\\S]*?)</p></div>`));
    assert.ok(m, `${where} : message juste après #${id}`);
    assert.equal(attr(m[1], 'id'), `${id}-error`, `${where} : id du message de ${id}`);
    assert.equal(attr(m[1], 'class'), 'error', `${where} : classe du message de ${id}`);
    assert.ok(hasAttr(m[1], 'hidden', ''), `${where} : message de ${id} caché`);
    assert.match(m[2], ALERT_ICON, `${where} : icône du message de ${id}`);
    const span = m[2].replace(ALERT_ICON, '').match(/^<span\b[^>]*>((?:[^<]|<\/?bdi\b[^>]*>)*)<\/span>$/)?.[1] ?? '';
    if (key === 'form.phone.error') assert.match(span, EXAMPLE_BDI, `${where} : numéro d'exemple isolé sous le champ`);
    assert.equal(plain(span), escaped(dict[key]), `${where} : texte du message de ${id}`);
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

/** Story 3.1 : contenu de src/content/pages/cameras.yaml (bloc `service`). */
const CAMERAS_PAGE = parse(readFileSync(join(ROOT, 'src/content/pages/cameras.yaml'), 'utf8')).service;
const STEP_KEYS = ['call', 'visit', 'install', 'service'];
/** Largeurs d'un srcset (`f 480w, …` → [480, …]). */
const srcsetWidths = (srcset) => (srcset ?? '').split(', ').map((c) => Number(c.split(' ')[1]?.replace('w', '')));
/** Fichier servi à la largeur `width` d'un srcset. */
const srcsetFile = (srcset, width) => (srcset ?? '').split(', ').find((c) => c.endsWith(` ${width}w`))?.split(' ')[0];

/**
 * Story 3.1 (AD-9, NFR4) : <picture> d'une photo des pages services : 3 sources 4:5 sous 700px, 2 sources paysage,
 * puis <img> JPEG ; `sizes`, dimensions, chargement et poids (paysage 1440w, portrait 1080w, AVIF et WebP).
 */
function assertServicePicture(picture, { alt, sizes, land, portrait, priority, budgets }, out, where) {
  const sources = tagsOf(picture, 'source');
  assert.equal(sources.length, 5, `${where} : <source>`);
  ['avif', 'webp', 'jpeg'].forEach((format, i) => {
    const tag = sources[i];
    assert.equal(attr(tag, 'media'), '(width < 700px)', `${where} : media ${format}`);
    assert.equal(attr(tag, 'type'), `image/${format}`, `${where} : type portrait ${format}`);
    assert.deepEqual(srcsetWidths(attr(tag, 'srcset')), [480, 768, 1080, 1440], `${where} : largeurs portrait ${format}`);
    assert.equal(attr(tag, 'sizes'), sizes, `${where} : sizes portrait ${format}`);
    assert.deepEqual([attr(tag, 'width'), attr(tag, 'height')], portrait, `${where} : dimensions portrait ${format}`);
  });
  ['avif', 'webp'].forEach((format, i) => {
    const tag = sources[3 + i];
    assert.equal(attr(tag, 'media'), undefined, `${where} : media paysage ${format}`);
    assert.equal(attr(tag, 'type'), `image/${format}`, `${where} : type paysage ${format}`);
    assert.deepEqual(srcsetWidths(attr(tag, 'srcset')), [480, 768, 1080, 1440, 1920, 2560], `${where} : largeurs paysage ${format}`);
    assert.equal(attr(tag, 'sizes'), sizes, `${where} : sizes paysage ${format}`);
    assert.deepEqual([attr(tag, 'width'), attr(tag, 'height')], land, `${where} : dimensions paysage ${format}`);
  });
  const img = tagsOf(picture, 'img')[0] ?? '';
  assert.equal(attr(img, 'alt'), escaped(alt), `${where} : alt`);
  assert.deepEqual([attr(img, 'width'), attr(img, 'height')], land, `${where} : dimensions img`);
  assert.equal(attr(img, 'sizes'), sizes, `${where} : sizes img`);
  assert.match(attr(img, 'src') ?? '', /\.jpe?g$/, `${where} : src JPEG`);
  if (priority) {
    assert.equal(attr(img, 'loading'), 'eager', `${where} : loading`);
    assert.equal(attr(img, 'fetchpriority'), 'high', `${where} : fetchpriority`);
    assert.equal(attr(img, 'decoding'), undefined, `${where} : decoding`);
  } else {
    assert.equal(attr(img, 'loading'), 'lazy', `${where} : loading`);
    assert.equal(attr(img, 'fetchpriority'), undefined, `${where} : fetchpriority`);
    assert.equal(attr(img, 'decoding'), 'async', `${where} : decoding`);
  }
  for (const [tag, width, budget] of [[sources[0], 1080, budgets.portrait], [sources[1], 1080, budgets.portrait], [sources[3], 1440, budgets.land], [sources[4], 1440, budgets.land]]) {
    const file = srcsetFile(attr(tag, 'srcset'), width);
    assert.ok(file, `${where} : ${width}w absent`);
    const size = statSync(join(out, file)).size;
    assert.ok(size <= budget, `${where} : ${file} ${size} > ${budget}`);
  }
}

/** Story 3.1 (FR2, FR21, FR22, FR23, FR31, UX-DR14, UX-DR17, UX-DR18, UX-DR20, UX-DR21, UX-DR37) : page Caméras en `lang`. */
function assertCameras(html, lang, out) {
  const where = `cameras (${lang})`;
  const dict = I18N[lang];
  const tel = 'tel:+972509565669';
  const wa = waHref({ serviceHe: serviceLabel('cameras', 'he') });
  const quote = `${PAGE_HREFS.contact[lang]}?service=cameras`;
  const main = html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  // Ordre de <main> : héros clair, trio, tuile grue, étapes, bloc contact ; rien d'autre.
  const sections = [...main.matchAll(/<section class="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ['hero', 'trio reveal', 'tile dark crane', 'steps reveal', 'band'], `${where} : sections de <main>`);
  assert.match(main, /^<section class="hero"/, `${where} : héros en tête`);
  const sectionAt = (cls) => main.match(new RegExp(`<section class="${cls}"[\\s\\S]*?</section>`))?.[0] ?? '';
  const [hero, trio, tile, steps, band] = sections.map(sectionAt);
  // Titres : un seul h1, puis aucun saut de niveau sur toute la page (footer compris).
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${where} : <h1>`);
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1, `${where} : premier titre ${levels}`);
  levels.forEach((level, i) => assert.ok(i === 0 || level <= levels[i - 1] + 1, `${where} : saut de titre ${levels}`));
  // Héros clair : h1, sous-titre, Appeler › WhatsApp › Devis › (ton clair), photo dôme encadrée.
  assert.match(hero, /^<section class="hero" aria-labelledby="hero-title"[\s>]/, `${where} : héros`);
  assert.ok(!/\sdata-surface=/.test(hero.match(/^<section\b[^>]*>/)[0]), `${where} : héros clair sans data-surface`);
  assert.equal(hero.match(/<h1 id="hero-title"[^>]*>([^<]*)<\/h1>/)?.[1], escaped(CAMERAS_PAGE.hero.title[lang]), `${where} : h1`);
  assert.equal(hero.match(/<p class="subtitle"[^>]*>([^<]*)<\/p>/)?.[1], escaped(CAMERAS_PAGE.hero.subtitle[lang]), `${where} : sous-titre`);
  const heroLinks = [...hero.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(heroLinks.length, 3, `${where} : liens du héros`);
  assertTextLink(heroLinks[0], tel, dict['action.call'], 'call_click', 'hero', `${where} : héros Appeler`);
  assertTextLink(heroLinks[1], wa, dict['action.whatsapp'], 'whatsapp_click', 'hero', `${where} : héros WhatsApp`);
  assertTextLink(heroLinks[2], quote, escaped(dict['action.quote']), undefined, undefined, `${where} : héros Devis`);
  for (const [, attrs] of heroLinks) assert.match(attrs, /\sclass="text-link light"/, `${where} : ton clair`);
  // Photos : dôme dans le héros (seule eager/high), grue dans la tuile (lazy) ; aucun autre <img> que le logo.
  const pictures = html.match(/<picture>[\s\S]*?<\/picture>/g) ?? [];
  assert.equal(pictures.length, 2, `${where} : <picture>`);
  assert.ok(hero.includes(pictures[0]) && tile.includes(pictures[1]), `${where} : <picture> hors du héros ou de la tuile`);
  assert.equal(html.match(/<img\b/g)?.length, 3, `${where} : <img> (logo + 2 photos)`);
  assert.equal(html.match(/\sfetchpriority="high"/g)?.length, 1, `${where} : une seule image prioritaire`);
  assertServicePicture(pictures[0], { alt: CAMERAS_PAGE.hero.alt[lang], sizes: 'min(1180px, calc(100vw - 44px))', land: ['2560', '1280'], portrait: ['1440', '1800'], priority: true, budgets: { land: 250_000, portrait: 120_000 } }, out, `${where} : dôme`);
  // Story 3.3 : cadre du héros de Caméras inchangé, point focal du dôme et ratio 4:5 par défaut (pas de ratio paysage).
  const cameraFrame = hero.match(/<div class="frame"[^>]*>/)?.[0] ?? '';
  assert.equal(attr(cameraFrame, 'style'), '--photo-position: var(--photo-focus-dome)', `${where} : style du cadre du héros`);
  assertServicePicture(pictures[1], { alt: CAMERAS_PAGE.tile.alt[lang], sizes: 'calc(100vw - 24px)', land: ['2560', '1164'], portrait: ['1440', '1800'], priority: false, budgets: { land: 180_000, portrait: 180_000 } }, out, `${where} : grue`);
  assertHeroLightFrameCss(html, out, where);
  assertCraneMobile(pictures[1], html, out, `${where} : grue`);
  // Trio : h2 puis 3 h3, chacun suivi de son texte ; aucun lien.
  assert.match(trio, /^<section class="trio reveal" aria-labelledby="trio-title"[\s>]/, `${where} : trio`);
  assert.equal(trio.match(/<h2 id="trio-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(CAMERAS_PAGE.trio.title[lang]), `${where} : h2 du trio`);
  const trioItems = [...trio.matchAll(/<h3\b[^>]*>([^<]*)<\/h3><p\b[^>]*>([^<]*)<\/p>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(trioItems, CAMERAS_PAGE.trio.items.map((item) => [escaped(item.title[lang]), escaped(item.text[lang])]), `${where} : 3 h3 du trio`);
  assert.equal(trio.match(/<h3[\s>]/g)?.length, 3, `${where} : h3 du trio`);
  assert.ok(!/<a\b|<svg\b|<img\b/.test(trio), `${where} : lien, picto ou image dans le trio`);
  // Tuile grue : sombre sur photo, sur-titre, h2, texte ; bloc non cliquable, un seul lien (story 3.4).
  const tileTag = tile.match(/^<section\b[^>]*>/)[0];
  assert.equal(attr(tileTag, 'data-surface'), 'photo', `${where} : data-surface de la tuile`);
  assert.equal(attr(tileTag, 'aria-labelledby'), 'tile-title', `${where} : aria-labelledby de la tuile`);
  assert.match(attr(tileTag, 'style') ?? '', /--tile-bg: var\(--color-tile-night\)/, `${where} : fond tile-night`);
  assert.match(attr(tileTag, 'style') ?? '', /--tile-scrim: var\(--scrim-crane\)/, `${where} : scrim-crane`);
  const content = tile.match(/<div class="content reveal"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.equal(content.match(/^<p class="eyebrow"[^>]*>([^<]*)<\/p>/)?.[1], escaped(CAMERAS_PAGE.tile.eyebrow[lang]), `${where} : sur-titre`);
  assert.equal(content.match(/<h2 id="tile-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(CAMERAS_PAGE.tile.title[lang]), `${where} : h2 de la tuile`);
  assert.equal(content.match(/<p class="text"[^>]*>([^<]*)<\/p>/)?.[1], escaped(CAMERAS_PAGE.tile.text[lang]), `${where} : texte de la tuile`);
  // Story 3.4 (FR23) : `contractors` actif, donc un lien « לפרטים › » (ton photo) vers Entrepreneurs, avant la photo.
  const tileLinks = [...tile.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(tileLinks.length, 1, `${where} : liens de la tuile`);
  assertTextLink(tileLinks[0], PAGE_HREFS.contractors[lang], escaped(dict['action.details']), undefined, undefined, `${where} : tuile vers Entrepreneurs`);
  assert.match(tileLinks[0][1], /\sclass="text-link photo"/, `${where} : ton photo du lien de tuile`);
  assert.ok(tile.indexOf(tileLinks[0][0]) < tile.indexOf('<picture'), `${where} : lien hors de l'image`);
  assert.match(tile, /<img\b[^>]*\sclass="photo parallax"/, `${where} : photo de la grue en parallaxe`);
  // Étapes : h2, puis <ol role="list"> de 4 <li> : numéro aria-hidden, h3 et texte lus dans i18n.
  assert.match(steps, /^<section class="steps reveal" aria-labelledby="steps-title"[\s>]/, `${where} : étapes`);
  assert.equal(steps.match(/<h2 id="steps-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(dict['steps.title']), `${where} : h2 des étapes`);
  const ol = steps.match(/<ol\b([^>]*)>([\s\S]*?)<\/ol>/);
  assert.equal(attr(`<ol${ol?.[1]}>`, 'role'), 'list', `${where} : ol role=list`);
  const items = [...(ol?.[2] ?? '').matchAll(/<li\b[^>]*><span class="number" aria-hidden="true"[^>]*>(\d)<\/span><h3\b[^>]*>([^<]*)<\/h3><p\b[^>]*>([^<]*)<\/p><\/li>/g)].map((m) => m.slice(1));
  assert.deepEqual(items, STEP_KEYS.map((key, i) => [String(i + 1), escaped(dict[`steps.${key}.title`]), escaped(dict[`steps.${key}.text`])]), `${where} : 4 étapes`);
  assert.equal((ol?.[2] ?? '').match(/<li[\s>]/g)?.length, 4, `${where} : <li> des étapes`);
  // Bloc contact : WhatsApp avec le service, « Laisser ses coordonnées » vers Contact avec ?service=cameras.
  const bandLinks = [...band.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(bandLinks.length, 4, `${where} : liens du bloc`);
  assertTextLink(bandLinks[2], wa, dict['action.whatsapp'], 'whatsapp_click', 'contact_band', `${where} : bloc WhatsApp`);
  assertTextLink(bandLinks[3], quote, escaped(dict['contact-band.leave-details']), undefined, undefined, `${where} : bloc leave-details`);
  assert.ok(decodeURIComponent(wa).includes(serviceLabel('cameras', 'he')), `${where} : service dans le message`);
  // CSS servie : mouvement au défilement seulement sous @supports (animation-timeline: view()).
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(([, href]) => readFileSync(join(out, href), 'utf8'));
  css.push(...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]));
  const all = css.join('\n');
  const supports = [...all.matchAll(/@supports \(animation-timeline: ?view\(\)\)\s*\{/g)];
  assert.ok(supports.length >= 2, `${where} : blocs @supports (animation-timeline: view())`);
  assert.ok(!/animation-timeline: ?view\(\)/.test(all.replace(/@supports \(animation-timeline: ?view\(\)\)\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, '')), `${where} : animation-timeline hors @supports`);
  const supported = supports.map((m) => all.slice(m.index, m.index + 2000)).join('\n');
  // Le minifieur abrège les plages (`entry 0% entry 45%` → `entry entry 45%`, `cover 0% cover 100%` → `cover`).
  assert.match(supported, /\.reveal\s*\{[^}]*animation-timeline: ?view\(\);[^}]*animation-range: ?entry(?: 0%)? entry 45%/, `${where} : .reveal`);
  assert.match(supported, /\.parallax[^{]*\{[^}]*animation:[^;}]*tile-drift[^}]*animation-range: ?cover(?: 0% cover 100%)?[;}]/, `${where} : parallaxe`);
  assert.match(supported, /img\.parallax[^{]*\{\s*animation-timeline: ?view\(\)/, `${where} : timeline de la parallaxe`);
  // Cadre de la photo de tuile en overflow: clip (hidden en ferait la source de view() : parallaxe figée).
  const tileCid = tileTag.match(/\s(data-astro-cid-[\w-]+)/)?.[1];
  assert.ok(tileCid, `${where} : scope CSS de la tuile`);
  const media = all.match(new RegExp(`\\.media\\[${tileCid}\\]\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  assert.match(media, /overflow: ?clip/, `${where} : .media de la tuile en overflow: clip`);
  assert.ok(!/overflow: ?hidden/.test(media), `${where} : .media de la tuile en overflow: hidden`);
  // Jamais `view()` replié dans le raccourci `animation` (rejeté en entier par les navigateurs).
  assert.ok(!/animation:[^;}]*view\(\)/.test(all), `${where} : view() dans le raccourci animation`);
  assert.ok(!html.includes('data-umami'), `${where} : data-umami-*`);
}

/** Story 3.2 : contenu de src/content/pages/smoke-detectors.yaml (bloc `service`). */
const SMOKE_PAGE = parse(readFileSync(join(ROOT, 'src/content/pages/smoke-detectors.yaml'), 'utf8')).service;

/**
 * Correctif 3.1 (D4, recette) : sous 960px, le ratio du héros clair est porté par la photo (16:9, puis le ratio
 * mobile sous 700px), jamais par le cadre. Un `aspect-ratio` sur `.frame` (élément flex centré en largeur 100 %)
 * faisait calculer à WebKit sa hauteur sur la largeur de l'écran : bande vide sous la photo sur iPhone.
 */
function assertHeroLightFrameCss(html, out, where) {
  const flat = servedCss(html, out).replace(/\s+/g, '');
  const cid = html.match(/<div class="frame"[^>]*\s(data-astro-cid-[\w-]+)/)?.[1];
  assert.ok(cid, `${where} : scope CSS du cadre`);
  const frame = `\\.frame\\[${cid}\\]`;
  assert.ok(!new RegExp(`${frame}\\{[^}]*aspect-ratio`).test(flat), `${where} : aspect-ratio sur le cadre du héros clair`);
  // Le minifieur fusionne les sélecteurs de même déclaration (`.frame,.frame picture{block-size:auto}`).
  assert.match(flat, new RegExp(`@media\\(width<960px\\)\\{${frame}(?:,${frame}picture)?\\{block-size:auto\\}[^@]*?${frame}\\.photo\\{block-size:auto;aspect-ratio:var\\(--photo-ratio-tablet\\)\\}\\}`), `${where} : ratio 16:9 porté par la photo sous 960px`);
  assert.match(flat, new RegExp(`@media\\(width<700px\\)\\{${frame}\\.photo\\{aspect-ratio:var\\(--hero-mobile-ratio,var\\(--photo-ratio-portrait\\)\\)\\}\\}`), `${where} : ratio mobile porté par la photo sous 700px`);
}

/**
 * Correctif 3.1 (D5, recette) : sous 700px, la grue est servie depuis le recadrage téléphone crane-mast-portrait.jpg
 * (mât et cabine) et sa parallaxe est plus douce (jetons --drift-*-mobile).
 */
function assertCraneMobile(picture, html, out, where) {
  assert.match(picture, /<source media="\(width < 700px\)" type="image\/avif" srcset="[^"]*\/crane-mast-portrait\.[^"]*"/, `${where} : source téléphone crane-mast-portrait`);
  const flat = servedCss(html, out).replace(/\s+/g, '');
  assert.match(flat, /@media\(width<700px\)\{\.media\[data-astro-cid-[\w-]+\]\.parallax\{--drift-from:var\(--drift-from-mobile\);--drift-to:var\(--drift-to-mobile\);--drift-scale:var\(--drift-scale-mobile\)\}\}/, `${where} : parallaxe douce sous 700px`);
}

/** CSS servie par une page : feuilles liées puis <style> inline. */
function servedCss(html, out) {
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(([, href]) => readFileSync(join(out, href), 'utf8'));
  css.push(...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]));
  return css.join('\n');
}

/** Story 3.2 (FR3, FR21, FR22, FR31, NFR7, UX-DR14, UX-DR17, UX-DR20, UX-DR34, UX-DR37, UX-DR38) : page Détecteurs en `lang`. */
function assertSmokeDetectors(html, lang, out) {
  const where = `smoke-detectors (${lang})`;
  const dict = I18N[lang];
  const tel = 'tel:+972509565669';
  const wa = waHref({ serviceHe: serviceLabel('smoke-detectors', 'he') });
  const quote = `${PAGE_HREFS.contact[lang]}?service=smoke-detectors`;
  const main = html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  // Ordre de <main> : héros clair illustré, trio, étapes, bloc contact ; pas de tuile.
  const sections = [...main.matchAll(/<section class="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ['hero', 'trio reveal', 'steps reveal', 'band'], `${where} : sections de <main>`);
  assert.match(main, /^<section class="hero"/, `${where} : héros en tête`);
  const sectionAt = (cls) => main.match(new RegExp(`<section class="${cls}"[\\s\\S]*?</section>`))?.[0] ?? '';
  const [hero, trio, steps, band] = sections.map(sectionAt);
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${where} : <h1>`);
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1, `${where} : premier titre ${levels}`);
  levels.forEach((level, i) => assert.ok(i === 0 || level <= levels[i - 1] + 1, `${where} : saut de titre ${levels}`));
  // Héros clair : h1, sous-titre, Appeler › WhatsApp › Devis › (ton clair).
  assert.match(hero, /^<section class="hero" aria-labelledby="hero-title"[\s>]/, `${where} : héros`);
  assert.ok(!/\sdata-surface=/.test(hero.match(/^<section\b[^>]*>/)[0]), `${where} : héros clair sans data-surface`);
  assert.equal(hero.match(/<h1 id="hero-title"[^>]*>([^<]*)<\/h1>/)?.[1], escaped(SMOKE_PAGE.hero.title[lang]), `${where} : h1`);
  assert.equal(hero.match(/<p class="subtitle"[^>]*>([^<]*)<\/p>/)?.[1], escaped(SMOKE_PAGE.hero.subtitle[lang]), `${where} : sous-titre`);
  const heroLinks = [...hero.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(heroLinks.length, 3, `${where} : liens du héros`);
  assertTextLink(heroLinks[0], tel, dict['action.call'], 'call_click', 'hero', `${where} : héros Appeler`);
  assertTextLink(heroLinks[1], wa, dict['action.whatsapp'], 'whatsapp_click', 'hero', `${where} : héros WhatsApp`);
  assertTextLink(heroLinks[2], quote, escaped(dict['action.quote']), undefined, undefined, `${where} : héros Devis`);
  for (const [, attrs] of heroLinks) assert.match(attrs, /\sclass="text-link light"/, `${where} : ton clair`);
  // Aucune photo : pas de <picture>, seul <img> = logo, rien de prioritaire.
  assert.ok(!/<picture[\s>]/.test(html), `${where} : <picture>`);
  assert.equal(html.match(/<img\b/g)?.length, 1, `${where} : <img> (logo seul)`);
  assert.ok(!html.includes('fetchpriority'), `${where} : fetchpriority`);
  // Détecteur illustré dans le héros, après les liens : décoratif, taille lg, qui monte, avec grille et LED.
  const detectors = html.match(/<div class="detector\b[^"]*"[^>]*>/g) ?? [];
  assert.equal(detectors.length, 1, `${where} : détecteur`);
  assert.ok(hero.includes(detectors[0]), `${where} : détecteur hors du héros`);
  assert.equal(attr(detectors[0], 'class'), 'detector lg rise', `${where} : classes du détecteur`);
  assert.equal(attr(detectors[0], 'aria-hidden'), 'true', `${where} : aria-hidden du détecteur`);
  assert.ok(hero.indexOf(detectors[0]) > hero.lastIndexOf('</a>'), `${where} : détecteur après les liens`);
  const detector = hero.slice(hero.indexOf(detectors[0]));
  assert.match(detector, /^<div class="detector[^>]*><div class="grille"[^>]*><div class="led"[^>]*><\/div><\/div><\/div>/, `${where} : grille et LED`);
  // Parent direct du détecteur : le conteneur d'illustration du héros (à la place du cadre photo).
  assert.match(hero, new RegExp(`<div class="illustration"[^>]*>${detectors[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${where} : détecteur hors de .illustration`);
  // Trio : h2 puis 3 h3 (YAML), aucun lien.
  assert.match(trio, /^<section class="trio reveal" aria-labelledby="trio-title"[\s>]/, `${where} : trio`);
  assert.equal(trio.match(/<h2 id="trio-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(SMOKE_PAGE.trio.title[lang]), `${where} : h2 du trio`);
  const trioItems = [...trio.matchAll(/<h3\b[^>]*>([^<]*)<\/h3><p\b[^>]*>([^<]*)<\/p>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(trioItems, SMOKE_PAGE.trio.items.map((item) => [escaped(item.title[lang]), escaped(item.text[lang])]), `${where} : 3 h3 du trio`);
  assert.ok(!/<a\b|<svg\b|<img\b/.test(trio), `${where} : lien, picto ou image dans le trio`);
  // Étapes : i18n.
  assert.equal(steps.match(/<h2 id="steps-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(dict['steps.title']), `${where} : h2 des étapes`);
  const ol = steps.match(/<ol\b([^>]*)>([\s\S]*?)<\/ol>/);
  const items = [...(ol?.[2] ?? '').matchAll(/<li\b[^>]*><span class="number" aria-hidden="true"[^>]*>(\d)<\/span><h3\b[^>]*>([^<]*)<\/h3><p\b[^>]*>([^<]*)<\/p><\/li>/g)].map((m) => m.slice(1));
  assert.deepEqual(items, STEP_KEYS.map((key, i) => [String(i + 1), escaped(dict[`steps.${key}.title`]), escaped(dict[`steps.${key}.text`])]), `${where} : 4 étapes`);
  // Bloc contact : WhatsApp avec « גלאי עשן », « Laisser ses coordonnées » vers Contact avec ?service=smoke-detectors.
  const bandLinks = [...band.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(bandLinks.length, 4, `${where} : liens du bloc`);
  assertTextLink(bandLinks[2], wa, dict['action.whatsapp'], 'whatsapp_click', 'contact_band', `${where} : bloc WhatsApp`);
  assertTextLink(bandLinks[3], quote, escaped(dict['contact-band.leave-details']), undefined, undefined, `${where} : bloc leave-details`);
  assert.ok(decodeURIComponent(wa).includes('גלאי עשן'), `${where} : service dans le message`);
  // CSS servie (UX-DR34, UX-DR38) : seule ombre = jetons --shadow-detector-* ; LED en 2 pulsations, jamais en boucle.
  const all = servedCss(html, out);
  const shadows = [...all.replace(/--[\w-]+:[^;}]*/g, '').matchAll(/box-shadow:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(shadows.length >= 1, `${where} : box-shadow du détecteur`);
  for (const value of shadows) assert.match(value, /^var\(--shadow-detector-(?:lg|md|sm)\)$/, `${where} : box-shadow ${value}`);
  assert.ok(!/\binfinite\b/.test(all), `${where} : animation infinite`);
  const led = all.match(/\.led\[[^\]]*\]\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(led, /animation:[^;}]*led-pulse[^;}]*var\(--led-pulse-count\)/, `${where} : animation de la LED`);
  // La LED attend la fin de la montée : délai = délai + durée de la montée, porté par .rise et lu par .led.
  assert.match(led, /animation:[^;}]*var\(--led-delay/, `${where} : délai de la LED`);
  const riseRule = all.match(/\.rise\[[^\]]*\]\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(riseRule, /--led-delay:\s*calc\(\s*var\(--detector-rise-delay\)\s*\+\s*var\(--detector-rise-duration\)\s*\)/, `${where} : --led-delay de .rise`);
  // Espacements du héros illustré (canvas Smoke.dc.html : 72px au-dessus, 112px en bas).
  const illustration = all.match(/\.illustration\[[^\]]*\]\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(illustration, /var\(--hero-light-illustration-gap\)/, `${where} : marge haute de l'illustration`);
  assert.match(illustration, /var\(--hero-light-illustration-pad-end\)/, `${where} : padding bas de l'illustration`);
  // Mouvement réduit (règle globale de base.css : animation: none) : l'état au repos est l'état final,
  // détecteur en place et LED allumée — ni opacité, ni transform, ni fill-mode hors des @keyframes.
  for (const cls of ['detector', 'led']) {
    const rule = all.match(new RegExp(`\\.${cls}\\[[^\\]]*\\]\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    assert.ok(rule, `${where} : règle .${cls}`);
    assert.ok(!/(?:^|;)\s*(?:opacity|transform)\s*:/.test(rule), `${where} : .${cls} déplacé ou estompé au repos`);
    assert.ok(!/\b(?:both|forwards|backwards)\b/.test(rule), `${where} : fill-mode sur .${cls}`);
  }
  const token = (name) => all.match(new RegExp(`${name}:\\s*([^;}]+)`))?.[1]?.trim();
  assert.equal(token('--led-pulse-count'), '2', `${where} : 2 pulsations`);
  assert.equal(token('--led-pulse-duration'), '2.4s', `${where} : pulsation de 2,4 s`);
  assert.deepEqual(['lg', 'md', 'sm'].map((s) => token(`--detector-size-${s}`)), ['380px', '260px', '150px'], `${where} : tailles du détecteur`);
  assert.match(all, /\.rise\[[^\]]*\]\s*\{[^}]*animation:[^;}]*detector-rise[^;}]*var\(--detector-rise-duration\)[^;}]*var\(--detector-rise-delay\)/, `${where} : montée du détecteur`);
  assert.ok(!html.includes('data-umami'), `${where} : data-umami-*`);
}

/** Story 3.3 : contenu de src/content/pages/{smart-home,intercom}.yaml (bloc `service`). */
const SMART_PAGE = parse(readFileSync(join(ROOT, 'src/content/pages/smart-home.yaml'), 'utf8')).service;
const INTERCOM_PAGE = parse(readFileSync(join(ROOT, 'src/content/pages/intercom.yaml'), 'utf8')).service;

/**
 * Story 3.3 (FR4, FR6, FR21, FR22, FR23, FR31, NFR4, UX-DR8, UX-DR14, UX-DR17, UX-DR18, UX-DR20, UX-DR21, UX-DR37) :
 * page service à héros clair photo, cadre 4:3 sous 700px (Maison connectée, Interphone) ; `tile` : tuile immeuble.
 */
function assertPhotoService(html, lang, out, { id, content, focus, tile: withTile }) {
  const where = `${id} (${lang})`;
  const dict = I18N[lang];
  const tel = 'tel:+972509565669';
  const wa = waHref({ serviceHe: serviceLabel(id, 'he') });
  const quote = `${PAGE_HREFS.contact[lang]}?service=${id}`;
  const main = html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  // Ordre de <main> : héros clair, trio, (tuile immeuble), étapes, bloc contact ; rien d'autre.
  const sections = [...main.matchAll(/<section class="([^"]*)"/g)].map((m) => m[1]);
  const expected = withTile ? ['hero', 'trio reveal', 'tile dark building', 'steps reveal', 'band'] : ['hero', 'trio reveal', 'steps reveal', 'band'];
  assert.deepEqual(sections, expected, `${where} : sections de <main>`);
  assert.match(main, /^<section class="hero"/, `${where} : héros en tête`);
  const sectionAt = (cls) => main.match(new RegExp(`<section class="${cls}"[\\s\\S]*?</section>`))?.[0] ?? '';
  const [hero, trio] = [sectionAt('hero'), sectionAt('trio reveal')];
  const [steps, band] = [sectionAt('steps reveal'), sectionAt('band')];
  const tile = withTile ? sectionAt('tile dark building') : '';
  // Titres : un seul h1, aucun saut de niveau (footer compris).
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${where} : <h1>`);
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1, `${where} : premier titre ${levels}`);
  levels.forEach((level, i) => assert.ok(i === 0 || level <= levels[i - 1] + 1, `${where} : saut de titre ${levels}`));
  // Héros clair : h1, sous-titre, Appeler › WhatsApp › Devis › (ton clair).
  assert.match(hero, /^<section class="hero" aria-labelledby="hero-title"[\s>]/, `${where} : héros`);
  assert.ok(!/\sdata-surface=/.test(hero.match(/^<section\b[^>]*>/)[0]), `${where} : héros clair sans data-surface`);
  assert.equal(hero.match(/<h1 id="hero-title"[^>]*>([^<]*)<\/h1>/)?.[1], escaped(content.hero.title[lang]), `${where} : h1`);
  assert.equal(hero.match(/<p class="subtitle"[^>]*>([^<]*)<\/p>/)?.[1], escaped(content.hero.subtitle[lang]), `${where} : sous-titre`);
  const heroLinks = [...hero.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(heroLinks.length, 3, `${where} : liens du héros`);
  assertTextLink(heroLinks[0], tel, dict['action.call'], 'call_click', 'hero', `${where} : héros Appeler`);
  assertTextLink(heroLinks[1], wa, dict['action.whatsapp'], 'whatsapp_click', 'hero', `${where} : héros WhatsApp`);
  assertTextLink(heroLinks[2], quote, escaped(dict['action.quote']), undefined, undefined, `${where} : héros Devis`);
  for (const [, attrs] of heroLinks) assert.match(attrs, /\sclass="text-link light"/, `${where} : ton clair`);
  // Cadre du héros : point focal de la photo, ratio 4:3 sous 700px (jeton), lu par la règle .frame.
  const frame = hero.match(/<div class="frame"[^>]*>/)?.[0] ?? '';
  assert.equal(attr(frame, 'style'), `--photo-position: var(--photo-focus-${focus}); --hero-mobile-ratio: var(--photo-ratio-mobile-landscape)`, `${where} : style du cadre`);
  const all = servedCss(html, out);
  assertHeroLightFrameCss(html, out, where);
  const token = (name) => all.match(new RegExp(`${name}:\\s*([^;}]+)`))?.[1]?.trim();
  assert.equal(token('--photo-ratio-mobile-landscape'), '4 / 3', `${where} : jeton 4:3`);
  // Photos : héros (seule eager/high, recadrage mobile 4:3) et, sur Interphone, l'immeuble de la tuile (lazy, 4:5).
  const pictures = html.match(/<picture>[\s\S]*?<\/picture>/g) ?? [];
  assert.equal(pictures.length, withTile ? 2 : 1, `${where} : <picture>`);
  assert.ok(hero.includes(pictures[0]), `${where} : <picture> hors du héros`);
  assert.equal(html.match(/<img\b/g)?.length, withTile ? 3 : 2, `${where} : <img> (logo + photos)`);
  assert.equal(html.match(/\sfetchpriority="high"/g)?.length, 1, `${where} : une seule image prioritaire`);
  assertServicePicture(pictures[0], { alt: content.hero.alt[lang], sizes: 'min(1180px, calc(100vw - 44px))', land: ['2560', '1280'], portrait: ['1440', '1080'], priority: true, budgets: { land: 250_000, portrait: 120_000 } }, out, `${where} : héros`);
  // Trio : h2 puis 3 h3 (YAML), aucun lien.
  assert.match(trio, /^<section class="trio reveal" aria-labelledby="trio-title"[\s>]/, `${where} : trio`);
  assert.equal(trio.match(/<h2 id="trio-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(content.trio.title[lang]), `${where} : h2 du trio`);
  const trioItems = [...trio.matchAll(/<h3\b[^>]*>([^<]*)<\/h3><p\b[^>]*>([^<]*)<\/p>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(trioItems, content.trio.items.map((item) => [escaped(item.title[lang]), escaped(item.text[lang])]), `${where} : 3 h3 du trio`);
  assert.equal(trio.match(/<h3[\s>]/g)?.length, 3, `${where} : h3 du trio`);
  assert.ok(!/<a\b|<svg\b|<img\b/.test(trio), `${where} : lien, picto ou image dans le trio`);
  if (withTile) {
    // Tuile immeuble : sombre sur photo navy-deep, scrim-tile, focus immeuble ; sur-titre, h2, texte ; un seul lien.
    assert.ok(main.indexOf(trio) < main.indexOf(tile) && main.indexOf(tile) < main.indexOf(steps), `${where} : tuile entre trio et étapes`);
    const tileTag = tile.match(/^<section\b[^>]*>/)[0];
    assert.equal(attr(tileTag, 'data-surface'), 'photo', `${where} : data-surface de la tuile`);
    assert.equal(attr(tileTag, 'aria-labelledby'), 'tile-title', `${where} : aria-labelledby de la tuile`);
    const style = attr(tileTag, 'style') ?? '';
    assert.match(style, /--photo-position: var\(--photo-focus-building\)/, `${where} : focus de l'immeuble`);
    assert.match(style, /--tile-bg: var\(--color-navy-deep\)/, `${where} : fond navy-deep`);
    assert.match(style, /--tile-scrim: var\(--scrim-tile\)/, `${where} : scrim-tile`);
    const tileContent = tile.match(/<div class="content reveal"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    assert.equal(tileContent.match(/^<p class="eyebrow"[^>]*>([^<]*)<\/p>/)?.[1], escaped(content.tile.eyebrow[lang]), `${where} : sur-titre`);
    assert.equal(tileContent.match(/<h2 id="tile-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(content.tile.title[lang]), `${where} : h2 de la tuile`);
    assert.equal(tileContent.match(/<p class="text"[^>]*>([^<]*)<\/p>/)?.[1], escaped(content.tile.text[lang]), `${where} : texte de la tuile`);
    const tileLinks = [...tile.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    assert.equal(tileLinks.length, 1, `${where} : liens de la tuile`);
    assertTextLink(tileLinks[0], quote, escaped(dict['action.site-visit']), undefined, undefined, `${where} : tuile visite technique`);
    assert.match(tileLinks[0][1], /\sclass="text-link photo"/, `${where} : ton photo du lien de tuile`);
    assert.ok(tile.indexOf(tileLinks[0][0]) < tile.indexOf('<picture'), `${where} : lien hors de l'image`);
    assert.ok(tile.includes(pictures[1]), `${where} : <picture> hors de la tuile`);
    assert.match(tile, /<img\b[^>]*\sclass="photo zoom"/, `${where} : photo de l'immeuble en dézoom`);
    assertServicePicture(pictures[1], { alt: content.tile.alt[lang], sizes: 'calc(100vw - 24px)', land: ['2560', '1280'], portrait: ['1440', '1800'], priority: false, budgets: { land: 180_000, portrait: 180_000 } }, out, `${where} : immeuble`);
    // Hauteurs minimales de la tuile : 620px, 560px sous 960px, 520px sous 700px (jetons).
    const building = [...all.matchAll(/\.building\[[^\]]*\]\s*\{([^}]*)\}/g)].map((m) => m[1]).join('\n');
    for (const name of ['--tile-building-min', '--tile-building-min-tablet', '--tile-building-min-mobile']) {
      assert.match(building, new RegExp(`min-block-size: ?var\\(${name}\\)`), `${where} : .building avec ${name}`);
    }
    assert.deepEqual(['', '-tablet', '-mobile'].map((s) => token(`--tile-building-min${s}`)), ['620px', '560px', '520px'], `${where} : jetons de la tuile immeuble`);
    assert.equal(token('--photo-focus-building'), 'center 70%', `${where} : jeton focus immeuble`);
  } else {
    assert.ok(!/<section class="tile\b/.test(main), `${where} : tuile`);
  }
  assert.equal(token(`--photo-focus-${focus}`), focus === 'switch' ? 'center 50%' : 'center 55%', `${where} : jeton focus du héros`);
  // Étapes : h2, puis <ol role="list"> de 4 <li> lus dans i18n.
  assert.match(steps, /^<section class="steps reveal" aria-labelledby="steps-title"[\s>]/, `${where} : étapes`);
  assert.equal(steps.match(/<h2 id="steps-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(dict['steps.title']), `${where} : h2 des étapes`);
  const ol = steps.match(/<ol\b([^>]*)>([\s\S]*?)<\/ol>/);
  assert.equal(attr(`<ol${ol?.[1]}>`, 'role'), 'list', `${where} : ol role=list`);
  const items = [...(ol?.[2] ?? '').matchAll(/<li\b[^>]*><span class="number" aria-hidden="true"[^>]*>(\d)<\/span><h3\b[^>]*>([^<]*)<\/h3><p\b[^>]*>([^<]*)<\/p><\/li>/g)].map((m) => m.slice(1));
  assert.deepEqual(items, STEP_KEYS.map((key, i) => [String(i + 1), escaped(dict[`steps.${key}.title`]), escaped(dict[`steps.${key}.text`])]), `${where} : 4 étapes`);
  // Bloc contact : WhatsApp avec le libellé hébreu du service, « Laisser ses coordonnées » vers Contact ?service={id}.
  const bandLinks = [...band.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(bandLinks.length, 4, `${where} : liens du bloc`);
  assertTextLink(bandLinks[2], wa, dict['action.whatsapp'], 'whatsapp_click', 'contact_band', `${where} : bloc WhatsApp`);
  assertTextLink(bandLinks[3], quote, escaped(dict['contact-band.leave-details']), undefined, undefined, `${where} : bloc leave-details`);
  assert.ok(decodeURIComponent(wa).includes(serviceLabel(id, 'he')), `${where} : service dans le message`);
  assert.ok(!html.includes('data-umami'), `${where} : data-umami-*`);
}

/** Story 3.3 (FR4) : page Maison connectée en `lang`. */
function assertSmartHome(html, lang, out) {
  assertPhotoService(html, lang, out, { id: 'smart-home', content: SMART_PAGE, focus: 'switch', tile: false });
}

/** Story 3.3 (FR6) : page Interphone en `lang`, avec la tuile immeuble. */
function assertIntercom(html, lang, out) {
  assertPhotoService(html, lang, out, { id: 'intercom', content: INTERCOM_PAGE, focus: 'intercom', tile: true });
}

/** Story 3.4 : contenu de src/content/pages/{networks,contractors}.yaml (bloc `service`). */
const NETWORKS_PAGE = parse(readFileSync(join(ROOT, 'src/content/pages/networks.yaml'), 'utf8')).service;
const CONTRACTORS_PAGE = parse(readFileSync(join(ROOT, 'src/content/pages/contractors.yaml'), 'utf8')).service;

/**
 * Story 3.4 (FR5, FR7, FR21, FR22, FR23, FR31, NFR4, UX-DR5, UX-DR13, UX-DR17, UX-DR18, UX-DR20, UX-DR21, UX-DR36) :
 * page service à héros photo sombre plein cadre (HeroPhoto.astro en variante) : Réseaux, Entrepreneurs (`tile`).
 */
function assertCoverService(html, lang, out, { id, service, content, focus, scrim, size, quoteKey, eyebrow, land, tile: withTile }) {
  const where = `${id} (${lang})`;
  const dict = I18N[lang];
  const tel = 'tel:+972509565669';
  const wa = waHref({ serviceHe: serviceLabel(service, 'he') });
  const quote = `${PAGE_HREFS.contact[lang]}?service=${service}`;
  const main = html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  // Ordre de <main> : héros sombre, trio, (tuile immeuble), étapes, bloc contact ; rien d'autre.
  const sections = [...main.matchAll(/<section class="([^"]*)"/g)].map((m) => m[1]);
  const expected = withTile ? ['hero', 'trio reveal', 'tile dark building', 'steps reveal', 'band'] : ['hero', 'trio reveal', 'steps reveal', 'band'];
  assert.deepEqual(sections, expected, `${where} : sections de <main>`);
  const sectionAt = (cls) => main.match(new RegExp(`<section class="${cls}"[\\s\\S]*?</section>`))?.[0] ?? '';
  const [hero, trio, steps, band] = [sectionAt('hero'), sectionAt('trio reveal'), sectionAt('steps reveal'), sectionAt('band')];
  const tile = withTile ? sectionAt('tile dark building') : '';
  assert.ok(main.startsWith(hero), `${where} : héros en tête`);
  // Titres : un seul h1, aucun saut de niveau (footer compris).
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${where} : <h1>`);
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1, `${where} : premier titre ${levels}`);
  levels.forEach((level, i) => assert.ok(i === 0 || level <= levels[i - 1] + 1, `${where} : saut de titre ${levels}`));
  // Héros sombre : surface photo, variante en style inline (point focal, scrim, hauteur).
  const heroTag = hero.match(/^<section\b[^>]*>/)?.[0] ?? '';
  assert.match(heroTag, /^<section class="hero" aria-labelledby="hero-title" data-surface="photo"[\s>]/, `${where} : héros sombre`);
  assert.equal(attr(heroTag, 'style'), `--photo-position: var(--photo-focus-${focus}); --hero-scrim: var(--scrim-${scrim}); --hero-min: var(--hero-photo-min-${size})`, `${where} : variante du héros`);
  const heroContent = hero.match(/<div class="content"[^>]*>([\s\S]*)<\/div><\/section>$/)?.[1] ?? '';
  if (eyebrow) {
    // Sur-titre avant le h1, premier élément du bloc de texte.
    assert.equal(heroContent.match(/^<p class="eyebrow"[^>]*>([^<]*)<\/p><h1\b/)?.[1], escaped(content.hero.eyebrow[lang]), `${where} : sur-titre avant le h1`);
  } else {
    assert.ok(!hero.includes('class="eyebrow"'), `${where} : sur-titre`);
    assert.match(heroContent, /^<h1\b/, `${where} : h1 en tête du bloc`);
  }
  const h1 = hero.match(/<h1 id="hero-title"([^>]*)>([^<]*)<\/h1>/);
  assert.equal(h1?.[2], escaped(content.hero.title[lang]), `${where} : h1`);
  assert.equal(attr(`<h1${h1?.[1]}>`, 'class'), 'title page', `${where} : h1 en page-title`);
  assert.equal(hero.match(/<p class="subtitle"[^>]*>([^<]*)<\/p>/)?.[1], escaped(content.hero.subtitle[lang]), `${where} : sous-titre`);
  const heroLinks = [...hero.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(heroLinks.length, 3, `${where} : liens du héros`);
  assertTextLink(heroLinks[0], tel, dict['action.call'], 'call_click', 'hero', `${where} : héros Appeler`);
  assertTextLink(heroLinks[1], wa, dict['action.whatsapp'], 'whatsapp_click', 'hero', `${where} : héros WhatsApp`);
  assertTextLink(heroLinks[2], quote, escaped(dict[quoteKey]), undefined, undefined, `${where} : héros Devis`);
  for (const [, attrs] of heroLinks) assert.match(attrs, /\sclass="text-link photo"/, `${where} : ton photo`);
  assert.ok(decodeURIComponent(wa).includes(serviceLabel(service, 'he')), `${where} : service dans le message`);
  // Photos : héros plein cadre (seule eager/high) et, sur Entrepreneurs, l'immeuble de la tuile (lazy).
  const pictures = html.match(/<picture>[\s\S]*?<\/picture>/g) ?? [];
  assert.equal(pictures.length, withTile ? 2 : 1, `${where} : <picture>`);
  assert.ok(hero.includes(pictures[0]), `${where} : <picture> hors du héros`);
  assert.equal(html.match(/<img\b/g)?.length, withTile ? 3 : 2, `${where} : <img> (logo + photos)`);
  assert.equal(html.match(/\sfetchpriority="high"/g)?.length, 1, `${where} : une seule image prioritaire`);
  assertServicePicture(pictures[0], { alt: content.hero.alt[lang], sizes: '100vw', land, portrait: ['1440', '1800'], priority: true, budgets: { land: 250_000, portrait: 120_000 } }, out, `${where} : héros`);
  // Correctif 3.1 (D5) : le héros Entrepreneurs (grue) sert lui aussi le recadrage téléphone crane-mast-portrait.jpg.
  if (focus === 'crane') assert.match(pictures[0], /<source media="\(width < 700px\)" type="image\/avif" srcset="[^"]*\/crane-mast-portrait\.[^"]*"/, `${where} : source téléphone crane-mast-portrait`);
  // CSS servie : la variante est lue avec les valeurs de l'accueil en repli ; jetons de la story 3.4.
  const all = servedCss(html, out);
  const heroCid = heroTag.match(/\s(data-astro-cid-[\w-]+)/)?.[1];
  assert.ok(heroCid, `${where} : scope CSS du héros`);
  const rule = (sel) => [...all.matchAll(new RegExp(`(?:^|[}\\s,])\\${sel}\\[${heroCid}\\]\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
  assert.match(rule('.hero'), /min-block-size: ?var\(--hero-min, ?var\(--hero-photo-min\)\)/, `${where} : .hero lit --hero-min`);
  // Photo non chargée : le fond navy-deep du héros reste sous le texte blanc.
  assert.match(rule('.hero'), /background-color: ?var\(--color-navy-deep\)/, `${where} : fond navy-deep du héros`);
  assert.match(rule('.scrim'), /background: ?var\(--hero-scrim, ?var\(--scrim-hero\)\)/, `${where} : .scrim lit --hero-scrim`);
  assert.match(all, /object-position: ?var\(--photo-position, ?center 60%\)/, `${where} : .photo lit --photo-position`);
  // Astro scope le sélecteur composé en `.title[cid].page` (ou `.title.page[cid]` selon la version).
  const titlePage = [...all.matchAll(new RegExp(`\\.title(?:\\[${heroCid}\\])?\\.page(?:\\[${heroCid}\\])?\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
  assert.match(titlePage, /font-size: ?var\(--type-page-title-size\)/, `${where} : .title.page en page-title`);
  assert.match(rule('.eyebrow'), /color: ?var\(--color-white\)/, `${where} : .eyebrow blanc`);
  const token = (name) => all.match(new RegExp(`${name}:\\s*([^;}]+)`))?.[1]?.trim();
  assert.deepEqual(['--hero-photo-min-networks', '--hero-photo-min-contractors', '--photo-focus-network'].map(token), ['760px', '820px', 'center 60%'], `${where} : jetons de la story 3.4`);
  assert.equal(token('--photo-focus-crane'), 'center 40%', `${where} : jeton focus grue`);
  // Trio : h2 puis 3 h3 (YAML), aucun lien.
  assert.match(trio, /^<section class="trio reveal" aria-labelledby="trio-title"[\s>]/, `${where} : trio`);
  assert.equal(trio.match(/<h2 id="trio-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(content.trio.title[lang]), `${where} : h2 du trio`);
  const trioItems = [...trio.matchAll(/<h3\b[^>]*>([^<]*)<\/h3><p\b[^>]*>([^<]*)<\/p>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(trioItems, content.trio.items.map((item) => [escaped(item.title[lang]), escaped(item.text[lang])]), `${where} : 3 h3 du trio`);
  assert.ok(!/<a\b|<svg\b|<img\b/.test(trio), `${where} : lien, picto ou image dans le trio`);
  if (withTile) {
    // Tuile immeuble : navy-deep, scrim-tile, focus immeuble ; sans sur-titre ; h2, texte ; un seul lien vers Réseaux.
    assert.ok(main.indexOf(trio) < main.indexOf(tile) && main.indexOf(tile) < main.indexOf(steps), `${where} : tuile entre trio et étapes`);
    const tileTag = tile.match(/^<section\b[^>]*>/)[0];
    assert.equal(attr(tileTag, 'data-surface'), 'photo', `${where} : data-surface de la tuile`);
    assert.equal(attr(tileTag, 'aria-labelledby'), 'tile-title', `${where} : aria-labelledby de la tuile`);
    assert.equal(attr(tileTag, 'style'), '--photo-position: var(--photo-focus-building); --tile-bg: var(--color-navy-deep); --tile-scrim: var(--scrim-tile)', `${where} : style de la tuile`);
    const tileContent = tile.match(/<div class="content reveal"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    assert.ok(!tile.includes('class="eyebrow"'), `${where} : sur-titre de la tuile`);
    assert.equal(tileContent.match(/^<h2 id="tile-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(content.tile.title[lang]), `${where} : h2 de la tuile`);
    assert.equal(tileContent.match(/<p class="text"[^>]*>([^<]*)<\/p>/)?.[1], escaped(content.tile.text[lang]), `${where} : texte de la tuile`);
    const tileLinks = [...tile.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    assert.equal(tileLinks.length, 1, `${where} : liens de la tuile`);
    assertTextLink(tileLinks[0], PAGE_HREFS.networks[lang], escaped(dict['action.details']), undefined, undefined, `${where} : tuile vers Réseaux`);
    assert.match(tileLinks[0][1], /\sclass="text-link photo"/, `${where} : ton photo du lien de tuile`);
    assert.ok(tile.indexOf(tileLinks[0][0]) < tile.indexOf('<picture'), `${where} : lien hors de l'image`);
    assert.ok(tile.includes(pictures[1]), `${where} : <picture> hors de la tuile`);
    assert.match(tile, /<img\b[^>]*\sclass="photo zoom"/, `${where} : photo de l'immeuble en dézoom`);
    assertServicePicture(pictures[1], { alt: content.tile.alt[lang], sizes: 'calc(100vw - 24px)', land: ['2560', '1280'], portrait: ['1440', '1800'], priority: false, budgets: { land: 180_000, portrait: 180_000 } }, out, `${where} : immeuble`);
  } else {
    assert.ok(!/<section class="tile\b/.test(main), `${where} : tuile`);
  }
  // Étapes : h2, puis <ol role="list"> de 4 <li> lus dans i18n.
  assert.match(steps, /^<section class="steps reveal" aria-labelledby="steps-title"[\s>]/, `${where} : étapes`);
  assert.equal(steps.match(/<h2 id="steps-title"[^>]*>([^<]*)<\/h2>/)?.[1], escaped(dict['steps.title']), `${where} : h2 des étapes`);
  const ol = steps.match(/<ol\b([^>]*)>([\s\S]*?)<\/ol>/);
  assert.equal(attr(`<ol${ol?.[1]}>`, 'role'), 'list', `${where} : ol role=list`);
  const items = [...(ol?.[2] ?? '').matchAll(/<li\b[^>]*><span class="number" aria-hidden="true"[^>]*>(\d)<\/span><h3\b[^>]*>([^<]*)<\/h3><p\b[^>]*>([^<]*)<\/p><\/li>/g)].map((m) => m.slice(1));
  assert.deepEqual(items, STEP_KEYS.map((key, i) => [String(i + 1), escaped(dict[`steps.${key}.title`]), escaped(dict[`steps.${key}.text`])]), `${where} : 4 étapes`);
  // Bloc contact : WhatsApp avec le libellé hébreu du service, « Laisser ses coordonnées » vers Contact ?service=.
  const bandLinks = [...band.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(bandLinks.length, 4, `${where} : liens du bloc`);
  assertTextLink(bandLinks[2], wa, dict['action.whatsapp'], 'whatsapp_click', 'contact_band', `${where} : bloc WhatsApp`);
  assertTextLink(bandLinks[3], quote, escaped(dict['contact-band.leave-details']), undefined, undefined, `${where} : bloc leave-details`);
  assert.ok(!html.includes('data-umami'), `${where} : data-umami-*`);
}

/** Story 3.4 (FR5) : page Réseaux en `lang`. */
function assertNetworks(html, lang, out) {
  assertCoverService(html, lang, out, { id: 'networks', service: 'networks', content: NETWORKS_PAGE, focus: 'network', scrim: 'network', size: 'networks', quoteKey: 'action.quote', eyebrow: false, land: ['2560', '1344'], tile: false });
}

/** Story 3.4 (FR7) : page Pour les entrepreneurs en `lang`, avec la tuile immeuble vers Réseaux. */
function assertContractors(html, lang, out) {
  assertCoverService(html, lang, out, { id: 'contractors', service: 'crane-cameras', content: CONTRACTORS_PAGE, focus: 'crane', scrim: 'crane', size: 'contractors', quoteKey: 'action.quote-site', eyebrow: true, land: ['2560', '1164'], tile: true });
}

/** Story 4.1 (FR9, FR29, FR31, NFR2, UX-DR15, UX-DR22, D5, D7) : page ville `cid` en `lang`. */
const SERVICE_ROWS = ['cameras', 'smoke-detectors', 'intercom', 'smart-home', 'networks'];
const REGIONS = Object.fromEntries(
  ['jerusalem-area', 'center-shfela'].map((rid) => [rid, parse(readFileSync(join(ROOT, `src/content/regions/${rid}.yaml`), 'utf8'))]),
);
function assertCity(html, cid, lang) {
  const id = `city:${cid}`;
  const where = `${id} (${lang})`;
  const dict = I18N[lang];
  const data = CITY_DATA[cid];
  const name = data.name[lang];
  const main = (html.match(/<main id="content"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '').replace(/ data-astro-cid-[\w-]+(?:="")?/g, '');
  // Un seul h1 (nom de la ville en city-title), pas de saut de titre (h1, h2, h2, h2 + h3 des étapes, h2 du bloc).
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${where} : <h1>`);
  const levels = [...main.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  assert.deepEqual(levels, [1, 2, 2, 2, 3, 3, 3, 3, 2], `${where} : niveaux de titres`);
  // Ordre : héros typographique, « ce qu'on installe », localités, étapes, bloc contact ; pas de section avis.
  const sections = [...main.matchAll(/<section class="([^"]*)" aria-labelledby="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(sections, [
    ['hero-typo', 'page-title'],
    ['section reveal', 'city-services-title'],
    ['section reveal', 'city-neighbors-title'],
    ['steps reveal', 'steps-title'],
    ['band', 'contact-band-title'],
  ], `${where} : sections`);
  assert.ok(!main.includes('<figure'), `${where} : aucune figure d'avis`);
  // Héros : fil d'Ariane = nom de la région en texte (areas inactive), h1, intro, liens Appeler › WhatsApp › Devis ›.
  const hero = main.slice(0, main.indexOf('</section>'));
  assert.equal((hero.match(/<svg\b[\s\S]*?<\/svg>/)?.[0].match(/<path\b[^>]*\spathLength="1"/g) ?? []).length, 3, `${where} : 3 arcs`);
  // areas inactive : sur-titre en <p> simple, sans landmark <nav> vide.
  assert.ok(!hero.includes('<nav'), `${where} : <nav> sans lien dans le héros`);
  assert.equal(hero.match(/<p class="crumb crumb-text">([^<]*)<\/p>/)?.[1], escaped(REGIONS[data.region].name[lang]), `${where} : région sans lien`);
  assert.equal(hero.match(/<h1 id="page-title" class="title city">([^<]*)<\/h1>/)?.[1], escaped(name), `${where} : h1`);
  assert.ok(hero.indexOf('class="crumb"') < hero.indexOf('<h1'), `${where} : fil avant le h1`);
  assert.equal(hero.match(/<p class="subtitle">([^<]*)<\/p>/)?.[1], escaped(data.intro[lang]), `${where} : intro`);
  const wa = waHref(pageWaInput({ city: cid }, HE_SERVICES, HE_CITIES));
  assert.ok(decodeURIComponent(wa).endsWith(`אשמח לקבל הצעת מחיר ב${data.name.he}.`), `${where} : message WhatsApp`);
  const quote = `${PAGE_HREFS.contact[lang]}?city=${cid}`;
  const heroLinks = [...hero.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(heroLinks.length, 3, `${where} : liens du héros`);
  assertTextLink(heroLinks[0], 'tel:+972509565669', escaped(dict['action.call']), 'call_click', 'hero', `${where} : Appeler`);
  assertTextLink(heroLinks[1], wa, escaped(dict['action.whatsapp']), 'whatsapp_click', 'hero', `${where} : WhatsApp`);
  assertTextLink(heroLinks[2], quote, escaped(dict['action.quote']), undefined, undefined, `${where} : Devis (D5)`);
  for (const [, attrs] of heroLinks) assert.match(attrs, /\sclass="text-link night"/, `${where} : ton nuit`);
  // « Ce qu'on installe » : titre avec la ville, 5 lignes pleine largeur dans l'ordre du canvas, un <a> chacune.
  const services = main.match(/<section class="section reveal" aria-labelledby="city-services-title">([\s\S]*?)<\/section>/)?.[1] ?? '';
  assert.equal(services.match(/<h2 id="city-services-title" class="services-title">([^<]*)<\/h2>/)?.[1], escaped(dict['city.services.title'].replace('{city}', name)), `${where} : titre des services`);
  const rows = [...services.matchAll(/<li><a href="([^"]*)" class="row"><span class="row-label">([^<]*)<\/span><span class="row-hint">([^<]*)<span aria-hidden="true"> ›<\/span><\/span><\/a><\/li>/g)];
  assert.equal(services.match(/<a\b/g)?.length, 5, `${where} : un seul <a> par ligne`);
  assert.deepEqual(
    rows.map((m) => [m[1], m[2], m[3]]),
    SERVICE_ROWS.map((code) => [PAGE_HREFS[code][lang], escaped(serviceLabel(code, lang)), escaped(dict[`city.service-hint.${code}`])]),
    `${where} : lignes de services`,
  );
  // Localités : titre et placeholder (aucune voisine fournie), sans lien.
  const neighbors = main.match(/<section class="section reveal" aria-labelledby="city-neighbors-title">([\s\S]*?)<\/section>/)?.[1] ?? '';
  assert.equal(neighbors.match(/<h2 id="city-neighbors-title" class="neighbors-title">([^<]*)<\/h2>/)?.[1], escaped(dict['city.neighbors.title']), `${where} : titre des localités`);
  assert.equal(neighbors.match(/<p class="neighbors-text"><span data-placeholder(?:="")?>([^<]*)<\/span><\/p>/)?.[1], `[${dict['placeholder.neighbors']}]`, `${where} : placeholder des localités`);
  assert.ok(!neighbors.includes('<a'), `${where} : localités sans liens`);
  // Bloc contact : WhatsApp avec la ville, « Laisser ses coordonnées » avec ?city=.
  const band = main.slice(main.indexOf('<section class="band"'));
  const bandLinks = [...band.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(bandLinks.length, 4, `${where} : liens du bloc`);
  assertTextLink(bandLinks[2], wa, dict['action.whatsapp'], 'whatsapp_click', 'contact_band', `${where} : bloc WhatsApp`);
  assertTextLink(bandLinks[3], quote, escaped(dict['contact-band.leave-details']), undefined, undefined, `${where} : bloc leave-details`);
  // Les liens WhatsApp de la page (héros, barre mobile, bloc) contiennent « ב{nom hébreu} » encodé ; aucun autre message.
  const cityEncoded = encodeURIComponent(`ב${data.name.he}`);
  const waLinks = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/g)].map((m) => m[1]);
  assert.equal(waLinks.length, 3, `${where} : liens WhatsApp`);
  for (const href of waLinks) assert.ok(href.includes(cityEncoded), `${where} : ${href} sans la ville`);
  if (cid === 'modiin') assert.ok(waLinks.every((href) => href.includes('%D7%91%D7%9E%D7%95%D7%93%D7%99%D7%A2%D7%99%D7%9F')), `${where} : « במודיעין » encodé`);
  // Aucun lien vers Zones (areas désactivée) ; liens Contact de la page avec ?city=.
  const hrefs = [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(!hrefs.some((h) => LANGS.some((l) => h === PAGE_HREFS.areas[l] || h.startsWith(`${PAGE_HREFS.areas[l]}#`))), `${where} : lien vers Zones`);
  assert.deepEqual(hrefs.filter((h) => h.startsWith(`${PAGE_HREFS.contact[lang]}?`)), [quote, quote], `${where} : liens Contact ?city=`);
}

/** Story 1.9 (FR39), stories 2.1, 3.1 à 3.4 : sitemap dans l'ordre du registre (ids triés : Caméras, Contact,
 * Entrepreneurs, accueil, Interphone, Réseaux, Maison connectée, Détecteurs ; 4 <url> chacun, 32 au total,
 * 5 xhtml:link chacun), robots.txt, icônes et manifeste. */
// Story 4.1 : titre (city.meta-title) et description (intro) des pages ville, comme ceux des pages fixes.
for (const cid of CITY_IDS) {
  const { name, intro } = CITY_DATA[cid];
  META[`city:${cid}`] = {
    title: Object.fromEntries(LANGS.map((lang) => [lang, escaped(I18N[lang]['city.meta-title'].replace('{city}', name[lang]))])),
    // Attribut entre guillemets doubles : l'apostrophe n'y est pas échappée (le texte du <title> l'est).
    description: Object.fromEntries(LANGS.map((lang) => [lang, intro[lang]])),
  };
}
// Story 4.1 : puis les pages ville, dans l'ordre région puis ville (registre : pages fixes, puis villes) ; Zones absente.
const SITEMAP_IDS = ['cameras', 'contact', 'contractors', 'home', 'intercom', 'networks', 'smart-home', 'smoke-detectors', ...CITY_IDS.map((cid) => `city:${cid}`)];
function assertSeoFiles(out, site, indexable) {
  const xml = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  assert.equal(blocks.length, SITEMAP_IDS.length * 4, 'sitemap : <url>');
  assert.equal(blocks.length, 40, 'sitemap : <url> (8 pages fixes et 2 villes × 4 langues)');
  assert.ok(!LANGS.some((l) => xml.includes(`/${encodeURIComponent(AREAS_SLUGS[l])}/<`)), 'sitemap : Zones');
  blocks.forEach((block, i) => {
    const hrefs = PAGE_HREFS[SITEMAP_IDS[Math.floor(i / 4)]];
    const lang = LANGS[i % 4];
    assert.equal(block.match(/<loc>([^<]*)<\/loc>/)?.[1], `${site}${hrefs[lang]}`, `sitemap : loc ${i} ${lang}`);
    const links = [...block.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]*)" href="([^"]*)"\/>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(links, [...LANGS.map((l) => [l, `${site}${hrefs[l]}`]), ['x-default', `${site}${hrefs.he}`]], `sitemap : xhtml:link ${i} ${lang}`);
  });
  // path-probe dans ses 4 slugs (story 3.3 : « בית-חכם » commence aussi par %D7%91, d'où les slugs complets).
  const probeSlugs = PROBES.map((file) => encodeURIComponent(file.split('/')[1]));
  assert.ok(!xml.includes('404') && !probeSlugs.some((slug) => xml.includes(`/${slug}/`)), 'sitemap : 404 ou path-probe');
  const robots = readFileSync(join(out, 'robots.txt'), 'utf8');
  assert.equal(robots, `User-agent: *\n${indexable ? 'Allow: /' : 'Disallow: /'}\n\nSitemap: ${site}/sitemap.xml\n`, 'robots.txt');
  for (const icon of ['rs-icon-32.png', 'rs-icon-180.png', 'rs-icon-512.png']) assert.ok(existsSync(join(out, icon)), `${icon} absent`);
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(manifest.icons, [{ src: '/rs-icon-512.png', sizes: '512x512', type: 'image/png' }], 'manifeste : icône 512');
}

test('build de branche : 4 accueils complets (tuiles de services) + 4 Contact + 4 Caméras + 4 Détecteurs + 4 Maison connectée + 4 Réseaux + 4 Interphone + 4 Entrepreneurs + 8 pages ville + 4 path-probe, layout Base (lang/dir, #rs-data, évitement, repères, hreflang relatifs), _redirects', { timeout: 120_000 }, () => {
  const out = build({});
  assert.deepEqual(indexFiles(out), [...HOMES, ...CONTACTS, ...CAMERAS, ...SMOKES, ...SMARTS, ...NETWORKS, ...INTERCOMS, ...CONTRACTORS, ...CITY_FILES, ...PROBES].sort());
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
  for (const [i, file] of CAMERAS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'cameras', LANGS[i], out);
    assertCameras(html, LANGS[i], out);
  }
  for (const [i, file] of SMOKES.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'smoke-detectors', LANGS[i], out);
    assertSmokeDetectors(html, LANGS[i], out);
  }
  for (const [i, file] of SMARTS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'smart-home', LANGS[i], out);
    assertSmartHome(html, LANGS[i], out);
  }
  for (const [i, file] of INTERCOMS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'intercom', LANGS[i], out);
    assertIntercom(html, LANGS[i], out);
  }
  for (const [i, file] of NETWORKS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'networks', LANGS[i], out);
    assertNetworks(html, LANGS[i], out);
  }
  for (const [i, file] of CONTRACTORS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'contractors', LANGS[i], out);
    assertContractors(html, LANGS[i], out);
  }
  // Story 4.1 : 2 villes × 4 langues sous le slug de `areas`, qui n'est pas générée.
  for (const cid of CITY_IDS) {
    for (const lang of LANGS) {
      const html = readFileSync(join(out, lang, AREAS_SLUGS[lang], CITY_DATA[cid].slugs[lang], 'index.html'), 'utf8');
      assertLayout(html, `city:${cid}`, lang, out);
      assertCity(html, cid, lang);
    }
  }
  assert.ok(!LANGS.some((lang) => existsSync(join(out, lang, AREAS_SLUGS[lang], 'index.html'))), 'page Zones générée');
  assertNotFoundPages(out);
  assertSeoFiles(out, '', false);
});

test('build de main indexable avec SITE_URL : 4 accueils complets (tuiles de services) + 4 Contact + 4 Caméras + 4 Détecteurs + 4 Maison connectée + 4 Réseaux + 4 Interphone + 4 Entrepreneurs + 8 pages ville, sans noindex, canonique et hreflang absolus', { timeout: 120_000 }, () => {
  const out = build({ WORKERS_CI_BRANCH: 'main', DOMAIN_LIVE: 'true', SITE_URL: 'https://rs.example' });
  assert.deepEqual(indexFiles(out), [...HOMES, ...CONTACTS, ...CAMERAS, ...SMOKES, ...SMARTS, ...NETWORKS, ...INTERCOMS, ...CONTRACTORS, ...CITY_FILES].sort());
  assert.ok(!existsSync(join(out, 'index.html')));
  for (const lang of LANGS) {
    const html = readFileSync(join(out, lang, 'index.html'), 'utf8');
    assertLayout(html, 'home', lang, out, 'https://rs.example', true);
    assertHome(html, lang, out);
  }
  for (const [i, file] of CONTACTS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'contact', LANGS[i], out, 'https://rs.example', true);
    assertContact(html, LANGS[i], out);
    assertFormHiddenWithoutJs(html, out, file);
  }
  for (const [i, file] of CAMERAS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'cameras', LANGS[i], out, 'https://rs.example', true);
    assertCameras(html, LANGS[i], out);
  }
  for (const [i, file] of SMOKES.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'smoke-detectors', LANGS[i], out, 'https://rs.example', true);
    assertSmokeDetectors(html, LANGS[i], out);
  }
  for (const [i, file] of SMARTS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'smart-home', LANGS[i], out, 'https://rs.example', true);
    assertSmartHome(html, LANGS[i], out);
  }
  for (const [i, file] of INTERCOMS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'intercom', LANGS[i], out, 'https://rs.example', true);
    assertIntercom(html, LANGS[i], out);
  }
  for (const [i, file] of NETWORKS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'networks', LANGS[i], out, 'https://rs.example', true);
    assertNetworks(html, LANGS[i], out);
  }
  for (const [i, file] of CONTRACTORS.entries()) {
    const html = readFileSync(join(out, file), 'utf8');
    assertLayout(html, 'contractors', LANGS[i], out, 'https://rs.example', true);
    assertContractors(html, LANGS[i], out);
  }
  for (const cid of CITY_IDS) {
    for (const lang of LANGS) {
      const html = readFileSync(join(out, lang, AREAS_SLUGS[lang], CITY_DATA[cid].slugs[lang], 'index.html'), 'utf8');
      assertLayout(html, `city:${cid}`, lang, out, 'https://rs.example', true);
      assertCity(html, cid, lang);
    }
  }
  // Story 1.9 : les 5 404 restent en noindex sur un build indexable ; sitemap et robots absolus.
  assertNotFoundPages(out);
  assertSeoFiles(out, 'https://rs.example', true);
});
