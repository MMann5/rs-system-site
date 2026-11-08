// AD-3, AD-10, FR39 : robots.txt statique, Disallow tant que le build n'est pas indexable ; annonce le sitemap.
import type { APIRoute } from 'astro';
import { INDEXABLE, SITE_URL } from '../lib/env';
import { absoluteUrl, assertSiteUrl } from '../lib/seo';
import { robotsTxt, SITEMAP_PATH } from '../lib/sitemap';

export const GET: APIRoute = () => {
  assertSiteUrl(INDEXABLE, SITE_URL);
  const body = robotsTxt({ indexable: INDEXABLE, sitemapUrl: absoluteUrl(SITEMAP_PATH, SITE_URL) });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
