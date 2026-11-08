// AD-4 : schémas Zod des contenus. Zod ne voit qu'une entrée à la fois : la complétude entre
// fichiers (doublons de chemin, mêmes clés i18n) est vérifiée par src/lib/routes et src/lib/i18n.
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { KEY_RE } from './lib/i18n/core.ts';

const text = z.string().trim().min(1);

// Id = nom de fichier brut : l'id par défaut est slugifié et masquerait les ids invalides ou en double.
const fileId = ({ entry }: { entry: string }) => entry.replace(/\.(yaml|json)$/, '');

/** Un champ traduisible : les 4 langues, rien d'autre. */
const perLang = <T extends z.ZodType>(value: T) => z.strictObject({ he: value, en: value, ru: value, fr: value });

// Pages fixes : src/content/pages/{id}.yaml, id = nom du fichier.
// Le champ s'appelle `slugs` : un champ `slug` remplacerait l'id de l'entrée (loader glob).
const pages = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/pages', generateId: fileId }),
  schema: z.strictObject({
    slugs: perLang(z.string()),
    enabled: z.boolean(),
    previewOnly: z.boolean().default(false),
    meta: z.strictObject({ title: perLang(text), description: perLang(text) }),
  }),
});

// Chaînes d'interface : src/i18n/{lang}.json, clés plates pointées.
const i18n = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/i18n', generateId: fileId }),
  schema: z.record(z.string().regex(KEY_RE), text),
});

// Services : src/content/services.yaml, liste d'entrées dont l'id est le code (AD-4, AD-5).
// Le loader file() garde le champ `id` dans les données. Codes attendus : src/lib/contact/table.ts.
const services = defineCollection({
  loader: file('src/content/services.yaml'),
  schema: z.strictObject({
    id: z.string(),
    label: perLang(text),
    page: z.string().optional(),
  }),
});

// Preuves du bloc contact : src/content/proof.yaml (FR41, AD-4, D2). Champs optionnels : absent = masqué.
const proof = defineCollection({
  loader: file('src/content/proof.yaml'),
  schema: z.strictObject({
    id: z.string(),
    rating: z.number().min(0).max(10).optional(),
    reviews: z.number().int().positive().optional(),
  }),
});

export const collections = { pages, i18n, services, proof };
