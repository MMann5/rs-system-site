// FR39, AD-8, AD-9, story 7.2 (EXPERIENCE.md › Référencement & métadonnées, décision D4 de l'epic 7) : balises Open
// Graph / Twitter du <head> et carte de partage « détecteur » (SVG 1200 × 630), sans Astro : testables par Node.
// La carte reprend le dessin CSS de src/components/SmokeDetector.astro (taille lg) avec les valeurs de
// src/styles/tokens.css, lues au build par parseTokens : aucune couleur littérale ici (AD-8).
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import type { Lang } from './langs.ts';
import { LANGS } from './langs.ts';
import { BRAND } from './structured-data.ts';

/** Format des images de partage (Facebook, WhatsApp, Twitter). */
export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;

/** `og:locale` de chaque langue. */
export const OG_LOCALES: Record<Lang, string> = { he: 'he_IL', en: 'en_US', ru: 'ru_RU', fr: 'fr_FR' };

export interface ShareImage {
  /** Chemin depuis la racine, ou URL absolue. */
  src: string;
  width: number;
  height: number;
  /** Type MIME (`image/jpeg`, `image/png`). */
  type: string;
}

export interface ShareTag {
  /** `property` pour Open Graph, `name` pour Twitter. */
  attr: 'property' | 'name';
  key: string;
  content: string;
}

export interface ShareInput {
  /** = `<title>`. */
  title: string;
  /** = meta description ; absente (404) : ni `og:description` ni `twitter:description`. */
  description?: string | undefined;
  lang: Lang;
  /** = canonique ; absente (404) : pas d'`og:url`. */
  url?: string | undefined;
  /** URL déjà absolue si SITE_URL est posé. */
  image: ShareImage;
  type: 'website' | 'article';
}

/** Balises Open Graph puis Twitter, dans l'ordre du <head>. */
export function shareMeta({ title, description, lang, url, image, type }: ShareInput): ShareTag[] {
  const og = (key: string, content: string): ShareTag => ({ attr: 'property', key: `og:${key}`, content });
  const tw = (key: string, content: string): ShareTag => ({ attr: 'name', key: `twitter:${key}`, content });
  return [
    og('title', title),
    ...(description !== undefined ? [og('description', description)] : []),
    og('type', type),
    ...(url !== undefined ? [og('url', url)] : []),
    og('site_name', BRAND),
    og('locale', OG_LOCALES[lang]),
    ...LANGS.filter((other) => other !== lang).map((other) => og('locale:alternate', OG_LOCALES[other])),
    og('image', image.src),
    og('image:width', String(image.width)),
    og('image:height', String(image.height)),
    og('image:type', image.type),
    tw('card', 'summary_large_image'),
    tw('title', title),
    ...(description !== undefined ? [tw('description', description)] : []),
    tw('image', image.src),
  ];
}

// — Carte détecteur (D4) —

/** Custom properties de :root dans un texte CSS (première déclaration de chaque nom, commentaires retirés). */
export function parseTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = m[1] as string;
    if (!Object.hasOwn(tokens, name)) tokens[name] = (m[2] as string).trim();
  }
  return tokens;
}

/** Jetons de tokens.css dont la carte détecteur a besoin (couleurs de SmokeDetector.astro, taille lg, ombre lg). */
export const DETECTOR_CARD_TOKENS = [
  '--color-surface-alt',
  '--color-detector-shell',
  '--color-detector-grille',
  '--color-detector-grille-light',
  '--color-detector-rim',
  '--color-led-ok',
  '--shadow-detector-lg',
  '--detector-size-lg',
  '--detector-grille-ratio',
  '--detector-rim-width',
  '--detector-led-lg',
  '--detector-grille-step-lg',
  '--detector-grille-pitch-lg',
] as const;

/** Agrandissement du détecteur lg (380px) sur la carte, pour qu'il se lise dans une vignette de partage. */
export const DETECTOR_CARD_SCALE = 1.2;

interface Shadow {
  inset: boolean;
  x: number;
  y: number;
  blur: number;
  color: string;
}

/** Ombres d'une valeur `box-shadow` (longueurs en px, couleur gardée telle quelle). */
export function parseShadows(value: string): Shadow[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => {
    const text = part.trim();
    const color = text.match(/[a-z]+\([^)]*\)|#[0-9a-f]+/i)?.[0];
    if (color === undefined) throw new Error(`share : ombre sans couleur « ${text} »`);
    const lengths = text.replace(color, '').match(/-?\d*\.?\d+(?:px)?/g)?.map((n) => parseFloat(n)) ?? [];
    const [x = 0, y = 0, blur = 0] = lengths;
    return { inset: /^inset\b/.test(text), x, y, blur, color };
  });
}

