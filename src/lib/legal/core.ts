// Story 5.2 (FR14, FR40, AD-2, AD-4, AD-11, décision D4 de l'epic 5) : cœur pur des pages légales.
// Sans dépendance Astro, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests, portes de build).
// Appelé au build par src/lib/legal/index.ts et au lint par scripts/checks/completeness.mjs : toute erreur lève, avec
// le fichier en cause, donc fait échouer `npm run build` comme `npm run lint`.
import { LANGS, isLang, type Lang } from '../langs.ts';

export const LEGAL_DIR = 'src/content/legal';

/** Chemin (relatif au dépôt) du texte `lang` de la page légale `id`. */
export const legalDocFile = (id: string, lang: string): string => `${LEGAL_DIR}/${id}/${lang}.md`;

export interface LegalMetaSource<M extends { enabled: boolean }> {
  /** Nom du dossier (`accessibility`, `privacy`, `terms`). */
  id: string;
  data: M;
}

export interface LegalDocSource {
  /** `{id}/{lang}` (dossier, puis nom du fichier sans `.md`). */
  id: string;
  pending: boolean;
  /** Markdown brut, sans frontmatter. */
  body: string;
  /** HTML rendu (build) ; absent au lint. */
  html?: string;
}

export interface LegalDoc {
  pending: boolean;
  html: string;
}

export interface Legal<M extends { enabled: boolean }> {
  /** Pages triées par id : ordre stable du registre (puis du sitemap). */
  pages: { id: string; data: M }[];
  /** Texte `lang` de la page `id` ; lève s'il n'existe pas. */
  doc(id: string, lang: Lang): LegalDoc;
}

const fail = (lines: string[]): never => {
  throw new Error(lines.map((line) => `legal : ${line}`).join('\n'));
};

/**
 * Vérifie la complétude des pages légales : une page active a ses 4 `.md` ; `pending: true` ⇔ corps vide (après trim) ;
 * un `.md` est rangé dans un dossier qui a son `meta.yaml`, sous un nom de langue. Une page désactivée n'est pas tenue
 * d'avoir ses `.md`. Lève avec toutes les erreurs, chacune nommant son fichier.
 */
export function buildLegal<M extends { enabled: boolean }>(
  metas: readonly LegalMetaSource<M>[],
  docs: readonly LegalDocSource[],
): Legal<M> {
  const errors: string[] = [];
  const byId = new Map<string, M>();
  for (const { id, data } of metas) {
    if (byId.has(id)) errors.push(`${LEGAL_DIR}/${id}/meta.yaml : page déclarée deux fois`);
    byId.set(id, data);
  }
  const byDoc = new Map<string, LegalDoc>();
  for (const doc of docs) {
    const slash = doc.id.indexOf('/');
    const id = slash < 0 ? '' : doc.id.slice(0, slash);
    const lang = slash < 0 ? doc.id : doc.id.slice(slash + 1);
    const file = `${LEGAL_DIR}/${doc.id}.md`;
    if (!isLang(lang) || id === '') {
      errors.push(`${file} : fichier inattendu (attendu {id}/{${LANGS.join(',')}}.md)`);
      continue;
    }
    if (!byId.has(id)) errors.push(`${file} : aucun ${LEGAL_DIR}/${id}/meta.yaml pour ce texte`);
    const empty = doc.body.trim() === '';
    if (doc.pending && !empty) errors.push(`${file} : « pending: true » mais le corps n'est pas vide (retirer pending une fois le texte fourni)`);
    if (!doc.pending && empty) errors.push(`${file} : corps vide sans « pending: true »`);
    byDoc.set(doc.id, { pending: doc.pending, html: doc.html ?? '' });
  }
  for (const [id, data] of byId) {
    if (!data.enabled) continue;
    for (const lang of LANGS) {
      if (!byDoc.has(`${id}/${lang}`)) errors.push(`${legalDocFile(id, lang)} : fichier manquant (page légale active)`);
    }
  }
  if (errors.length > 0) fail(errors);

  const pages = [...byId].map(([id, data]) => ({ id, data })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    pages,
    doc(id, lang) {
      const doc = byDoc.get(`${id}/${lang}`);
      if (!doc) throw new Error(`legal : ${legalDocFile(id, lang)} : texte inconnu`);
      return doc;
    },
  };
}

/** Résolution d'un lien `page:<id>` (en pratique `url(id, lang, params)` du registre, qui lève sur un id inconnu). */
export type ResolvePage = (id: string, params?: { hash?: string }) => string;

const HREF_RE = /(\shref=)(["'])(.*?)\2/g;
const PAGE_RE = /^page:([^#]+)(?:#(.+))?$/;
const ALLOWED_RE = /^(?:https:\/\/|http:\/\/|mailto:|#)/;

/**
 * AD-2, AD-11 : liens du HTML rendu d'un texte Markdown. `href="page:<id>"` / `href="page:<id>#<ancre>"` →
 * `resolve(id, { hash })` ; `https://`, `http://`, `mailto:` et `#ancre` passent tels quels ; tout autre `href` (dont
 * `/…`, relatif, lien téléphone) lève avec `where` (le fichier en cause).
 */
export function resolveProseLinks(html: string, resolve: ResolvePage, where: string): string {
  return html.replace(HREF_RE, (_all, prefix: string, quote: string, href: string) => {
    const page = href.match(PAGE_RE);
    if (page) {
      const [, id, hash] = page as unknown as [string, string, string | undefined];
      let target: string;
      try {
        target = resolve(id, hash === undefined ? undefined : { hash });
      } catch (error) {
        throw new Error(`legal : ${where} : lien « ${href} » non résolu (${String((error as Error)?.message ?? error)})`);
      }
      return `${prefix}${quote}${target}${quote}`;
    }
    if (ALLOWED_RE.test(href)) return `${prefix}${quote}${href}${quote}`;
    throw new Error(`legal : ${where} : lien « ${href} » refusé (lien interne en page:<id>, externe en https://, mailto: ou #ancre)`);
  });
}
