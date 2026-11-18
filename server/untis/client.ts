// Minimal WebUntis client.
//
// WebUntis has no public REST API. This talks to the same two interfaces the
// official apps use:
//   * JSON-RPC  /WebUntis/jsonrpc.do   (documented by Untis; read-only)
//   * REST      /WebUntis/api/...      (used by the web app; undocumented)
// Both work with the JSESSIONID that `authenticate` returns.

import type { ApiError } from '../../shared/types.ts';
import { isValidUntisServer } from '../../shared/untis-url.ts';

export class UntisError extends Error {
  constructor(
    message: string,
    public code: ApiError['code'],
    public untisCode?: number,
  ) {
    super(message);
    this.name = 'UntisError';
  }
}

export interface UntisCredentials {
  /** Host name, e.g. "mese.webuntis.com". */
  server: string;
  /** School login name, e.g. "gym-musterstadt". */
  school: string;
  username: string;
  password: string;
}

export interface SessionInfo {
  sessionId: string;
  personId: number;
  personType: number;
  klasseId?: number;
}

// JSON-RPC error codes WebUntis returns.
const RPC_BAD_CREDENTIALS = -8504;
const RPC_NOT_AUTHENTICATED = -8520;
const RPC_INVALID_SCHOOL = -8500;

const CLIENT_NAME = 'Untis2';
const TIMEOUT_MS = 15_000;

export { isValidUntisServer };

/** 2024-11-18 -> 20241118 */
export function toUntisDate(date: string): number {
  return Number(date.replaceAll('-', ''));
}

