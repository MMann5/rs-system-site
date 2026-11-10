// Story 7.3, NFR3–NFR6 (EXPERIENCE.md › Performance) : volet performance de l'audit de lancement, sur les 44
// pages-modèles (11 types × 4 langues), Chromium.
// - Lighthouse 13.5.0, configuration mobile par défaut (4G simulée) : LCP, CLS, TBT, poids total, polices, scripts.
// - INP : Event Timing (PerformanceObserver `event`, interactionId > 0) sous Playwright, CPU ×4 (CDP) : ouverture et
//   fermeture du menu à 390 px, saisie dans un champ de Contact.
// - Images : poids de chaque image chargée à 1440 et 390 px (héros, carte de blog, autres photos).
import { createServer } from 'node:net';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { imageVerdict, inpIssue, LANGS, perfVerdict, servedPath, templatePages, TEMPLATE_IDS } from './lib.mjs';

function freePort() {
  return new Promise((ok, ko) => {
    const server = createServer();
    server.on('error', ko);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => ok(port));
    });
  });
}

/** Observateur Event Timing posé avant tout script de la page. */
function observeInteractions() {
  window.__auditEvents = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.interactionId > 0) window.__auditEvents.push({ name: e.name, duration: e.duration });
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
}

/** INP (ms, `null` si aucune interaction ≥ 16 ms) d'une page à 390 px, CPU ×4. */
async function measureInp(browser, url, { contact }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: false });
  const page = await context.newPage();
  await page.addInitScript(observeInteractions);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const button = page.locator('.menu-button');
  await button.click();
  await page.waitForTimeout(400);
  await button.click();
  await page.waitForTimeout(400);
  if (contact) {
    const field = page.locator('form input:not([type="hidden"]):visible').first();
    await field.click();
    await page.keyboard.type('Test 123', { delay: 80 });
    await page.waitForTimeout(400);
  }
  const events = await page.evaluate(() => window.__auditEvents);
  await context.close();
  return events.length === 0 ? null : Math.max(...events.map((e) => e.duration));
}

/** Images chargées après défilement complet, à la largeur `width` : `[{ kind, url, bytes }]`. */
async function measureImages(browser, url, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((ok) => setTimeout(ok, 60));
    }
  });
  await page.waitForLoadState('networkidle');
  const images = await page.evaluate(() => {
    const out = [];
    for (const img of document.querySelectorAll('img')) {
      if (!img.currentSrc || !img.complete) continue;
      const entry = performance.getEntriesByName(img.currentSrc).at(-1);
      const kind = img.getAttribute('fetchpriority') === 'high' || img.closest('.hero')
        ? 'hero'
        : img.closest('.card')
          ? 'card'
          : 'photo';
      out.push({ kind, url: new URL(img.currentSrc).pathname, bytes: entry?.encodedBodySize ?? entry?.transferSize ?? 0 });
    }
    return out;
  });
  await context.close();
  return images;
}

/** Volet perf : `{ title, columns, rows, failures, notes }`. */
export async function runPerf({ origin, dist, log = () => {} }) {
  const pages = templatePages(dist);
  const port = await freePort();
  const browser = await chromium.launch({ channel: 'chromium', args: [`--remote-debugging-port=${port}`] });
  const rows = [];
  const failures = [];
  try {
    for (const id of TEMPLATE_IDS) {
      for (const lang of LANGS) {
        const path = pages[id][lang];
        const url = origin + servedPath(path);
        await fetch(url); // réveille wrangler dev (première réponse lente) avant la mesure
        const runner = await lighthouse(url, { port, logLevel: 'error', output: 'json', onlyCategories: ['performance'] });
        const { values, failures: perfFailures } = perfVerdict(runner.lhr);
        const inp = await measureInp(browser, url, { contact: id === 'contact' });
        const images = [
          ...(await measureImages(browser, url, 1440)).map((img) => ({ ...img, viewport: 1440 })),
          ...(await measureImages(browser, url, 390)).map((img) => ({ ...img, viewport: 390 })),
        ];
        const imageFailures = images.map((img) => imageVerdict(img, img.viewport)).filter(Boolean);
        const heaviest = (kind, viewport) =>
          Math.max(0, ...images.filter((i) => i.kind === kind && (viewport === undefined || i.viewport === viewport)).map((i) => i.bytes));
        const pageFailures = [...perfFailures, inpIssue(inp), ...imageFailures].filter(Boolean);
        for (const f of pageFailures) failures.push(`${id} · ${lang} · ${path} : ${f}`);
        rows.push({
          page: id,
          lang,
          lcp: Math.round(values.lcp),
          cls: values.cls,
          tbt: Math.round(values.tbt),
          inp: inp === null ? '< 16' : Math.round(inp),
          total: values.total,
          fonts: values.fonts,
          scripts: values.scripts,
          hero1440: heaviest('hero', 1440) || '—',
          hero390: heaviest('hero', 390) || '—',
          photo: heaviest('photo') || '—',
          card: heaviest('card') || '—',
          verdict: pageFailures.length === 0 ? 'ok' : 'ÉCHEC',
        });
        log(`perf ${id} ${lang} LCP ${Math.round(values.lcp)} ms`);
      }
    }
  } finally {
    await browser.close();
  }
  return {
    title: 'Performance (NFR3–NFR6)',
    columns: [
      { key: 'page', label: 'Page' },
      { key: 'lang', label: 'Langue' },
      { key: 'lcp', label: 'LCP (ms)' },
      { key: 'cls', label: 'CLS' },
      { key: 'tbt', label: 'TBT (ms)' },
      { key: 'inp', label: 'INP (ms)' },
      { key: 'total', label: 'Poids (o)' },
      { key: 'fonts', label: 'Polices (o)' },
      { key: 'scripts', label: 'Scripts (o)' },
      { key: 'hero1440', label: 'Héros 1440 (o)' },
      { key: 'hero390', label: 'Héros 390 (o)' },
      { key: 'photo', label: 'Autre image max (o)' },
      { key: 'card', label: 'Carte blog max (o)' },
      { key: 'verdict', label: 'Verdict' },
    ],
    rows,
    failures,
    notes: [
      'Lighthouse 13.5.0 mobile par défaut (4G simulée, CPU ×4 simulé) ; poids en octets transférés. INP : Event Timing sous Playwright Chromium, CPU ×4 (CDP), menu ouvert puis fermé à 390 px et saisie dans un champ de Contact ; « < 16 » = aucune interaction de 16 ms ou plus.',
      'Images : plus lourde image chargée après défilement complet ; seuils héros 250 000 o à 1440 px et 120 000 o à 390 px, carte de blog 60 000 o, autres 180 000 o.',
    ],
  };
}
