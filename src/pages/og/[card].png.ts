// FR39, AD-1, AD-8, story 7.2 (décision D4 de l'epic 7) : cartes de partage 1200 × 630 générées au build (endpoint
// statique, aucun rendu à la requête) : /og/logo.png et /og/detector.png (SHARE_CARD_PATHS de src/lib/seo.ts).
// - detector : SVG de src/lib/share.ts tiré des jetons de tokens.css (lus par `?raw`), rendu en PNG par sharp ;
// - logo : brand/logo-final/rs-logo-full-on-navy.png (copie dans src/assets/brand/) ramené à 630px de haut, élargi à
//   1200px en recopiant ses bords : aucune couleur de fond inventée (le fond du PNG n'est pas exactement --color-navy).
// Le PNG est lu par un chemin relatif à la racine du projet (process.cwd(), où tourne toujours le build) :
// import.meta.url pointe sur le bundle compilé.
import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import tokensCss from '../../styles/tokens.css?raw';
import type { ShareCard } from '../../lib/seo';
import { detectorCardSvg, parseTokens, SHARE_HEIGHT, SHARE_WIDTH } from '../../lib/share';

const LOGO_FILE = 'src/assets/brand/rs-logo-full-on-navy.png';
/** Marge retirée sur chaque bord du PNG source (3000 × 2000), en pixels source. */
const LOGO_EDGE = 24;

export const getStaticPaths: GetStaticPaths = () => [{ params: { card: 'logo' } }, { params: { card: 'detector' } }];

async function logoCard(): Promise<Uint8Array> {
  const source = sharp(LOGO_FILE);
  const { width = 0, height = 0 } = await source.metadata();
  // Liseré clair sur les derniers pixels du PNG (bords droit et bas) : retiré avant de recopier les bords, sinon il
  // serait étiré en bandes. Coordonnées de pixels sharp, pas du CSS : physical-ok.
  const crop = { left: LOGO_EDGE, top: LOGO_EDGE, width: width - 2 * LOGO_EDGE, height: height - 2 * LOGO_EDGE }; // physical-ok
  const resized = await source.extract(crop).resize({ height: SHARE_HEIGHT }).toBuffer({ resolveWithObject: true });
  const extra = SHARE_WIDTH - resized.info.width;
  if (extra < 0) throw new Error(`og : logo plus large que ${SHARE_WIDTH}px à ${SHARE_HEIGHT}px de haut`);
  const left = Math.floor(extra / 2);
  return sharp(resized.data)
    .extend({ left, right: extra - left, extendWith: 'copy' })
    // Palette : ≤ 300 Ko (limite d'aperçu WhatsApp) ; le PNG plein fait plus de 500 Ko.
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toBuffer();
}

async function detectorCard(): Promise<Uint8Array> {
  return sharp(new TextEncoder().encode(detectorCardSvg(parseTokens(tokensCss)))).png().toBuffer();
}

export const GET: APIRoute = async ({ params }) => {
  const name = params.card as ShareCard;
  const png = name === 'logo' ? await logoCard() : name === 'detector' ? await detectorCard() : undefined;
  if (png === undefined) throw new Error(`og : carte inconnue « ${String(params.card)} »`);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
