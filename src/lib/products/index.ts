// Pages produits : collection `products` (src/content/products/{id}.yaml) et scènes rendues (src/assets/frames/{id}/),
// chargées une fois au build et contrôlées par checkScenes (le build échoue sur une scène absente ou incohérente).
// Les images de scène sont des rendus 3D, pas des photos : elles sont émises telles quelles (`?url`), sans
// ResponsivePhoto (exception déclarée dans scripts/checks/photos.mjs).
import { getCollection } from 'astro:content';
import { checkScenes, PRODUCT_ID_PREFIX, sortProducts, type Frames, type SceneJson } from './core.ts';
import type { ProductData } from './schema.ts';

export { PRODUCT_ID_PREFIX, type Frames, type SceneJson } from './core.ts';

const frameUrls = import.meta.glob<string>('../../assets/frames/*/*/*.webp', { query: '?url', import: 'default', eager: true });
const sceneFiles = import.meta.glob<SceneJson>('../../assets/frames/*/scene.json', { import: 'default', eager: true });

const scenes = new Map<string, SceneJson>();
for (const [path, scene] of Object.entries(sceneFiles)) scenes.set(path.split('/').at(-2) as string, scene);

const frames = new Map<string, { portrait: string[]; landscape: string[] }>();
for (const path of Object.keys(frameUrls).sort()) {
  const [id, variant] = path.split('/').slice(-3, -1) as [string, string];
  if (variant !== 'portrait' && variant !== 'landscape') continue;
  const set = frames.get(id) ?? { portrait: [], landscape: [] };
  set[variant].push(frameUrls[path] as string);
  frames.set(id, set);
}

export interface Product {
  id: string;
  data: ProductData;
}

/** Produits triés par ordre, puis par id (actifs ou non). */
export const PRODUCTS: readonly Product[] = sortProducts((await getCollection('products')).map(({ id, data }) => ({ id, data })));

checkScenes(PRODUCTS, scenes, frames);

/** Produit `id` (sans préfixe) ; lève s'il n'existe pas. */
export function product(id: string): Product {
  const found = PRODUCTS.find((p) => p.id === id);
  if (!found) throw new Error(`products : produit inconnu « ${id} »`);
  return found;
}

/** Scène et images du produit `id` (contrôlées au chargement pour un produit actif). */
export function sceneOf(id: string): { scene: SceneJson; frames: Frames } {
  const scene = scenes.get(id);
  const set = frames.get(id);
  if (!scene || !set) throw new Error(`products : scène absente pour « ${id} »`);
  return { scene, frames: set };
}

/** Id de route d'un produit. */
export const routeId = (id: string): string => `${PRODUCT_ID_PREFIX}${id}`;

