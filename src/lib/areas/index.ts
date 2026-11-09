// FR9, AD-2, AD-4 (story 4.1) : régions et villes, chargées une fois au build depuis les collections
// `regions` et `cities`, validées et triées par src/lib/areas/core.ts. Accès synchrone (comme src/lib/pages.ts).
import { getCollection } from 'astro:content';
import { buildAreas } from './core.ts';

export type { City, Region } from './core.ts';
export { CITY_ID_PREFIX } from './core.ts';

const areas = buildAreas(
  (await getCollection('regions')).map(({ id, data }) => ({ id, data })),
  (await getCollection('cities')).map(({ id, data }) => ({ id, data })),
);

/** Régions triées par ordre. */
export const REGIONS = areas.regions;
/** Villes triées par région, puis par ordre dans la région. */
export const CITIES = areas.cities;
/** Ville `id` ; lève si elle n'existe pas. */
export const city = areas.city;
/** Région `id` ; lève si elle n'existe pas. */
export const region = areas.region;
