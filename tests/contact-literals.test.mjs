// Story 1.5 (AD-5, AD-11) : contrôle des liens tel: / wa.me littéraux hors de src/lib/contact/core.ts.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findContactLiterals } from '../scripts/checks/contact-literals.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/checks/contact-literals.mjs');
const dirs = [];

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'rs-contact-'));
  dirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const BAD = {
  'src/components/Call.astro': '<a href="tel:0509565669">Appeler</a>\n',
  'src/lib/share.ts': "export const x = 'https://WA.ME/972509565669';\n",
  'public/_headers': '# TEL: dans un fichier public\n',
  'src/lib/contact/core.ts': "export const t = 'tel:+972509565669'; export const w = 'https://wa.me/972509565669';\n",
  'src/components/Ok.astro': '<a href="/he/">ok</a>\n',
  'public/fonts/x.woff2': Buffer.from([0, 1, 2, 0x74, 0x65, 0x6c, 0x3a, 0]),
  'tests/elsewhere.mjs': "'tel:+972'\n",
  'src/content/hotel.yaml': "name: 'Hotel: Dan'\nfr: 'Hôtel: Dan'\nru: 'Мотель: x'\n",
};

test('tel: dans un .astro, wa.me dans un .ts et dans public/ listés ; core.ts, binaires, « Hotel: » et hors src/public exemptés', () => {
  assert.deepEqual(findContactLiterals(fixture(BAD)), ['public/_headers', 'src/components/Call.astro', 'src/lib/share.ts']);
});

test('CLI : code 1 et fichiers nommés ; code 0 sur un dépôt propre', () => {
  const root = fixture(BAD);
  assert.throws(
    () => execFileSync('node', [SCRIPT, root], { stdio: 'pipe' }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr), /src\/components\/Call\.astro/);
      return true;
    },
  );
  const clean = fixture({ 'src/lib/contact/core.ts': "'tel:+972509565669'\n", 'src/a.ts': 'export {};\n' });
  assert.match(execFileSync('node', [SCRIPT, clean], { encoding: 'utf8' }), /contact-literals : OK/);
});

test('dépôt réel : aucun littéral hors de core.ts', () => {
  assert.deepEqual(findContactLiterals(ROOT), []);
});
