// AD-14 : cœur pur des listes de navigation. src/lib/nav/index.ts lui injecte le registre de routes
// et les chaînes i18n. Un id désactivé ou inconnu du registre est omis, sans erreur.
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import type { Lang } from '../langs.ts';

/** Liste fermée des liens du header, dans l'ordre d'EXPERIENCE.md. Libellés : `nav.{id}`. */
export const HEADER_NAV_IDS = [
  'cameras',
  'smoke-detectors',
  'smart-home',
  'networks',
  'intercom',
  'contractors',
  'areas',
  'blog',
  'about',
  'contact',
] as const;

/** Lien du footer : id du registre, clé i18n du libellé, ancre facultative (`url(id, lang, { hash })`). */
export interface LinkDef {
  id: string;
  label: string;
  hash?: string;
}

export interface ColumnDef {
  key: string;
  /** Clé i18n du titre de colonne (`footer.col.*`). */
  heading: string;
  links: readonly LinkDef[];
}

/** Colonnes de liens du footer, dans l'ordre d'EXPERIENCE.md (la colonne Contact est fixe, dans Footer.astro). */
export const FOOTER_COLUMNS: readonly ColumnDef[] = [
  {
    key: 'services',
    heading: 'footer.col.services',
    links: [
      { id: 'cameras', label: 'nav.cameras' },
      { id: 'smoke-detectors', label: 'nav.smoke-detectors' },
      { id: 'smart-home', label: 'nav.smart-home' },
      { id: 'networks', label: 'nav.networks' },
      { id: 'intercom', label: 'nav.intercom' },
    ],
  },
  {
    key: 'business',
    heading: 'footer.col.business',
    links: [
      { id: 'contractors', label: 'nav.footer.crane-cameras' },
      { id: 'intercom', label: 'nav.footer.management' },
    ],
  },
  {
    key: 'areas',
    heading: 'footer.col.areas',
    links: [
      { id: 'areas', label: 'nav.region.jerusalem-area', hash: 'jerusalem-area' },
      { id: 'areas', label: 'nav.region.center-shfela', hash: 'center-shfela' },
      { id: 'areas', label: 'nav.region.south', hash: 'south' },
      { id: 'areas', label: 'nav.region.judea-samaria', hash: 'judea-samaria' },
    ],
  },
  {
    key: 'company',
    heading: 'footer.col.company',
    links: [
      { id: 'about', label: 'nav.about' },
      { id: 'blog', label: 'nav.blog' },
      { id: 'contact', label: 'nav.contact' },
    ],
  },
];

/** Liens légaux de la ligne basse du footer. */
export const LEGAL_NAV: readonly LinkDef[] = [
  { id: 'accessibility', label: 'nav.accessibility' },
  { id: 'privacy', label: 'nav.privacy' },
];

/** FR15, UX-DR15 : liens de la 404 (Accueil, puis Zones et Contact s'ils sont actifs). */
export const NOT_FOUND_NAV: readonly LinkDef[] = [
  { id: 'home', label: 'not-found.home' },
  { id: 'areas', label: 'nav.areas' },
  { id: 'contact', label: 'nav.contact' },
];

export interface NavDeps {
  isEnabled(id: string): boolean;
  url(id: string, lang: Lang, params?: { hash?: string }): string;
  label(lang: Lang, key: string): string;
}

export interface NavLink {
  href: string;
  label: string;
}

export interface NavItem {
  id: string;
  href: string;
  label: string;
  /** Vrai pour la section de la page courante (`aria-current="page"`). */
  current: boolean;
}

export function buildNav(ids: readonly string[], lang: Lang, deps: NavDeps, navSection?: string): NavItem[] {
  return ids
    .filter((id) => deps.isEnabled(id))
    .map((id) => ({
      id,
      href: deps.url(id, lang),
      label: deps.label(lang, `nav.${id}`),
      current: navSection !== undefined && id === navSection,
    }));
}

/** Liens de `defs` en `lang` : un id inactif ou inconnu est filtré avant tout appel à `url` / `label`. */
export function buildLinks(defs: readonly LinkDef[], lang: Lang, deps: NavDeps): NavLink[] {
  return defs
    .filter(({ id }) => deps.isEnabled(id))
    .map(({ id, label, hash }) => ({
      href: deps.url(id, lang, hash ? { hash } : undefined),
      label: deps.label(lang, label),
    }));
}

export interface FooterColumn {
  key: string;
  /** Titre traduit (`deps.label(lang, footer.col.*)`). */
  heading: string;
  links: NavLink[];
}

/** Colonnes de liens du footer en `lang` : titres traduits, ids désactivés omis, colonnes vides retirées. */
export function buildFooterColumns(lang: Lang, deps: NavDeps): FooterColumn[] {
  return FOOTER_COLUMNS.map(({ key, heading, links }) => ({
    key,
    heading: deps.label(lang, heading),
    links: buildLinks(links, lang, deps),
  })).filter(({ links }) => links.length > 0);
}

/** NavDeps à partir du registre de routes (`isEnabled`, `url` avec ses paramètres, ancre comprise) et de `t`. */
export function routeDeps(
  routes: { isEnabled(id: string): boolean; url(id: string, lang: Lang, params?: { hash?: string }): string },
  label: NavDeps['label'],
): NavDeps {
  return {
    isEnabled: (id) => routes.isEnabled(id),
    url: (id, lang, params) => routes.url(id, lang, params),
    label,
  };
}
