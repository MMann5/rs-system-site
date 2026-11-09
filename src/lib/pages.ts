// Accès synchrone aux contenus des pages fixes (src/content/pages/{id}.yaml), chargés une fois au build.
import { getCollection, type CollectionEntry } from 'astro:content';

export type PageData = CollectionEntry<'pages'>['data'];

const all = await getCollection('pages');

/** Pages triées par id : ordre stable du registre. */
export const PAGES: readonly { id: string; data: PageData }[] = all
  .map(({ id, data }) => ({ id, data }))
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const byId = new Map(PAGES.map(({ id, data }) => [id, data]));

/** Données validées par Zod de la page `id` ; lève si elle n'existe pas. */
export function page(id: string): PageData {
  const data = byId.get(id);
  if (!data) throw new Error(`pages : page inconnue « ${id} »`);
  return data;
}
