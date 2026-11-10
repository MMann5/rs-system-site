// AD-10 : seul module qui lit les variables de build WORKERS_CI_BRANCH, DOMAIN_LIVE, SITE_URL et UMAMI_WEBSITE_ID.
// Repris par astro.config.mjs, par le registre de routes (story 1.3), par le layout (story 1.4), par seo/robots (story 1.9) et par scripts/.
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (scripts, tests).

export interface IndexabilityEnv {
  WORKERS_CI_BRANCH?: string | undefined;
  DOMAIN_LIVE?: string | undefined;
}

export type UmamiEnv = IndexabilityEnv & { UMAMI_WEBSITE_ID?: string | undefined };

type BuildEnv = UmamiEnv & { SITE_URL?: string | undefined };

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

/** Story 7.1 (AD-6, AD-10) : script d'Umami Cloud (sans cookie, donc sans bandeau). */
export const UMAMI_SCRIPT_SRC = 'https://cloud.umami.is/script.js';

export interface UmamiScript {
  src: string;
  websiteId: string;
}

/**
 * Script Umami à charger, seulement sur un build indexable avec un id de site (variable de build, jamais dans le
 * dépôt) ; `undefined` sinon. Indexable sans id : pas de script, le build ne casse pas.
 */
export function umamiScript(env: UmamiEnv): UmamiScript | undefined {
  const websiteId = env.UMAMI_WEBSITE_ID?.trim();
  if (!isIndexable(env) || !websiteId) return undefined;
  return { src: UMAMI_SCRIPT_SRC, websiteId };
}

export const UMAMI: UmamiScript | undefined = umamiScript(buildEnv);
