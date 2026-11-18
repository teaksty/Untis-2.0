import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? (production ? 3000 : 8787));

let secret = process.env.SESSION_SECRET ?? '';
if (!secret) {
  if (production) {
    console.error('SESSION_SECRET is not set. Generate one with:  openssl rand -base64 32');
    process.exit(1);
  }
  // Dev only: a random secret means everyone gets logged out on restart.
  secret = randomBytes(32).toString('base64');
  console.warn('SESSION_SECRET not set, using a random one (logins reset on restart).');
}

const { app } = createApp({
  secret,
  secureCookies: production && process.env.INSECURE_COOKIES !== '1',
});

// In production the same server also serves the built web app.
const distDir = resolve(process.env.DIST_DIR ?? 'dist');
if (production && existsSync(distDir)) {
  const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8');
  app.use(
    '/*',
    serveStatic({
      root: distDir,
      onFound: (path, c) => {
        // Hashed assets never change; everything else should be revalidated.
        c.header('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  app.get('*', (c) => c.html(indexHtml));
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Untis 2.0 server on http://localhost:${info.port}`);
});
