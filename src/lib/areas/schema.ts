// AD-4 (story 4.1) : schémas Zod stricts des régions et des villes, lus par src/content.config.ts.
// Module pur, sans import Astro virtuel, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
// Zod ne voit qu'une entrée à la fois : région connue et ancres uniques sont vérifiées par src/lib/areas/core.ts,
// slugs et chemins par le registre de routes (src/lib/routes).
import { z } from 'astro/zod';
import { perLang, text } from '../page-schema.ts';

/** Ancre kebab-case (`url(id, lang, { hash })` n'accepte que [a-z0-9-]). */
const anchor = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** src/content/regions/{id}.yaml : nom × 4, ancre, ordre. */
export const regionSchema = z.strictObject({
  name: perLang(text),
  anchor,
  order: z.number().int(),
});

/** src/content/cities/{id}.yaml : id du fichier = id de la ville = code `?city=`. */
export const citySchema = z.strictObject({
  name: perLang(text),
  // `slugs` et non `slug` : un champ `slug` remplacerait l'id de l'entrée (loader glob).
  slugs: perLang(z.string()),
  region: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  intro: perLang(text),
  order: z.number().int(),
  neighbors: z.array(perLang(text)).default([]),
  reviews: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).default([]),
});
