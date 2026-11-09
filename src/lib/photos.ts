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

// Story 3.1 : `sizes` des photos des pages services (les attributs HTML ne lisent pas les tokens).
/** Photo encadrée du héros clair : --container (1180px) au plus, entre les deux --page-gutter (22px). */
export const FRAMED_PHOTO_SIZES = 'min(1180px, calc(100vw - 44px))';
/** Tuile pleine largeur : l'écran moins les deux --tile-gutter (12px). */
export const TILE_PHOTO_SIZES = 'calc(100vw - 24px)';
