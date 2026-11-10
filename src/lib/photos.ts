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
// Story 3.5 : `sizes` des tuiles de l'accueil.
/** Tuile claire caméras : cadre de 1100px au plus, entre les --tile-gutter (12px) et les --page-gutter (22px). */
export const FEATURE_TILE_PHOTO_SIZES = 'min(1100px, calc(100vw - 68px))';
/**
 * Tuile de la grille : 2 colonnes dès 1076px (2 × 520px + joint de 12px + 2 × 12px de padding), chacune
 * la moitié de l'écran moins 18px ; sinon une colonne, l'écran moins les deux --tile-gutter.
 */
export const GRID_TILE_PHOTO_SIZES = '(width >= 1076px) calc(50vw - 18px), calc(100vw - 24px)';
// Story 6.1 : `sizes` des photos du blog.
/** Photo d'article : cadre 16:9 de la largeur du conteneur (1180px au plus, entre les --page-gutter), comme le héros clair. */
export const ARTICLE_PHOTO_SIZES = FRAMED_PHOTO_SIZES;
/**
 * Carte de blog : grille `minmax(min(100%, 300px), 1fr)` (écart de 24px) dans le conteneur. 3 colonnes dès 992px
 * (948px de contenu), 2 dès 668px (624px), sinon une : l'écran moins les deux --page-gutter (22px).
 */
export const BLOG_CARD_PHOTO_SIZES =
  '(width >= 992px) min(377px, calc((100vw - 92px) / 3)), (width >= 668px) calc((100vw - 68px) / 2), calc(100vw - 44px)';
/**
 * Story 6.2 : carte vedette de l'index. Dès 960px, image et texte côte à côte en deux colonnes égales du conteneur
 * (1180px au plus, entre les --page-gutter) ; en dessous, empilée sur toute la largeur du conteneur (l'écran moins les
 * deux --page-gutter).
 */
export const FEATURED_PHOTO_SIZES = '(width >= 960px) min(590px, calc((100vw - 44px) / 2)), calc(100vw - 44px)';
