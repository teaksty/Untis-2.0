// Tiny persisted stores on top of localStorage + useSyncExternalStore.

import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the app keeps working in memory.
  }
}

const stores = new Map<string, Store<unknown>>();

/** Returns the store for `key`, creating it on first use. */
export function persistedStore<T>(key: string, initial: T, merge?: (stored: T) => T): Store<T> {
  const existing = stores.get(key);
  if (existing) return existing as Store<T>;

  let value = readJson(key, initial);
  if (merge) value = merge(value);
  const listeners = new Set<() => void>();

  const store: Store<T> = {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
      writeJson(key, value);
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  // Keep several open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key !== key) return;
    value = readJson(key, initial);
    listeners.forEach((l) => l());
  });

  stores.set(key, store as Store<unknown>);
  return store;
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
