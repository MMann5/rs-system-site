// Story 3.2 (FR3, AD-4) : héros des pages services, photo encadrée ou illustration (détecteur de fumée).
// `hero.alt` est facultatif au schéma (héros illustré) mais obligatoire pour un héros à photo : la garde vit ici.
// Pur, sans import Astro, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import type { Lang } from './langs.ts';

/** Héros photo de SERVICE_PAGES (`src`/`portrait` : images importées par le modèle). */
export interface HeroPhotoDef<I> {
  kind: 'photo';
  src: I;
  portrait: I;
  focus: 'dome';
}

export type HeroDef<I> = HeroPhotoDef<I> | { kind: 'detector' };

/**
 * Photo du héros de la page `id` en `lang`, avec son `alt` traduit ; `undefined` pour un héros illustré.
 * Lève une erreur nommant la page si un héros à photo n'a pas de `hero.alt` dans son YAML.
 */
export function heroPhoto<I>(
  id: string,
  hero: HeroDef<I>,
  alt: Record<Lang, string> | undefined,
  lang: Lang,
): { src: I; portrait: I; focus: 'dome'; alt: string } | undefined {
  if (hero.kind !== 'photo') return undefined;
  if (!alt) throw new Error(`Service : page « ${id} » à photo sans hero.alt dans src/content/pages/${id}.yaml`);
  return { src: hero.src, portrait: hero.portrait, focus: hero.focus, alt: alt[lang] };
}
