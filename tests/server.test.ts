// Runs the API against a fake WebUntis, so login, session expiry and data
// mapping are tested without a real school account.

import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { createSealer } from '../server/session.ts';
import { UntisClient, UntisError } from '../server/untis/client.ts';

const SECRET = 'test-secret-that-is-long-enough';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (res: Response): Promise<any> => res.json();

interface FakeUntis {
  fetch: typeof fetch;
  calls: string[];
  /** Makes the current session invalid, like WebUntis does after idling. */
  expire(): void;
}

function fakeUntis(): FakeUntis {
  let session = 0;
  let valid = false;
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const cookie = new Headers(init?.headers).get('Cookie') ?? '';
    const authed = valid && cookie.includes(`JSESSIONID=S${session}`);

    if (url.hostname === 'mobile.webuntis.com') {
      calls.push('searchSchool');
      return json({ result: { schools: [{ displayName: 'Gymnasium Musterstadt', loginName: 'gym-muster', server: 'mese.webuntis.com', address: 'Musterstadt' }, { displayName: 'Evil', loginName: 'x', server: 'evil.example.com' }] } });
    }
    if (url.pathname === '/WebUntis/jsonrpc.do') {
      const body = JSON.parse(String(init?.body));
      calls.push(body.method);
      if (body.method === 'authenticate') {
        if (body.params.password !== 'right') return json({ error: { code: -8504, message: 'bad credentials' } });
        session++;
        valid = true;
        return json({ result: { sessionId: `S${session}`, personId: 7, personType: 5, klasseId: 3 } });
      }
      if (!authed) return json({ error: { code: -8520, message: 'not authenticated' } });
      if (body.method === 'getTimegridUnits') return json({ result: [{ day: 2, timeUnits: [{ name: '1', startTime: 800, endTime: 845 }, { name: '2', startTime: 850, endTime: 935 }] }] });
      if (body.method === 'getHolidays') return json({ result: [{ id: 1, name: 'HF', longName: 'Herbstferien', startDate: 20261026, endDate: 20261030 }] });
      if (body.method === 'getTimetable') {
        expect(body.params.options.element).toEqual({ id: 7, type: 5 });
        return json({
          result: [
            { id: 1, date: 20261116, startTime: 800, endTime: 845, su: [{ id: 1, name: 'M', longname: 'Mathematik' }], te: [{ id: 2, name: 'BRA' }], ro: [{ id: 3, name: '204' }], kl: [] },
            { id: 2, date: 20261116, startTime: 850, endTime: 935, su: [{ id: 1, name: 'M', longname: 'Mathematik' }], te: [{ id: 2, name: 'BRA' }], ro: [{ id: 3, name: '204' }], kl: [], code: 'cancelled' },
          ],
        });
      }
      if (body.method === 'logout') return json({ result: null });
    }
    if (url.pathname === '/WebUntis/api/exams') {
      calls.push('exams');
      if (!authed) return new Response('', { status: 403 });
      expect(url.searchParams.get('klasseId')).toBe('3');
      return json({ data: { exams: [{ id: 5, examDate: 20261120, startTime: 800, endTime: 935, subject: 'Mathematik', name: 'KA 3', teachers: ['BRA'], rooms: ['204'] }] } });
    }
    if (url.pathname === '/WebUntis/api/homeworks/lessons') {
      calls.push('homework');
      if (!authed) return new Response('', { status: 302, headers: { Location: '/WebUntis/' } });
      return json({ data: { homeworks: [{ id: 1, lessonId: 9, date: 20261110, dueDate: 20261117, text: 'S. 84', completed: false }], lessons: [{ id: 9, subject: 'M' }], teachers: [], records: [] } });
    }
    return new Response('not found', { status: 404 });
  };

  return {
    fetch: impl as typeof fetch,
    calls,
    expire: () => {
      valid = false;
    },
  };
}

function setup() {
  const untis = fakeUntis();
  const { app, registry } = createApp({ secret: SECRET, secureCookies: false, fetchImpl: untis.fetch });
  let cookie = '';
  const request = async (path: string, init?: RequestInit) => {
    const res = await app.request(path, { ...init, headers: { ...(cookie ? { Cookie: cookie } : {}), ...init?.headers } });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  const login = (password = 'right') =>
    request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server: 'mese.webuntis.com', school: 'gym-muster', schoolDisplayName: 'Gymnasium Musterstadt', username: 'anna', password }),
    });
  return { untis, request, login, registry, getCookie: () => cookie };
}

