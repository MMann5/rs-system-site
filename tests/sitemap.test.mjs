// Story 1.9 (FR39, AD-2, AD-10) : sitemap XML, robots.txt et garde SITE_URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../src/lib/routes/core.ts';
import { absoluteUrl, assertSiteUrl, ICON_LINKS } from '../src/lib/seo.ts';
import { robotsTxt, SITEMAP_PATH, sitemapIds, sitemapXml } from '../src/lib/sitemap.ts';

const LANGS = ['he', 'en', 'ru', 'fr'];
const slugs = (he, en, ru, fr) => ({ he, en, ru, fr });
const registry = buildRegistry(
  [
    { id: 'home', slugs: slugs('', '', '', ''), enabled: true },
    { id: 'path-probe', slugs: slugs('בדיקת-נתיב', 'path-probe', 'проверка-пути', 'test-de-chemin'), enabled: true, previewOnly: true },
  ],
  { isMainBranch: false },
);

const urlBlocks = (xml) => [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
const links = (block) => [...block.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]*)" href="([^"]*)"\/>/g)].map((m) => [m[1], m[2]]);

test('sitemapIds : ids uniques dans l’ordre, entrées previewOnly exclues', () => {
  assert.deepEqual(sitemapIds(registry.entries()), ['home']);
  assert.deepEqual(
    sitemapIds([
      { id: 'a', previewOnly: false },
      { id: 'a', previewOnly: false },
      { id: 'p', previewOnly: true },
      { id: 'b', previewOnly: false },
    ]),
    ['a', 'b'],
  );
});

test('sitemap epic 1, branche sans SITE_URL : 4 <url> relatifs, 5 xhtml:link chacun, sans path-probe', () => {
  const xml = sitemapXml(sitemapIds(registry.entries()).map((id) => registry.alternates(id)));
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml">\n/);
  assert.ok(xml.trimEnd().endsWith('</urlset>'));
  const blocks = urlBlocks(xml);
  assert.equal(blocks.length, 4);
  blocks.forEach((block, i) => {
    assert.equal(block.match(/<loc>([^<]*)<\/loc>/)?.[1], `/${LANGS[i]}/`);
    assert.deepEqual(links(block), [...LANGS.map((l) => [l, `/${l}/`]), ['x-default', '/he/']]);
  });
  assert.ok(!xml.includes('path-probe') && !xml.includes('404'));
});

test('sitemap avec SITE_URL : loc et href absolus ; robots annonce l’URL absolue du sitemap', () => {
  const site = 'https://rs.example';
  const xml = sitemapXml([registry.alternates('home')], site);
  const blocks = urlBlocks(xml);
  assert.deepEqual(blocks.map((b) => b.match(/<loc>([^<]*)<\/loc>/)?.[1]), LANGS.map((l) => `${site}/${l}/`));
  assert.deepEqual(links(blocks[0]).at(-1), ['x-default', `${site}/he/`]);
  const robots = robotsTxt({ indexable: true, sitemapUrl: absoluteUrl(SITEMAP_PATH, site) });
  assert.match(robots, /^Sitemap: https:\/\/rs\.example\/sitemap\.xml$/m);
});

test('échappement XML : & dans loc et href', () => {
  const alts = LANGS.map((lang) => ({ lang, href: `/${lang}/a&b/` }));
  const xml = sitemapXml([alts]);
  assert.match(xml, /<loc>\/he\/a&amp;b\/<\/loc>/);
  assert.match(xml, /hreflang="fr" href="\/fr\/a&amp;b\/"/);
  assert.ok(!/&(?!amp;)/.test(xml));
});

test('robots non indexable / indexable : Disallow / Allow, et Sitemap dans les deux cas', () => {
  assert.equal(robotsTxt({ indexable: false, sitemapUrl: '/sitemap.xml' }), 'User-agent: *\nDisallow: /\n\nSitemap: /sitemap.xml\n');
  assert.equal(robotsTxt({ indexable: true, sitemapUrl: '/sitemap.xml' }), 'User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml\n');
});

test('assertSiteUrl : indexable sans domaine lève ; sinon passe', () => {
  assert.throws(() => assertSiteUrl(true, undefined), /^Error: seo : SITE_URL requis/);
  assert.throws(() => assertSiteUrl(true, ''), /seo : SITE_URL requis/);
  assert.doesNotThrow(() => assertSiteUrl(true, 'https://rs.example'));
  assert.doesNotThrow(() => assertSiteUrl(false, undefined));
});

test('ICON_LINKS : favicon 32, apple-touch-icon 180, manifeste', () => {
  assert.deepEqual(ICON_LINKS, [
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/rs-icon-32.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/rs-icon-180.png' },
    { rel: 'manifest', href: '/manifest.webmanifest' },
  ]);
});
