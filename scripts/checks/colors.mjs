// AD-8, AD-11 : aucune couleur littérale dans src/ hors de src/styles/tokens.css.
// Déplacé de tests/styles.test.mjs (story 1.2) sans changement de logique.
// Usage : node scripts/checks/colors.mjs [racine]  (défaut : racine du dépôt).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, rel, report, REPO_ROOT, rootArg } from './report.mjs';

export const TOKENS_REL = 'src/styles/tokens.css';
/** Extensions des fichiers de src/ vérifiés par les lints de styles. */
export const CHECKED_EXT = /\.(css|astro|ts|mjs|js)$/;

// Mots-clés de couleur CSS (couleurs nommées + system colors usuels), hors transparent / currentColor.
export const COLOR_KEYWORDS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
  'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
  'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
  'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
  'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
  'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
  'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
  'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
  'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
  'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
  'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
  'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
  'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
  'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
  'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen ' +
  'canvas canvastext linktext visitedtext activetext buttonface buttontext field fieldtext highlight highlighttext graytext'
).split(' ');
const KEYWORD_RE = new RegExp(`(?<![\\w-])(${COLOR_KEYWORDS.join('|')})(?![\\w-])`, 'i');
// Propriétés qui reçoivent une couleur (CSS, style inline, objet TS, attribut SVG) et custom properties.
const COLOR_PROP =
  '(?:--[\\w-]+|color|background(?:-color)?|border(?:-[\\w-]+)?|outline(?:-color)?|fill|stroke|' +
  'caret-color|accent-color|text-decoration(?:-color)?|text-emphasis(?:-color)?|column-rule(?:-color)?|' +
  'stop-color|flood-color|lighting-color|scrollbar-color|-webkit-tap-highlight-color|box-shadow|text-shadow)';
const COLOR_DECL_RE = new RegExp(`(?<![\\w-])${COLOR_PROP}\\s*:\\s*([^;}\\n]+)`, 'gi');
const COLOR_ATTR_RE = new RegExp(`(?<![\\w-])${COLOR_PROP}\\s*=\\s*["']([^"']*)["']`, 'gi');

// Remplace les commentaires /* */ par des espaces en gardant les retours à la ligne (numéros de ligne).
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Fichiers vérifiés de `dir`, en `{ path, text }` avec `path` relatif à `root` (séparateur /). */
export function sourceFiles(root, dir) {
  return readdirSync(dir, { recursive: true })
    .map((p) => join(dir, String(p)))
    .filter((p) => CHECKED_EXT.test(p) && statSync(p).isFile())
    .map((p) => ({ path: rel(root, p), text: readFileSync(p, 'utf8') }));
}

/** AD-8 : aucune couleur littérale hors de tokens.css. */
export function findLiteralColors(files) {
  const errors = [];
  for (const { path, text } of files) {
    if (path === TOKENS_REL) continue;
    const src = stripComments(text);
    const report = (i, what) => errors.push(`${path}:${lineOf(src, i)} : couleur littérale ${what}`);
    for (const m of src.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) report(m.index, m[0]);
    for (const m of src.matchAll(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)) report(m.index, m[0]);
    for (const re of [COLOR_DECL_RE, COLOR_ATTR_RE]) {
      for (const m of src.matchAll(re)) {
        const k = m[1].match(KEYWORD_RE);
        if (k) report(m.index, `« ${k[1]} »`);
      }
    }
  }
  return errors;
}

if (isMain(import.meta.url)) {
  const root = rootArg(REPO_ROOT);
  report('colors', findLiteralColors(sourceFiles(root, join(root, 'src'))));
}
