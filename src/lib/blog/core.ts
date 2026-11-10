// Story 6.1 (FR12, FR23, FR25, AD-2, AD-4, AD-11, décisions D1 et D3 de l'epic 6) : cœur pur du blog.
// Sans dépendance Astro, syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests, portes de build).
// Appelé au build par src/lib/blog/index.ts et au lint par scripts/checks/completeness.mjs : toute erreur lève, avec le
// fichier en cause, donc fait échouer `npm run build` comme `npm run lint`.
import { LANGS, isLang, type Lang } from '../langs.ts';
import { postImageRuleError } from '../page-schema.ts';
import type { RouteSource } from '../routes/core.ts';

export const POSTS_DIR = 'src/content/posts';
export const BLOG_IMAGES_DIR = 'src/assets/blog';

/** Id de l'index du blog (registre), parent des articles. */
export const BLOG_ID = 'blog';

/** Préfixe des ids de route des articles (`post:how-many-smoke-detectors`). */
export const POST_ID_PREFIX = 'post:';

/** Chemin (relatif au dépôt) du fichier `name` de l'article `id` (`meta.yaml`, `fr.md`…). */
export const postFile = (id: string, name: string): string => `${POSTS_DIR}/${id}/${name}`;

/** Chemin (relatif au dépôt) du texte `lang` de l'article `id`. */
export const postDocFile = (id: string, lang: string): string => postFile(id, `${lang}.md`);

export interface PostMeta {
  /** ISO `AAAA-MM-JJ`. */
  date: string;
  /** Code de service (`SERVICE_CODES` sauf `unsure`). */
  category: string;
  /** Nom de fichier dans src/assets/blog/ ; absent pour `smoke-detectors` (D1). */
  image?: string | undefined;
  slugs: Record<Lang, string>;
  enabled: boolean;
  featured?: boolean | undefined;
}

export interface PostDocData {
  title: string;
  lede: string;
  meta: { title: string; description: string };
  alt?: string | undefined;
}

export interface PostMetaSource {
  /** Nom du dossier. */
  id: string;
  data: PostMeta;
}

export interface PostDocSource {
  /** `{id}/{lang}` (dossier, puis nom du fichier sans `.md`). */
  id: string;
  data: PostDocData;
  /** Markdown brut, sans frontmatter. */
  body: string;
  /** HTML rendu (build) ; absent au lint. */
  html?: string;
}

export interface PostDoc extends PostDocData {
  html: string;
  /** Temps de lecture, en minutes (readingMinutes du corps). */
  minutes: number;
}

export interface Post {
  id: string;
  meta: PostMeta;
}

export interface Posts {
  /** Tous les articles (actifs ou non), du plus récent au plus ancien, puis par id. */
  posts: readonly Post[];
  /** Articles actifs, même ordre. */
  active: readonly Post[];
  post(id: string): Post;
  /** Texte `lang` de l'article `id` ; lève s'il n'existe pas. */
  doc(id: string, lang: Lang): PostDoc;
}

const fail = (lines: string[]): never => {
  throw new Error(lines.map((line) => `blog : ${line}`).join('\n'));
};

/** Plus récent d'abord ; à date égale, par id. */
export const byRecency = (a: Post, b: Post): number =>
  a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Vérifie la complétude des articles : un article actif a ses 4 `.md` ; tout `.md` est rangé sous un dossier qui a son
 * `meta.yaml`, sous un nom de langue, avec un corps non vide et un `alt` si et seulement si `meta.yaml` a une `image` ;
 * la règle image / catégorie (D1) est respectée et l'image existe parmi `imageNames` (fichiers de src/assets/blog/).
 * Un article désactivé n'est pas tenu d'avoir ses `.md`. Lève avec toutes les erreurs, chacune nommant son fichier.
 */
