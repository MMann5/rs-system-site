// AD-11 : utilitaires communs des portes de scripts/checks/ (pas un contrôle : aucun CLI).
// Interface commune : `{nom} : OK`, ou `{nom} : N échec(s)` suivi d'une ligne `  - {fichier}[:{ligne}] : {raison}`
// par échec, et code de sortie 1.
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Vrai si le module d'URL `metaUrl` est le script lancé par `node`. */
export const isMain = (metaUrl) =>
  Boolean(process.argv[1]) && metaUrl === pathToFileURL(resolve(process.argv[1])).href;

/** Racine du dépôt. */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Argument CLI de racine ou de dist/, sinon la valeur par défaut. */
export const rootArg = (fallback) => (process.argv[2] ? resolve(process.argv[2]) : fallback);

/** Chemin relatif à `root`, séparateur /. */
export const rel = (root, path) => relative(root, path).split(sep).join('/');

/** Fichiers (récursif) d'un dossier. */
export function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

/** Un fichier est binaire s'il contient un octet nul (polices, images). */
export const isBinary = (buffer) => buffer.includes(0);

/** Affiche le verdict et sort en code 1 s'il y a des échecs. */
export function report(name, failures) {
  if (failures.length > 0) {
    console.error(`${name} : ${failures.length} échec(s)\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`${name} : OK`);
}
