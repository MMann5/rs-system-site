// Story 5.1 (FR10, FR40, AD-4, décision D3 de l'epic 5) : règles pures de la page À propos.
// Sans dépendance Astro, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import type { z } from 'astro/zod';
import type { aboutPageSchema, fillable } from './page-schema.ts';
import type { Lang } from './langs.ts';

export type AboutData = z.infer<typeof aboutPageSchema>;
export type Fillable = z.infer<typeof fillable>;

/** Ordre fixe des chiffres (canvas About.dc.html) : année de création, installations, zone. */
export const ABOUT_STAT_KEYS = ['founded', 'installations', 'zone'] as const;
export type AboutStatKey = (typeof ABOUT_STAT_KEYS)[number];

/** Texte d'un champ `fillable` en `lang` ; `placeholder` vrai = à rendre par <Placeholder> (sans crochets ici). */
export function fill(value: Fillable, lang: Lang): { text: string; placeholder: boolean } {
  return 'placeholder' in value ? { text: value.placeholder[lang], placeholder: true } : { text: value[lang], placeholder: false };
}

export interface AboutStat {
  key: AboutStatKey;
  value: string;
  placeholder: boolean;
  label: string;
}

/** Chiffres présents dans les données, dans l'ordre fixe : un chiffre retiré ne laisse ni colonne ni trou. */
export function aboutStats(about: Pick<AboutData, 'stats'>, lang: Lang): AboutStat[] {
  return ABOUT_STAT_KEYS.flatMap((key) => {
    const stat = about.stats[key];
    if (!stat) return [];
    const { text, placeholder } = fill(stat.value, lang);
    return [{ key, value: text, placeholder, label: stat.label[lang] }];
  });
}
