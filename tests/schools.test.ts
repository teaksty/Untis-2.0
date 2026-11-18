import { describe, expect, it } from 'vitest';
import { parseUntisUrl } from '../shared/untis-url.ts';
import { UntisError } from '../server/untis/client.ts';
import { searchSchools } from '../server/untis/schools.ts';

describe('parseUntisUrl', () => {
  it('reads server and school from typical WebUntis links', () => {
    expect(parseUntisUrl('https://sab.webuntis.com/WebUntis/?school=sab#/basic/login')).toEqual({
      displayName: 'sab', loginName: 'sab', server: 'sab.webuntis.com', address: 'sab.webuntis.com',
    });
    expect(parseUntisUrl('nessa.webuntis.com/WebUntis/#/basic/login?school=Gym%20Nord')?.loginName).toBe('Gym Nord');
    expect(parseUntisUrl(' HTTPS://Neilo.WebUntis.com/WebUntis/?school=x ')?.server).toBe('neilo.webuntis.com');
  });

  it('rejects links without a school or outside webuntis.com', () => {
    expect(parseUntisUrl('https://sab.webuntis.com/WebUntis/')).toBeNull();
    expect(parseUntisUrl('https://evil.com/?school=x')).toBeNull();
    expect(parseUntisUrl('https://webuntis.com.evil.com/?school=x')).toBeNull();
    expect(parseUntisUrl('not a url')).toBeNull();
  });
});

describe('searchSchools', () => {
  const ok = { result: { schools: [{ displayName: 'A', loginName: 'a', server: 'a.webuntis.com', address: 'X' }] } };

  it('retries once on a temporary error', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls === 1 ? new Response('busy', { status: 503 }) : Response.json(ok);
    }) as unknown as typeof fetch;
    expect(await searchSchools('abc', fetchImpl)).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it('explains blocked or broken answers', async () => {
    const forbidden = (async () => new Response('<html>Access denied</html>', { status: 403 })) as unknown as typeof fetch;
    await expect(searchSchools('abc', forbidden)).rejects.toThrow(/HTTP 403: <html>Access denied/);
    const html = (async () => new Response('<html>hi</html>', { status: 200 })) as unknown as typeof fetch;
    await expect(searchSchools('abc', html)).rejects.toThrow(UntisError);
  });

  it('reports too many results', async () => {
    const many = (async () => Response.json({ error: { code: -6003, message: 'too many results' } })) as unknown as typeof fetch;
    await expect(searchSchools('a', many)).rejects.toMatchObject({ code: 'too_many_results' });
  });
});
