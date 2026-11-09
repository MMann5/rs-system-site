// AD-2, AD-3 : cœur pur du registre de routes. Aucun import de contenu : src/lib/routes/index.ts
// lui passe les sources. Toute erreur de règle lève au chargement, donc fait échouer le build.
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import { LANGS, isLang, type Lang } from '../langs.ts';

/** Un seul segment minuscule : lettres minuscules, lettres sans casse (hébreu), diacritiques, chiffres, tirets simples. */
export const SLUG_RE = /^[\p{Ll}\p{Lo}\p{Mn}\p{Nd}]+(?:-[\p{Ll}\p{Lo}\p{Mn}\p{Nd}]+)*$/u;

/** Id kebab-case anglais, préfixe de type admis (`city:modiin`, `blog-page:2`). */
export const ID_RE = /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*:)?[a-z0-9]+(?:-[a-z0-9]+)*$/;

const HASH_RE = /^[a-z0-9-]+$/;

/** Seul id dont les slugs sont vides (`/{lang}/`). */
const ROOT_ID = 'home';

/** AD-2, AD-3 : id du contexte de page de la 404. Réservé : jamais une entrée du registre. */
export const NOT_FOUND_ID = 'not-found';

/** Segment de `/{lang}/404/`, chemin généré pour la 404 de chaque langue puis déplacé en `/{lang}/404.html`. */
export const NOT_FOUND_SEGMENT = '404';

/** Page dont le sélecteur de langues lit les alternates : l'accueil pour la 404, la page elle-même sinon. */
export function switcherTargetId(id: string): string {
  return id === NOT_FOUND_ID ? ROOT_ID : id;
}

export interface RouteSource {
  id: string;
  /** Un slug brut par langue ; la complétude est vérifiée ici, pas seulement par Zod. */
  slugs: Partial<Record<Lang, string>>;
  enabled: boolean;
  previewOnly?: boolean;
  parent?: string;
}

export interface RouteEntry {
  id: string;
  lang: Lang;
  /** Slugs bruts NFC, paramètres de getStaticPaths. */
  segments: readonly string[];
  /** `/{lang}/` + segments encodés RFC 3986, barre oblique finale. */
  href: string;
  previewOnly: boolean;
}

export interface UrlParams {
  hash?: string;
}

export interface Registry {
  url(id: string, lang: Lang, params?: UrlParams): string;
  alternates(id: string): { lang: Lang; href: string }[];
  entries(): RouteEntry[];
  isEnabled(id: string): boolean;
}

export interface RegistryOptions {
  isMainBranch: boolean;
}

interface Resolved {
  source: RouteSource;
  active: boolean;
  segments: Record<Lang, string[]>;
}

const fail = (lines: string[]): never => {
  throw new Error(lines.map((line) => `routes : ${line}`).join('\n'));
};

function hrefOf(lang: Lang, segments: readonly string[]): string {
  return `/${lang}/` + segments.map((s) => `${encodeURIComponent(s)}/`).join('');
}

