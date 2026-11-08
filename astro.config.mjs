// @ts-check
import { defineConfig } from 'astro/config';
import { SITE_URL } from './src/lib/env.ts';

// AD-1, AD-3 : sortie 100 % statique, barre oblique finale, aucun adaptateur ni intégration.
// AD-10 : SITE_URL sert de base aux URL absolues, seulement s'il est posé.
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  ...(SITE_URL ? { site: SITE_URL } : {}),
});
