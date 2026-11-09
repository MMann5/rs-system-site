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
  // Story 3.4 : `eyebrow` facultatif, sur-titre du héros sombre (« לקבלנים » d'Entrepreneurs), complet s'il est présent.
  hero: z.strictObject({
    eyebrow: perLang(text).optional(),
    title: perLang(text),
    subtitle: perLang(text),
    alt: perLang(text).optional(),
  }),
  trio: z.strictObject({ title: perLang(text), items: z.array(trioItem).length(3) }),
  tile: z
    .strictObject({ eyebrow: perLang(text).optional(), title: perLang(text), text: perLang(text), alt: perLang(text) })
    .optional(),
});

// Story 3.5 (FR1, AD-4) : textes des tuiles de l'accueil (src/templates/Home.astro, canvas Main.dc.html) : tuile
// caméras, tuile grue (avec sur-titre), grille sous un titre masqué (syndics, interphone, maison connectée,
// réseaux) et tuile détecteur (sans photo, donc sans `alt`). Libellés des liens : src/i18n (action.*).
const homeTile = z.strictObject({ title: perLang(text), text: perLang(text), alt: perLang(text) });
export const homePageSchema = z.strictObject({
  cameras: homeTile,
  crane: z.strictObject({ eyebrow: perLang(text), title: perLang(text), text: perLang(text), alt: perLang(text) }),
  services: z.strictObject({
    title: perLang(text),
    management: homeTile,
    intercom: homeTile,
    'smart-home': homeTile,
    networks: homeTile,
  }),
  smoke: z.strictObject({ title: perLang(text), text: perLang(text) }),
});

// Story 5.1 (FR10, FR40, AD-4, décisions D2 et D3 de l'epic 5) : contenu de la page À propos (src/templates/About.astro).
// `fillable` : un texte fourni dans les 4 langues, ou `{ placeholder }` (4 langues, sans crochets) tant que RS SYSTEM
// ne l'a pas fourni, rendu par <Placeholder>. Mêler les deux formes, ou omettre une langue, est refusé.
export const fillable = z.union([perLang(text), z.strictObject({ placeholder: perLang(text) })]);
/** Un chiffre : valeur et libellé de colonne ensemble (retirer l'entrée retire la colonne). */
const aboutStat = z.strictObject({ value: fillable, label: perLang(text) });
export const aboutPageSchema = z.strictObject({
  hero: z.strictObject({ title: perLang(text) }),
  story: fillable,
  // Chiffres dans un ordre fixe (année · installations · zone), chacun facultatif ; `label` = aria-label de la section.
  stats: z.strictObject({
    label: perLang(text),
    founded: aboutStat.optional(),
    installations: aboutStat.optional(),
    zone: aboutStat.optional(),
  }),
  how: z.strictObject({
    title: perLang(text),
    items: z.array(z.strictObject({ title: perLang(text), text: fillable })).length(3),
  }),
});

// Le champ s'appelle `slugs` : un champ `slug` remplacerait l'id de l'entrée (loader glob).
export const pageSchema = z.strictObject({
  slugs: perLang(z.string()),
  enabled: z.boolean(),
  previewOnly: z.boolean().default(false),
  meta: z.strictObject({ title: perLang(text), description: perLang(text) }),
  service: servicePageSchema.optional(),
  home: homePageSchema.optional(),
  about: aboutPageSchema.optional(),
});

/** Story 3.5 : bloc `home` de la page `id`, obligatoire pour l'accueil ; lève une erreur nommant le fichier sinon. */
export function requireHome<T>(id: string, home: T | undefined): T {
  if (!home) throw new Error(`Home : bloc « home » absent de src/content/pages/${id}.yaml`);
  return home;
}

/** Story 5.1 : bloc `about` de la page `id`, obligatoire pour À propos ; lève une erreur nommant le fichier sinon. */
export function requireAbout<T>(id: string, about: T | undefined): T {
  if (!about) throw new Error(`About : bloc « about » absent de src/content/pages/${id}.yaml`);
  return about;
}
