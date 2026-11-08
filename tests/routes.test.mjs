import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRegistry, ID_RE, SLUG_RE } from '../src/lib/routes/core.ts';
import { LANGS, DIR, isLang } from '../src/lib/langs.ts';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

const slugs = (he, en, ru, fr) => ({ he, en, ru, fr });
const HOME = { id: 'home', slugs: slugs('', '', '', ''), enabled: true };
const PROBE = { id: 'path-probe', slugs: slugs('בדיקת-נתיב', 'path-probe', 'проверка-пути', 'test-de-chemin'), enabled: true, previewOnly: true };
const branch = { isMainBranch: false };
const main = { isMainBranch: true };
const build = (sources, options = branch) => buildRegistry(sources, options);
const throwsRoutes = (fn, pattern) =>
  assert.throws(fn, (error) => {
    assert.match(error.message, /^routes : /);
    assert.match(error.message, pattern);
    return true;
  });

// — Langues —

test('LANGS : he, en, ru, fr dans cet ordre ; he en rtl, les autres en ltr', () => {
  assert.deepEqual(LANGS, ['he', 'en', 'ru', 'fr']);
  assert.deepEqual(DIR, { he: 'rtl', en: 'ltr', ru: 'ltr', fr: 'ltr' });
  assert.equal(isLang('fr'), true);
  assert.equal(isLang('de'), false);
  assert.equal(isLang(undefined), false);
});

// — Matrice I/O —

test('accueil : /{lang}/, segments vides', () => {
  const r = build([HOME]);
  assert.equal(r.url('home', 'he'), '/he/');
  assert.equal(r.url('home', 'fr'), '/fr/');
  assert.deepEqual(
    r.entries().map((e) => [e.lang, e.href, e.segments]),
    [['he', '/he/', []], ['en', '/en/', []], ['ru', '/ru/', []], ['fr', '/fr/', []]],
  );
});

test('slug hébreu : href encodé RFC 3986, segments bruts', () => {
  const r = build([HOME, PROBE]);
  assert.equal(r.url('path-probe', 'he'), '/he/%D7%91%D7%93%D7%99%D7%A7%D7%AA-%D7%A0%D7%AA%D7%99%D7%91/');
  assert.equal(r.url('path-probe', 'ru'), '/ru/%D0%BF%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%BA%D0%B0-%D0%BF%D1%83%D1%82%D0%B8/');
  const he = r.entries().find((e) => e.id === 'path-probe' && e.lang === 'he');
  assert.deepEqual(he.segments, ['בדיקת-נתיב']);
  assert.equal(he.previewOnly, true);
});

test('slug NFD : segments et href identiques à la forme NFC', () => {
  const nfd = 'te\u0301st';
  const nfc = 't\u00e9st';
  assert.notEqual(nfd, nfc);
  const a = build([{ id: 'x', slugs: slugs('x', 'x', 'x', nfd), enabled: true }]);
  const b = build([{ id: 'x', slugs: slugs('x', 'x', 'x', nfc), enabled: true }]);
  const fr = (r) => r.entries().find((e) => e.lang === 'fr');
  assert.deepEqual(fr(a).segments, [nfc]);
  assert.equal(fr(a).href, fr(b).href);
  assert.equal(a.url('x', 'fr'), '/fr/t%C3%A9st/');
});

test('ancre : url(id, lang, { hash }) ; hash invalide → erreur', () => {
  const r = build([HOME]);
  assert.equal(r.url('home', 'fr', { hash: 'south' }), '/fr/#south');
  throwsRoutes(() => r.url('home', 'fr', { hash: 'South Area' }), /ancre/);
  throwsRoutes(() => r.url('home', 'fr', { hash: '' }), /ancre/);
});

test('alternates : 4 { lang, href } dans l’ordre LANGS', () => {
  const r = build([HOME, PROBE]);
  assert.deepEqual(r.alternates('home'), [
    { lang: 'he', href: '/he/' },
    { lang: 'en', href: '/en/' },
    { lang: 'ru', href: '/ru/' },
    { lang: 'fr', href: '/fr/' },
  ]);
  assert.deepEqual(r.alternates('path-probe').map((a) => a.lang), ['he', 'en', 'ru', 'fr']);
});

test('désactivée : absente d’entries(), isEnabled faux, url() et alternates() lèvent', () => {
  const r = build([HOME, { id: 'contact', slugs: slugs('צור-קשר', 'contact', 'контакты', 'contact'), enabled: false }]);
  assert.deepEqual([...new Set(r.entries().map((e) => e.id))], ['home']);
  assert.equal(r.isEnabled('contact'), false);
  assert.equal(r.isEnabled('home'), true);
  throwsRoutes(() => r.url('contact', 'he'), /« contact » inactif/);
  throwsRoutes(() => r.alternates('contact'), /« contact » inactif/);
});

