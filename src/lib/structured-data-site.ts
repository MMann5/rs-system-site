// FR38, story 7.2 (D3) : données du site que les modèles passent aux constructeurs purs de src/lib/structured-data.ts
// (build : lit le registre, les villes et SITE_URL). URL absolues si SITE_URL est posé, chemins depuis la racine sinon.
import { CITIES } from './areas';
import { SITE_URL } from './env';
import type { Lang } from './langs';
import { isEnabled, url, type UrlParams } from './routes';
import { absoluteUrl, LOGO_PATH } from './seo';
import type { BusinessRef } from './structured-data';

/** Chemin depuis la racine rendu absolu sur SITE_URL s'il est posé (AD-10). */
export const siteUrl = (path: string): string => absoluteUrl(path, SITE_URL);

/** URL de la page `id` en `lang`, absolue si SITE_URL est posé. */
export const pageUrl = (id: string, lang: Lang, params?: UrlParams): string => siteUrl(url(id, lang, params));

/** L'entreprise vue de la langue `lang` : accueil de la langue et logo carré. */
export function business(lang: Lang): BusinessRef {
  return { url: pageUrl('home', lang), logo: siteUrl(LOGO_PATH) };
}

/** Noms, en `lang`, des villes actives (ordre région puis ville) : zone desservie de l'entreprise. */
export function servedCities(lang: Lang): string[] {
  return CITIES.filter((c) => isEnabled(`city:${c.id}`)).map((c) => c.name[lang]);
}
