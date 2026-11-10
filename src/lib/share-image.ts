// FR39, AD-9, story 7.2 (décision D4 de l'epic 7) : images de partage 1200 × 630 des pages. Seul point de recadrage
// Open Graph : il reçoit la photo (ImageMetadata) du modèle, sans importer de photo lui-même
// (scripts/checks/photos.mjs). Photo du héros ou de l'article → JPEG `cover` ; sinon carte générée au build
// (src/pages/og/[card].png.ts).
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { SHARE_CARD_PATHS, type ShareCard } from './seo';
import { SHARE_HEIGHT, SHARE_WIDTH, type ShareImage } from './share';

/** Photo recadrée `cover` en JPEG 1200 × 630 (chemin depuis la racine, sous /_astro/). */
export async function photoShareImage(image: ImageMetadata): Promise<ShareImage> {
  const result = await getImage({ src: image, width: SHARE_WIDTH, height: SHARE_HEIGHT, fit: 'cover', format: 'jpeg' });
  return { src: result.src, width: SHARE_WIDTH, height: SHARE_HEIGHT, type: 'image/jpeg' };
}

const card = (name: ShareCard): ShareImage => ({ src: SHARE_CARD_PATHS[name], width: SHARE_WIDTH, height: SHARE_HEIGHT, type: 'image/png' });

/** Cartes générées au build : logo complet sur navy (défaut), détecteur dessiné. */
export const SHARE_CARDS: Record<ShareCard, ShareImage> = { logo: card('logo'), detector: card('detector') };