test('branche main : previewOnly absente ; branche de PR ou local : présente', () => {
  const onMain = build([HOME, PROBE], main);
  assert.deepEqual([...new Set(onMain.entries().map((e) => e.id))], ['home']);
  assert.equal(onMain.isEnabled('path-probe'), false);
  throwsRoutes(() => onMain.url('path-probe', 'he'), /inactif/);
  const onBranch = build([HOME, PROBE], branch);
  assert.equal(onBranch.isEnabled('path-probe'), true);
  assert.equal(onBranch.entries().length, 8);
});

test('id inconnu : isEnabled faux sans erreur, url() lève « id inconnu »', () => {
  const r = build([HOME]);
  assert.equal(r.isEnabled('x'), false);
  throwsRoutes(() => r.url('x', 'he'), /id inconnu « x »/);
  throwsRoutes(() => r.alternates('x'), /id inconnu « x »/);
});

test('langue invalide passée à url() → erreur', () => {
  throwsRoutes(() => build([HOME]).url('home', 'de'), /langue inconnue/);
});

test('doublon (lang, chemin) : lève et cite les deux ids', () => {
  throwsRoutes(
    () =>
      build([
        { id: 'about', slugs: slugs('אודות', 'about', 'о-нас', 'a-propos'), enabled: true },
        { id: 'about-us', slugs: slugs('עלינו', 'about', 'о-компании', 'qui-sommes-nous'), enabled: false },
      ]),
    /« about » et « about-us » \(en\) : même chemin \/en\/about\//,
  );
});

test('doublon NFD / NFC : détecté après normalisation', () => {
  const nfd = 'te\u0301st';
  const nfc = 't\u00e9st';
  assert.notEqual(nfd, nfc);
  throwsRoutes(
    () =>
      build([
        { id: 'a', slugs: slugs('a', 'a', 'a', nfd), enabled: true },
        { id: 'b', slugs: slugs('b', 'b', 'b', nfc), enabled: true },
      ]),
    /« a » et « b » \(fr\)/,
  );
});

test('slug manquant : lève, cite id et langue', () => {
  throwsRoutes(() => build([{ id: 'about', slugs: { he: 'אודות', en: 'about', ru: 'о-нас' }, enabled: true }]), /« about » \(fr\) : slug manquant/);
});

test('slug vide hors home : lève, cite id et langue', () => {
  throwsRoutes(() => build([{ id: 'about', slugs: slugs('אודות', '', 'о-нас', 'a-propos'), enabled: true }]), /« about » \(en\) : slug vide/);
});

test('slug invalide : a/b, A b, a--b, majuscule, tiret final → lève', () => {
  for (const bad of ['a/b', 'A b', 'a--b', 'About', '-a', 'a-', 'a b', 'a_b', 'a.b']) {
    throwsRoutes(() => build([{ id: 'about', slugs: slugs('אודות', bad, 'о-нас', 'a-propos'), enabled: true }]), /« about » \(en\) : slug .* invalide/);
  }
});

test('SLUG_RE : hébreu, cyrillique, accents, chiffres admis', () => {
  for (const ok of ['בדיקת-נתיב', 'проверка-пути', 'à-propos', 'blog-2', 'מודיעין', 'בית-שמש']) assert.ok(SLUG_RE.test(ok), ok);
  for (const bad of ['Проверка', 'a--b', 'a/b', '']) assert.ok(!SLUG_RE.test(bad), bad);
});

test('id hors kebab-case : lève ; préfixe de type admis', () => {
  for (const ok of ['home', 'smoke-detectors', 'city:beit-shemesh', 'blog-page:2', 'post:2026-11-10-cameras']) assert.ok(ID_RE.test(ok), ok);
  for (const bad of ['Home', 'smoke_detectors', 'a--b', 'city:', ':x', 'a:b:c', 'city:Modiin']) assert.ok(!ID_RE.test(bad), bad);
  throwsRoutes(() => build([{ id: 'About', slugs: slugs('א', 'a', 'а', 'a'), enabled: true }]), /id « About » hors kebab-case/);
});

test('id déclaré deux fois : lève', () => {
  throwsRoutes(() => build([HOME, HOME]), /id « home » déclaré deux fois/);
});

test('parent : chemin = segments du parent + slug', () => {
  const r = build([
    HOME,
    { id: 'areas', slugs: slugs('אזורים', 'areas', 'районы', 'zones'), enabled: true },
    { id: 'city:modiin', slugs: slugs('מודיעין', 'modiin', 'модиин', 'modiin'), enabled: true, parent: 'areas' },
  ]);
  assert.equal(r.url('city:modiin', 'en'), '/en/areas/modiin/');
  assert.deepEqual(r.entries().find((e) => e.id === 'city:modiin' && e.lang === 'he').segments, ['אזורים', 'מודיעין']);
});

