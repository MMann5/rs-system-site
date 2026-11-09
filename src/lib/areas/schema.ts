// AD-4 (story 4.1) : schémas Zod stricts des régions et des villes, lus par src/content.config.ts.
// Module pur, sans import Astro virtuel, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
// Zod ne voit qu'une entrée à la fois : région connue et ancres uniques sont vérifiées par src/lib/areas/core.ts,
// slugs et chemins par le registre de routes (src/lib/routes).
import { z } from 'astro/zod';
import { LANGS } from '../langs.ts';
import { perLang, text } from '../page-schema.ts';

/** Ancre kebab-case (`url(id, lang, { hash })` n'accepte que [a-z0-9-]). */
const anchor = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
/** Id kebab-case (ville, avis). */
const kebabId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** src/content/regions/{id}.yaml : nom × 4, ancre, ordre ; `others` (story 4.4, D2) : ligne « autres yishouvim ». */
export const regionSchema = z.strictObject({
  name: perLang(text),
  anchor,
  order: z.number().int(),
  others: z.boolean().default(false),
});

/** src/content/cities/{id}.yaml : id du fichier = id de la ville = code `?city=`. */
export const citySchema = z.strictObject({
  name: perLang(text),
  // `slugs` et non `slug` : un champ `slug` remplacerait l'id de l'entrée (loader glob).
  slugs: perLang(z.string()),
  region: kebabId,
  intro: perLang(text),
  order: z.number().int(),
  neighbors: z.array(perLang(text)).default([]),
  reviews: z.array(kebabId).default([]),
});

/**
 * Story 4.3 (FR41, AD-4, décisions D3 et D4 de l'epic 4) : src/content/reviews/{id}.yaml, un fichier par avis Midrag.
 * Citation, auteur et localité verbatim, dans la langue d'origine `lang` (une des 4 langues du site, `DIR` connu).
 * `translations` est accepté mais jamais affiché (D4). Ville connue, provenance et ≤ 2 avis par ville :
 * src/lib/areas/core.ts (`buildReviews`).
 */
export const reviewSchema = z.strictObject({
  quote: text,
  lang: z.enum(LANGS),
  author: text,
  locality: text,
  city: kebabId,
  translations: perLang(text).partial().optional(),
});