export function buildPosts(
  metas: readonly PostMetaSource[],
  docs: readonly PostDocSource[],
  imageNames: Iterable<string>,
): Posts {
  const errors: string[] = [];
  const images = new Set(imageNames);
  const byId = new Map<string, PostMeta>();
  for (const { id, data } of metas) {
    const file = postFile(id, 'meta.yaml');
    if (byId.has(id)) {
      errors.push(`${file} : article déclaré deux fois`);
      continue;
    }
    byId.set(id, data);
    const rule = postImageRuleError(data.category, data.image);
    if (rule !== undefined) errors.push(`${file} : ${rule}`);
    else if (data.image !== undefined && !images.has(data.image)) errors.push(`${file} : image « ${data.image} » absente de ${BLOG_IMAGES_DIR}/`);
  }
  const byDoc = new Map<string, PostDoc>();
  for (const doc of docs) {
    const slash = doc.id.indexOf('/');
    const id = slash < 0 ? '' : doc.id.slice(0, slash);
    const lang = slash < 0 ? doc.id : doc.id.slice(slash + 1);
    const file = `${POSTS_DIR}/${doc.id}.md`;
    if (!isLang(lang) || id === '') {
      errors.push(`${file} : fichier inattendu (attendu {id}/{${LANGS.join(',')}}.md)`);
      continue;
    }
    const meta = byId.get(id);
    if (!meta) errors.push(`${file} : aucun ${postFile(id, 'meta.yaml')} pour ce texte`);
    else if (meta.image !== undefined && doc.data.alt === undefined) errors.push(`${file} : « alt » obligatoire (meta.yaml a une image)`);
    else if (meta.image === undefined && doc.data.alt !== undefined) errors.push(`${file} : « alt » interdit (meta.yaml n'a pas d'image)`);
    if (doc.body.trim() === '') errors.push(`${file} : corps vide`);
    byDoc.set(doc.id, { ...doc.data, html: doc.html ?? '', minutes: readingMinutes(doc.body) });
  }
  for (const [id, data] of byId) {
    if (!data.enabled) continue;
    for (const lang of LANGS) {
      if (!byDoc.has(`${id}/${lang}`)) errors.push(`${postDocFile(id, lang)} : fichier manquant (article actif)`);
    }
  }
  if (errors.length > 0) fail(errors);

  const posts = [...byId].map(([id, meta]) => ({ id, meta })).sort(byRecency);
  const postById = new Map(posts.map((p) => [p.id, p]));
  return {
    posts,
    active: posts.filter((p) => p.meta.enabled),
    post(id) {
      return postById.get(id) ?? fail([`article inconnu « ${id} »`]);
    },
    doc(id, lang) {
      return byDoc.get(`${id}/${lang}`) ?? fail([`${postDocFile(id, lang)} : texte inconnu`]);
    },
  };
}

/** Sources du registre (AD-2) : `post:{id}` sous `blog`, actif même tant que `blog` est désactivé (`inheritActive: false`). */
export function postSources(posts: readonly Post[]): RouteSource[] {
  return posts.map(({ id, meta }) => ({
    id: `${POST_ID_PREFIX}${id}`,
    slugs: meta.slugs,
    enabled: meta.enabled,
    parent: BLOG_ID,
    inheritActive: false,
  }));
}

// — Story 6.2 (FR11, AD-2, AD-3) : index du blog et pagination —

/** Articles par page de la grille de l'index (AD-3). */
export const BLOG_PAGE_SIZE = 12;

/** Préfixe des ids de route des pages 2, 3… de l'index (`blog-page:2`). */
export const BLOG_PAGE_ID_PREFIX = 'blog-page:';

/** Id de route de la page `n` de l'index : `blog` pour 1, `blog-page:{n}` au-delà. */
export const blogPageId = (n: number): string => (n <= 1 ? BLOG_ID : `${BLOG_PAGE_ID_PREFIX}${n}`);

