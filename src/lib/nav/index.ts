// AD-14 : seule source des listes de liens (header, colonnes et liens légaux du footer), liée au
// registre de routes (AD-2, ancres comprises) et aux chaînes i18n `nav.*` / `footer.col.*`.
// Le sélecteur de langues lit alternates() du registre (LanguageSwitcher.astro).
import type { Lang } from '../langs.ts';
import { t } from '../i18n/index.ts';
import type { PageContext } from '../page-context.ts';
import { isEnabled, url } from '../routes/index.ts';
import {
  buildFooterColumns,
  buildLinks,
  buildNav,
  HEADER_NAV_IDS,
  LEGAL_NAV,
  routeDeps,
  type FooterColumn,
  type NavItem,
  type NavLink,
} from './core.ts';

export type { FooterColumn, NavItem, NavLink } from './core.ts';

const deps = routeDeps({ isEnabled, url }, t);

/** Liens du header pour la page `ctx`, ids désactivés omis, `current` selon `ctx.navSection`. */
export function headerNav(ctx: PageContext): NavItem[] {
  return buildNav(HEADER_NAV_IDS, ctx.lang, deps, ctx.navSection);
}

/** Colonnes de liens du footer en `lang`, ids désactivés omis, colonnes vides retirées. */
export function footerColumns(lang: Lang): FooterColumn[] {
  return buildFooterColumns(lang, deps);
}

/** Liens légaux du footer en `lang` (accessibilité, confidentialité), ids désactivés omis. */
export function legalNav(lang: Lang): NavLink[] {
  return buildLinks(LEGAL_NAV, lang, deps);
}
