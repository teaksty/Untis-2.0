// Data providers (real WebUntis or demo) plus the in-memory caches that keep
// us from hitting WebUntis on every tap.

import type { Exam, Homework, TimetableResponse } from '../shared/types.ts';
import { DemoProvider } from './demo.ts';
import { sessionKey, type SessionData } from './session.ts';
import { UntisClient } from './untis/client.ts';
import {
  normalizeExams,
  normalizeHolidays,
  normalizeHomework,
  normalizeLessons,
  normalizeTimegrid,
} from './untis/normalize.ts';

export type TimetableData = Omit<TimetableResponse, 'fetchedAt'>;

export interface DataProvider {
  /** Throws if the login is not valid. */
  verify(): Promise<void>;
  timetable(start: string, end: string): Promise<TimetableData>;
  homework(start: string, end: string): Promise<Homework[]>;
  exams(start: string, end: string): Promise<Exam[]>;
  close(): Promise<void>;
}

const STATIC_TTL_MS = 12 * 60 * 60 * 1000;

export class UntisProvider implements DataProvider {
  private client: UntisClient;
  private staticData: { at: number; value: Promise<Pick<TimetableData, 'timegrid' | 'holidays'>> } | null = null;

  constructor(session: SessionData, fetchImpl?: typeof fetch) {
    this.client = new UntisClient(session, fetchImpl);
  }

  async verify() {
    await this.client.login();
  }

  /** Timegrid and holidays rarely change, so fetch them twice a day at most. */
  private schoolData() {
    if (!this.staticData || Date.now() - this.staticData.at > STATIC_TTL_MS) {
      const value = Promise.all([
        this.client.getTimegrid().catch(() => []),
        this.client.getHolidays().catch(() => []),
      ]).then(([grid, holidays]) => ({
        timegrid: normalizeTimegrid(grid),
        holidays: normalizeHolidays(holidays),
      }));
      this.staticData = { at: Date.now(), value };
      value.catch(() => (this.staticData = null));
    }
    return this.staticData.value;
  }

  async timetable(start: string, end: string): Promise<TimetableData> {
    const [school, raw] = await Promise.all([this.schoolData(), this.client.getOwnTimetable(start, end)]);
    return {
      start,
      end,
      lessons: normalizeLessons(raw, school.timegrid),
      timegrid: school.timegrid,
      holidays: school.holidays.filter((h) => h.end >= start && h.start <= end),
    };
  }

  async homework(start: string, end: string) {
    return normalizeHomework(await this.client.getHomework(start, end));
  }

  async exams(start: string, end: string) {
    return normalizeExams(await this.client.getExams(start, end));
  }

  async close() {
    await this.client.logout().catch(() => {});
  }
}

const IDLE_MS = 20 * 60 * 1000;
const RESPONSE_TTL_MS = 60 * 1000;
const MIN_REFRESH_MS = 10 * 1000;

/** Keeps one provider (and so one WebUntis session) per login, and caches responses briefly. */
export class ProviderRegistry {
  private providers = new Map<string, { provider: DataProvider; lastUsed: number }>();
  private responses = new Map<string, { at: number; value: Promise<unknown> }>();
  private timer: ReturnType<typeof setInterval>;

  constructor(private fetchImpl?: typeof fetch) {
    this.timer = setInterval(() => this.sweep(), 60 * 1000);
    this.timer.unref?.();
  }

  get(session: SessionData): DataProvider {
    const key = sessionKey(session);
    let entry = this.providers.get(key);
    if (!entry) {
      const provider = session.demo ? new DemoProvider() : new UntisProvider(session, this.fetchImpl);
      entry = { provider, lastUsed: Date.now() };
      this.providers.set(key, entry);
    }
    entry.lastUsed = Date.now();
    return entry.provider;
  }

  /**
   * Returns a cached response if it is fresh enough. `fresh` (pull-to-refresh)
   * skips the cache, but never more often than every MIN_REFRESH_MS.
   */
  cached<T>(session: SessionData, name: string, fresh: boolean, load: (p: DataProvider) => Promise<T>): Promise<T> {
    const key = `${sessionKey(session)}:${name}`;
    const hit = this.responses.get(key);
    const age = hit ? Date.now() - hit.at : Infinity;
    if (hit && (age < MIN_REFRESH_MS || (!fresh && age < RESPONSE_TTL_MS))) {
      return hit.value as Promise<T>;
    }
    const value = load(this.get(session));
    this.responses.set(key, { at: Date.now(), value });
    value.catch(() => this.responses.delete(key));
    return value;
  }

  async drop(session: SessionData) {
    const key = sessionKey(session);
    const entry = this.providers.get(key);
    this.providers.delete(key);
    for (const k of this.responses.keys()) if (k.startsWith(key)) this.responses.delete(k);
    await entry?.provider.close();
  }

  private sweep() {
    const now = Date.now();
    for (const [key, entry] of this.providers) {
      if (now - entry.lastUsed > IDLE_MS) {
        this.providers.delete(key);
        entry.provider.close().catch(() => {});
      }
    }
    for (const [key, entry] of this.responses) {
      if (now - entry.at > RESPONSE_TTL_MS) this.responses.delete(key);
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}
