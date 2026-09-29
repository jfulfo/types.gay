import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/cat-theory/',
  plugins: [svelte()],
  worker: { format: 'es' },
  build: {
    outDir: '../www/cat-theory',
    emptyOutDir: true,
    target: 'es2022',
    // No data: URIs; the site's CSP only allows same-origin fonts and images.
    assetsInlineLimit: 0,
  },
});
