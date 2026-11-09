// AD-5 : tables de libellés préparées au build, { code: { label, he } }. Les villes s'ajoutent en epic 4.
// Les services viennent de src/content/services.yaml (collection `services`), validés au chargement.
import { getCollection } from 'astro:content';
import type { Lang } from '../langs.ts';
import type { LabelTable } from './core.ts';
import { buildServiceTable, type ServiceEntry, type ServiceTable } from './table.ts';

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

/**
 * Table des villes `{ code: { label, he } }` pour `?city=` et la correspondance de nom du formulaire.
 * Vide jusqu'à l'epic 4, qui crée la collection des villes.
 */
export function cityLabels(_lang: Lang): LabelTable {
  return {};
}
