// FR21, FR41, AD-2, AD-4, décisions D2 et D3 : cœur pur du bloc contact (src/components/ContactBand.astro).
// Note Midrag formatée selon la langue, ligne sous la note (nombre d'avis seulement s'il est fourni),
// liens Zones et Contact seulement si ces pages sont actives. Dépendances injectées comme routeDeps
// (src/lib/nav/core.ts) : Node l'importe directement (tests), syntaxe TypeScript effaçable uniquement.
import type { Lang } from '../langs.ts';

/** Preuve Midrag (src/content/proof.yaml) : chaque champ est optionnel, jamais inventé (AD-4). */
export interface Proof {
  rating?: number | undefined;
  reviews?: number | undefined;
}

/** Proof à partir d'une entrée de proof.yaml : seulement les champs présents, `{}` sans entrée. */
export function toProof(data: { rating?: number | undefined; reviews?: number | undefined } | undefined): Proof {
  const proof: Proof = {};
  if (data?.rating !== undefined) proof.rating = data.rating;
  if (data?.reviews !== undefined) proof.reviews = data.reviews;
  return proof;
}

export interface BandDeps {
  isEnabled(id: string): boolean;
  url(id: string, lang: Lang): string;
}

export interface BandLinks {
  zoneHref?: string;
  detailsHref?: string;
}

/** Note dans la langue de la page : `9.94` en he et en, `9,94` en ru et fr (D2). */
export function formatRating(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(value);
}

/** Ligne sous la note : `contact-band.midrag`, puis ` · {n} avis` si `reviews` existe ; absente sans note. */
export function ratingLine(proof: Proof, lang: Lang, t: (key: string) => string): string | undefined {
  if (proof.rating === undefined) return undefined;
  let line = t('contact-band.midrag');
  if (proof.reviews !== undefined) {
    const n = new Intl.NumberFormat(lang).format(proof.reviews);
    line += ` · ${t('contact-band.reviews').replace('{n}', n)}`;
  }
  return line;
}

/**
 * Liens du bloc : Zones (D3) et « Laisser ses coordonnées » vers Contact avec `?service=` du contexte
 * (FR21). Un id inactif n'a pas de lien et `url` n'est jamais appelé pour lui.
 */
export function bandLinks({ lang, service }: { lang: Lang; service?: string | undefined }, deps: BandDeps): BandLinks {
  const links: BandLinks = {};
  if (deps.isEnabled('areas')) links.zoneHref = deps.url('areas', lang);
  if (deps.isEnabled('contact')) {
    const base = deps.url('contact', lang);
    links.detailsHref = service ? `${base}?service=${encodeURIComponent(service)}` : base;
  }
  return links;
}
