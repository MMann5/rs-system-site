// AD-5, AD-11 : aucun lien d'appel ni lien WhatsApp littéral hors de src/lib/contact/core.ts.
// Cherche « tel: » et « wa.me » (insensible à la casse) dans les fichiers texte de src/ et public/.
// Usage : node scripts/checks/contact-literals.mjs [racine]  (défaut : racine du dépôt).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIRS = ['src', 'public'];
const EXEMPT = 'src/lib/contact/core.ts';
// Pas de lettre ni de chiffre avant « tel: » : « Hotel: », « Hôtel: » ne sont pas des liens.
const LITERAL = /(?<![\p{L}\d])tel:|wa\.me/iu;

/** Un fichier est binaire s'il contient un octet nul (polices, images). */
const isBinary = (buffer) => buffer.includes(0);

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() ? [path] : [];
  });
}

/** Chemins (relatifs à `root`, séparateur /) des fichiers texte de src/ et public/ qui contiennent un littéral. */
export function findContactLiterals(root) {
  const found = [];
  for (const dir of DIRS) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const path of files(base)) {
      const rel = relative(root, path).split(sep).join('/');
      if (rel === EXEMPT) continue;
      const buffer = readFileSync(path);
      if (!isBinary(buffer) && LITERAL.test(buffer.toString('utf8'))) found.push(rel);
    }
  }
  return found.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../../', import.meta.url));
  const found = findContactLiterals(root);
  if (found.length > 0) {
    console.error(
      `contact-literals : ${found.length} fichier(s) avec tel: ou wa.me hors de ${EXEMPT} (AD-5)\n` +
        found.map((f) => `  - ${f}`).join('\n'),
    );
    process.exit(1);
  }
  console.log('contact-literals : OK');
}
