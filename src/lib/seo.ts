// FR39, AD-10 : canonique et hreflang. Module pur, syntaxe TypeScript effaçable uniquement.
// Sans SITE_URL (pas encore de domaine), les URL restent des chemins depuis la racine.
import type { Lang } from './langs.ts';

export interface HreflangLink {
  hreflang: Lang | 'x-default';
  href: string;
}

/** `href` (chemin depuis la racine, déjà encodé) rendu absolu sur `siteUrl` s'il est posé. */
export function absoluteUrl(href: string, siteUrl?: string): string {
  return siteUrl ? new URL(href, siteUrl).href : href;
}

/** 4 liens dans l'ordre des alternates (he, en, ru, fr), puis `x-default` vers la version he. */
export function hreflangLinks(alternates: readonly { lang: Lang; href: string }[], siteUrl?: string): HreflangLink[] {
  const he = alternates.find((a) => a.lang === 'he');
  if (!he) throw new Error('seo : version he absente des alternates');
  return [
    ...alternates.map(({ lang, href }) => ({ hreflang: lang, href: absoluteUrl(href, siteUrl) })),
    { hreflang: 'x-default', href: absoluteUrl(he.href, siteUrl) },
  ];
}
