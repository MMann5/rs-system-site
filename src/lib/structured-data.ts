// FR38, story 7.2 (EXPERIENCE.md › Référencement & métadonnées, décision D3 de l'epic 7) : constructeurs purs des
// données structurées JSON-LD. Les modèles leur passent des libellés déjà traduits et des URL déjà absolues
// (absoluteUrl de src/lib/seo.ts) ; le layout rend le graphe dans un seul <script type="application/ld+json">.
// D3 : jamais d'adresse postale, de note ni d'avis (`address`, `aggregateRating`, `review`) ; le numéro vient de
// src/lib/contact/core.ts (AD-5). Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import { PHONE_E164 } from './contact/core.ts';

/** Nom de l'entreprise dans les données structurées et `og:site_name`. */
export const BRAND = 'RS SYSTEM';

export type JsonLdNode = Record<string, unknown> & { '@type': string };

/** Ce que les données structurées disent de l'entreprise (D3) : nom, téléphone, URL de l'accueil, logo. */
export interface BusinessRef {
  /** Accueil dans la langue de la page, absolu si SITE_URL est posé. */
  url: string;
  /** Logo carré publié (`/rs-icon-512.png`), absolu si SITE_URL est posé. */
  logo: string;
}

/** Entreprise citée par un autre nœud (`provider`, `author`, `publisher`) : sans zone desservie. */
export function businessRef({ url, logo }: BusinessRef): JsonLdNode {
  return { '@type': 'LocalBusiness', name: BRAND, telephone: PHONE_E164, url, logo };
}

/** Ville desservie, nommée dans la langue de la page. */
export function city(name: string): JsonLdNode {
  return { '@type': 'City', name };
}

/**
 * Point de contact de la page Contact. Sans `availableLanguage` : les langues parlées au téléphone sont un fait métier
 * non confirmé (à ajouter quand Mike / Ran l'auront dit, jamais inventé).
 */
export function contactPoint(): JsonLdNode {
  return { '@type': 'ContactPoint', telephone: PHONE_E164, contactType: 'customer service' };
}

export interface LocalBusinessInput extends BusinessRef {
  /** Noms des villes desservies (accueil, Contact : toutes les villes actives ; page ville : la ville). */
  areaServed: readonly string[];
  /** Page Contact : point de contact. */
  contactPoint?: boolean;
}

/** `LocalBusiness` de l'accueil, de Contact (avec `contactPoint`) et des pages ville. */
export function localBusiness({ areaServed, contactPoint: withContact = false, ...ref }: LocalBusinessInput): JsonLdNode {
  if (areaServed.length === 0) throw new Error('structured-data : LocalBusiness sans ville desservie');
  return {
    ...businessRef(ref),
    areaServed: areaServed.map(city),
    ...(withContact ? { contactPoint: contactPoint() } : {}),
  };
}

export interface ServiceInput {
  name: string;
  description: string;
  /** URL de la page service. */
  url: string;
  provider: BusinessRef;
  areaServed: readonly string[];
}

/** `Service` des 5 pages services et d'Entrepreneurs. */
export function service({ name, description, url, provider, areaServed }: ServiceInput): JsonLdNode {
  return { '@type': 'Service', name, description, url, provider: businessRef(provider), areaServed: areaServed.map(city) };
}

export interface ArticleInput {
  headline: string;
  description: string;
  /** ISO `AAAA-MM-JJ`. */
  datePublished: string;
  /** URL de l'image de partage (photo de l'article ou carte détecteur). */
  image: string;
  inLanguage: string;
  url: string;
  business: BusinessRef;
}

/** `Article` d'un article de blog : auteur et éditeur = l'entreprise. */
export function article({ headline, description, datePublished, image, inLanguage, url, business }: ArticleInput): JsonLdNode {
  const org = businessRef(business);
  return { '@type': 'Article', headline, description, datePublished, image, inLanguage, url, author: org, publisher: org };
}

export interface Crumb {
  name: string;
  url: string;
}

/** `BreadcrumbList` du fil d'Ariane (positions à partir de 1). */
export function breadcrumbList(crumbs: readonly Crumb[]): JsonLdNode {
  if (crumbs.length < 2) throw new Error('structured-data : fil d\'Ariane de moins de 2 éléments');
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(({ name, url }, i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
  };
}

/** Graphe JSON-LD d'une page. */
export function jsonLdGraph(nodes: readonly JsonLdNode[]): { '@context': string; '@graph': readonly JsonLdNode[] } {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/**
 * Contenu du `<script type="application/ld+json">` : `<` échappé en `<` (comme #rs-data) pour qu'aucune
 * valeur ne ferme le script ; JSON.parse rend le graphe.
 */
export function serializeJsonLd(nodes: readonly JsonLdNode[]): string {
  return JSON.stringify(jsonLdGraph(nodes)).replace(/</g, '\\u003c');
}
