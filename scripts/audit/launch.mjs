// Story 7.3 (NFR1–NFR6, UX-DR5) : audit de lancement, relançable, hors CI et hors `npm test`.
// Sert dist/ par wrangler dev (scripts/checks/serve.mjs), joue les volets scrims, perf et a11y (Playwright, Lighthouse,
// axe-core), écrit .audit/report.json et .audit/report.md ; code 1 au moindre échec.
// Usage : npm run audit:launch [-- --only=scrims,perf,a11y] [--out=dossier] [--dist=dossier]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from '../checks/report.mjs';
import { serve } from '../checks/serve.mjs';
import { failureCount, renderReport } from './lib.mjs';

const VOLETS = ['scrims', 'perf', 'a11y'];

function parseArgs(argv) {
  const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const only = opt('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? VOLETS;
  if (only.length === 0) throw new Error(`aucun volet sélectionné (attendu : ${VOLETS.join(', ')})`);
  const unknown = only.filter((v) => !VOLETS.includes(v));
  if (unknown.length > 0) throw new Error(`volet inconnu : ${unknown.join(', ')} (attendu : ${VOLETS.join(', ')})`);
  return {
    only,
    out: resolve(opt('out') ?? join(REPO_ROOT, '.audit')),
    dist: resolve(opt('dist') ?? join(REPO_ROOT, 'dist')),
  };
}

async function main() {
  const { only, out, dist } = parseArgs(process.argv.slice(2));
  if (!existsSync(dist)) {
    console.error(`audit : ${dist} absent, lancer npm run build d'abord`);
    process.exit(1);
  }
  const log = (msg) => console.log(`  ${msg}`);
  const server = await serve(dist);
  const results = { generatedAt: new Date().toISOString(), origin: server.origin, volets: {} };
  try {
    for (const name of only) {
      console.log(`audit : volet ${name}…`);
      const mod = await import(`./${name}.mjs`);
      const run = { scrims: mod.runScrims, perf: mod.runPerf, a11y: mod.runA11y }[name];
      try {
        results.volets[name] = await run({ origin: server.origin, dist, log });
      } catch (err) {
        // Un volet qui plante compte comme un échec ; le rapport des autres volets est quand même écrit.
        results.volets[name] = { title: name, columns: [], rows: [], failures: [`erreur du volet : ${String(err.message ?? err).split('\n')[0]}`], notes: [] };
      }
      console.log(`audit : ${name} — ${results.volets[name].failures.length} échec(s)`);
    }
  } finally {
    await server.close();
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(out, 'report.md'), renderReport(results));
  const failures = failureCount(results);
  for (const [name, v] of Object.entries(results.volets)) for (const f of v.failures) console.error(`  - [${name}] ${f}`);
  console.log(`audit : ${failures === 0 ? 'OK' : `${failures} échec(s)`} — rapport ${join(out, 'report.md')}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`audit : ${err.stack ?? err}`);
  process.exit(1);
});
