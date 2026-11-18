import type { Profile } from '../shared/types.ts';
import type { Grade, ScaleId } from './lib/grades.ts';
import { persistedStore, type Store } from './lib/store.ts';

export type Lang = 'ru' | 'de' | 'en';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  lang: Lang;
  theme: Theme;
  mergeDoubles: boolean;
  teacherLongNames: boolean;
  scale: ScaleId;
}

function defaultLang(): Lang {
  const l = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return l === 'ru' || l === 'de' ? l : 'en';
}

const DEFAULT_SETTINGS: Settings = {
  lang: defaultLang(),
  theme: 'system',
  mergeDoubles: true,
  teacherLongNames: true,
  scale: defaultLang() === 'ru' ? 'ru' : 'de',
};

export const settingsStore = persistedStore<Settings>('u2.settings', DEFAULT_SETTINGS, (s) => ({
  ...DEFAULT_SETTINGS,
  ...s,
}));

/** The logged-in profile, cached so the app opens instantly (and offline). */
export const profileStore = persistedStore<Profile | null>('u2.profile', null);

// ---- Per-account data (kept apart so two accounts on one device do not mix) ----

export interface OwnTask {
  id: string;
  subject: string;
  text: string;
  due: string;
  done: boolean;
  createdAt: number;
}

export interface UserData {
  grades: Grade[];
  tasks: OwnTask[];
  /** Done/undone overrides for WebUntis homework, by homework id. */
  homeworkDone: Record<string, boolean>;
  /** Subjects added by hand on the grades page. */
  extraSubjects: string[];
}

const EMPTY_USER_DATA: UserData = { grades: [], tasks: [], homeworkDone: {}, extraSubjects: [] };

export function profileScope(p: Profile): string {
  return `${p.demo ? 'demo' : p.server}/${p.school}/${p.username}`.toLowerCase();
}

export function userDataStore(p: Profile): Store<UserData> {
  return persistedStore<UserData>(`u2.data.${profileScope(p)}`, EMPTY_USER_DATA, (d) => ({
    ...EMPTY_USER_DATA,
    ...d,
  }));
}

export function isUserData(value: unknown): value is UserData {
  const v = value as UserData;
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray(v.grades) &&
    Array.isArray(v.tasks) &&
    typeof v.homeworkDone === 'object' &&
    Array.isArray(v.extraSubjects)
  );
}
