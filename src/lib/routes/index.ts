// AD-2 : registre de routes unique, construit une fois au chargement du module.
// Sources : pages fixes (story 1.3) ; villes (4.1) et articles (6.x) s'ajoutent ici.
import { IS_MAIN_BRANCH } from '../env.ts';
import { PAGES } from '../pages.ts';
import { buildRegistry, type RouteSource } from './core.ts';

export type { RouteEntry, UrlParams } from './core.ts';
export { NOT_FOUND_ID, NOT_FOUND_SEGMENT, switcherTargetId } from './core.ts';

const sources: RouteSource[] = PAGES.map(({ id, data }) => ({
  id,
  slugs: data.slugs,
  enabled: data.enabled,
  previewOnly: data.previewOnly,
}));

const registry = buildRegistry(sources, { isMainBranch: IS_MAIN_BRANCH });

export const { url, alternates, entries, isEnabled } = registry;