test('parent désactivé : enfant inactif', () => {
  const r = build([
    { id: 'areas', slugs: slugs('אזורים', 'areas', 'районы', 'zones'), enabled: false },
    { id: 'city:modiin', slugs: slugs('מודיעין', 'modiin', 'модиин', 'modiin'), enabled: true, parent: 'areas' },
  ]);
  assert.equal(r.isEnabled('city:modiin'), false);
  assert.deepEqual(r.entries(), []);
  throwsRoutes(() => r.url('city:modiin', 'en'), /inactif/);
});

test('parent inconnu ou cycle : lève', () => {
  throwsRoutes(() => build([{ id: 'city:x', slugs: slugs('x', 'x', 'x', 'x'), enabled: true, parent: 'areas' }]), /« city:x » : parent inconnu « areas »/);
  throwsRoutes(
    () =>
      build([
        { id: 'a', slugs: slugs('a', 'a', 'a', 'a'), enabled: true, parent: 'b' },
        { id: 'b', slugs: slugs('b', 'b', 'b', 'b'), enabled: true, parent: 'a' },
      ]),
    /cycle de parents/,
  );
  throwsRoutes(() => build([{ id: 'a', slugs: slugs('a', 'a', 'a', 'a'), enabled: true, parent: 'a' }]), /cycle de parents/);
});

test('entries() : copie figée, ne modifie pas le registre', () => {
  const r = build([HOME]);
  const list = r.entries();
  list.pop();
  assert.equal(r.entries().length, 4);
  assert.throws(() => {
    r.entries()[0].href = '/x/';
  }, TypeError);
});

// — Contenu réel —

test('path-probe.yaml : previewOnly, slug hébreu en he, cyrillique en ru', () => {
  const yaml = read('src/content/pages/path-probe.yaml');
  assert.match(yaml, /^previewOnly: true$/m);
  assert.match(yaml, /^enabled: true$/m);
  const he = yaml.match(/^  he: '(.+)'$/m)?.[1];
  const ru = yaml.match(/^  ru: '(.+)'$/m)?.[1];
  assert.match(he, /^[\p{Script=Hebrew}-]+$/u);
  assert.match(ru, /^[\p{Script=Cyrillic}-]+$/u);
  assert.ok(SLUG_RE.test(he) && SLUG_RE.test(ru));
});

test('home.yaml : slugs vides, actif, pas réservé aux aperçus', () => {
  const yaml = read('src/content/pages/home.yaml');
  assert.match(yaml, /^slugs:\n  he: ''\n  en: ''\n  ru: ''\n  fr: ''$/m);
  assert.match(yaml, /^enabled: true$/m);
  assert.doesNotMatch(yaml, /previewOnly/);
});

test('public/_redirects : exactement la règle / → /he/ en 301', () => {
  assert.equal(read('public/_redirects'), '/ /he/ 301\n');
});

// — Story 1.9 : 404 (AD-2, AD-3) —

test('id not-found réservé : une source d’id not-found lève', () => {
  throwsRoutes(() => build([HOME, { id: 'not-found', slugs: slugs('a', 'b', 'c', 'd'), enabled: false }]), /« not-found » réservé/);
});

test('/{lang}/404/ réservé : une page de slug 404 à la racine lève, même désactivée', () => {
  throwsRoutes(
    () => build([HOME, { id: 'oops', slugs: slugs('x', '404', 'y', 'z'), enabled: false }]),
    /« not-found » et « oops » \(en\) : même chemin \/en\/404\//,
  );
  // Sous un parent, le chemin n'est plus /{lang}/404/ : admis.
  const r = build([HOME, { id: 'p', slugs: slugs('p', 'p', 'p', 'p'), enabled: true }, { id: 'c', slugs: slugs('404', '404', '404', '404'), enabled: true, parent: 'p' }]);
  assert.equal(r.url('c', 'fr'), '/fr/p/404/');
});

test('NOT_FOUND_ID, NOT_FOUND_SEGMENT et switcherTargetId', async () => {
  const { NOT_FOUND_ID, NOT_FOUND_SEGMENT, switcherTargetId } = await import('../src/lib/routes/core.ts');
  assert.equal(NOT_FOUND_ID, 'not-found');
  assert.equal(NOT_FOUND_SEGMENT, '404');
  assert.equal(switcherTargetId('not-found'), 'home');
  assert.equal(switcherTargetId('home'), 'home');
  assert.equal(switcherTargetId('cameras'), 'cameras');
});

test('src/lib/routes/index.ts réexporte NOT_FOUND_ID, NOT_FOUND_SEGMENT et switcherTargetId', () => {
  assert.match(read('src/lib/routes/index.ts'), /export \{ NOT_FOUND_ID, NOT_FOUND_SEGMENT, switcherTargetId \} from '\.\/core\.ts';/);
});
