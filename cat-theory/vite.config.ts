import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

/** In development, answer /cat-theory/api/check with the real checker and a local Lean. */
function leanCheck(): Plugin {
  const cache = join(tmpdir(), 'loose-pages-lean');
  return {
    name: 'lean-check',
    configureServer(server) {
      mkdirSync(cache, { recursive: true });
      server.middlewares.use('/cat-theory/api/check', (req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks);
          const child = spawn('python3', [join(__dirname, '../cgi-bin/lean/check.cgi')], {
            env: {
              REQUEST_METHOD: req.method ?? 'GET',
              CONTENT_LENGTH: String(body.length),
              LOOSE_PAGES_LEAN: process.env.LEAN ?? join(homedir(), '.local/lib/lean/lean-4.34.1-linux/bin/lean'),
              LOOSE_PAGES_CACHE: cache,
              PATH: process.env.PATH,
            },
          });
          let out = '';
          child.stdout.on('data', (d) => (out += d));
          child.on('close', () => {
            const [head, ...rest] = out.split('\r\n\r\n');
            const status = Number(head.match(/^Status: (\d+)/)?.[1] ?? 500);
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.end(rest.join('\r\n\r\n'));
          });
          child.stdin.end(body);
        });
      });
    },
  };
}

export default defineConfig({
  base: '/cat-theory/',
  plugins: [svelte(), leanCheck()],
  build: {
    outDir: '../www/cat-theory',
    emptyOutDir: true,
    target: 'es2022',
    // No data: URIs; the site's CSP only allows same-origin fonts and images.
    assetsInlineLimit: 0,
  },
});
