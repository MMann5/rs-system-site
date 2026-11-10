// Cartes des pages produits (src/components/ProductCards.astro). Fichier à part : il lit le registre de routes, qui
// lit lui-même la liste des produits (src/lib/products/index.ts).
import type { Lang } from '../langs.ts';
import { isEnabled, url } from '../routes/index.ts';
import { PRODUCTS, routeId, sceneOf } from './index.ts';

/**
 * Cartes des produits actifs de la page service `parent`, dans l'ordre : lien, nom dans la langue, première image
 * de la variante paysage (rendu 3D). [] si la page n'a aucun produit actif.
 */
export function cardsFor(parent: string, lang: Lang) {
  return PRODUCTS.filter((p) => (p.data.parent ?? p.data.listedOn) === parent && isEnabled(routeId(p.id))).map((p) => {
    const { scene, frames: set } = sceneOf(p.id);
    const [width, height] = scene.size.landscape;
    return { id: p.id, href: url(routeId(p.id), lang), name: p.data.name[lang], image: set.landscape[0] as string, width, height };
  });
}
