// FR9, AD-2, AD-4 (story 4.1) : cœur pur des régions et des villes. src/lib/areas/index.ts lui passe les entrées
// des collections `regions` et `cities` (src/content/{regions,cities}/{id}.yaml) ; toute anomalie lève au
// chargement, donc fait échouer le build. Id de fichier = id de la ville = code `?city=` (AD-4).
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests, scripts/checks/completeness.mjs).
import type { Lang } from '../langs.ts';

export type PerLang = Record<Lang, string>;

export interface RegionData {
  name: PerLang;
  /** Ancre de la région sur la page Zones (`#jerusalem-area`), identique dans les 4 langues. */
  anchor: string;
  order: number;
}

export interface CityData {
  name: PerLang;
  slugs: PerLang;
  /** Id de la région (nom de fichier de src/content/regions/). */
  region: string;
  intro: PerLang;
  /** Ordre manuel dans la région. */
  order: number;
  /** Localités voisines, noms localisés, sans liens ; vide → placeholder. */
  neighbors: readonly PerLang[];
  /** Ids d'avis (story 4.3). */
  reviews: readonly string[];
}

export interface Region extends RegionData {
  id: string;
}

export interface City extends CityData {
  id: string;
}

export interface Areas {
  /** Régions triées par `order`, puis par id. */
  regions: readonly Region[];
  /** Villes triées par ordre de leur région, puis par `order`, puis par id. */
  cities: readonly City[];
  city(id: string): City;
  region(id: string): Region;
}

/** Préfixe des ids de route des villes (`city:modiin`). */
export const CITY_ID_PREFIX = 'city:';

const fail = (lines: string[]): never => {
  throw new Error(lines.map((line) => `areas : ${line}`).join('\n'));
};

const byOrder = <T extends { id: string; order: number }>(a: T, b: T): number =>
  a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Valide (région connue, ancres uniques, ids uniques) et trie ; lève en nommant le fichier fautif. */
export function buildAreas(
  regionSources: readonly { id: string; data: RegionData }[],
  citySources: readonly { id: string; data: CityData }[],
): Areas {
  const errors: string[] = [];
  const regionById = new Map<string, Region>();
  const anchors = new Map<string, string>();
  for (const { id, data } of regionSources) {
    if (regionById.has(id)) {
      errors.push(`src/content/regions/${id}.yaml : région « ${id} » déclarée deux fois`);
      continue;
    }
    regionById.set(id, { id, ...data });
    const other = anchors.get(data.anchor);
    if (other !== undefined) errors.push(`src/content/regions/${id}.yaml : ancre « ${data.anchor} » déjà prise par « ${other} »`);
    else anchors.set(data.anchor, id);
  }
  const cityById = new Map<string, City>();
  for (const { id, data } of citySources) {
    if (cityById.has(id)) {
      errors.push(`src/content/cities/${id}.yaml : ville « ${id} » déclarée deux fois`);
      continue;
    }
    if (!regionById.has(data.region)) errors.push(`src/content/cities/${id}.yaml : région inconnue « ${data.region} »`);
    cityById.set(id, { id, ...data });
  }
  if (errors.length > 0) fail(errors);

  const regions = [...regionById.values()].sort(byOrder);
  const rank = new Map(regions.map((r, i) => [r.id, i]));
  const cities = [...cityById.values()].sort(
    (a, b) => (rank.get(a.region) as number) - (rank.get(b.region) as number) || byOrder(a, b),
  );
  return {
    regions: Object.freeze(regions),
    cities: Object.freeze(cities),
    city(id) {
      const city = cityById.get(id);
      return city ?? fail([`ville inconnue « ${id} »`]);
    },
    region(id) {
      const region = regionById.get(id);
      return region ?? fail([`région inconnue « ${id} »`]);
    },
  };
}

/** Sources du registre de routes (AD-2) : `city:{id}` sous `areas`, active même tant que `areas` est désactivée. */
export function citySources(cities: readonly { id: string; slugs: PerLang }[]) {
  return cities.map(({ id, slugs }) => ({
    id: `${CITY_ID_PREFIX}${id}`,
    slugs,
    enabled: true,
    parent: 'areas',
    inheritActive: false,
  }));
}

