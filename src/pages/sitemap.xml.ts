// AD-3, AD-10, FR39 : sitemap statique, entrées actives du registre × 4 langues (aperçus et 404 exclus).
import type { APIRoute } from 'astro';
import { INDEXABLE, SITE_URL } from '../lib/env';
import { alternates, entries } from '../lib/routes';
import { assertSiteUrl } from '../lib/seo';
import { sitemapIds, sitemapXml } from '../lib/sitemap';

export const GET: APIRoute = () => {
  assertSiteUrl(INDEXABLE, SITE_URL);
  const body = sitemapXml(sitemapIds(entries()).map(alternates), SITE_URL);
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
