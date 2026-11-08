// AD-2, AD-11 : aucun href interne littéral dans src/ ; tout lien interne passe par le registre
// (`url(id, lang)`). Refuse `href="/…"`, `href='/…'`, `href={'/…'}`, `href={`/…`}`, `href: '/…'`
// (pas `//`, URL externe sans schéma). `#ancre` et les URL externes sont permis.
// Exemptés : src/lib/routes/ (le registre) et src/lib/seo.ts (ICON_LINKS : fichiers de public/, pas des pages).
// Usage : node scripts/checks/internal-hrefs.mjs [racine]  (défaut : racine du dépôt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isBinary, isMain, rel, report, REPO_ROOT, rootArg, walk } from './report.mjs';

const EXEMPT = ['src/lib/routes/', 'src/lib/seo.ts'];
const LITERAL = /(?<![\w-])href\s*(?:=\s*(?:\{\s*)?|:\s*)(["'`])\/(?!\/)/g;

/** Échecs `{fichier}:{ligne} : {raison}` des fichiers texte de src/ (chemins relatifs à `root`). */
export function findInternalHrefs(root) {
  const found = [];
  const src = join(root, 'src');
  if (!existsSync(src)) return found;
  for (const path of walk(src).sort()) {
    const file = rel(root, path);
    if (EXEMPT.some((e) => (e.endsWith('/') ? file.startsWith(e) : file === e))) continue;
    const buffer = readFileSync(path);
    if (isBinary(buffer)) continue;
    const text = buffer.toString('utf8');
    for (const m of text.matchAll(LITERAL)) {
      const line = text.slice(0, m.index).split('\n').length;
      const snippet = text.slice(m.index, m.index + 40).split('\n')[0];
      found.push(`${file}:${line} : href interne littéral « ${snippet} » (passer par url() du registre, AD-2)`);
    }
  }
  return found;
}

if (isMain(import.meta.url)) report('internal-hrefs', findInternalHrefs(rootArg(REPO_ROOT)));
