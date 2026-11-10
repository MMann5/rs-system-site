// AD-2 : registre de routes unique, construit une fois au chargement du module.
// Sources : pages fixes (story 1.3), puis pages légales (story 5.2 : src/content/legal/{id}/meta.yaml), puis villes
// (story 4.1 : `city:{id}` sous `areas`, actives même tant que `areas` est désactivée — `inheritActive: false`), puis
// articles (story 6.1 : `post:{id}` sous `blog`, du plus récent au plus ancien, actifs même tant que `blog` est
// désactivée), puis pages 2, 3… de l'index (story 6.2 : `blog-page:{n}` sous `blog`, activité héritée). L'ordre des
// sources est celui du sitemap. Story 6.2 (FR11) : `blog` n'est actif que si blog.yaml l'autorise (`enabled`) ET qu'au
// moins 1 article est actif (même calcul au lint : scripts/checks/completeness.mjs).
import { CITIES } from '../areas/index.ts';
import { citySources } from '../areas/core.ts';
import { activePosts, BLOG_ID, BLOG_PAGE_SOURCES, blogActive, POST_SOURCES } from '../blog/index.ts';
import { IS_MAIN_BRANCH } from '../env.ts';
import { LEGAL_SOURCES } from '../legal/index.ts';
import { PAGES } from '../pages.ts';
import { buildRegistry, type RouteSource } from './core.ts';

export type { RouteEntry, UrlParams } from './core.ts';
export { NOT_FOUND_ID, NOT_FOUND_SEGMENT, switcherTargetId } from './core.ts';

const sources: RouteSource[] = [
  ...PAGES.map(({ id, data }) => ({
    id,
    slugs: data.slugs,
    enabled: id === BLOG_ID ? blogActive(data.enabled, activePosts.length) : data.enabled,
    previewOnly: data.previewOnly,
  })),
  ...LEGAL_SOURCES,
  ...citySources(CITIES),
  ...POST_SOURCES,
  ...BLOG_PAGE_SOURCES,
];

const registry = buildRegistry(sources, { isMainBranch: IS_MAIN_BRANCH });

export const { url, alternates, entries, isEnabled } = registry;
