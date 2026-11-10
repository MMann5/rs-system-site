// AD-4 : schémas Zod des contenus. Zod ne voit qu'une entrée à la fois : la complétude entre
// fichiers (doublons de chemin, mêmes clés i18n) est vérifiée par src/lib/routes et src/lib/i18n.
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { citySchema, regionSchema, reviewSchema } from './lib/areas/schema.ts';
import { KEY_RE } from './lib/i18n/core.ts';
import { productSchema } from './lib/products/schema.ts';
import { legalDocSchema, legalMetaSchema, pageSchema, perLang, postDocSchema, postMetaSchema, text } from './lib/page-schema.ts';

// Id = nom de fichier brut : l'id par défaut est slugifié et masquerait les ids invalides ou en double.
const fileId = ({ entry }: { entry: string }) => entry.replace(/\.(yaml|json)$/, '');

// Pages fixes : src/content/pages/{id}.yaml, id = nom du fichier.
// Schéma (slugs, enabled, meta, bloc `service` des pages services) : src/lib/page-schema.ts.
const pages = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/pages', generateId: fileId }),
  schema: pageSchema,
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

// Story 4.1 (FR9, AD-2, AD-4) : régions (src/content/regions/{id}.yaml) et villes (src/content/cities/{id}.yaml),
// id = nom du fichier (id de ville = code `?city=`). Schémas : src/lib/areas/schema.ts ; région connue, ancres
// uniques et tri : src/lib/areas/core.ts ; slugs et chemins `city:{id}` : registre de routes.
const regions = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/regions', generateId: fileId }),
  schema: regionSchema,
});

const cities = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/cities', generateId: fileId }),
  schema: citySchema,
});

// Story 4.3 (FR41, AD-4, D3, D4) : avis Midrag, un fichier par avis (src/content/reviews/{id}.yaml), id = nom du
// fichier. Schéma : src/lib/areas/schema.ts ; ≤ 2 avis par ville et provenance : src/lib/areas/core.ts.
// Aucun avis au lancement (D3) : le dossier ne contient que son README.
const reviews = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/reviews', generateId: fileId }),
  schema: reviewSchema,
});

// Story 5.2 (FR14, AD-2, AD-4, AD-11) : pages légales. Métas : src/content/legal/{id}/meta.yaml, id = nom du dossier ;
// textes : src/content/legal/{id}/{lang}.md, id `{id}/{lang}` (Markdown sans plugin, rendu par Astro). Complétude
// (4 .md par page active, `pending` ⇔ corps vide, dossier avec meta.yaml) : src/lib/legal/core.ts (buildLegal).
const legalMeta = defineCollection({
  loader: glob({ pattern: '*/meta.yaml', base: './src/content/legal', generateId: ({ entry }) => entry.replace(/\/meta\.yaml$/, '') }),
  schema: legalMetaSchema,
});

const legal = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/legal', generateId: ({ entry }) => entry.replace(/\.md$/, '') }),
  schema: legalDocSchema,
});

// Story 6.1 (FR12, FR25, AD-4, AD-11, décision D1 de l'epic 6) : articles du blog. Métas : src/content/posts/{id}/meta.yaml,
// id = nom du dossier ; textes : src/content/posts/{id}/{lang}.md, id `{id}/{lang}`. Complétude (4 .md par article actif,
// `alt` ⇔ image, image présente dans src/assets/blog/, corps non vide) : src/lib/blog/core.ts (buildPosts).
const postsMeta = defineCollection({
  loader: glob({ pattern: '*/meta.yaml', base: './src/content/posts', generateId: ({ entry }) => entry.replace(/\/meta\.yaml$/, '') }),
  schema: postMetaSchema,
});

const posts = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/posts', generateId: ({ entry }) => entry.replace(/\.md$/, '') }),
  schema: postDocSchema,
});

// Pages produits : src/content/products/{id}.yaml, id = nom du fichier = nom du modèle 3D (scripts/render/models/{id}.js).
// Schéma : src/lib/products/schema.ts ; scènes rendues et contrôle : src/lib/products/index.ts.
const products = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/products', generateId: fileId }),
  schema: productSchema,
});

export const collections = { products, pages, i18n, services, proof, regions, cities, reviews, legalMeta, legal, postsMeta, posts };
