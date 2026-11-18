// School search via the same endpoint the Untis Mobile app uses.
// It does not allow cross-origin browser requests, so it has to go through our server.

import type { SchoolSearchResult } from '../../shared/types.ts';
import { isValidUntisServer } from '../../shared/untis-url.ts';
import { UntisError } from './client.ts';

const SCHOOL_SEARCH_URL = 'https://mobile.webuntis.com/ms/schoolquery2';
const RPC_TOO_MANY_RESULTS = -6003;
const RETRY_DELAY_MS = 600;

interface SearchResponse {
  result?: { schools?: { displayName: string; loginName: string; server: string; address?: string }[] };
  error?: { code: number; message: string };
}

/** First characters of an unexpected response, for error messages and logs. */
async function snippet(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

async function request(query: string, fetchImpl: typeof fetch): Promise<SearchResponse> {
  let res: Response;
  try {
    res = await fetchImpl(SCHOOL_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: 'Untis2', method: 'searchSchool', params: [{ search: query }], jsonrpc: '2.0' }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new UntisError(`School search is not reachable: ${(err as Error).message}`, 'untis_unreachable');
  }
  if (!res.ok) {
    throw new UntisError(`School search answered HTTP ${res.status}: ${await snippet(res)}`, 'untis_error', res.status);
  }
  const body = await res.text();
  try {
    return JSON.parse(body) as SearchResponse;
  } catch {
    throw new UntisError(`School search returned something that is not JSON: ${body.slice(0, 160)}`, 'untis_error');
  }
}

const retryable = (err: unknown) =>
  err instanceof UntisError &&
  (err.code === 'untis_unreachable' || (err.untisCode != null && (err.untisCode === 429 || err.untisCode >= 500)));

export async function searchSchools(query: string, fetchImpl: typeof fetch = fetch): Promise<SchoolSearchResult[]> {
  let data: SearchResponse;
  try {
    data = await request(query, fetchImpl);
  } catch (err) {
    if (!retryable(err)) throw err;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    data = await request(query, fetchImpl);
  }
  if (data.error) {
    if (data.error.code === RPC_TOO_MANY_RESULTS) {
      throw new UntisError('Too many schools match, type more of the name', 'too_many_results');
    }
    throw new UntisError(`School search: ${data.error.message} (${data.error.code})`, 'untis_error', data.error.code);
  }
  return (data.result?.schools ?? [])
    .filter((s) => isValidUntisServer(s.server))
    .map((s) => ({
      displayName: s.displayName,
      loginName: s.loginName,
      server: s.server,
      address: s.address ?? '',
    }));
}
