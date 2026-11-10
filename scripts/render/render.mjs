// Rendu des scènes produits en suites d'images (technique « Apple » : le défilement fait avancer les images).
// Usage : node scripts/render/render.mjs <id…>   (ex. bullet dome). Sans argument : tous les modèles.
// Lit scripts/render/models/{id}.js, rend chaque variante dans Chromium (WebGL logiciel, déterministe), écrit
// src/assets/frames/{id}/{variante}/NNN.webp (fond transparent) et src/assets/frames/{id}/scene.json (plages des
// textes, positions des étiquettes). three.js r128 est chargé depuis cdnjs : le rendu demande le réseau, le site non.
// Étape manuelle, hors build : les images produites sont commitées.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../src/assets/frames');
/** Nombre d'images par variante, taille de sortie et suréchantillonnage. */
export const FRAMES = 72;
export const VARIANTS = { portrait: [540, 960], landscape: [1280, 720] };
const RATIO = 2;
const QUALITY = 64;

const ids = process.argv.slice(2).length > 0 ? process.argv.slice(2) : readdirSync(join(HERE, 'models')).map((f) => f.replace(/\.js$/, ''));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const id of ids) {
  const model = (await import(join(HERE, 'models', `${id}.js`))).default;
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(`${id} : ${e.message}`));
  await page.route('http://render.local/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    route.fulfill({ body: readFileSync(join(HERE, path)), contentType: TYPES[extname(path)] ?? 'application/octet-stream' });
  });
  await page.goto(`http://render.local/stage.html?model=${id}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60_000 });
  rmSync(join(OUT, id), { recursive: true, force: true });
  const scene = { frames: FRAMES, steps: model.steps, labels: { range: model.labels }, size: {} };
  for (const [variant, [w, h]] of Object.entries(VARIANTS)) {
    const dir = join(OUT, id, variant);
    mkdirSync(dir, { recursive: true });
    let bytes = 0;
    for (let i = 0; i < FRAMES; i++) {
      const url = await page.evaluate(([p, v, w, h, r]) => window.renderFrame(p, v, w, h, r), [i / (FRAMES - 1), variant, w, h, RATIO]);
      const png = Buffer.from(url.split(',')[1], 'base64');
      const webp = await sharp(png).resize(w, h).webp({ quality: QUALITY, alphaQuality: 70, effort: 6 }).toBuffer();
      writeFileSync(join(dir, `${String(i).padStart(3, '0')}.webp`), webp);
      bytes += webp.length;
    }
    scene.size[variant] = [w, h];
    scene.labels[variant] = await page.evaluate(([p, v, w, h]) => window.labelsAt(p, v, w, h), [model.hold, variant, w, h]);
    console.log(`${id} ${variant} : ${FRAMES} images, ${(bytes / 1024).toFixed(0)} Ko`);
  }
  writeFileSync(join(OUT, id, 'scene.json'), `${JSON.stringify(scene, null, 2)}\n`);
  await page.close();
}
await browser.close();
