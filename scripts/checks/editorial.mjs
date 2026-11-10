// Story 6.3 (FR36, NFR10, AD-11, AD-12, décisions D2 et D3 de l'epic 6) : lint éditorial des articles du blog.
// Scanne src/content/posts/** (meta.yaml et {he,en,ru,fr}.md) sur le texte publié : valeurs YAML (meta.yaml et
// frontmatter) et corps Markdown, sans les commentaires YAML (`# …`) ni HTML (`<!-- … -->`), normalisé NFKC.
// Règles bloquantes : (1) emoji ; (2) point d'exclamation et variantes ; (3) IDS / Maagal (latin, hébreu, cyrillique) ;
// (4) cible de lien littérale (ni `page:<id>`, ni https://, http://, mailto:, #ancre : même liste blanche que
// src/lib/prose-links.ts) ; (5) placeholder dans un article (`data-placeholder`, `<Placeholder`, crochet hors lien) ;
// (6) balise HTML brute dans un `.md` (recette D7-A), hors blocs et spans de code.
// Consignes de rédaction correspondantes : automation/blog-routine.md.
// Usage : node scripts/checks/editorial.mjs [racine]  (défaut : racine du dépôt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_RE, PAGE_RE } from '../../src/lib/prose-links.ts';
import { isMain, rel, report, REPO_ROOT, rootArg, walk } from './report.mjs';

export const POSTS_DIR = 'src/content/posts';

// — Règles : chacune prend une ligne de texte publié (déjà normalisée) et rend les raisons d'échec. —

// ©, ® et ™ (U+00A9, U+00AE, U+2122) sont des signes typographiques, pas des emoji (recette D7-E).
const EMOJI_RE = /(?![\u00A9\u00AE\u2122])[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u20E3]/gu;

/**
 * (1) Emoji : pictogrammes, indicateurs régionaux (drapeaux), sélecteur de variation emoji, touche « keycap ».
 * ©, ® et ™ seuls passent ; suivis de U+FE0F (présentation emoji), le sélecteur bloque.
 */
export function emojiErrors(text) {
  const found = [...new Set(text.match(EMOJI_RE) ?? [])];
  if (found.length === 0) return [];
  const codes = found.map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
  return [`emoji « ${found.join('')} » (${codes}) interdit (NFR10)`];
}

// Après NFKC, « ！ » devient « ! » et « ‼ » « !! » ; « ¡ » et le clic latin « ǃ » (sosie) restent.
const BANG_RE = /[!¡ǃ]/u;

/** (2) Point d'exclamation, sous toutes ses formes. */
export function exclamationErrors(text) {
  return BANG_RE.test(text) ? ['point d’exclamation interdit (NFR10)'] : [];
}

const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const LATIN_SEP = '[.\\s_-]{0,2}';
const HE_PREFIX = '[ובהלמשכ]{0,3}';
const HE_SEP = "[\\s.\\-־'׳]*";
const FORBIDDEN = [
  ['IDS', `I${LATIN_SEP}D${LATIN_SEP}S\\.?`],
  ['IDS', `${HE_PREFIX}אי(?:י)?${HE_SEP}די${HE_SEP}(?:אס|איס)`],
  ['IDS', `И\\.?Д\\.?С\\.?`],
  ['IDS', `Ай[\\s-]?Ди[\\s-]?(?:Эс|Ес)`],
  ['Maagal', `ma['’ʼ]?a?gal`],
  ['Maagal', `${HE_PREFIX}מעגל`],
  ['Maagal', `ма['’ʼ]?а?гал(?:ь|а|е|у|ом|я|ю|ем|ём)?`],
].map(([name, src]) => [name, new RegExp(`${B}${src}${E}`, 'giu')]);

/**
 * (3) IDS / Maagal, mots entiers, insensible à la casse, graphies latines, hébraïques et cyrilliques. Niqqud et autres
 * marques (`\p{M}`), trait d'union conditionnel et caractères invisibles (`\p{Default_Ignorable_Code_Point}`) retirés
 * avant la recherche (pour cette règle seulement).
 */
export function forbiddenNameErrors(text) {
  const out = [];
  const bare = text.replace(/[\p{M}\p{Default_Ignorable_Code_Point}]/gu, '');
  for (const [name, re] of FORBIDDEN) {
    for (const m of bare.matchAll(re)) out.push(`« ${m[0]} » : ${name} ne doit pas être cité (NFR10)`);
  }
  return out;
}

const INLINE_TARGET_RE = /\]\(\s*(<[^>]*>|[^\s)]*)/g;
const REF_DEF_RE = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S*)/;
const AUTOLINK_RE = /<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/g;
const HREF_ATTR_RE = /(?<![\w-])href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

const allowedTarget = (target) => PAGE_RE.test(target) || ALLOWED_RE.test(target);