const px = (value: string, name: string): number => {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) throw new Error(`share : ${name} « ${value} » n'est pas une longueur`);
  return n;
};

const round = (n: number): number => Math.round(n * 100) / 100;

/** SVG 1200 × 630 : le détecteur dessiné (disque, ombre, grille radiale, rebord, LED) centré sur `surface-alt`. */
export function detectorCardSvg(tokens: Record<string, string>): string {
  const missing = DETECTOR_CARD_TOKENS.filter((name) => !Object.hasOwn(tokens, name));
  if (missing.length > 0) throw new Error(`share : jetons absents de tokens.css : ${missing.join(', ')}`);
  const tok = (name: (typeof DETECTOR_CARD_TOKENS)[number]): string => tokens[name] as string;
  const k = DETECTOR_CARD_SCALE;
  const cx = SHARE_WIDTH / 2;
  const cy = SHARE_HEIGHT / 2;
  const disc = (px(tok('--detector-size-lg'), 'taille') * k) / 2;
  const grille = (disc * px(tok('--detector-grille-ratio'), 'grille')) / 100;
  const rim = px(tok('--detector-rim-width'), 'rebord') * k;
  const inner = grille - rim;
  const step = px(tok('--detector-grille-step-lg'), 'pas') * k;
  const pitch = px(tok('--detector-grille-pitch-lg'), 'période') * k;
  const led = (px(tok('--detector-led-lg'), 'LED') * k) / 2;
  const shadows = parseShadows(tok('--shadow-detector-lg'));
  const drop = shadows.find((s) => !s.inset);
  const inset = shadows.find((s) => s.inset);

  // repeating-radial-gradient(circle, grille-light 0 step, grille step pitch) : anneau sombre de step à pitch, répété.
  const rings: string[] = [];
  for (let r0 = step; r0 < inner; r0 += pitch) {
    const width = Math.min(pitch - step, inner - r0);
    rings.push(`<circle cx="${cx}" cy="${cy}" r="${round(r0 + width / 2)}" fill="none" stroke="${tok('--color-detector-grille')}" stroke-width="${round(width)}"/>`);
  }

  const filters: string[] = [];
  if (drop) {
    filters.push(
      `<filter id="drop" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">` +
        `<feDropShadow dx="${round(drop.x * k)}" dy="${round(drop.y * k)}" stdDeviation="${round((drop.blur * k) / 2)}" flood-color="${drop.color}"/>` +
        `</filter>`,
    );
  }
  if (inset) {
    filters.push(
      `<filter id="inset" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">` +
        `<feFlood flood-color="${inset.color}" result="color"/>` +
        `<feComposite in="color" in2="SourceAlpha" operator="out" result="outside"/>` +
        `<feOffset in="outside" dx="${round(inset.x * k)}" dy="${round(inset.y * k)}" result="moved"/>` +
        `<feGaussianBlur in="moved" stdDeviation="${round((inset.blur * k) / 2)}" result="blurred"/>` +
        `<feComposite in="blurred" in2="SourceAlpha" operator="in" result="inner"/>` +
        `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="inner"/></feMerge>` +
        `</filter>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}">`,
    `<defs>${filters.join('')}<clipPath id="grille"><circle cx="${cx}" cy="${cy}" r="${round(inner)}"/></clipPath></defs>`,
    `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="${tok('--color-surface-alt')}"/>`,
    `<g${drop ? ' filter="url(#drop)"' : ''}><circle cx="${cx}" cy="${cy}" r="${round(disc)}" fill="${tok('--color-detector-shell')}"${inset ? ' filter="url(#inset)"' : ''}/></g>`,
    `<circle cx="${cx}" cy="${cy}" r="${round(inner)}" fill="${tok('--color-detector-grille-light')}"/>`,
    `<g clip-path="url(#grille)">${rings.join('')}</g>`,
    `<circle cx="${cx}" cy="${cy}" r="${round(grille - rim / 2)}" fill="none" stroke="${tok('--color-detector-rim')}" stroke-width="${round(rim)}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${round(led)}" fill="${tok('--color-led-ok')}"/>`,
    `</svg>`,
  ].join('');
}
