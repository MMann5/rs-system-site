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

export interface NavDeps {
  isEnabled(id: string): boolean;
  url(id: string, lang: Lang): string;
  label(lang: Lang, key: string): string;
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