/** (4) Cibles de liens : Markdown `[x](…)`, `[x]: …`, autolien `<…>`, attribut `href=`. */
export function linkErrors(text) {
  const targets = [];
  for (const m of text.matchAll(INLINE_TARGET_RE)) targets.push(m[1]);
  const def = text.match(REF_DEF_RE);
  if (def) targets.push(def[1]);
  for (const m of text.matchAll(AUTOLINK_RE)) targets.push(m[1]);
  for (const m of text.matchAll(HREF_ATTR_RE)) targets.push(m[1] ?? m[2] ?? m[3]);
  const bad = targets.map((t) => t.replace(/^<(.*)>$/, '$1')).filter((t) => !allowedTarget(t));
  return [...new Set(bad)].map(
    (t) => `lien « ${t} » littéral (lien interne en page:<id>, externe en https://, mailto: ou #ancre ; AD-2)`,
  );
}

const LINK_FORMS = [
  /^\s{0,3}\[[^\]]+\]:.*$/, // définition de référence
  /!?\[[^[\]]*\]\([^)]*\)/g, // lien (ou image) en ligne
  /\[[^[\]]*\]\[[^[\]]*\]/g, // lien de référence complet ou réduit
];

/** (5) Placeholder dans un article : `data-placeholder`, `<Placeholder`, crochet hors lien Markdown (D2, D3). */
export function placeholderErrors(text, refLabels = new Set()) {
  const out = [];
  if (/data-placeholder/i.test(text)) out.push('« data-placeholder » : aucun placeholder dans un article (D3)');
  if (/<Placeholder\b/.test(text)) out.push('« <Placeholder> » : aucun placeholder dans un article (D3)');
  let rest = text;
  for (const re of LINK_FORMS) rest = rest.replace(re, '');
  rest = rest.replace(/\[([^[\]]*)\]/g, (all, label) => (refLabels.has(label.trim().toLowerCase()) ? '' : all));
  const bracket = rest.match(/\[[^\]]*\]?|\]/);
  if (bracket) out.push(`crochet « ${bracket[0]} » hors lien : aucun placeholder dans un article (D3)`);
  return out;
}

// Balise ouvrante ou fermante (`<script`, `</div`, `<img`…), déclaration ou CDATA (`<!DOCTYPE`, `<![CDATA[`),
// instruction (`<?`). Un autolien `<https://…>` n'en est pas une (le nom est suivi de `:`).
const HTML_TAG_RE = /<\/?[A-Za-z][A-Za-z0-9-]*(?=[\s/>]|$)|<![A-Za-z[]|<\?/;

/** (6) Balise HTML brute (D7-A) : le corps d'un article s'écrit en Markdown seulement. */
export function htmlErrors(text) {
  const m = text.match(HTML_TAG_RE);
  return m ? [`balise HTML « ${m[0]} » interdite dans un article : Markdown seulement (D7)`] : [];
}

/** Toutes les raisons d'échec d'une ligne de texte publié (normalisée NFKC ici). */
export function lineErrors(text, refLabels) {
  const t = text.normalize('NFKC');
  return [...emojiErrors(t), ...exclamationErrors(t), ...forbiddenNameErrors(t), ...linkErrors(t), ...placeholderErrors(t, refLabels)];
}

// — Texte publié d'un fichier : tableau de lignes (index = numéro de ligne - 1), commentaires retirés. —

const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(?:excl|iexcl);/g, (m) => (m === '&excl;' ? '!' : '¡'));

const YAML_ESCAPES = { n: ' ', t: ' ', '"': '"', '\\': '\\', '/': '/', ' ': ' ', '0': '', _: ' ' };

/**
 * Valeurs d'un texte YAML, ligne par ligne : commentaires retirés, guillemets ôtés et échappements décodés
 * (`''`, `\uXXXX`…), clés retirées ; contenu d'un bloc `|` / `>` gardé tel quel.
 */
export function yamlValueLines(source) {
  const out = [];
  let quote = null; // ' ou " ouvert sur une ligne précédente
  let block = null; // indentation de la clé d'un bloc | ou >
  for (const line of source.split('\n')) {
    const indent = line.match(/^ */)[0].length;
    if (block !== null) {
      if (line.trim() === '' || indent > block) {
        out.push(line);
        continue;
      }
      block = null;
    }
    let value = '';
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (quote === "'") {
        if (c === "'" && line[i + 1] === "'") (value += "'"), (i += 2);
        else if (c === "'") (quote = null), (i += 1);
        else (value += c), (i += 1);
      } else if (quote === '"') {
        if (c === '\\') {
          const n = line[i + 1] ?? '';
          const hex = { x: 2, u: 4, U: 8 }[n];
          if (hex) (value += String.fromCodePoint(Number.parseInt(line.slice(i + 2, i + 2 + hex), 16) || 0)), (i += 2 + hex);
          else (value += YAML_ESCAPES[n] ?? n), (i += 2);
        } else if (c === '"') (quote = null), (i += 1);
        else (value += c), (i += 1);
      } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
        break;
      } else if ((c === "'" || c === '"') && /(?:^|[:\-[{,])\s*$/.test(line.slice(0, i))) {
        (quote = c), (i += 1);
      } else (value += c), (i += 1);
    }
    const withoutKey = value.replace(/^\s*(?:-\s+)*[\w.-]+\s*:(?=\s|$)\s*/, '').replace(/^\s*-\s+/, '');
    if (/^[|>][+-]?\d*\s*$/.test(withoutKey)) {
      block = indent;
      out.push('');
    } else out.push(withoutKey);
  }
  return out;
}

