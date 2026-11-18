import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError, Profile } from '../shared/types.ts';
import { writeJson } from './lib/store.ts';
import { profileScope, profileStore } from './state.ts';

export class RequestError extends Error {
  constructor(
    message: string,
    public code: ApiError['code'] | 'network',
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    });
  } catch {
    throw new RequestError('Network error', 'network');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body as ApiError | null;
    if (err?.code === 'not_logged_in') profileStore.set(null);
    throw new RequestError(err?.error ?? `HTTP ${res.status}`, err?.code ?? 'network');
  }
  return body as T;
}

export const login = (data: { server: string; school: string; schoolDisplayName: string; username: string; password: string }) =>
  api<Profile>('/api/login', { method: 'POST', body: JSON.stringify(data) });

export const loginDemo = () => api<Profile>('/api/demo', { method: 'POST' });

export async function logout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  profileStore.set(null);
}

// ---- Response cache: show the last data instantly, then refresh ----------

const CACHE_PREFIX = 'u2.cache.';
const CACHE_INDEX = 'u2.cache-index';
const CACHE_MAX_ENTRIES = 40;

function cacheKey(path: string) {
  const p = profileStore.get();
  return `${CACHE_PREFIX}${p ? profileScope(p) : 'anon'}:${path}`;
}

function readCache<T>(path: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(path));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(path: string, value: unknown) {
  const key = cacheKey(path);
  let index: string[] = [];
  try {
    index = JSON.parse(localStorage.getItem(CACHE_INDEX) ?? '[]');
  } catch {
    // start over
  }
  index = [key, ...index.filter((k) => k !== key)];
  for (const old of index.splice(CACHE_MAX_ENTRIES)) localStorage.removeItem(old);
  writeJson(CACHE_INDEX, index);
  writeJson(key, value);
}

export function clearCache() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
  }
  localStorage.removeItem(CACHE_INDEX);
}

export interface Resource<T> {
  data: T | null;
  error: RequestError | null;
  /** True while a request is running (also when cached data is shown). */
  loading: boolean;
  reload(): void;
}

/**
 * Fetches `path` (if not null), showing cached data immediately. Refetches
 * when the app comes back to the foreground.
 */
export function useApi<T>(path: string | null): Resource<T> {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: RequestError | null; loading: boolean }>(
    () => ({ path, data: path ? readCache<T>(path) : null, error: null, loading: Boolean(path) }),
  );
  const seq = useRef(0);

  const load = useCallback(
    async (fresh: boolean) => {
      if (!path) return;
      const id = ++seq.current;
      setState((s) => ({ ...s, loading: true }));
      try {
        const sep = path.includes('?') ? '&' : '?';
        const data = await api<T>(fresh ? `${path}${sep}fresh=1` : path);
        if (id !== seq.current) return;
        writeCache(path, data);
        setState({ path, data, error: null, loading: false });
      } catch (err) {
        if (id !== seq.current) return;
        setState((s) => ({ ...s, error: err as RequestError, loading: false }));
      }
    },
    [path],
  );

  // New path: show its cached data right away, then fetch.
  if (state.path !== path) {
    setState({ path, data: path ? readCache<T>(path) : null, error: null, loading: Boolean(path) });
  }

  useEffect(() => {
    void load(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [load]);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    reload: () => void load(true),
  };
}

/** Warms the cache for a path without rendering it (e.g. next week). */
export function prefetch(path: string) {
  api(path)
    .then((data) => writeCache(path, data))
    .catch(() => {});
}
