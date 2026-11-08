// AD-3, AD-11 : sert un dossier dist/ avec `wrangler dev`, qui applique les règles de Cloudflare
// (`_redirects`, barre oblique finale, `not_found_handling: "404-page"`). Utilisé par les portes
// not-found et links : on vérifie la surface réelle, pas une imitation de ces règles.
// Pas un contrôle : aucun CLI.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from './report.mjs';

const WRANGLER = join(REPO_ROOT, 'node_modules', '.bin', 'wrangler');
const START_TIMEOUT_MS = 90_000;

/** Lit wrangler.jsonc en retirant les commentaires `//` hors chaînes. */
export function readWranglerConfig(path = join(REPO_ROOT, 'wrangler.jsonc')) {
  const text = readFileSync(path, 'utf8');
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else out += c;
  }
  return JSON.parse(out);
}

function freePort() {
  return new Promise((ok, ko) => {
    const server = createServer();
    server.unref();
    server.on('error', ko);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => ok(port));
    });
  });
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Sert `dist` par `wrangler dev` ; renvoie `{ origin, close() }`. */
export async function serve(dist) {
  const config = readWranglerConfig();
  delete config.$schema;
  config.assets = { ...config.assets, directory: resolve(dist) };
  const dir = mkdtempSync(join(tmpdir(), 'rs-serve-'));
  const configPath = join(dir, 'wrangler.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(WRANGLER, ['dev', '--config', configPath, '--ip', '127.0.0.1', '--port', String(port)], {
    cwd: dir,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  let exited = null;
  const exit = new Promise((ok) => child.on('exit', (code, signal) => ok((exited = { code, signal }))));

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (exited === null) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }, 5_000);
      await exit;
      clearTimeout(timer);
    }
    rmSync(dir, { recursive: true, force: true });
  };

  const deadline = Date.now() + START_TIMEOUT_MS;
  for (;;) {
    if (exited !== null) {
      await close();
      throw new Error(`serve : wrangler dev s'est arrêté (code ${exited.code ?? exited.signal})\n${output}`);
    }
    try {
      await fetch(`${origin}/`, { redirect: 'manual', signal: AbortSignal.timeout(2_000) });
      return { origin, close };
    } catch {}
    if (Date.now() > deadline) {
      await close();
      throw new Error(`serve : wrangler dev ne répond pas après ${START_TIMEOUT_MS / 1000} s\n${output}`);
    }
    await sleep(250);
  }
}
