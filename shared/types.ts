// Data shapes shared by the server (which normalizes WebUntis responses)
// and the web app. Dates are "YYYY-MM-DD", times are "HH:MM" (school-local).

export interface Ref {
  id: number;
  /** Short name as WebUntis shows it, e.g. "M", "MUE", "204". */
  short: string;
  /** Long name, e.g. "Mathematik", "Müller". Falls back to `short`. */
  long: string;
}

/** A teacher or room that may have been swapped for this lesson. */
export interface ChangeableRef extends Ref {
  /** Set when this teacher/room replaces the planned one. */
  original?: Ref;
}

export type LessonStatus =
  | 'regular'
  | 'cancelled'
  /** Teacher replaced. */
  | 'substitution'
  /** Same lesson, different room. */
  | 'roomChange'
  /** Extra lesson or event that was not in the regular timetable. */
  | 'additional';

export interface Lesson {
  /** Unique within a response. Merged double lessons join their ids with "+". */
  id: string;
  date: string;
  start: string;
  end: string;
  /** Timegrid period names, e.g. "1" and "2" for a double lesson. */
  periodFrom?: string;
  periodTo?: string;
  /** How many timegrid periods this entry covers (2 for a merged double lesson). */
  periods: number;
  subjects: Ref[];
  teachers: ChangeableRef[];
  rooms: ChangeableRef[];
  classes: Ref[];
  status: LessonStatus;
  /** Lesson text set by the school ("lstext"). */
  text?: string;
  /** Substitution text, e.g. "Aufgaben im Moodle". */
  substText?: string;
  info?: string;
  studentGroup?: string;
  activityType?: string;
}

export interface TimegridUnit {
  name: string;
  start: string;
  end: string;
}

export interface Holiday {
  name: string;
  start: string;
  end: string;
}

export interface TimetableResponse {
  start: string;
  end: string;
  lessons: Lesson[];
  timegrid: TimegridUnit[];
  holidays: Holiday[];
  fetchedAt: number;
}

export interface Homework {
  id: string;
  subject: string | null;
  text: string;
  remark?: string;
  /** Date the homework was given. */
  assigned: string;
  due: string;
  completed: boolean;
  teacher?: string;
}

export interface HomeworkResponse {
  homework: Homework[];
  fetchedAt: number;
}

export interface Exam {
  id: string;
  date: string;
  start: string;
  end: string;
  subject: string;
  name: string;
  type: string;
  text?: string;
  rooms: string[];
  teachers: string[];
  grade?: string;
}

export interface ExamsResponse {
  exams: Exam[];
  fetchedAt: number;
}

export interface Profile {
  /** The login name. */
  username: string;
  school: string;
  schoolDisplayName: string;
  server: string;
  demo: boolean;
}

export interface SchoolSearchResult {
  displayName: string;
  loginName: string;
  server: string;
  address: string;
}

export interface ApiError {
  error: string;
  /** Machine-readable reason the web app can translate. */
  code:
    | 'bad_credentials'
    | 'not_logged_in'
    | 'untis_unreachable'
    | 'untis_error'
    | 'too_many_results'
    | 'rate_limited'
    | 'bad_request';
}
