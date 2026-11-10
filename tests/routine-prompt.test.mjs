// Story 6.4 (FR36, AD-12, décisions D4 et D6 de l'epic 6) : automation/routine-prompt.md, fiche de configuration et
// prompt complet de la tâche planifiée Claude Code. Le prompt doit citer chaque étape et ne jamais autoriser un push
// vers main, un --force ni une fusion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const DOC = readFileSync(new URL('automation/routine-prompt.md', ROOT), 'utf8');
const ROUTINE = readFileSync(new URL('automation/blog-routine.md', ROOT), 'utf8');

/** Texte entre les marqueurs du prompt. */
const prompt = () => {
  const match = DOC.match(/<!-- PROMPT:START -->\n([\s\S]*?)<!-- PROMPT:END -->/);
  assert.ok(match, 'bloc PROMPT:START … PROMPT:END');
  return match[1];
};

test('routine-prompt.md : bloc prompt présent, une seule fois, non vide', () => {
  assert.equal(DOC.split('<!-- PROMPT:START -->').length, 2);
  assert.equal(DOC.split('<!-- PROMPT:END -->').length, 2);
  assert.ok(prompt().trim().length > 2000);
});

test('prompt : consignes, plan, branche blog/, sous-commandes de l’outil', () => {
  const p = prompt();
  assert.ok(p.includes('automation/blog-routine.md'));
  assert.match(p, /en entier/);
  for (const sub of ['plan', 'photo-search', 'photo-download', 'scope']) {
    assert.ok(p.includes(`node automation/blog-routine.mjs ${sub}`), `sous-commande ${sub}`);
  }
  assert.ok(p.includes('blog/{runDate}'));
  assert.ok(p.includes('gh pr list --label blog-auto --state open --json number,title,headRefName,files'));
  assert.ok(p.includes('Asia/Jerusalem'));
  assert.ok(p.includes('smoke-detectors'));
});

test('prompt : les 5 commandes de vérification de §10, dans l’ordre', () => {
  const p = prompt();
  const cmds = ['npm run check', 'npm run lint', 'npm test', 'npm run build', 'BLOG_AUTO=true npm run check:dist'];
  const positions = cmds.map((c) => p.indexOf(`\n${c}\n`));
  for (const [i, pos] of positions.entries()) assert.ok(pos >= 0, cmds[i]);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'ordre de §10');
  for (const c of cmds) assert.ok(ROUTINE.includes(c), `${c} aussi dans blog-routine.md §10`);
});

test('prompt : PR vers main, étiquette blog-auto via gh api, échecs décrits', () => {
  const p = prompt();
  assert.match(p, /gh pr create --base main --head "blog\/\{runDate\}"/);
  assert.ok(p.includes(`gh api -X POST "repos/{owner}/{repo}/issues/{n}/labels" -f 'labels[]=blog-auto'`));
  assert.match(p, /git push -u origin "blog\/\{runDate\}"/);
  assert.match(p, /Avant le push/);
  assert.match(p, /Après le push/);
  assert.match(p, /PR rouge reste ouverte/);
});

test('PEXELS_API_KEY nommée, sans valeur, nulle part dans le fichier', () => {
  assert.ok(prompt().includes('PEXELS_API_KEY'));
  assert.ok(!/PEXELS_API_KEY\s*[=:]\s*\S/.test(DOC), 'aucune affectation de la clé');
  assert.ok(!/\b[A-Za-z0-9]{40,}\b/.test(DOC), 'aucun jeton long');
});

test('prompt : push vers main, --force et gh pr merge seulement dans des phrases d’interdiction', () => {
  const forbidden = [/git push(?: [^\n`]*)? origin main\b/, /--force/, /gh pr merge/, /push[^\n]*\bmain\b/];
  const interdiction = /\b(?:jamais|Jamais|Interdit|interdit|ne pousse|Ne pousse)\b/;
  const lines = prompt().split('\n');
  for (const re of forbidden) {
    const hits = lines.filter((l) => re.test(l));
    for (const line of hits) assert.match(line, interdiction, `ligne non interdictive : ${line}`);
  }
  // Seule commande git push du prompt hors interdiction : vers la branche blog/.
  const pushes = lines.filter((l) => /^\s*git push\b/.test(l));
  assert.deepEqual(pushes, ['git push -u origin "blog/{runDate}"']);
});

test('fiche de configuration : dimanche 07:00 Asia/Jerusalem, réseau Pexels, test manuel avant activation (D4, D6)', () => {
  const sheet = DOC.split('<!-- PROMPT:START -->')[0];
  assert.ok(sheet.includes('`0 7 * * 0`'));
  assert.ok(sheet.includes('Asia/Jerusalem'));
  assert.ok(sheet.includes('`api.pexels.com`') && sheet.includes('`images.pexels.com`'));
  assert.ok(sheet.includes('PEXELS_API_KEY'));
  assert.match(sheet, /une fois à la main/);
  assert.match(sheet, /planning désactivé/);
});

test('blog-routine.md renvoie vers le prompt et l’outil', () => {
  assert.ok(ROUTINE.includes('automation/routine-prompt.md'));
  assert.ok(ROUTINE.includes('automation/blog-routine.mjs'));
  assert.ok(ROUTINE.includes('node automation/blog-routine.mjs scope --post {id}'));
});