export function buildRegistry(sources: readonly RouteSource[], options: RegistryOptions): Registry {
  const errors: string[] = [];
  const byId = new Map<string, RouteSource>();
  const own = new Map<string, Record<Lang, string>>();

  // 1. Ids et slugs propres à chaque entrée.
  for (const source of sources) {
    const { id } = source;
    if (!ID_RE.test(id)) errors.push(`id « ${id} » hors kebab-case`);
    if (id === NOT_FOUND_ID) {
      errors.push(`id « ${id} » réservé (404, hors registre)`);
      continue;
    }
    if (byId.has(id)) {
      errors.push(`id « ${id} » déclaré deux fois`);
      continue;
    }
    byId.set(id, source);
    const slugs = {} as Record<Lang, string>;
    for (const key of Object.keys(source.slugs ?? {})) {
      if (!isLang(key)) errors.push(`« ${id} » : langue inconnue « ${key} »`);
    }
    for (const lang of LANGS) {
      const raw = source.slugs?.[lang];
      if (typeof raw !== 'string') {
        errors.push(`« ${id} » (${lang}) : slug manquant`);
        continue;
      }
      const slug = raw.normalize('NFC');
      if (slug === '') {
        if (id !== ROOT_ID) errors.push(`« ${id} » (${lang}) : slug vide`);
      } else if (!SLUG_RE.test(slug)) {
        errors.push(`« ${id} » (${lang}) : slug « ${slug} » invalide (un seul segment minuscule, tirets simples)`);
      }
      slugs[lang] = slug;
    }
    own.set(id, slugs);
  }

  // 2. Parents : inconnu ou cycle.
  for (const source of byId.values()) {
    const seen = new Set<string>([source.id]);
    let parent = source.parent;
    while (parent !== undefined) {
      if (!byId.has(parent)) {
        errors.push(`« ${source.id} » : parent inconnu « ${parent} »`);
        break;
      }
      if (seen.has(parent)) {
        errors.push(`« ${source.id} » : cycle de parents (${[...seen, parent].join(' → ')})`);
        break;
      }
      seen.add(parent);
      parent = byId.get(parent)?.parent;
    }
  }
  if (errors.length > 0) fail(errors);

  // 3. Chemins complets et activité (le parent doit être actif).
  const resolved = new Map<string, Resolved>();
  const resolve = (id: string): Resolved => {
    const done = resolved.get(id);
    if (done) return done;
    const source = byId.get(id) as RouteSource;
    const slugs = own.get(id) as Record<Lang, string>;
    const parent = source.parent === undefined ? undefined : resolve(source.parent);
    const selfActive = source.enabled && !(source.previewOnly === true && options.isMainBranch);
    const segments = {} as Record<Lang, string[]>;
    for (const lang of LANGS) {
      const base = parent ? parent.segments[lang] : [];
      segments[lang] = slugs[lang] === '' ? [...base] : [...base, slugs[lang]];
    }
    const entry: Resolved = { source, active: selfActive && (parent ? parent.active : true), segments };
    resolved.set(id, entry);
    return entry;
  };
  for (const id of byId.keys()) resolve(id);

  // 4. Doublons (lang, chemin), toutes entrées confondues : une page activée plus tard ne doit pas en masquer une autre.
  // `/{lang}/404/` est réservé à la 404 (AD-3) : aucune page ne peut s'y loger.
  const owners = new Map<string, string>(LANGS.map((lang) => [hrefOf(lang, [NOT_FOUND_SEGMENT]), NOT_FOUND_ID]));
  for (const { source, segments } of resolved.values()) {
    for (const lang of LANGS) {
      const href = hrefOf(lang, segments[lang]);
      const other = owners.get(href);
      if (other !== undefined) errors.push(`« ${other} » et « ${source.id} » (${lang}) : même chemin ${decodeURI(href)}`);
      else owners.set(href, source.id);
    }
  }
  if (errors.length > 0) fail(errors);

  // 5. Table figée des entrées actives.
  const active = new Map<string, Record<Lang, RouteEntry>>();
  for (const { source, active: isActive, segments } of resolved.values()) {
    if (!isActive) continue;
    const perLang = {} as Record<Lang, RouteEntry>;
    for (const lang of LANGS) {
      perLang[lang] = Object.freeze({
        id: source.id,
        lang,
        segments: Object.freeze([...segments[lang]]),
        href: hrefOf(lang, segments[lang]),
        previewOnly: source.previewOnly === true,
      });
    }
    active.set(source.id, perLang);
  }

  const activeEntry = (id: string): Record<Lang, RouteEntry> => {
    const entry = active.get(id);
    if (entry) return entry;
    if (!byId.has(id)) return fail([`id inconnu « ${id} »`]);
    return fail([`« ${id} » inactif (désactivé, réservé aux aperçus ou parent inactif) : aucun lien possible`]);
  };

  return {
    url(id, lang, params) {
      const entry = activeEntry(id);
      if (!isLang(lang)) return fail([`« ${id} » : langue inconnue « ${String(lang)} »`]);
      const hash = params?.hash;
      if (hash === undefined) return entry[lang].href;
      if (!HASH_RE.test(hash)) return fail([`« ${id} » (${lang}) : ancre « ${hash} » invalide`]);
      return `${entry[lang].href}#${hash}`;
    },
    alternates(id) {
      const entry = activeEntry(id);
      return LANGS.map((lang) => ({ lang, href: entry[lang].href }));
    },
    entries() {
      return [...active.values()].flatMap((perLang) => LANGS.map((lang) => perLang[lang]));
    },
    isEnabled(id) {
      return active.has(id);
    },
  };
}
