// Story 7.3, UX-DR5 (DESIGN.md › Elevation › Plancher de lisibilité) : échantillonnage des scrims.
// Chaque bloc [data-surface="photo"] de chaque page de dist/ (4 langues), Chromium à 320, 390 et 1440 px, photo figée
// au début puis à la fin de son animation (zoom, dézoom, parallaxe), autres animations à leur état final.
// La photo est remplacée par du blanc pur (pire cas), le texte masqué après relevé de ses boîtes ; l'opacité du scrim
// est déduite de chaque pixel (lib.mjs › minAlpha) sous chaque boîte de texte et sur 32 px sous le dernier lien.
import sharp from 'sharp';
import { chromium } from 'playwright';
import { hexRgb, measure, photoPages, SCRIM_BELOW_LINK, SCRIM_MIN, scrimFailure, servedPath } from './lib.mjs';

export const SCRIM_WIDTHS = [320, 390, 1440];
const HEIGHT = 900;

/** Fige les animations : `extreme` = début ou fin pour les photos, état final pour le reste ; photo en blanc. */
const freezeCss = (extreme) => `
*, *::before, *::after {
  animation-timeline: auto !important;
  animation-range: normal !important;
  animation-play-state: paused !important;
  animation-duration: 1s !important;
  animation-delay: -1s !important;
  animation-fill-mode: both !important;
  transition: none !important;
}
[data-surface="photo"] .media img, [data-surface="photo"] picture img {
  animation-delay: ${extreme === 'début' ? '0s' : '-0.999s'} !important;
  filter: brightness(0) invert(1) !important;
}`;

/** Masque le texte des blocs photo (mise en page inchangée) et tout élément fixe ou collant hors des blocs. */
const HIDE_TEXT_CSS = `
[data-surface="photo"] *:not(.media):not(.media *) {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-decoration-color: transparent !important;
  text-shadow: none !important;
  outline: none !important;
}
[data-surface="photo"] svg:not(.media svg) { visibility: hidden !important; }
[data-audit-hidden] { visibility: hidden !important; }`;

/** Dans la page : boîtes (coordonnées du document) du texte et de la zone sous le dernier lien de chaque bloc. */
function collectBoxes(below) {
  const sx = window.scrollX;
  const sy = window.scrollY;
  const abs = (r) => ({ x: r.left + sx, y: r.top + sy, w: r.width, h: r.height });
  return [...document.querySelectorAll('[data-surface="photo"]')].map((block, index) => {
    const label = `${block.tagName.toLowerCase()}.${[...block.classList].join('.')}#${index}`;
    const boxes = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('.media')) continue;
      const style = getComputedStyle(node.parentElement);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const owner = node.parentElement.closest('h1, h2, h3, h4, p, a, span, li') ?? node.parentElement;
      const name = `${owner.tagName.toLowerCase()} « ${node.textContent.trim().slice(0, 40)} »`;
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) boxes.push({ ...abs(r), name });
    }
    const links = [...block.querySelectorAll('a')].filter((a) => !a.closest('.media') && a.getClientRects().length > 0);
    const last = links.at(-1);
    if (last) {
      const r = last.getBoundingClientRect();
      boxes.push({ x: r.left + sx, y: r.bottom + sy, w: r.width, h: below, name: `${below} px sous le dernier lien « ${last.textContent.trim().slice(0, 30)} »` });
    }
    const b = block.getBoundingClientRect();
    return { label, rect: abs(b), boxes };
  });
}

async function waitImages(page) {
  await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('[data-surface="photo"] img')];
    for (const img of imgs) img.loading = 'eager';
    await Promise.all(
      imgs.map((img) => (img.complete && img.naturalWidth > 0 ? null : new Promise((ok) => {
        img.addEventListener('load', ok, { once: true });
        img.addEventListener('error', ok, { once: true });
        setTimeout(ok, 15_000);
      }))),
    );
    await Promise.all(imgs.map((img) => img.decode().catch(() => null)));
    await document.fonts.ready;
  });
}

/** Volet scrims : `{ title, columns, rows, failures, notes }`. */
export async function runScrims({ origin, dist, log = () => {} }) {
  const pages = photoPages(dist);
  const browser = await chromium.launch();
  const rows = [];
  const failures = [];
  try {
    for (const { id, lang, path } of pages) {
      for (const width of SCRIM_WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        await page.goto(origin + servedPath(path), { waitUntil: 'load' });
        await waitImages(page);
        const scrimHex = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-scrim'));
        const scrimRgb = hexRgb(scrimHex);
        // Éléments fixes ou collants hors des blocs (header, barre mobile) : masqués pour la capture.
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('body *')) {
            const pos = getComputedStyle(el).position;
            if ((pos === 'fixed' || pos === 'sticky') && !el.closest('[data-surface="photo"]')) el.setAttribute('data-audit-hidden', '');
          }
        });
        for (const extreme of ['début', 'fin']) {
          const freeze = await page.addStyleTag({ content: freezeCss(extreme) });
          const blocks = await page.evaluate(collectBoxes, SCRIM_BELOW_LINK);
          const hide = await page.addStyleTag({ content: HIDE_TEXT_CSS });
          await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
          for (const block of blocks) {
            const clip = {
              x: Math.max(0, Math.floor(block.rect.x)),
              y: Math.max(0, Math.floor(block.rect.y)),
              width: Math.floor(block.rect.w),
              height: Math.floor(block.rect.h),
            };
            const png = await page.screenshot({ clip, fullPage: true, animations: 'allow' });
            const image = await sharp(png).raw().toBuffer({ resolveWithObject: true });
            const measures = measure(image, clip, block.boxes, scrimRgb).filter((m) => m.alpha !== null);
            const worst = measures.reduce((w, m) => (w === null || m.alpha < w.alpha ? m : w), null);
            const failure = scrimFailure({ id, lang, width, extreme, block: block.label, worst });
            const ok = failure === null;
            rows.push({
              page: id,
              lang,
              width,
              extreme,
              block: block.label,
              boxes: measures.length,
              min: worst ? Math.round(worst.alpha * 1000) / 1000 : '—',
              worst: worst?.name ?? '—',
              verdict: ok ? 'ok' : 'ÉCHEC',
            });
            if (!ok) failures.push(failure);
          }
          await hide.evaluate((el) => el.remove());
          await freeze.evaluate((el) => el.remove());
        }
        log(`scrims ${id} ${lang} ${width}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return {
    title: 'Scrims (UX-DR5)',
    columns: [
      { key: 'page', label: 'Page' },
      { key: 'lang', label: 'Langue' },
      { key: 'width', label: 'Largeur' },
      { key: 'extreme', label: 'Animation' },
      { key: 'block', label: 'Bloc' },
      { key: 'boxes', label: 'Boîtes' },
      { key: 'min', label: 'Opacité min.' },
      { key: 'worst', label: 'Sous' },
      { key: 'verdict', label: 'Verdict' },
    ],
    rows,
    failures,
    notes: [
      `Photo remplacée par du blanc pur (filter: brightness(0) invert(1)), seuil ${SCRIM_MIN} (tolérance 0,005) sous chaque boîte de texte et sur ${SCRIM_BELOW_LINK} px sous le dernier lien ; ${pages.length} pages à blocs photo.`,
    ],
  };
}
