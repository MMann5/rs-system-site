// AD-9, AD-11 : toutes les photos vivent dans src/assets/ et passent par src/components/ResponsivePhoto.astro.
// Refuse : (a) une image matricielle dans public/ (sauf les icônes rs-icon-*, favicon*, apple-touch-icon*) ;
// (b) une photo dans src/ hors de src/assets/ ; (c) une balise <img dans un fichier texte de src/ autre que
// ResponsivePhoto.astro ; (d) un fichier de src/ qui importe depuis assets/photos/ et utilise aussi <Image,
// <Picture ou getImage( ; idem pour une photo .jpg/.webp/.avif/.heic importée d'ailleurs (une photo doit passer
// par ResponsivePhoto).
// Usage : node scripts/checks/photos.mjs [racine]  (défaut : racine du dépôt).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const COMPONENT = 'src/components/ResponsivePhoto.astro';
const RASTER = /\.(?:jpe?g|png|webp|avif|gif|heic|heif|tiff?|bmp)$/i;
const PHOTO = /\.(?:jpe?g|png|gif|webp|avif|heic|heif)$/i;
const ICON = /^(?:rs-icon-\d+|favicon[\w-]*|apple-touch-icon[\w-]*)\.png$/i;
const TEXT = /\.(?:astro|tsx?|m?js|mdx?|html)$/i;
const IMG_TAG = /<img\b/i;
// Import d'une photo : depuis assets/photos/, ou tout fichier .jpg/.jpeg/.webp/.avif/.heic/.heif (pas .png : logo).
const PHOTO_IMPORT =
  /\bfrom\s+['"](?:[^'"]*assets\/photos\/|[^'"]*\.(?:jpe?g|webp|avif|heic|heif)['"])|\bimport\s*\(\s*['"](?:[^'"]*assets\/photos\/|[^'"]*\.(?:jpe?g|webp|avif|heic|heif)['"])/i;
const IMAGE_API = /<Image\b|<Picture\b|\bgetImage\s*\(/;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() ? [path] : [];
  });
}

const rel = (root, path) => relative(root, path).split(sep).join('/');

/** Violations `{ file, reason }` (chemins relatifs à `root`, séparateur /), triées par fichier. */
export function findPhotoViolations(root) {
  const found = [];
  const pub = join(root, 'public');
  if (existsSync(pub)) {
    for (const path of files(pub)) {
      const name = path.split(sep).at(-1);
      if (RASTER.test(name) && !ICON.test(name)) found.push({ file: rel(root, path), reason: 'image dans public/ (photo : src/assets/ + ResponsivePhoto)' });
    }
  }
  const src = join(root, 'src');
  if (existsSync(src)) {
    for (const path of files(src)) {
      const file = rel(root, path);
      if (PHOTO.test(file) && !file.startsWith('src/assets/')) found.push({ file, reason: 'photo hors de src/assets/' });
      if (!TEXT.test(file) || file === COMPONENT) continue;
      const text = readFileSync(path, 'utf8');
      if (IMG_TAG.test(text)) found.push({ file, reason: `<img> brut (passer par ${COMPONENT})` });
      if (PHOTO_IMPORT.test(text) && IMAGE_API.test(text)) found.push({ file, reason: `photo rendue par <Image>, <Picture> ou getImage() (passer par ${COMPONENT})` });
    }
  }
  return found.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../../', import.meta.url));
  const found = findPhotoViolations(root);
  if (found.length > 0) {
    console.error(`photos : ${found.length} violation(s) (AD-9)\n` + found.map(({ file, reason }) => `  - ${file} : ${reason}`).join('\n'));
    process.exit(1);
  }
  console.log('photos : OK');
}