// — Story 4.3 (FR41, UX-DR24, AD-4, décisions D3 et D4 de l'epic 4) : avis Midrag des pages ville —

export interface ReviewData {
  /** Citation verbatim, dans la langue d'origine. */
  quote: string;
  /** Langue d'origine (citation, auteur, localité). */
  lang: Lang;
  author: string;
  /** Localité verbatim, dans la langue d'origine : nom de la ville ou d'une de ses voisines dans `lang`. */
  locality: string;
  /** Id de la ville qui référence l'avis. */
  city: string;
  /** Traductions optionnelles, jamais affichées (D4). */
  translations?: Partial<PerLang>;
}

export interface Review extends ReviewData {
  id: string;
}

/** Au plus 2 avis par ville (FR41). */
export const MAX_REVIEWS_PER_CITY = 2;

/** Ville vue par `buildReviews` : champs lus tels quels (YAML brut au lint, entrées validées au build). */
export interface ReviewCity {
  id: string;
  name?: Partial<PerLang>;
  neighbors?: readonly Partial<PerLang>[];
  reviews?: readonly string[];
}

const sameName = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' && typeof b === 'string' && a.trim().normalize('NFC') === b.trim().normalize('NFC');

/**
 * Valide les avis et leurs références, puis rend `reviewsOf(cityId)` (avis de la ville, dans l'ordre de ses
 * `reviews`). Lève en nommant le fichier fautif, toutes les erreurs d'un coup : ville à plus de 2 avis, avis
 * inconnu ou listé deux fois, avis d'une ville inconnue ou d'une autre ville que celle qui le référence, localité
 * qui n'est ni le nom de la ville ni celui d'une voisine dans la langue de l'avis. Un avis non référencé est accepté.
 */
export function buildReviews(
  reviewSources: readonly { id: string; data: ReviewData }[],
  cities: readonly ReviewCity[],
): (cityId: string) => readonly Review[] {
  const errors: string[] = [];
  const reviewById = new Map<string, Review>();
  for (const { id, data } of reviewSources) {
    if (reviewById.has(id)) {
      errors.push(`src/content/reviews/${id}.yaml : avis « ${id} » déclaré deux fois`);
      continue;
    }
    reviewById.set(id, { id, ...data });
  }
  const cityById = new Map(cities.map((c) => [c.id, c]));

  // Provenance : ville connue, localité = la ville ou une voisine, dans la langue d'origine de l'avis.
  for (const review of reviewById.values()) {
    const file = `src/content/reviews/${review.id}.yaml`;
    const city = cityById.get(review.city);
    if (city === undefined) {
      errors.push(`${file} : ville inconnue « ${review.city} »`);
      continue;
    }
    const neighbors = Array.isArray(city.neighbors) ? city.neighbors : [];
    const names = [city.name?.[review.lang], ...neighbors.map((n) => n?.[review.lang])];
    if (!names.some((name) => sameName(name, review.locality))) {
      errors.push(`${file} : localité « ${review.locality} » ni ${review.city} ni une de ses voisines (${review.lang})`);
    }
  }

  const byCity = new Map<string, readonly Review[]>();
  for (const city of cities) {
    const file = `src/content/cities/${city.id}.yaml`;
    const refs: readonly string[] = Array.isArray(city.reviews) ? city.reviews : [];
    if (refs.length > MAX_REVIEWS_PER_CITY) errors.push(`${file} : ${refs.length} avis (au plus ${MAX_REVIEWS_PER_CITY})`);
    const seen = new Set<string>();
    const list: Review[] = [];
    for (const ref of refs) {
      if (seen.has(ref)) {
        errors.push(`${file} : avis « ${ref} » listé deux fois`);
        continue;
      }
      seen.add(ref);
      const review = reviewById.get(ref);
      if (review === undefined) {
        errors.push(`${file} : avis inconnu « ${ref} »`);
        continue;
      }
      if (review.city !== city.id) {
        errors.push(`src/content/reviews/${ref}.yaml : avis de « ${review.city} », référencé par « ${city.id} »`);
        continue;
      }
      list.push(review);
    }
    byCity.set(city.id, Object.freeze(list));
  }
  if (errors.length > 0) fail(errors);

  return (cityId) => byCity.get(cityId) ?? fail([`ville inconnue « ${cityId} »`]);
}
