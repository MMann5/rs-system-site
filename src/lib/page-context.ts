// AD-13 : contexte de page unique, construit par chaque modèle et passé au layout Base.astro.
// Sans dépendance Astro, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
// La valeur par défaut d'`indexable` vient de env.ts (INDEXABLE, lu au build).
import { INDEXABLE } from './env.ts';
import { isLang, type Lang } from './langs.ts';

export interface PageContext {
  id: string;
  lang: Lang;
  service?: string;
  city?: string;
  navSection?: string;
  indexable: boolean;
}

export interface PageContextInput {
  id: string;
  lang: string;
  service?: string | undefined;
  city?: string | undefined;
  navSection?: string | undefined;
}

/** Construit le contexte ; lève si `lang` n'est pas une langue du site ou si `id` est vide. */
export function createPageContext(
  input: PageContextInput,
  { indexable = INDEXABLE }: { indexable?: boolean } = {},
): PageContext {
  const { id, lang, service, city, navSection } = input;
  if (typeof id !== 'string' || id === '') throw new Error('page-context : id vide');
  if (!isLang(lang)) throw new Error(`page-context : langue inconnue « ${String(lang)} »`);
  const ctx: PageContext = { id, lang, indexable };
  if (service !== undefined) ctx.service = service;
  if (city !== undefined) ctx.city = city;
  if (navSection !== undefined) ctx.navSection = navSection;
  return ctx;
}

/**
 * Contenu du bloc `<script type="application/json" id="rs-data">` : `{ context, ...tables }`.
 * `<` est échappé en `<` pour qu'aucune valeur ne ferme le script ; JSON.parse rend l'objet.
 */
export function serializeRsData(ctx: PageContext, tables: Record<string, unknown> = {}): string {
  if (Object.hasOwn(tables, 'context')) throw new Error('page-context : « context » est réservé dans les tables de #rs-data');
  return JSON.stringify({ context: ctx, ...tables }).replace(/</g, '\\u003c');
}
