// Story 3.2 (FR3, AD-4) : héros des pages services, photo encadrée ou illustration (détecteur de fumée).
// `hero.alt` est facultatif au schéma (héros illustré) mais obligatoire pour un héros à photo : la garde vit ici.
// Story 3.3 (UX-DR14) : ratio du cadre sous 700px par photo, 4:5 (`portrait`, défaut) ou 4:3 (`landscape` :
// interrupteur, interphone), avec son point focal (jeton --photo-focus-{focus}).
// Pur, sans import Astro, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import type { Lang } from './langs.ts';

/** Point focal d'une photo de héros : jeton --photo-focus-{focus} de tokens.css. */
export type HeroFocus = 'dome' | 'switch' | 'intercom';

/** Ratio du cadre sous 700px : 4:5 (--photo-ratio-portrait) ou 4:3 (--photo-ratio-mobile-landscape). */
export type HeroMobileRatio = 'portrait' | 'landscape';

/** Héros photo de SERVICE_PAGES (`src`/`portrait` : images importées par le modèle ; `portrait` = recadrage mobile). */
export interface HeroPhotoDef<I> {
  kind: 'photo';
  src: I;
  portrait: I;
  focus: HeroFocus;
  /** Ratio du cadre sous 700px ; `portrait` (4:5) par défaut. */
  mobile?: HeroMobileRatio;
}

export type HeroDef<I> = HeroPhotoDef<I> | { kind: 'detector' };

/** Photo du héros prête pour HeroLight. */
export interface HeroPhoto<I> {
  src: I;
  portrait: I;
  focus: HeroFocus;
  mobile: HeroMobileRatio;
  alt: string;
}

/**
 * Photo du héros de la page `id` en `lang`, avec son `alt` traduit ; `undefined` pour un héros illustré.
 * Lève une erreur nommant la page si un héros à photo n'a pas de `hero.alt` dans son YAML.
 */
export function heroPhoto<I>(
  id: string,
  hero: HeroDef<I>,
  alt: Record<Lang, string> | undefined,
  lang: Lang,
): HeroPhoto<I> | undefined {
  if (hero.kind !== 'photo') return undefined;
  if (!alt) throw new Error(`Service : page « ${id} » à photo sans hero.alt dans src/content/pages/${id}.yaml`);
  return { src: hero.src, portrait: hero.portrait, focus: hero.focus, mobile: hero.mobile ?? 'portrait', alt: alt[lang] };
}
