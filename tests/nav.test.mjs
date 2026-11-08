// Stories 1.5 et 1.7 (AD-14) : listes de navigation du header et du footer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFooterColumns, buildLinks, buildNav, FOOTER_COLUMNS, HEADER_NAV_IDS, LEGAL_NAV, NOT_FOUND_NAV, routeDeps } from '../src/lib/nav/core.ts';
import { buildRegistry } from '../src/lib/routes/core.ts';

const LANGS = ['he', 'en', 'ru', 'fr'];

/** Registre factice : seuls les ids `active` existent ; url() lève sur un autre id, comme le vrai. */
function deps(active) {
  return {
    isEnabled: (id) => active.includes(id),
    url: (id, lang, params) => {
      if (!active.includes(id)) throw new Error(`routes : « ${id} » inactif`);
      return `/${lang}/${id}/${params?.hash ? `#${params.hash}` : ''}`;
    },
    label: (lang, key) => `${lang}:${key}`,
  };
}

test('HEADER_NAV_IDS : 10 ids dans l’ordre du header', () => {
  assert.deepEqual(HEADER_NAV_IDS, ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom', 'contractors', 'areas', 'blog', 'about', 'contact']);
});

test('buildNav : seuls cameras et blog actifs, navSection blog → 2 items dans l’ordre fixe, blog courant', () => {
  const items = buildNav(HEADER_NAV_IDS, 'fr', deps(['blog', 'cameras', 'home']), 'blog');
  assert.deepEqual(items, [
    { id: 'cameras', href: '/fr/cameras/', label: 'fr:nav.cameras', current: false },
    { id: 'blog', href: '/fr/blog/', label: 'fr:nav.blog', current: true },
  ]);
});

test('buildNav : ids inactifs ou inconnus omis sans erreur ; sans navSection, aucun courant', () => {
  assert.deepEqual(buildNav(HEADER_NAV_IDS, 'he', deps(['home'])), []);
  const items = buildNav(['contact', 'nope'], 'he', deps(['contact']));
  assert.deepEqual(items, [{ id: 'contact', href: '/he/contact/', label: 'he:nav.contact', current: false }]);
});

test('clés nav.{id}, nav.main-label et header.home-label présentes dans les 4 fichiers i18n', () => {
  for (const lang of LANGS) {
    const dict = JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'));
    for (const key of [...HEADER_NAV_IDS.map((id) => `nav.${id}`), 'nav.main-label', 'header.home-label']) {
      assert.ok(typeof dict[key] === 'string' && dict[key].trim() !== '', `${lang} : ${key}`);
    }
  }
});

// — Story 1.7 : colonnes et liens légaux du footer —

test('FOOTER_COLUMNS et LEGAL_NAV : ordre, ids, libellés et titres', () => {
  assert.deepEqual(
    FOOTER_COLUMNS.map(({ key, heading }) => [key, heading]),
    [['services', 'footer.col.services'], ['business', 'footer.col.business'], ['areas', 'footer.col.areas'], ['company', 'footer.col.company']],
  );
  const [services, business, areas, company] = FOOTER_COLUMNS;
  assert.deepEqual(services.links, ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom'].map((id) => ({ id, label: `nav.${id}` })));
  assert.deepEqual(business.links, [
    { id: 'contractors', label: 'nav.footer.crane-cameras' },
    { id: 'intercom', label: 'nav.footer.management' },
  ]);
  assert.deepEqual(areas.links, ['jerusalem-area', 'center-shfela', 'south', 'judea-samaria'].map((hash) => ({ id: 'areas', label: `nav.region.${hash}`, hash })));
  assert.deepEqual(company.links, ['about', 'blog', 'contact'].map((id) => ({ id, label: `nav.${id}` })));
  assert.deepEqual(LEGAL_NAV, [
    { id: 'accessibility', label: 'nav.accessibility' },
    { id: 'privacy', label: 'nav.privacy' },
  ]);
});

test('footer, epic 1 (seul home actif) : aucune colonne, aucun lien légal', () => {
  for (const lang of LANGS) {
    assert.deepEqual(buildFooterColumns(lang, deps(['home'])), []);
    assert.deepEqual(buildLinks(LEGAL_NAV, lang, deps(['home'])), []);
  }
});

test('footer : cameras et blog actifs → services = [cameras], company = [blog], business et areas omises', () => {
  assert.deepEqual(buildFooterColumns('fr', deps(['home', 'cameras', 'blog'])), [
    { key: 'services', heading: 'fr:footer.col.services', links: [{ href: '/fr/cameras/', label: 'fr:nav.cameras' }] },
    { key: 'company', heading: 'fr:footer.col.company', links: [{ href: '/fr/blog/', label: 'fr:nav.blog' }] },
  ]);
});

test('footer : areas actif → 4 liens d’ancre de région, dans l’ordre', () => {
  assert.deepEqual(buildFooterColumns('ru', deps(['areas'])), [
    {
      key: 'areas',
      heading: 'ru:footer.col.areas',
      links: ['jerusalem-area', 'center-shfela', 'south', 'judea-samaria'].map((hash) => ({ href: `/ru/areas/#${hash}`, label: `ru:nav.region.${hash}` })),
    },
  ]);
});

test('routeDeps + vrai registre (home, areas actifs) : 4 ancres de région en fr, titre traduit', () => {
  const routes = buildRegistry(
    [
      { id: 'home', slugs: { he: '', en: '', ru: '', fr: '' }, enabled: true },
      { id: 'areas', slugs: { he: 'אזורים', en: 'areas', ru: 'zony', fr: 'zones' }, enabled: true },
    ],
    { isMainBranch: false },
  );
  const cols = buildFooterColumns('fr', routeDeps(routes, (lang, key) => `${lang}:${key}`));
  assert.deepEqual(cols, [
    {
      key: 'areas',
      heading: 'fr:footer.col.areas',
      links: ['jerusalem-area', 'center-shfela', 'south', 'judea-samaria'].map((hash) => ({ href: `/fr/zones/#${hash}`, label: `fr:nav.region.${hash}` })),
    },
  ]);
});

test('buildLinks : id inactif ou inconnu omis, url et label jamais appelés pour lui', () => {
  const calls = [];
  const spy = {
    isEnabled: (id) => id === 'privacy',
    url: (id, lang, params) => (calls.push(['url', id, params]), `/${lang}/${id}/`),
    label: (lang, key) => (calls.push(['label', key]), key),
  };
  assert.deepEqual(buildLinks([...LEGAL_NAV, { id: 'nope', label: 'nav.nope' }], 'he', spy), [{ href: '/he/privacy/', label: 'nav.privacy' }]);
  assert.deepEqual(calls, [['url', 'privacy', undefined], ['label', 'nav.privacy']]);
});

test('clés des libellés et titres du footer présentes dans les 4 fichiers i18n', () => {
  const keys = [
    ...FOOTER_COLUMNS.flatMap(({ heading, links }) => [heading, ...links.map(({ label }) => label)]),
    ...LEGAL_NAV.map(({ label }) => label),
    'footer.col.contact', 'footer.legal-label', 'footer.copyright', 'contact.zone', 'placeholder.email',
  ];
  for (const lang of LANGS) {
    const dict = JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'));
    for (const key of keys) assert.ok(typeof dict[key] === 'string' && dict[key].trim() !== '', `${lang} : ${key}`);
    assert.ok(!/[[\]]/.test(dict['placeholder.email']), `${lang} : crochets dans placeholder.email`);
  }
});

// — Story 1.9 (FR15, UX-DR15) : liens de la 404 —

test('NOT_FOUND_NAV : Accueil, Zones, Contact', () => {
  assert.deepEqual(NOT_FOUND_NAV, [
    { id: 'home', label: 'not-found.home' },
    { id: 'areas', label: 'nav.areas' },
    { id: 'contact', label: 'nav.contact' },
  ]);
});

test('liens de la 404 : areas et contact inactifs → [Accueil] ; actifs → [Accueil, Zones, Contact]', () => {
  assert.deepEqual(buildLinks(NOT_FOUND_NAV, 'fr', deps(['home'])), [{ href: '/fr/home/', label: 'fr:not-found.home' }]);
  assert.deepEqual(buildLinks(NOT_FOUND_NAV, 'he', deps(['home', 'areas', 'contact'])), [
    { href: '/he/home/', label: 'he:not-found.home' },
    { href: '/he/areas/', label: 'he:nav.areas' },
    { href: '/he/contact/', label: 'he:nav.contact' },
  ]);
});

test('clés not-found.* présentes dans les 4 fichiers i18n', () => {
  for (const lang of LANGS) {
    const dict = JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'));
    for (const key of ['not-found.meta-title', 'not-found.title', 'not-found.home']) assert.ok(dict[key], `${lang} : ${key}`);
  }
});
