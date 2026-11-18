// School search via the same endpoint the Untis Mobile app uses.

import type { SchoolSearchResult } from '../../shared/types.ts';
import { UntisError, isValidUntisServer } from './client.ts';

const SCHOOL_SEARCH_URL = 'https://mobile.webuntis.com/ms/schoolquery2';
const RPC_TOO_MANY_RESULTS = -6003;

export async function searchSchools(query: string, fetchImpl: typeof fetch = fetch): Promise<SchoolSearchResult[]> {
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
  if (!res.ok) throw new UntisError(`School search answered HTTP ${res.status}`, 'untis_error');
  const data = (await res.json()) as {
    result?: { schools?: { displayName: string; loginName: string; server: string; address?: string }[] };
    error?: { code: number; message: string };
  };
  if (data.error) {
    if (data.error.code === RPC_TOO_MANY_RESULTS) {
      throw new UntisError('Too many schools match, type more of the name', 'too_many_results');
    }
    throw new UntisError(data.error.message, 'untis_error', data.error.code);
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
