// Story 5.2 (FR14, FR40, AD-2, AD-4, AD-11) : pages légales (src/content/legal/{id}/meta.yaml + {he,en,ru,fr}.md),
// chargées une fois au build. buildLegal lève sur une page active incomplète ou un `pending` incohérent : le build échoue.
// Les liens `page:<id>` du HTML rendu sont résolus par templates/Legal.astro (resolveProseLinks + registre), ce module
// étant lui-même une source du registre (src/lib/routes/index.ts).
import { getCollection, type CollectionEntry } from 'astro:content';
import type { RouteSource } from '../routes/core.ts';
import type { Lang } from '../langs.ts';
import { buildLegal, type LegalDoc } from './core.ts';

export type LegalMeta = CollectionEntry<'legalMeta'>['data'];

const metas = await getCollection('legalMeta');
const docs = await getCollection('legal');

const legal = buildLegal(
  metas.map(({ id, data }) => ({ id, data })),
  docs.map((entry) => ({ id: entry.id, pending: entry.data.pending, body: entry.body ?? '', html: entry.rendered?.html ?? '' })),
);

/** Sources du registre de routes, triées par id (`accessibility`, `privacy`, `terms`). */
export const LEGAL_SOURCES: RouteSource[] = legal.pages.map(({ id, data }) => ({ id, slugs: data.slugs, enabled: data.enabled }));

const byId = new Map(legal.pages.map(({ id, data }) => [id, data]));

/** Données validées de la page légale `id` ; lève si elle n'existe pas. */
export function legalPage(id: string): LegalMeta {
  const data = byId.get(id);
  if (!data) throw new Error(`legal : page inconnue « ${id} »`);
  return data;
}

/** Texte `lang` de la page légale `id` : `pending` (placeholder juridique) et HTML rendu (liens `page:` non résolus). */
export function legalDoc(id: string, lang: Lang): LegalDoc {
  return legal.doc(id, lang);
}
