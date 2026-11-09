// AD-2 : registre de routes unique, construit une fois au chargement du module.
// Sources : pages fixes (story 1.3), puis villes (story 4.1 : `city:{id}` sous `areas`, actives même tant que
// `areas` est désactivée — `inheritActive: false`) ; les articles (6.x) s'ajoutent ici.
import { CITIES } from '../areas/index.ts';
import { citySources } from '../areas/core.ts';
import { IS_MAIN_BRANCH } from '../env.ts';
import { PAGES } from '../pages.ts';
import { buildRegistry, type RouteSource } from './core.ts';

export type { RouteEntry, UrlParams } from './core.ts';
export { NOT_FOUND_ID, NOT_FOUND_SEGMENT, switcherTargetId } from './core.ts';

const sources: RouteSource[] = [
  ...PAGES.map(({ id, data }) => ({
    id,
    slugs: data.slugs,
    enabled: data.enabled,
    previewOnly: data.previewOnly,
  })),
  ...citySources(CITIES),
];

const registry = buildRegistry(sources, { isMainBranch: IS_MAIN_BRANCH });

export const { url, alternates, entries, isEnabled } = registry;