/**
 * Article vedette : le plus récent des articles actifs `featured: true`, sinon le plus récent des actifs ; `undefined`
 * sans article actif. Les désactivés sont ignorés (filtrés ici aussi, pour une liste quelconque).
 */
export function featuredPost(posts: readonly Post[]): Post | undefined {
  const active = posts.filter((p) => p.meta.enabled).sort(byRecency);
  return active.find((p) => p.meta.featured === true) ?? active[0];
}

export interface BlogLayout {
  featured: Post | undefined;
  /** Grille (les actifs hors vedette, plus récents d'abord) découpée en pages de BLOG_PAGE_SIZE ; au moins 1 page. */
  pages: Post[][];
}

/** Vedette, puis la grille paginée : `max(1, ceil(grille / 12))` pages, la première éventuellement vide. */
export function blogPages(posts: readonly Post[]): BlogLayout {
  const featured = featuredPost(posts);
  const grid = posts.filter((p) => p.meta.enabled && p.id !== featured?.id).sort(byRecency);
  const count = Math.max(1, Math.ceil(grid.length / BLOG_PAGE_SIZE));
  const pages = Array.from({ length: count }, (_, i) => grid.slice(i * BLOG_PAGE_SIZE, (i + 1) * BLOG_PAGE_SIZE));
  return { featured, pages };
}

/** Sources du registre (AD-2) : `blog-page:{n}` (n ≥ 2, slug `"{n}"`) sous `blog`, activité héritée de `blog`. */
export function blogPageSources(posts: readonly Post[]): RouteSource[] {
  const { pages } = blogPages(posts);
  return pages.slice(1).map((_, i) => {
    const n = String(i + 2);
    return {
      id: `${BLOG_PAGE_ID_PREFIX}${n}`,
      slugs: Object.fromEntries(LANGS.map((lang) => [lang, n])) as Record<Lang, string>,
      enabled: true,
      parent: BLOG_ID,
    };
  });
}

/** FR11 : `blog` est actif si l'interrupteur `enabled` de blog.yaml est vrai et qu'au moins 1 article est actif. */
export const blogActive = (yamlEnabled: boolean, activeCount: number): boolean => yamlEnabled && activeCount > 0;

/** Un mot : lettres ou chiffres (toutes écritures), apostrophes et tirets internes compris. */
const WORD_RE = /[\p{L}\p{N}]+(?:['’\-־][\p{L}\p{N}]+)*/gu;

/** Nombre de mots d'un Markdown : cibles de liens et balises retirées, texte des liens compté. */
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/<[^>]*>/g, ' ');
  return text.match(WORD_RE)?.length ?? 0;
}

/** FR12 : temps de lecture = mots du corps / 200, arrondi à la minute, au moins 1. */
export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(countWords(markdown) / 200));
}

/** Locales d'affichage des dates (Consistency Conventions › Dates). */
export const DATE_LOCALES: Record<Lang, string> = { he: 'he-IL', en: 'en-GB', ru: 'ru-RU', fr: 'fr-FR' };

/** Date ISO au format local : jour numérique, mois en toutes lettres, année (UTC : aucune dérive de fuseau). */
export function formatPostDate(date: string, lang: Lang): string {
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return fail([`date invalide « ${date} »`]);
  return new Intl.DateTimeFormat(DATE_LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(value);
}

/**
 * FR12, FR23 : « autres articles » de `current` : articles actifs autres que lui, ceux de sa catégorie d'abord (plus
 * récents d'abord), complétés par les plus récents toutes catégories, sans doublon, `limit` au plus.
 */
export function relatedPosts(current: Post, all: readonly Post[], limit = 3): Post[] {
  const others = all.filter((p) => p.meta.enabled && p.id !== current.id).sort(byRecency);
  const same = others.filter((p) => p.meta.category === current.meta.category);
  const rest = others.filter((p) => p.meta.category !== current.meta.category);
  return [...same, ...rest].slice(0, Math.max(0, limit));
}