const blankComments = (s) => s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

/** Lignes de texte publié d'un `.md` : frontmatter YAML (valeurs) puis corps (commentaires HTML blanchis). */
export function markdownLines(source) {
  const lines = source.split('\n');
  if (lines[0]?.trimEnd() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
    if (end > 0) {
      const front = yamlValueLines(lines.slice(1, end).join('\n'));
      const body = blankComments(lines.slice(end + 1).join('\n')).split('\n');
      return ['', ...front, '', ...body.map(decodeEntities)];
    }
  }
  return blankComments(source).split('\n').map(decodeEntities);
}

const blank = (s) => s.replace(/[^\n]/g, ' ');

/**
 * Corps Markdown avec le code blanchi (même nombre de lignes et de colonnes) : blocs clôturés ``` / ~~~ fermés
 * (un bloc non fermé reste visible), puis spans de code `…` par paragraphe (CommonMark : une suite de n accents graves
 * se ferme sur la suivante d'exactement n ; un accent échappé par `\` n'ouvre pas). Les autoliens `<scheme:…>` sont
 * blanchis avant les spans (ils priment sur eux). Côté prudent : ce qui n'est pas sûrement du code reste visible.
 */
export function maskCode(body) {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const open = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (!open || (open[1][0] === '`' && lines[i].slice(open[0].length).includes('`'))) continue;
    const fence = open[1];
    const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    const end = lines.findIndex((l, j) => j > i && close.test(l));
    if (end < 0) break;
    for (let j = i; j <= end; j += 1) lines[j] = blank(lines[j]);
    i = end;
  }
  return lines
    .join('\n')
    .split(/(\n[ \t]*\n)/)
    .map((para) => {
      const s = para.replace(/<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>/g, blank);
      let out = '';
      let i = 0;
      while (i < s.length) {
        if (s[i] === '\\' && s[i + 1] === '`') {
          out += s.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (s[i] !== '`') {
          out += s[i];
          i += 1;
          continue;
        }
        const run = s.slice(i).match(/^`+/)[0];
        const re = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');
        re.lastIndex = i + run.length;
        const closing = re.exec(s);
        if (!closing) {
          out += run;
          i += run.length;
          continue;
        }
        const endAt = closing.index + run.length;
        out += blank(s.slice(i, endAt));
        i = endAt;
      }
      return out;
    })
    .join('');
}

/**
 * Lignes d'un `.md` pour la règle HTML (alignées sur `markdownLines`) : valeurs du frontmatter, puis corps brut
 * (entités non décodées, commentaires HTML gardés : une balise dans un commentaire bloque aussi) au code blanchi.
 */
export function htmlLines(source) {
  const lines = source.split('\n');
  if (lines[0]?.trimEnd() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
    if (end > 0) {
      const front = yamlValueLines(lines.slice(1, end).join('\n'));
      return ['', ...front, '', ...maskCode(lines.slice(end + 1).join('\n')).split('\n')];
    }
  }
  return maskCode(source).split('\n');
}

/** Étiquettes des définitions de référence `[label]: …` (pour admettre le lien raccourci `[label]`). */
const refLabelsOf = (lines) =>
  new Set(lines.map((l) => l.match(/^\s{0,3}\[([^\]]+)\]:/)?.[1].trim().toLowerCase()).filter(Boolean));

/** Échecs `{fichier}:{ligne} : {raison}` d'un fichier d'article (`file` = chemin affiché). */
export function fileErrors(file, source) {
  const text = source.replace(/\r\n?/g, '\n');
  const lines = /\.ya?ml$/.test(file) ? yamlValueLines(text) : markdownLines(text);
  const labels = refLabelsOf(lines);
  const html = /\.md$/.test(file) ? htmlLines(text) : [];
  return lines.flatMap((line, i) =>
    [...new Set([...lineErrors(line, labels), ...htmlErrors(html[i] ?? '')])].map((reason) => `${file}:${i + 1} : ${reason}`),
  );
}

/** Échecs du lint éditorial sur `{root}/src/content/posts/**` (chemins relatifs à `root`). */
export function findEditorialErrors(root) {
  const dir = join(root, POSTS_DIR);
  if (!existsSync(dir)) return [];
  return walk(dir)
    .filter((p) => /\.(?:md|ya?ml)$/.test(p))
    .sort()
    .flatMap((path) => fileErrors(rel(root, path), readFileSync(path, 'utf8')));
}

if (isMain(import.meta.url)) report('editorial', findEditorialErrors(rootArg(REPO_ROOT)));
