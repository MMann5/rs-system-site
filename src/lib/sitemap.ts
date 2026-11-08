// FR39, AD-2, AD-10 : sitemap XML et robots.txt. Module pur, syntaxe TypeScript effaçable uniquement.
// Les endpoints src/pages/sitemap.xml.ts et robots.txt.ts lui passent le registre et l'environnement.
import type { Lang } from './langs.ts';
import { absoluteUrl, hreflangLinks } from './seo.ts';

export const SITEMAP_PATH = '/sitemap.xml';

type Alternates = readonly { lang: Lang; href: string }[];

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

const xml = (value: string): string => value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] as string);

/** Ids uniques, dans l'ordre, des entrées hors aperçu (D6 : path-probe exclue). La 404 n'est pas une entrée. */
export function sitemapIds(entries: readonly { id: string; previewOnly: boolean }[]): string[] {
  return [...new Set(entries.filter((e) => !e.previewOnly).map((e) => e.id))];
}

/** Un `<url>` par page et par langue, chacun avec les 5 `xhtml:link` (he, en, ru, fr, x-default). */
export function sitemapXml(pages: readonly Alternates[], siteUrl?: string): string {
  const urls = pages.flatMap((alternates) => {
    const links = hreflangLinks(alternates, siteUrl)
      .map(({ hreflang, href }) => `    <xhtml:link rel="alternate" hreflang="${xml(hreflang)}" href="${xml(href)}"/>`)
      .join('\n');
    return alternates.map(({ href }) => `  <url>\n    <loc>${xml(absoluteUrl(href, siteUrl))}</loc>\n${links}\n  </url>`);
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** robots.txt : tout autorisé si indexable, tout interdit sinon ; annonce le sitemap dans les deux cas. */
export function robotsTxt({ indexable, sitemapUrl }: { indexable: boolean; sitemapUrl: string }): string {
  return `User-agent: *\n${indexable ? 'Allow: /' : 'Disallow: /'}\n\nSitemap: ${sitemapUrl}\n`;
}
