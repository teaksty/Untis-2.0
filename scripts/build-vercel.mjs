// Packages the app in Vercel's Build Output API format (.vercel/output):
//   static/              the built web app (from dist/)
//   functions/api.func/  the API server bundled into one file
// Vercel deploys this directory as-is, so no framework detection is involved.
// Run after `vite build` (see the build:vercel script).

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const OUT = '.vercel/output';
const FUNC = `${OUT}/functions/api.func`;

if (!existsSync('dist/index.html')) {
  console.error('dist/ is missing, run `vite build` first');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(FUNC, { recursive: true });
cpSync('dist', `${OUT}/static`, { recursive: true });

await build({
  entryPoints: ['server/vercel.ts'],
  outfile: `${FUNC}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Lets bundled CommonJS code call require() inside an ES module.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

const json = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

json(`${FUNC}/.vc-config.json`, {
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  maxDuration: 30,
  // Frankfurt: close to the WebUntis servers and to most users.
  regions: ['fra1'],
});

json(`${OUT}/config.json`, {
  version: 3,
  routes: [
    { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '^/api/(.*)$', dest: '/api?__path=$1' },
    { handle: 'filesystem' },
    // Single-page app: unknown paths get the app shell.
    { src: '^/(.*)$', dest: '/index.html' },
  ],
});

console.log(`Vercel output ready in ${OUT}`);
