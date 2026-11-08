// AD-10 : écrit _headers selon INDEXABLE, lu dans src/lib/env.ts.
// Usage : node scripts/postbuild/headers.mjs [dossier]  (défaut : dist/ du dépôt).
// La story 1.9 étend ce fichier.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEXABLE } from '../../src/lib/env.ts';

const dist = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../../dist/', import.meta.url));
const headers = INDEXABLE ? '' : '/*\n  X-Robots-Tag: noindex\n';

writeFileSync(join(dist, '_headers'), headers);
console.log(`_headers écrit (INDEXABLE=${INDEXABLE})`);
