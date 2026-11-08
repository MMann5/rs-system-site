// AD-14 : seule source des listes de liens (header ; footer et sélecteur en 1.7), liée au registre
// de routes (AD-2) et aux chaînes i18n `nav.*`.
import { t } from '../i18n/index.ts';
import type { PageContext } from '../page-context.ts';
import { isEnabled, url } from '../routes/index.ts';
import { buildNav, HEADER_NAV_IDS, type NavDeps, type NavItem } from './core.ts';

export type { NavItem } from './core.ts';

const deps: NavDeps = { isEnabled, url: (id, lang) => url(id, lang), label: t };

/** Liens du header pour la page `ctx`, ids désactivés omis, `current` selon `ctx.navSection`. */
export function headerNav(ctx: PageContext): NavItem[] {
  return buildNav(HEADER_NAV_IDS, ctx.lang, deps, ctx.navSection);
}
