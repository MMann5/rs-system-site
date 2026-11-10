// Story 7.3, NFR1, NFR2 (EXPERIENCE.md › Accessibility Floor) : volet accessibilité de l'audit de lancement, sur les
// 44 pages-modèles. axe-core 4.14.0 (WCAG 2.0/2.1 A et AA, 2.2 AA) dans WebKit 390 et Chromium 1280 ; titres, repères ;
// clavier (Chromium 390 et 1280) ; 320 px (WebKit et Chromium) ; texte 200 % = zoom navigateur (Chromium 640 × 400,
// DPR 2) ; espacement WCAG 1.4.12 à 320 et 1280 px ; cibles ≥ 44 × 44 (liens en phrase exemptés, WCAG 2.5.8).
// Le passage VoiceOver (D5) reste un geste d'opérateur : fiche hors dépôt.
import axe from 'axe-core';
import { chromium, webkit } from 'playwright';
import { headingIssues, isInlineLink, LANGS, servedPath, targetIssues, templatePages, TEMPLATE_IDS } from './lib.mjs';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CONCURRENCY = 4;

/** Animations à leur état final (lecture d'un contenu une fois à l'écran) : axe et mises en page. */
const FINAL_STATE_CSS = `
*, *::before, *::after {
  animation-timeline: auto !important;
  animation-range: normal !important;
  animation-play-state: paused !important;
  animation-duration: 1s !important;
  animation-delay: -1s !important;
  animation-fill-mode: both !important;
  transition: none !important;
}`;

/** Espacement de texte WCAG 1.4.12 (CSS de référence). */
const SPACING_CSS = `
*, *::before, *::after {
  line-height: 1.5 !important;
  letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important;
}
p { margin-block-end: 2em !important; }`;

async function open(browser, url, contextOptions, { finalState = true, css } = {}) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (finalState) await page.addStyleTag({ content: FINAL_STATE_CSS });
  if (css) await page.addStyleTag({ content: css });
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  return { context, page };
}

// — Mesures dans la page —

async function axeViolations(page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }));
  }, AXE_TAGS);
  return violations.map((v) => `axe ${v.id} (${v.nodes.length}) : ${v.nodes.slice(0, 3).join(' ; ')}`);
}

function structure() {
  const levels = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .filter((h) => h.checkVisibility({ visibilityProperty: true }))
    .map((h) => Number(h.tagName[1]));
  const landmarks = [];
  if (!document.querySelector('body > header, [role="banner"]')) landmarks.push('header (banner) absent');
  if (!document.querySelector('nav')) landmarks.push('nav absent');
  const mains = document.querySelectorAll('main');
  if (mains.length !== 1 || mains[0].id !== 'content') landmarks.push(`main#content attendu (trouvé : ${mains.length} main, id « ${mains[0]?.id ?? ''} »)`);
  if (!document.querySelector('body > footer, [role="contentinfo"]')) landmarks.push('footer (contentinfo) absent');
  const positive = [...document.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0);
  for (const el of positive) landmarks.push(`tabindex positif : ${el.outerHTML.slice(0, 80)}`);
  return { levels, landmarks };
}

function horizontalOverflow() {
  const sw = document.documentElement.scrollWidth;
  return sw > window.innerWidth ? [`défilement horizontal : scrollWidth ${sw} > ${window.innerWidth}`] : [];
}

function clippedText() {
  const issues = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.media')) continue;
    const cs = getComputedStyle(el);
    const clipX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    const clipY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
    if (!clipX && !clipY) continue;
    if (!el.textContent.trim() || !el.checkVisibility({ visibilityProperty: true })) continue;
    // Masqué visuellement (lu par les lecteurs d'écran, jamais affiché) : rien n'est rogné à l'écran.
    if (el.clientWidth <= 1 && el.clientHeight <= 1) continue;
    const overX = clipX && el.scrollWidth > el.clientWidth + 1;
    const overY = clipY && el.scrollHeight > el.clientHeight + 1;
    if (overX || overY) {
      const name = `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''}`;
      issues.push(`texte rogné : ${name} (${el.scrollWidth}×${el.scrollHeight} dans ${el.clientWidth}×${el.clientHeight}) « ${el.textContent.trim().slice(0, 40)} »`);
    }
  }
  return issues;
}

