// Recognizing WebUntis addresses; used by the server and the login page.

import type { SchoolSearchResult } from './types.ts';

/** WebUntis is hosted on *.webuntis.com; refusing anything else keeps the
 * server from being used to make requests to arbitrary hosts. */
export function isValidUntisServer(server: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}\.webuntis\.com$/i.test(server);
}

/**
 * Reads server and school from a WebUntis address the user copied from the
 * browser, e.g. "https://abc.webuntis.com/WebUntis/?school=gym-x#/basic/login".
 */
export function parseUntisUrl(input: string): SchoolSearchResult | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const server = url.hostname.toLowerCase();
  if (!isValidUntisServer(server)) return null;
  const hashQuery = url.hash.includes('?') ? new URLSearchParams(url.hash.slice(url.hash.indexOf('?') + 1)) : null;
  const school = (url.searchParams.get('school') ?? hashQuery?.get('school') ?? '').trim();
  if (!school) return null;
  return { displayName: school, loginName: school, server, address: server };
}
