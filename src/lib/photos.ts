// AD-9, NFR4 : largeurs et media des photos, lus par src/components/ResponsivePhoto.astro.
// Pur, sans import Astro, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).

/** Largeurs servies (EXPERIENCE.md › Performance), croissantes. */
export const PHOTO_WIDTHS = [480, 768, 1080, 1440, 1920, 2560] as const;

/** Source 4:5 dédiée sous 700px (--bp-mobile-bar) pour les photos qui portent du texte. */
export const MOBILE_PHOTO_MEDIA = '(width < 700px)';

/**
 * Largeurs de PHOTO_WIDTHS ≤ `sourceWidth` (et ≤ `max` s'il est donné) : jamais d'agrandissement.
 * Une source plus étroite que la plus petite largeur n'est servie qu'à sa taille : `[sourceWidth]`.
 */
export function photoWidths(sourceWidth: number, max: number = Infinity): number[] {
  const limit = Math.min(sourceWidth, max);
  const widths = PHOTO_WIDTHS.filter((w) => w <= limit);
  return widths.length > 0 ? widths : [sourceWidth];
}
