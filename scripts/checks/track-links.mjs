// Story 7.1 (AD-6, AD-11) : chaque lien d'appel et chaque lien WhatsApp de dist/ est mesuré.
// Sur chaque .html : tout <a> dont le href commence par « tel: » porte data-track="call_click", par
// « https://wa.me/ » data-track="whatsapp_click", et un data-placement de TRACK_PLACEMENTS. Seule exception :
// id="contact-sent-retry" (Réessayer de la story 2.4, qui n'émet rien pour ne pas compter deux fois).
// Usage : node scripts/checks/track-links.mjs [dossier]  (défaut : dist/ du dépôt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRACK_PLACEMENTS } from '../../src/lib/track-events.ts';
import { decodeEntities } from './links.mjs';
import { isMain, rel, report, REPO_ROOT, rootArg, walk } from './report.mjs';

const EXEMPT_ID = 'contact-sent-retry';
const ANCHOR = /<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const RAW_TEXT = /<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const KINDS = [
  { prefix: 'tel:', event: 'call_click' },
  { prefix: 'https://wa.me/', event: 'whatsapp_click' },
];

/** Valeur d'un attribut d'une liste d'attributs HTML (entités décodées), ou undefined. */
const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i'));
  const value = m?.slice(1).find((v) => v !== undefined);
  return value === undefined ? undefined : decodeEntities(value);
};

/** Raisons d'échec des liens d'appel / WhatsApp d'une page HTML. */
export function findUntrackedLinks(html) {
  // Contenu des <script> et <style> ignoré ; celui des <template> (bloc hors ligne cloné) est gardé.
  const scan = html.replace(RAW_TEXT, (m, tag) => (tag.toLowerCase() === 'template' ? m : ''));
  const failures = [];
  for (const [, attrs] of scan.matchAll(ANCHOR)) {
    const href = attr(attrs, 'href')?.trim();
    if (href === undefined) continue;
    const kind = KINDS.find(({ prefix }) => href.toLowerCase().startsWith(prefix));
    if (!kind || attr(attrs, 'id') === EXEMPT_ID) continue;
    const track = attr(attrs, 'data-track');
    const placement = attr(attrs, 'data-placement');
    const short = href.length > 40 ? `${href.slice(0, 40)}…` : href;
    if (track !== kind.event) failures.push(`${short} : data-track="${track ?? ''}" au lieu de « ${kind.event} »`);
    if (!TRACK_PLACEMENTS.includes(placement)) failures.push(`${short} : data-placement="${placement ?? ''}" hors de la liste`);
  }
  return failures;
}

/** Échecs `{page} : …` des pages .html de `dist`. */
export function checkTrackLinks(dist) {
  return walk(dist)
    .filter((p) => p.endsWith('.html'))
    .sort()
    .flatMap((file) => findUntrackedLinks(readFileSync(file, 'utf8')).map((reason) => `${rel(dist, file)} : ${reason}`));
}

if (isMain(import.meta.url)) {
  const dist = rootArg(join(REPO_ROOT, 'dist'));
  if (!existsSync(dist)) report('track-links', [`${dist} : absent, lancer npm run build d’abord`]);
  report('track-links', checkTrackLinks(dist));
}