let cleanup: (() => void) | null = null;
afterEach(() => cleanup?.());

describe('API', () => {
  it('rejects data requests without a session', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    const res = await s.request('/api/timetable?start=2026-11-16&end=2026-11-22');
    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ code: 'not_logged_in' });
  });

  it('reports wrong passwords', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    const res = await s.login('wrong');
    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ code: 'bad_credentials' });
  });

  it('logs in, keeps the password out of the cookie, and loads the timetable', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    const res = await s.login();
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ username: 'anna', schoolDisplayName: 'Gymnasium Musterstadt', demo: false });
    expect(s.getCookie()).toMatch(/^u2_session=/);
    expect(decodeURIComponent(s.getCookie())).not.toContain('right');

    const tt = await s.request('/api/timetable?start=2026-11-16&end=2026-11-22');
    expect(tt.status).toBe(200);
    const body = await json(tt);
    expect(body.lessons).toHaveLength(2);
    expect(body.lessons[1].status).toBe('cancelled');
    expect(body.timegrid).toHaveLength(2);
    expect(body.holidays).toEqual([]); // outside the range
  });

  it('logs in again when WebUntis drops the session', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    await s.login();
    s.untis.expire();
    const exams = await s.request('/api/exams?start=2026-11-16&end=2026-11-30');
    expect(exams.status).toBe(200);
    expect((await json(exams)).exams[0]).toMatchObject({ subject: 'Mathematik', date: '2026-11-20', start: '08:00' });

    s.untis.expire();
    const hw = await s.request('/api/homework?start=2026-11-16&end=2026-11-30');
    expect(hw.status).toBe(200);
    expect((await json(hw)).homework[0]).toMatchObject({ subject: 'M', due: '2026-11-17' });
    expect(s.untis.calls.filter((c) => c === 'authenticate').length).toBe(3);
  });

  it('caches responses briefly', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    await s.login();
    await s.request('/api/timetable?start=2026-11-16&end=2026-11-22');
    await s.request('/api/timetable?start=2026-11-16&end=2026-11-22');
    expect(s.untis.calls.filter((c) => c === 'getTimetable').length).toBe(1);
  });

  it('validates date ranges', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    await s.login();
    expect((await s.request('/api/timetable?start=2026-11-16&end=2027-11-22')).status).toBe(400);
    expect((await s.request('/api/timetable?start=nope&end=2026-11-22')).status).toBe(400);
  });

  it('only returns schools hosted on webuntis.com', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    const res = await s.request('/api/schools?q=muster');
    const body = await json(res);
    expect(body.schools).toEqual([{ displayName: 'Gymnasium Musterstadt', loginName: 'gym-muster', server: 'mese.webuntis.com', address: 'Musterstadt' }]);
  });

  it('refuses servers outside webuntis.com', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    const res = await s.request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server: '169.254.169.254', school: 'x', username: 'a', password: 'b' }),
    });
    expect(res.status).toBe(400);
    expect(() => new UntisClient({ server: 'evil.com', school: 'x', username: 'a', password: 'b' })).toThrow(UntisError);
  });

  it('serves demo data', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    expect((await s.request('/api/demo', { method: 'POST' })).status).toBe(200);
    const tt = await json(await s.request('/api/timetable?start=2026-11-16&end=2026-11-22'));
    expect(tt.lessons.length).toBeGreaterThan(20);
    expect(s.untis.calls).toEqual([]);
  });

  it('logs out', async () => {
    const s = setup();
    cleanup = () => s.registry.stop();
    await s.login();
    await s.request('/api/logout', { method: 'POST' });
    expect(s.untis.calls).toContain('logout');
    expect((await s.request('/api/me')).status).toBe(401);
  });
});

describe('session cookie', () => {
  it('round-trips and rejects tampering', () => {
    const sealer = createSealer(SECRET);
    const token = sealer.seal({ v: 1, server: 'a.webuntis.com', school: 's', schoolDisplayName: 'S', username: 'u', password: 'p' });
    expect(sealer.unseal(token)?.username).toBe('u');
    const flipped = token.slice(0, -2) + (token.endsWith('A') ? 'B' : 'A') + token.slice(-1);
    expect(sealer.unseal(flipped)).toBeNull();
    expect(createSealer('another-secret-long-enough').unseal(token)).toBeNull();
    expect(sealer.unseal('garbage')).toBeNull();
  });
});
