// Story 3.2 (FR3, AD-4) : héros des pages services, photo encadrée ou illustration (détecteur de fumée).
// `hero.alt` est facultatif au schéma (héros illustré) mais obligatoire pour un héros à photo : la garde vit ici.
// Story 3.3 (UX-DR14) : ratio du cadre sous 700px par photo, 4:5 (`portrait`, défaut) ou 4:3 (`landscape` :
// interrupteur, interphone), avec son point focal (jeton --photo-focus-{focus}).
// Story 3.4 (UX-DR13, AD-9) : héros photo sombre plein cadre (`cover` : Réseaux, Entrepreneurs), rendu par
// HeroPhoto.astro avec son point focal, son scrim, sa hauteur et le libellé de son lien Devis ; même garde `alt`.
// Story 3.4 (FR23) : résolution du lien de tuile sortie de Service.astro (tileLinks), à dépendances injectées.
// Pur, sans import Astro, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import { bandLinks } from './contact/band.ts';
import type { Lang } from './langs.ts';

/** Point focal d'une photo de héros : jeton --photo-focus-{focus} de tokens.css. */
export type HeroFocus = 'dome' | 'switch' | 'intercom';

/** Ratio du cadre sous 700px : 4:5 (--photo-ratio-portrait) ou 4:3 (--photo-ratio-mobile-landscape). */
export type HeroMobileRatio = 'portrait' | 'landscape';

/** Héros photo de SERVICE_PAGES (`src`/`portrait` : images importées par le modèle ; `portrait` = recadrage mobile). */
export interface HeroPhotoDef<I> {
  kind: 'photo';
  src: I;
  portrait: I;
  focus: HeroFocus;
  /** Ratio du cadre sous 700px ; `portrait` (4:5) par défaut. */
  mobile?: HeroMobileRatio;
}

/**
 * Héros photo sombre plein cadre (HeroPhoto.astro) : point focal (--photo-focus-{focus}), scrim (--scrim-{scrim}),
 * hauteur minimale au-dessus de 960px (--hero-photo-min-{size}) et libellé du lien Devis (`action.{quote}`).
 */
export interface HeroCoverDef<I> {
  kind: 'cover';
  src: I;
  portrait: I;
  focus: 'network' | 'crane';
  scrim: 'network' | 'crane';
  size: 'networks' | 'contractors';
  quote: 'quote' | 'quote-site';
}

export type HeroDef<I> = HeroPhotoDef<I> | HeroCoverDef<I> | { kind: 'detector' };

/** Photo du héros prête pour HeroLight. */
export interface HeroPhoto<I> {
  src: I;
  portrait: I;
  focus: HeroFocus;
  mobile: HeroMobileRatio;
  alt: string;
}

/**
 * Photo du héros de la page `id` en `lang`, avec son `alt` traduit ; `undefined` pour un héros illustré.
 * Lève une erreur nommant la page si un héros à photo n'a pas de `hero.alt` dans son YAML.
 */
export function heroPhoto<I>(
  id: string,
  hero: HeroDef<I>,
  alt: Record<Lang, string> | undefined,
  lang: Lang,
): HeroPhoto<I> | undefined {
  if (hero.kind !== 'photo') return undefined;
  return { src: hero.src, portrait: hero.portrait, focus: hero.focus, mobile: hero.mobile ?? 'portrait', alt: requireAlt(id, alt)[lang] };
}

/** Héros sombre prêt pour HeroPhoto.astro. */
export interface HeroCover<I> {
  photo: { src: I; portrait: I; alt: string };
  variant: { focus: HeroCoverDef<I>['focus']; scrim: HeroCoverDef<I>['scrim']; size: HeroCoverDef<I>['size'] };
  /** Clé i18n du lien Devis. */
  quoteKey: 'action.quote' | 'action.quote-site';
}

/**
 * Héros sombre de la page `id` en `lang`, avec son `alt` traduit ; `undefined` pour un autre héros.
 * Lève une erreur nommant la page si `hero.alt` manque dans son YAML.
 */
export function heroCover<I>(
  id: string,
  hero: HeroDef<I>,
  alt: Record<Lang, string> | undefined,
  lang: Lang,
): HeroCover<I> | undefined {
  if (hero.kind !== 'cover') return undefined;
  return {
    photo: { src: hero.src, portrait: hero.portrait, alt: requireAlt(id, alt)[lang] },
    variant: { focus: hero.focus, scrim: hero.scrim, size: hero.size },
    quoteKey: `action.${hero.quote}` as const,
  };
}

function requireAlt(id: string, alt: Record<Lang, string> | undefined): Record<Lang, string> {
  if (!alt) throw new Error(`Service : page « ${id} » à photo sans hero.alt dans src/content/pages/${id}.yaml`);
  return alt;
}

/**
 * Lien unique d'une tuile de page service :
 * - `details` : « לפרטים › » vers la page `page`, omis tant qu'elle est inactive (tuile grue de Caméras →
 *   Entrepreneurs, tuile immeuble d'Entrepreneurs → Réseaux) ;
 * - `visit` : « תיאום סיור טכני › » vers Contact avec `?service=` de la page, construit par bandLinks comme le
 *   Devis du héros, omis si `contact` est inactif (tuile immeuble d'Interphone).
 */
export type TileLinkDef = { kind: 'details'; page: string } | { kind: 'visit' };

export interface TileLinkDeps {
  isEnabled(id: string): boolean;
  url(id: string, lang: Lang): string;
  t(lang: Lang, key: string): string;
}

/** Liens de la tuile (0 ou 1) ; `url` n'est jamais appelé pour une cible inactive (FR23). */
export function tileLinks(
  link: TileLinkDef,
  { lang, service }: { lang: Lang; service?: string | undefined },
  deps: TileLinkDeps,
): { href: string; label: string }[] {
  if (link.kind === 'details') {
    return deps.isEnabled(link.page) ? [{ href: deps.url(link.page, lang), label: deps.t(lang, 'action.details') }] : [];
  }
  const { detailsHref } = bandLinks({ lang, service }, deps);
  return detailsHref ? [{ href: detailsHref, label: deps.t(lang, 'action.site-visit') }] : [];
}
