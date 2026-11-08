// AD-5 : tables de libellés préparées au build, { code: { label, he } }. Les villes s'ajoutent en epic 4.
// Les services viennent de src/content/services.yaml (collection `services`), validés au chargement.
import { getCollection } from 'astro:content';
import type { Lang } from '../langs.ts';
import { buildServiceTable, type ServiceEntry, type ServiceTable } from './table.ts';

const entries: ServiceEntry[] = (await getCollection('services')).map(({ id, data }) => ({
  id,
  label: data.label,
  page: data.page,
}));

// Valide les 7 codes au premier import de ce module (stories 1.6+ ; aucun import en 1.5,
// d'ici là tests/contact.test.mjs garde services.yaml).
buildServiceTable(entries, 'he');

export function serviceLabels(lang: Lang): ServiceTable {
  return buildServiceTable(entries, lang);
}
