// Cœur pur des pages produits : sources du registre de routes et contrôle des scènes rendues. Toute anomalie lève au
// chargement, donc fait échouer le build. Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import type { Lang } from '../langs.ts';

/** Préfixe des ids de route des produits (`product:bullet`). */
export const PRODUCT_ID_PREFIX = 'product:';

/** Scène rendue par scripts/render/render.mjs (src/assets/frames/{id}/scene.json). */
export interface SceneJson {
  frames: number;
  /** Plages de p (0–1) des 4 textes : titre, fonction phare, éclatement, remonté. */
  steps: [number, number][];
  labels: { range: [number, number]; portrait: [number, number][]; landscape: [number, number][] };
  size: { portrait: [number, number]; landscape: [number, number] };
}

export interface ProductSource {
  id: string;
  data: { slugs: Record<Lang, string>; enabled: boolean; parent?: string | undefined; order: number; scene: { inside: { parts: readonly unknown[] } } };
}

export interface Frames {
  portrait: readonly string[];
  landscape: readonly string[];
}

const fail = (lines: string[]): never => {
  throw new Error(lines.map((line) => `products : ${line}`).join('\n'));
};

/** Produits triés par ordre, puis par id. */
export function sortProducts<T extends ProductSource>(products: readonly T[]): T[] {
  return [...products].sort((a, b) => a.data.order - b.data.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Entrées du registre : `product:{id}` sous sa page service (activité héritée : service inactif ⇒ produit inactif). */
export function productSources(products: readonly ProductSource[]) {
  return sortProducts(products).map(({ id, data }) => ({
    id: `${PRODUCT_ID_PREFIX}${id}`,
    slugs: data.slugs,
    enabled: data.enabled,
    ...(data.parent === undefined ? {} : { parent: data.parent }),
  }));
}

/**
 * Vérifie, pour chaque produit activé, que sa scène est rendue et cohérente : scene.json présent, 4 étapes, le nombre
 * d'images de chaque variante, une étiquette par pièce dans les deux variantes.
 */
export function checkScenes(
  products: readonly ProductSource[],
  scenes: ReadonlyMap<string, SceneJson>,
  frames: ReadonlyMap<string, Frames>,
): void {
  const errors: string[] = [];
  for (const { id, data } of products) {
    if (!data.enabled) continue;
    const where = `src/content/products/${id}.yaml`;
    const scene = scenes.get(id);
    const set = frames.get(id);
    if (!scene || !set) {
      errors.push(`${where} : scène non rendue (node scripts/render/render.mjs ${id})`);
      continue;
    }
    if (scene.steps.length !== 4) errors.push(`${where} : ${scene.steps.length} étapes dans scene.json, 4 attendues`);
    for (const variant of ['portrait', 'landscape'] as const) {
      if (set[variant].length !== scene.frames) errors.push(`${where} : ${set[variant].length} images ${variant}, ${scene.frames} attendues`);
      const labels = scene.labels[variant].length;
      if (labels !== data.scene.inside.parts.length) {
        errors.push(`${where} : ${data.scene.inside.parts.length} pièces nommées, ${labels} ancres dans le modèle (${variant})`);
      }
    }
  }
  if (errors.length > 0) fail(errors);
}
