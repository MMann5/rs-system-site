// AD-5 : tables de libellés préparées au build, { code: { label, he } }.
// Les services viennent de src/content/services.yaml (collection `services`), validés au chargement.
// Story 4.1 : les villes viennent des collections `regions` / `cities` (src/lib/areas), ordre région puis ville.
import { getCollection } from 'astro:content';
import { CITIES } from '../areas/index.ts';
import type { Lang } from '../langs.ts';
import type { LabelTable } from './core.ts';
import { buildCityTable, buildServiceTable, type ServiceEntry, type ServiceTable } from './table.ts';

const entries: ServiceEntry[] = (await getCollection('services')).map(({ id, data }) => ({
  id,
  label: data.label,
  page: data.page,
}));

// Valide les 7 codes au premier import de ce module (MobileBar.astro l'importe sur chaque page
// depuis la story 1.6) : un services.yaml fautif fait échouer le build.
buildServiceTable(entries, 'he');

export function serviceLabels(lang: Lang): ServiceTable {
  return buildServiceTable(entries, lang);
}

/** Id de la page liée au service `code` (services.yaml `page`) ; aucune pour `unsure` ou un code inconnu. */
export function servicePage(code: string): string | undefined {
  return entries.find((entry) => entry.id === code)?.page;
}

/**
 * Table des villes `{ code: { label, he } }` pour `?city=`, la correspondance de nom du formulaire et le
 * message WhatsApp des pages ville (FR29, FR30, FR31). Ordre : région, puis ville dans la région.
 */
export function cityLabels(lang: Lang): LabelTable {
  return buildCityTable(CITIES, lang);
}
