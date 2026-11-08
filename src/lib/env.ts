// AD-10 : seul module qui lit les variables de build WORKERS_CI_BRANCH, DOMAIN_LIVE et SITE_URL.
// Repris par astro.config.mjs, par le registre de routes (story 1.3), par le layout (story 1.4), par seo/robots (story 1.9) et par scripts/.
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (scripts, tests).

export interface IndexabilityEnv {
  WORKERS_CI_BRANCH?: string | undefined;
  DOMAIN_LIVE?: string | undefined;
}

type BuildEnv = IndexabilityEnv & { SITE_URL?: string | undefined };

// process.env lu au build, sans dépendre des types Node (aucun @types/node dans le projet).
const buildEnv: BuildEnv = (globalThis as { process?: { env: BuildEnv } }).process?.env ?? {};

/** Vrai seulement sur un build de `main` avec le domaine définitif en ligne. */
export function isIndexable(env: IndexabilityEnv): boolean {
  return env.WORKERS_CI_BRANCH === 'main' && env.DOMAIN_LIVE === 'true';
}

export const INDEXABLE: boolean = isIndexable(buildEnv);

/** D6 : vrai sur un build de `main` ; les pages `previewOnly` n'y sont pas générées. */
export function isMainBranch(env: Pick<IndexabilityEnv, 'WORKERS_CI_BRANCH'>): boolean {
  return env.WORKERS_CI_BRANCH === 'main';
}

export const IS_MAIN_BRANCH: boolean = isMainBranch(buildEnv);

/** Base des URL absolues ; absente tant que le domaine n'existe pas. */
export const SITE_URL: string | undefined = buildEnv.SITE_URL || undefined;
