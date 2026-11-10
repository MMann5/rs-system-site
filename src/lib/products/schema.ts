// Pages produits (épopée « pages produits », décision de Mike du 2026-11-10) : une page par produit, avec une scène 3D
// pré-rendue (src/assets/frames/{id}/) que le défilement fait avancer, puis les usages, les étapes et le bloc contact.
// Contenu : src/content/products/{id}.yaml, id = nom du fichier = nom du modèle (scripts/render/models/{id}.js).
import { z } from 'astro/zod';
import { perLang, text } from '../page-schema.ts';

const titled = z.strictObject({ title: perLang(text), text: perLang(text) });

// Le champ s'appelle `slugs` : un champ `slug` remplacerait l'id de l'entrée (loader glob).
export const productSchema = z.strictObject({
  slugs: perLang(z.string()),
  enabled: z.boolean(),
  /** Page service sous laquelle vit le produit (chemin et activité hérités) ; absent = à la racine de la langue. */
  parent: z.string().optional(),
  /** Page service qui affiche la carte du produit, quand le produit n'a pas de `parent` (ex. l'alarme, listée sur Caméras). */
  listedOn: z.string().optional(),
  /** Code `?service=` (src/content/services.yaml) du lien Contact ; absent = Contact sans service. */
  service: z.string().optional(),
  /** Ordre parmi les produits d'une même page service. */
  order: z.number().int(),
  /** Nom court : cartes produits, et en hébreu, message WhatsApp (« …הצעת מחיר ל{name.he}. »). */
  name: perLang(text),
  meta: z.strictObject({ title: perLang(text), description: perLang(text) }),
  scene: z.strictObject({
    eyebrow: perLang(text),
    /** h1 de la page, en gros sur la première image. */
    title: perLang(text),
    /** Étape 2 : la fonction phare (gros plan). */
    feature: titled,
    /** Étape 3 : l'éclatement ; une étiquette par pièce, dans l'ordre des ancres du modèle. */
    inside: z.strictObject({ title: perLang(text), parts: z.array(perLang(text)).min(3) }),
    /** Étape 4 : remonté, invitation au devis. */
    outro: titled,
  }),
  uses: z.strictObject({ title: perLang(text), items: z.array(titled).length(3) }),
});

export type ProductData = z.infer<typeof productSchema>;