/** 20241118 -> 2024-11-18 */
export function fromUntisDate(value: number | string): string {
  const s = String(value);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** 745 -> 07:45 */
export function fromUntisTime(value: number | string): string {
  const s = String(value).padStart(4, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

type Fetch = typeof fetch;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcResponse = { result?: any; error?: { code: number; message: string } };

export class UntisClient {
  private session: SessionInfo | null = null;
  private loginInFlight: Promise<SessionInfo> | null = null;

  constructor(
    readonly creds: UntisCredentials,
    private fetchImpl: Fetch = fetch,
  ) {
    if (!isValidUntisServer(creds.server)) {
      throw new UntisError('Unknown WebUntis server', 'bad_request');
    }
  }

  get sessionInfo(): SessionInfo | null {
    return this.session;
  }

  private url(path: string, query: Record<string, string | number | boolean> = {}): string {
    const u = new URL(`https://${this.creds.server}/WebUntis${path}`);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
    return u.toString();
  }

  private cookieHeader(): string {
    const school64 = '_' + Buffer.from(this.creds.school, 'utf8').toString('base64');
    const parts = [`schoolname=${encodeURIComponent(school64)}`];
    if (this.session) parts.unshift(`JSESSIONID=${this.session.sessionId}`);
    return parts.join('; ');
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: this.cookieHeader(),
          ...init.headers,
        },
      });
    } catch (err) {
      throw new UntisError(`WebUntis is not reachable: ${(err as Error).message}`, 'untis_unreachable');
    }
  }

  private async rawRpc(method: string, params: unknown): Promise<RpcResponse> {
    const res = await this.send(this.url('/jsonrpc.do', { school: this.creds.school }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: CLIENT_NAME, method, params, jsonrpc: '2.0' }),
    });
    if (!res.ok) {
      throw new UntisError(`WebUntis answered HTTP ${res.status}`, 'untis_error');
    }
    try {
      return (await res.json()) as RpcResponse;
    } catch {
      throw new UntisError('WebUntis returned something that is not JSON', 'untis_error');
    }
  }

  /** Logs in (once, even if called concurrently) and returns the session. */
  async login(): Promise<SessionInfo> {
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = (async () => {
      this.session = null;
      const data = await this.rawRpc('authenticate', {
        user: this.creds.username,
        password: this.creds.password,
        client: CLIENT_NAME,
      });
      if (data.error) {
        if (data.error.code === RPC_BAD_CREDENTIALS) {
          throw new UntisError('Wrong username or password', 'bad_credentials', data.error.code);
        }
        if (data.error.code === RPC_INVALID_SCHOOL) {
          throw new UntisError('School not found on this server', 'bad_request', data.error.code);
        }
        throw new UntisError(data.error.message || 'Login failed', 'untis_error', data.error.code);
      }
      const r = data.result;
      if (!r?.sessionId) throw new UntisError('Login failed: no session', 'untis_error');
      this.session = {
        sessionId: r.sessionId,
        personId: r.personId,
        personType: r.personType,
        klasseId: r.klasseId,
      };
      return this.session;
    })();
    try {
      return await this.loginInFlight;
    } finally {
      this.loginInFlight = null;
    }
  }

  private async ensureSession(): Promise<SessionInfo> {
    return this.session ?? this.login();
  }

  /** JSON-RPC call. Re-logs in once if the session expired. */
  async rpc<T>(method: string, params: unknown = {}, retry = true): Promise<T> {
    await this.ensureSession();
    const data = await this.rawRpc(method, params);
    if (data.error) {
      if (data.error.code === RPC_NOT_AUTHENTICATED && retry) {
        await this.login();
        return this.rpc<T>(method, params, false);
      }
      throw new UntisError(data.error.message || `${method} failed`, 'untis_error', data.error.code);
    }
    return data.result as T;
  }

  /** REST call against /WebUntis/api. Re-logs in once if the session expired. */
  async rest<T>(path: string, query: Record<string, string | number | boolean>, retry = true): Promise<T> {
    await this.ensureSession();
    const res = await this.send(this.url(`/api${path}`, query), { method: 'GET' });
    const expired = res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400);
    if (expired && retry) {
      await this.login();
      return this.rest<T>(path, query, false);
    }
    if (!res.ok) throw new UntisError(`WebUntis answered HTTP ${res.status}`, 'untis_error');
    try {
      return (await res.json()) as T;
    } catch {
      throw new UntisError('WebUntis returned something that is not JSON', 'untis_error');
    }
  }

  async logout(): Promise<void> {
    if (!this.session) return;
    try {
      await this.rawRpc('logout', {});
    } finally {
      this.session = null;
    }
  }

  // ---- Endpoints ---------------------------------------------------------

  async getOwnTimetable(start: string, end: string): Promise<RawLesson[]> {
    const s = await this.ensureSession();
    return this.rpc<RawLesson[]>('getTimetable', {
      options: {
        element: { id: s.personId, type: s.personType },
        startDate: toUntisDate(start),
        endDate: toUntisDate(end),
        showLsText: true,
        showStudentgroup: true,
        showSubstText: true,
        showInfo: true,
        showBooking: true,
        klasseFields: ['id', 'name', 'longname'],
        roomFields: ['id', 'name', 'longname'],
        subjectFields: ['id', 'name', 'longname'],
        teacherFields: ['id', 'name', 'longname'],
      },
    });
  }

  getTimegrid(): Promise<RawTimegridDay[]> {
    return this.rpc<RawTimegridDay[]>('getTimegridUnits');
  }

  getHolidays(): Promise<RawHoliday[]> {
    return this.rpc<RawHoliday[]>('getHolidays');
  }

  async getHomework(start: string, end: string): Promise<RawHomeworkData> {
    const res = await this.rest<{ data: RawHomeworkData }>('/homeworks/lessons', {
      startDate: toUntisDate(start),
      endDate: toUntisDate(end),
    });
    return res.data ?? { homeworks: [], lessons: [], teachers: [], records: [] };
  }

  async getExams(start: string, end: string): Promise<RawExam[]> {
    const s = await this.ensureSession();
    const res = await this.rest<{ data: { exams: RawExam[] } }>('/exams', {
      startDate: toUntisDate(start),
      endDate: toUntisDate(end),
      klasseId: s.klasseId ?? -1,
      withGrades: true,
    });
    return res.data?.exams ?? [];
  }
}

// ---- Raw WebUntis shapes (only the fields we use) -------------------------

export interface RawRef {
  id: number;
  name?: string;
  longname?: string;
  orgid?: number;
  orgname?: string;
}

export interface RawLesson {
  id: number;
  date: number;
  startTime: number;
  endTime: number;
  kl?: RawRef[];
  te?: RawRef[];
  su?: RawRef[];
  ro?: RawRef[];
  code?: 'cancelled' | 'irregular' | string;
  lstext?: string;
  substText?: string;
  info?: string;
  sg?: string;
  activityType?: string;
  bkRemark?: string;
  bkText?: string;
}

export interface RawTimegridDay {
  day: number;
  timeUnits: { name: string; startTime: number; endTime: number }[];
}

export interface RawHoliday {
  id: number;
  name: string;
  longName: string;
  startDate: number;
  endDate: number;
}

export interface RawHomeworkData {
  homeworks: {
    id: number;
    lessonId: number;
    date: number;
    dueDate: number;
    text: string;
    remark?: string;
    completed?: boolean;
  }[];
  lessons: { id: number; subject?: string; lessonType?: string }[];
  teachers: { id: number; name: string }[];
  records: { homeworkId: number; teacherId?: number; elementIds?: number[] }[];
}

export interface RawExam {
  id: number;
  examType?: string;
  name?: string;
  examDate: number;
  startTime: number;
  endTime: number;
  subject?: string;
  teachers?: string[];
  rooms?: string[];
  text?: string;
  grade?: string;
}
