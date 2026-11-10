// Story 6.1 (FR12, FR23, FR25, AD-2, AD-4, AD-9, AD-11) : articles du blog (src/content/posts/{id}/meta.yaml +
// {he,en,ru,fr}.md) et leurs photos (src/assets/blog/), chargés une fois au build. buildPosts lève sur un article actif
// incomplet, un `alt` incohérent ou une image absente : le build échoue. Les liens `page:<id>` du HTML rendu sont résolus
// par templates/Post.astro (resolveProseLinks + registre), ce module étant lui-même une source du registre
// (src/lib/routes/index.ts).
import type { ImageMetadata } from 'astro';
import { getCollection } from 'astro:content';
import type { Lang } from '../langs.ts';
import type { RouteSource } from '../routes/core.ts';
import { buildPosts, postSources, relatedPosts, type Post, type PostDoc } from './core.ts';

export { BLOG_ID, POST_ID_PREFIX, formatPostDate, postDocFile } from './core.ts';
export type { Post, PostDoc } from './core.ts';

const metas = await getCollection('postsMeta');
const docs = await getCollection('posts');

// AD-9 : photos des articles, une par nom de fichier (`image` de meta.yaml), rendues par ResponsivePhoto.
const modules = import.meta.glob<{ default: ImageMetadata }>('/src/assets/blog/*.{jpg,jpeg,png,webp,avif}', { eager: true });
const images = new Map(Object.entries(modules).map(([path, mod]) => [path.slice(path.lastIndexOf('/') + 1), mod.default]));

const blog = buildPosts(
  metas.map(({ id, data }) => ({ id, data })),
  docs.map((entry) => ({ id: entry.id, data: entry.data, body: entry.body ?? '', html: entry.rendered?.html ?? '' })),
  images.keys(),
);

/** Sources du registre de routes : `post:{id}` sous `blog`, du plus récent au plus ancien. */
export const POST_SOURCES: RouteSource[] = postSources(blog.posts);

/** Article `id` (sans préfixe `post:`) ; lève s'il n'existe pas. */
export function post(id: string): Post {
  return blog.post(id);
}

/** Texte `lang` de l'article `id` : frontmatter, HTML rendu (liens `page:` non résolus), temps de lecture. */
export function postDoc(id: string, lang: Lang): PostDoc {
  return blog.doc(id, lang);
}

/** Photo de l'article (`image` de meta.yaml) ; `undefined` pour le détecteur dessiné (D1). */
export function postImage(item: Post): ImageMetadata | undefined {
  const { image } = item.meta;
  if (image === undefined) return undefined;
  const found = images.get(image);
  if (!found) throw new Error(`blog : image « ${image} » introuvable dans src/assets/blog/`);
  return found;
}

/** « Autres articles » de `item` (3 au plus). */
export function related(item: Post): Post[] {
  return relatedPosts(item, blog.active, 3);
}
