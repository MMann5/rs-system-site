// AD-2, AD-11 : liens du HTML rendu d'un texte Markdown (pages légales, story 5.2 ; articles du blog, story 6.1).
// Module pur, sans dépendance Astro, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).

/** Résolution d'un lien `page:<id>` (en pratique `url(id, lang, params)` du registre, qui lève sur un id inconnu). */
export type ResolvePage = (id: string, params?: { hash?: string }) => string;

const HREF_RE = /(\shref=)(["'])(.*?)\2/g;
const PAGE_RE = /^page:([^#]+)(?:#(.+))?$/;
const ALLOWED_RE = /^(?:https:\/\/|http:\/\/|mailto:|#)/;

/**
 * `href="page:<id>"` / `href="page:<id>#<ancre>"` → `resolve(id, { hash })` ; `https://`, `http://`, `mailto:` et
 * `#ancre` passent tels quels ; tout autre `href` (dont `/…`, relatif, lien téléphone) lève avec `where` (le fichier en
 * cause). `scope` préfixe les messages d'erreur (`legal`, `blog`…).
 */
export function resolveProseLinks(html: string, resolve: ResolvePage, where: string, scope = 'prose'): string {
  return html.replace(HREF_RE, (_all, prefix: string, quote: string, href: string) => {
    const page = href.match(PAGE_RE);
    if (page) {
      const [, id, hash] = page as unknown as [string, string, string | undefined];
      let target: string;
      try {
        target = resolve(id, hash === undefined ? undefined : { hash });
      } catch (error) {
        throw new Error(`${scope} : ${where} : lien « ${href} » non résolu (${String((error as Error)?.message ?? error)})`);
      }
      return `${prefix}${quote}${target}${quote}`;
    }
    if (ALLOWED_RE.test(href)) return `${prefix}${quote}${href}${quote}`;
    throw new Error(`${scope} : ${where} : lien « ${href} » refusé (lien interne en page:<id>, externe en https://, mailto: ou #ancre)`);
  });
}
