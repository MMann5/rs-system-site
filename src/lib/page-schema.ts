// AD-4 : schéma Zod d'une page fixe (src/content/pages/{id}.yaml), lu par src/content.config.ts.
// Module pur, sans import Astro virtuel, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import { z } from 'astro/zod';

/** Texte non vide après suppression des espaces. */
export const text = z.string().trim().min(1);

/** Un champ traduisible : les 4 langues, rien d'autre. */
export const perLang = <T extends z.ZodType>(value: T) => z.strictObject({ he: value, en: value, ru: value, fr: value });

// Story 3.1 (FR2, AD-4) : contenu propre à une page service (src/templates/Service.astro). Héros clair,
// trio « pour qui » (exactement 3 publics), tuile facultative ; chaque texte dans les 4 langues.
// Les étapes et les libellés des liens sont communs : src/i18n (steps.*, action.*).
const trioItem = z.strictObject({ title: perLang(text), text: perLang(text) });
export const servicePageSchema = z.strictObject({
  // Story 3.2 : `alt` facultatif (héros illustré, sans photo) ; Service.astro l'exige pour un héros à photo.
  hero: z.strictObject({ title: perLang(text), subtitle: perLang(text), alt: perLang(text).optional() }),
  trio: z.strictObject({ title: perLang(text), items: z.array(trioItem).length(3) }),
  tile: z
    .strictObject({ eyebrow: perLang(text).optional(), title: perLang(text), text: perLang(text), alt: perLang(text) })
    .optional(),
});

// Le champ s'appelle `slugs` : un champ `slug` remplacerait l'id de l'entrée (loader glob).
export const pageSchema = z.strictObject({
  slugs: perLang(z.string()),
  enabled: z.boolean(),
  previewOnly: z.boolean().default(false),
  meta: z.strictObject({ title: perLang(text), description: perLang(text) }),
  service: servicePageSchema.optional(),
});