function targets() {
  const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
  const blockOf = (el) => {
    let node = el.parentElement;
    while (node && /^(inline|contents)/.test(getComputedStyle(node).display)) node = node.parentElement;
    return node;
  };
  const textOutside = (block) => {
    let text = '';
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement.closest('a, button')) text += n.textContent;
    return text;
  };
  return [...document.querySelectorAll(selector)]
    .filter((el) => el.checkVisibility({ visibilityProperty: true }) && el.getClientRects().length > 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const block = blockOf(el);
      return {
        name: `${el.tagName.toLowerCase()} « ${(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('name') || '').slice(0, 40)} »`,
        tag: el.tagName.toLowerCase(),
        display: getComputedStyle(el).display,
        siblingText: block ? textOutside(block) : '',
        width: r.width,
        height: r.height,
      };
    });
}

/** État du focus courant : description, position dans le DOM, contour, masquage. */
function focusState() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const all = document.querySelectorAll('*');
  const index = Array.prototype.indexOf.call(all, el);
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
  const shadow = cs.boxShadow !== 'none';
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Un lien en phrase peut tenir sur deux lignes : centre de chaque fragment, le premier qui touche l'élément suffit.
  const fragments = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh);
  const inView = fragments.length > 0;
  let hit = null;
  for (const r of fragments) {
    const cx = Math.min(Math.max((r.left + r.right) / 2, 0), vw - 1);
    const cy = Math.min(Math.max((r.top + r.bottom) / 2, 0), vh - 1);
    hit = document.elementFromPoint(cx, cy);
    if (hit === el || el.contains(hit)) break;
  }
  return {
    index,
    name: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''} « ${(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('name') || '').slice(0, 30)} »`,
    skip: el.matches('a.skip-link[href="#content"]'),
    inView,
    ringed: outline || shadow,
    obscured: !inView || !(hit === el || el.contains(hit)),
    hitName: hit ? `${hit.tagName.toLowerCase()}${hit.className && typeof hit.className === 'string' ? `.${hit.className.trim().split(/\s+/)[0]}` : ''}` : 'hors écran',
  };
}

async function keyboard(page) {
  const issues = [];
  const total = await page.evaluate(() => document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').length);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(focusState);
  if (!first?.skip) issues.push(`1er Tab : ${first?.name ?? 'aucun focus'} au lieu du lien d'évitement vers #content`);
  else if (!first.inView) issues.push("lien d'évitement invisible au focus");
  else if (first.obscured) issues.push(`lien d'évitement masqué : sous ${first.hitName}`);
  let prev = first;
  const seen = new Set(first ? [first.index] : []);
  if (first && !first.ringed) issues.push(`focus sans contour visible : ${first.name}`);
  for (let i = 0; i < total + 5; i++) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(focusState);
    if (state === null || seen.has(state.index)) break;
    seen.add(state.index);
    if (prev && state.index < prev.index) issues.push(`ordre de focus ≠ ordre du DOM : ${state.name} après ${prev.name}`);
    if (!state.ringed) issues.push(`focus sans contour visible : ${state.name}`);
    if (state.obscured) issues.push(`focus masqué : ${state.name} sous ${state.hitName}`);
    prev = state;
  }
  return { issues, count: seen.size };
}

// — Une page —

