// Entry point for the Vercel serverless function that serves /api/*.
// scripts/build-vercel.mjs bundles this file into .vercel/output.

import { getRequestListener } from '@hono/node-server';
import { createApp } from './app.ts';

/** Query parameter the Vercel route uses to pass the original /api/<path>. */
export const PATH_PARAM = '__path';

/**
 * The route rewrites /api/<path> to /api?__path=<path>. Depending on the
 * platform the function sees either form, so put the original path back.
 */
export function restorePath(req: Request): Request {
  const url = new URL(req.url);
  const path = url.searchParams.get(PATH_PARAM);
  if (path === null) return req;
  url.searchParams.delete(PATH_PARAM);
  if (url.pathname === '/api' || url.pathname === '/api/') url.pathname = `/api/${path}`;
  return new Request(url, req);
}

const secret = process.env.SESSION_SECRET ?? '';
const app = secret.length >= 16 ? createApp({ secret, secureCookies: true }).app : null;

export default getRequestListener(async (req) => {
  if (!app) {
    return Response.json(
      { error: 'SESSION_SECRET is not set (Vercel → Settings → Environment Variables)', code: 'untis_error' },
      { status: 500 },
    );
  }
  return app.fetch(restorePath(req));
});
