// Story 1.8 (AD-9, AD-11, NFR4) : largeurs des photos et contrôle « toutes les photos passent par ResponsivePhoto ».
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOBILE_PHOTO_MEDIA, PHOTO_WIDTHS, photoWidths } from '../src/lib/photos.ts';
import { findPhotoViolations } from '../scripts/checks/photos.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/checks/photos.mjs');
const dirs = [];

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'rs-photos-'));
  dirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

// — Largeurs —

test('PHOTO_WIDTHS et MOBILE_PHOTO_MEDIA', () => {
  assert.deepEqual(PHOTO_WIDTHS, [480, 768, 1080, 1440, 1920, 2560]);
  assert.equal(MOBILE_PHOTO_MEDIA, '(width < 700px)');
});

test('photoWidths : largeurs ≤ source et ≤ max, source étroite servie à sa taille', () => {
  assert.deepEqual(photoWidths(2560), [480, 768, 1080, 1440, 1920, 2560]);
  assert.deepEqual(photoWidths(1440), [480, 768, 1080, 1440]);
  assert.deepEqual(photoWidths(1440, 1080), [480, 768, 1080]);
  assert.deepEqual(photoWidths(300), [300]);
  assert.deepEqual(photoWidths(2000), [480, 768, 1080, 1440, 1920]);
});

// — Lint —

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const BAD = {
  'public/a.jpg': JPEG,
  'public/rs-icon-32.png': JPEG,
  'public/favicon.png': JPEG,
  'public/apple-touch-icon.png': JPEG,
  'public/logo.png': JPEG,
  'public/fonts/x.woff2': Buffer.from([0, 1, 2]),
  'src/x.webp': JPEG,
  'src/assets/photos/ok.jpg': JPEG,
  'src/assets/brand/logo.png': JPEG,
  'src/components/Raw.astro': '<img src="/a.jpg" alt="">\n',
  'src/components/ResponsivePhoto.astro': "---\nimport { getImage } from 'astro:assets';\nimport p from '../assets/photos/ok.jpg';\nawait getImage({ src: p });\n---\n<img src={p.src} alt=\"\">\n",
  'src/components/Pic.astro': "---\nimport { Image } from 'astro:assets';\nimport p from '../assets/photos/ok.jpg';\n---\n<Image src={p} alt=\"\" />\n",
  'src/components/Logo.astro': "---\nimport { Image } from 'astro:assets';\nimport l from '../assets/brand/logo.png';\n---\n<Image src={l} alt=\"\" />\n",
  'src/x.png': JPEG,
  'src/y.gif': JPEG,
  'public/Favicon.PNG': JPEG,
  'src/assets/other/a.webp': JPEG,
  'src/components/Other.astro': "---\nimport { Picture } from 'astro:assets';\nimport p from '../assets/other/a.webp';\n---\n<Picture src={p} alt=\"\" />\n",
  'src/components/Jpg.astro': "---\nimport { getImage } from 'astro:assets';\nimport p from '../assets/brand/b.JPG';\nawait getImage({ src: p });\n---\n",
  'src/templates/Home.astro': "---\nimport p from '../assets/photos/ok.jpg';\nimport ResponsivePhoto from '../components/ResponsivePhoto.astro';\n---\n<ResponsivePhoto src={p} alt=\"\" sizes=\"100vw\" />\n",
};

test('refuse photo dans public/, photo hors src/assets/, <img> brut, <Image> sur une photo ; icônes et ResponsivePhoto permis', () => {
  const found = findPhotoViolations(fixture(BAD));
  assert.deepEqual(
    found.map(({ file }) => file),
    ['public/a.jpg', 'public/logo.png', 'src/components/Jpg.astro', 'src/components/Other.astro', 'src/components/Pic.astro', 'src/components/Raw.astro', 'src/x.png', 'src/x.webp', 'src/y.gif'],
  );
  for (const { reason } of found) assert.ok(reason.length > 0);
});

test('CLI : code 1 et fichiers nommés ; code 0 sur un dépôt propre', () => {
  assert.throws(
    () => execFileSync('node', [SCRIPT, fixture(BAD)], { stdio: 'pipe' }),
    (error) => {
      assert.equal(error.status, 1);
      for (const file of ['public/a.jpg', 'src/x.webp', 'src/components/Raw.astro', 'src/components/Pic.astro']) {
        assert.ok(String(error.stderr).includes(file), file);
      }
      return true;
    },
  );
  const clean = fixture({ 'public/rs-icon-180.png': JPEG, 'src/assets/photos/a.jpg': JPEG, 'src/a.ts': 'export {};\n' });
  assert.match(execFileSync('node', [SCRIPT, clean], { encoding: 'utf8' }), /photos : OK/);
});

test('dépôt réel : aucune violation', () => {
  assert.deepEqual(findPhotoViolations(ROOT), []);
});