async function auditPage({ chrome, safari, url }) {
  const checks = {};
  const run = async (name, fn) => {
    try {
      checks[name] = await fn();
    } catch (err) {
      checks[name] = [`erreur de mesure : ${err.message.split('\n')[0]}`];
    }
  };

  await run('axe WebKit 390', async () => {
    const { context, page } = await open(safari, url, { viewport: { width: 390, height: 844 } });
    const out = await axeViolations(page);
    await context.close();
    return out;
  });
  await run('axe Chromium 1280', async () => {
    const { context, page } = await open(chrome, url, { viewport: { width: 1280, height: 800 } });
    const out = await axeViolations(page);
    const { levels, landmarks } = await page.evaluate(structure);
    checks['titres'] = headingIssues(levels);
    checks['repères'] = landmarks;
    await context.close();
    return out;
  });
  for (const width of [390, 1280]) {
    await run(`clavier ${width}`, async () => {
      const { context, page } = await open(chrome, url, { viewport: { width, height: width === 390 ? 844 : 800 } }, { finalState: false });
      const { issues } = await keyboard(page);
      await context.close();
      return issues;
    });
    await run(`cibles ${width}`, async () => {
      const { context, page } = await open(chrome, url, { viewport: { width, height: width === 390 ? 844 : 800 } });
      const rects = (await page.evaluate(targets)).map((t) => ({ ...t, inline: isInlineLink(t) }));
      await context.close();
      return targetIssues(rects);
    });
  }
  await run('320 px', async () => {
    const issues = [];
    for (const [name, browser] of [['WebKit', safari], ['Chromium', chrome]]) {
      const { context, page } = await open(browser, url, { viewport: { width: 320, height: 640 } });
      issues.push(...(await page.evaluate(horizontalOverflow)).map((i) => `${name} : ${i}`));
      await context.close();
    }
    return issues;
  });
  await run('texte 200 %', async () => {
    const { context, page } = await open(chrome, url, { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
    const out = [...(await page.evaluate(horizontalOverflow)), ...(await page.evaluate(clippedText))];
    await context.close();
    return out;
  });
  for (const width of [320, 1280]) {
    await run(`espacement ${width}`, async () => {
      const { context, page } = await open(chrome, url, { viewport: { width, height: 800 } }, { css: SPACING_CSS });
      const out = [...(await page.evaluate(horizontalOverflow)), ...(await page.evaluate(clippedText))];
      await context.close();
      return out;
    });
  }
  return checks;
}

const CHECKS = [
  'axe WebKit 390',
  'axe Chromium 1280',
  'titres',
  'repères',
  'clavier 390',
  'clavier 1280',
  '320 px',
  'texte 200 %',
  'espacement 320',
  'espacement 1280',
  'cibles 390',
  'cibles 1280',
];

/** Volet a11y : `{ title, columns, rows, failures, notes }`. */
export async function runA11y({ origin, dist, log = () => {} }) {
  const pages = templatePages(dist);
  const jobs = TEMPLATE_IDS.flatMap((id) => LANGS.map((lang) => ({ id, lang, path: pages[id][lang] })));
  const chrome = await chromium.launch();
  const safari = await webkit.launch();
  const results = new Map();
  try {
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        results.set(job, await auditPage({ chrome, safari, url: origin + servedPath(job.path) }));
        log(`a11y ${job.id} ${job.lang}`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    await chrome.close();
    await safari.close();
  }
  const rows = [];
  const failures = [];
  for (const job of jobs) {
    const checks = results.get(job);
    const row = { page: job.id, lang: job.lang };
    for (const name of CHECKS) {
      const issues = checks[name] ?? ['non mesuré'];
      row[name] = issues.length === 0 ? 'ok' : `${issues.length} ✗`;
      for (const issue of issues) failures.push(`${job.id} · ${job.lang} · ${name} : ${issue}`);
    }
    rows.push(row);
  }
  return {
    title: 'Accessibilité (NFR1, NFR2, WCAG 2.2 AA)',
    columns: [{ key: 'page', label: 'Page' }, { key: 'lang', label: 'Langue' }, ...CHECKS.map((name) => ({ key: name, label: name }))],
    rows,
    failures,
    notes: [
      `axe-core ${axe.version}, étiquettes ${AXE_TAGS.join(', ')} ; animations à leur état final pour axe et les mises en page (le clavier tourne sans).`,
      'Clavier : 1er Tab = lien d’évitement visible vers #content, ordre de focus = ordre du DOM, contour ≥ 2 px ou ombre, centre non masqué (elementFromPoint). Texte rogné : élément avec overflow hidden/clip dont le contenu dépasse de plus de 1 px, cadres .media exclus, élément masqué visuellement (1 × 1 px, lu seulement par les lecteurs d’écran) non compté.',
      'Non mesuré ici : VoiceOver (hébreu et français), geste d’opérateur (D5).',
    ],
  };
}
