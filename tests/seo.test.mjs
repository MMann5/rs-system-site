// Story 1.4 (FR39, AD-10) : canonique et hreflang, relatifs sans SITE_URL, absolus avec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absoluteUrl, hreflangLinks } from '../src/lib/seo.ts';

const HOME = [
  { lang: 'he', href: '/he/' },
  { lang: 'en', href: '/en/' },
  { lang: 'ru', href: '/ru/' },
  { lang: 'fr', href: '/fr/' },
];
const PROBE_HE = '/he/%D7%91%D7%93%D7%99%D7%A7%D7%AA-%D7%A0%D7%AA%D7%99%D7%91/';

test('hreflang sans SITE_URL : 5 liens he, en, ru, fr, x-default → /he/', () => {
  assert.deepEqual(hreflangLinks(HOME), [
    { hreflang: 'he', href: '/he/' },
    { hreflang: 'en', href: '/en/' },
    { hreflang: 'ru', href: '/ru/' },
    { hreflang: 'fr', href: '/fr/' },
    { hreflang: 'x-default', href: '/he/' },
  ]);
});

test('hreflang avec SITE_URL : URL absolues', () => {
  assert.deepEqual(hreflangLinks(HOME, 'https://rs.example').map((l) => l.href), [
    'https://rs.example/he/',
    'https://rs.example/en/',
    'https://rs.example/ru/',
    'https://rs.example/fr/',
    'https://rs.example/he/',
  ]);
});

test('x-default = version he de la même page, chemin encodé conservé', () => {
  const alts = [{ lang: 'he', href: PROBE_HE }, { lang: 'en', href: '/en/path-probe/' }, { lang: 'ru', href: '/ru/x/' }, { lang: 'fr', href: '/fr/y/' }];
  const links = hreflangLinks(alts, 'https://rs.example');
  assert.equal(links[0].href, `https://rs.example${PROBE_HE}`);
  assert.deepEqual(links.at(-1), { hreflang: 'x-default', href: `https://rs.example${PROBE_HE}` });
});

test('absoluteUrl : chemin inchangé sans SITE_URL, jamais de paramètre ajouté', () => {
  assert.equal(absoluteUrl('/fr/'), '/fr/');
  assert.equal(absoluteUrl('/fr/', ''), '/fr/');
  assert.equal(absoluteUrl('/fr/', 'https://rs.example/'), 'https://rs.example/fr/');
});
