import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { daysBetween, isIsoDate } from '../shared/dates.ts';
import type { ApiError, Profile } from '../shared/types.ts';
import { ProviderRegistry } from './provider.ts';
import { createSealer, type SessionData } from './session.ts';
import { UntisError, isValidUntisServer } from './untis/client.ts';
import { searchSchools } from './untis/schools.ts';

const COOKIE = 'u2_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export interface AppOptions {
  secret: string;
  /** Send cookies with the Secure flag (set in production behind HTTPS). */
  secureCookies: boolean;
  fetchImpl?: typeof fetch;
}

const STATUS: Record<ApiError['code'], 400 | 401 | 429 | 502 | 504> = {
  bad_credentials: 401,
  not_logged_in: 401,
  untis_unreachable: 504,
  untis_error: 502,
  too_many_results: 400,
  rate_limited: 429,
  bad_request: 400,
};

function fail(c: Context, code: ApiError['code'], error: string) {
  return c.json({ error, code } satisfies ApiError, STATUS[code]);
}

function profileOf(s: SessionData): Profile {
  return {
    username: s.username,
    school: s.school,
    schoolDisplayName: s.schoolDisplayName,
    server: s.server,
    demo: Boolean(s.demo),
  };
}

/** Very small fixed-window limiter for login attempts, per client IP. */
function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return true;
    }
    h.count++;
    return h.count <= max;
  };
}

export function createApp(opts: AppOptions) {
  const sealer = createSealer(opts.secret);
  const registry = new ProviderRegistry(opts.fetchImpl);
  const loginLimiter = createLimiter(10, 10 * 60 * 1000);
  const app = new Hono();

  const clientIp = (c: Context) =>
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';

  const startSession = (c: Context, data: SessionData) =>
    setCookie(c, COOKIE, sealer.seal(data), {
      httpOnly: true,
      secure: opts.secureCookies,
      sameSite: 'Lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });

  const session = (c: Context) => sealer.unseal(getCookie(c, COOKIE));

  app.onError((err, c) => {
    if (err instanceof UntisError) {
      if (err.code === 'bad_credentials') deleteCookie(c, COOKIE, { path: '/' });
      // Upstream trouble ends up in the hosting logs (e.g. Vercel → Logs).
      if (err.code === 'untis_error' || err.code === 'untis_unreachable') console.warn(`[${c.req.path}] ${err.message}`);
      return fail(c, err.code, err.message);
    }
    console.error(err);
    return c.json({ error: `Internal error: ${(err as Error).message}`, code: 'untis_error' } satisfies ApiError, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/schools', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 3) return c.json({ schools: [] });
    return c.json({ schools: await searchSchools(q.slice(0, 100), opts.fetchImpl) });
  });

  app.post('/api/login', async (c) => {
    if (!loginLimiter(clientIp(c))) return fail(c, 'rate_limited', 'Too many login attempts, try again later');
    const body = await c.req.json().catch(() => null);
    const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const data: SessionData = {
      v: 1,
      server: str(body?.server).toLowerCase(),
      school: str(body?.school),
      schoolDisplayName: str(body?.schoolDisplayName) || str(body?.school),
      username: str(body?.username),
      password: typeof body?.password === 'string' ? body.password.slice(0, 200) : '',
    };
    if (!isValidUntisServer(data.server) || !data.school || !data.username || !data.password) {
      return fail(c, 'bad_request', 'School, username and password are required');
    }
    await registry.drop(data);
    await registry.get(data).verify();
    startSession(c, data);
    return c.json(profileOf(data));
  });

  app.post('/api/demo', (c) => {
    const data: SessionData = {
      v: 1,
      demo: true,
      server: 'demo.webuntis.com',
      school: 'demo',
      schoolDisplayName: 'Demo-Gymnasium',
      username: 'demo',
      password: 'demo',
    };
    startSession(c, data);
    return c.json(profileOf(data));
  });

  app.post('/api/logout', async (c) => {
    const s = session(c);
    if (s) await registry.drop(s).catch(() => {});
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/me', (c) => {
    const s = session(c);
    if (!s) return fail(c, 'not_logged_in', 'Not logged in');
    return c.json(profileOf(s));
  });

  /** Validates ?start&end and the session, then runs the loader through the cache. */
  const dataRoute = <T>(name: string, maxDays: number, load: (p: import('./provider.ts').DataProvider, start: string, end: string) => Promise<T>) =>
    async (c: Context) => {
      const s = session(c);
      if (!s) return fail(c, 'not_logged_in', 'Not logged in');
      const start = c.req.query('start');
      const end = c.req.query('end');
      if (!isIsoDate(start) || !isIsoDate(end) || end < start || daysBetween(start, end) > maxDays) {
        return fail(c, 'bad_request', `start and end must be dates at most ${maxDays} days apart`);
      }
      const fresh = c.req.query('fresh') === '1';
      const value = await registry.cached(s, `${name}:${start}:${end}`, fresh, (p) => load(p, start, end));
      return c.json(value);
    };

  app.get(
    '/api/timetable',
    dataRoute('timetable', 62, async (p, start, end) => ({ ...(await p.timetable(start, end)), fetchedAt: Date.now() })),
  );
  app.get(
    '/api/homework',
    dataRoute('homework', 190, async (p, start, end) => ({ homework: await p.homework(start, end), fetchedAt: Date.now() })),
  );
  app.get(
    '/api/exams',
    dataRoute('exams', 370, async (p, start, end) => ({ exams: await p.exams(start, end), fetchedAt: Date.now() })),
  );

  app.all('/api/*', (c) => fail(c, 'bad_request', 'Unknown endpoint'));

  return { app, registry };
}
