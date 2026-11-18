import { describe, expect, it } from 'vitest';
import { restorePath } from '../server/vercel.ts';

describe('vercel entry', () => {
  it('restores /api/<path> from the rewrite parameter', () => {
    const r = restorePath(new Request('https://x.vercel.app/api?__path=timetable&start=2026-11-16&end=2026-11-22'));
    const url = new URL(r.url);
    expect(url.pathname).toBe('/api/timetable');
    expect(url.search).toBe('?start=2026-11-16&end=2026-11-22');
  });

  it('leaves requests that already have the original path alone', () => {
    const r = restorePath(new Request('https://x.vercel.app/api/me'));
    expect(new URL(r.url).pathname).toBe('/api/me');
  });

  it('keeps method and body', async () => {
    const r = restorePath(new Request('https://x.vercel.app/api?__path=login', { method: 'POST', body: '{"a":1}' }));
    expect(r.method).toBe('POST');
    expect(await r.text()).toBe('{"a":1}');
  });
});
