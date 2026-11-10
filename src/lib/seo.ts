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

/** FR39 : liens d'icônes du <head> de chaque page (fichiers tirés de brand/logo-final/, dans public/). */
export const ICON_LINKS: readonly { rel: string; type?: string; sizes?: string; href: string }[] = [
  { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/rs-icon-32.png' },
  { rel: 'apple-touch-icon', sizes: '180x180', href: '/rs-icon-180.png' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
];

/** AD-10 : un build indexable exige SITE_URL (canonique, hreflang et sitemap absolus). */
export function assertSiteUrl(indexable: boolean, siteUrl?: string): void {
  if (indexable && !siteUrl) throw new Error('seo : SITE_URL requis pour un build indexable (URL absolues du sitemap, de la canonique et des hreflang)');
}

/**
 * Story 7.2 (D4) : cartes de partage 1200 × 630 générées au build par src/pages/og/[card].png.ts (fichiers, pas des
 * pages) ; `logo` = logo complet sur navy, `detector` = détecteur dessiné.
 */
export const SHARE_CARD_PATHS = { logo: '/og/logo.png', detector: '/og/detector.png' } as const;

export type ShareCard = keyof typeof SHARE_CARD_PATHS;

/** Logo carré publié (manifeste), cité comme `logo` par les données structurées (D3). */
export const LOGO_PATH = '/rs-icon-512.png';
