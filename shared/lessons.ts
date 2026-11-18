// Pure helpers for working with lessons; used by both server and web app.

import type { Lesson, TimegridUnit } from './types.ts';

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Everything that has to match for two consecutive lessons to count as one double lesson. */
function mergeKey(l: Lesson): string {
  const refs = (xs: { id: number; original?: { id: number } }[]) =>
    xs.map((x) => `${x.id}/${x.original?.id ?? ''}`).sort().join(',');
  return [
    l.date,
    l.status,
    l.subjects.map((s) => s.id).sort().join(','),
    refs(l.teachers),
    refs(l.rooms),
    l.studentGroup ?? '',
    l.text ?? '',
    l.substText ?? '',
    l.info ?? '',
  ].join('|');
}

const MAX_GAP_MINUTES = 10;

/** True when `b` starts right after `a` ends (at most a short break, no period in between). */
function isAdjacent(a: Lesson, b: Lesson, grid: TimegridUnit[]): boolean {
  const gap = timeToMinutes(b.start) - timeToMinutes(a.end);
  if (gap < 0 || gap > MAX_GAP_MINUTES) return false;
  const aEnd = timeToMinutes(a.end);
  const bStart = timeToMinutes(b.start);
  return !grid.some((u) => timeToMinutes(u.start) >= aEnd && timeToMinutes(u.end) <= bStart);
}

/**
 * Joins identical back-to-back lessons (same subject, teacher, room and status)
 * into one entry, the way most people think about a "double lesson".
 */
export function mergeDoubleLessons(lessons: Lesson[], grid: TimegridUnit[] = []): Lesson[] {
  const sorted = [...lessons].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const out: Lesson[] = [];
  for (const lesson of sorted) {
    const key = mergeKey(lesson);
    const prev = out.find((p) => p.date === lesson.date && mergeKey(p) === key && isAdjacent(p, lesson, grid));
    if (prev) {
      prev.id = `${prev.id}+${lesson.id}`;
      prev.end = lesson.end;
      prev.periodTo = lesson.periodTo ?? prev.periodTo;
      prev.periods += lesson.periods;
    } else {
      out.push({ ...lesson });
    }
  }
  return out;
}

/** A time slot on one day and every lesson that happens in it (e.g. a cancelled lesson and its replacement). */
export interface Slot {
  start: string;
  end: string;
  lessons: Lesson[];
}

const STATUS_ORDER: Record<Lesson['status'], number> = {
  additional: 0,
  substitution: 1,
  roomChange: 2,
  regular: 3,
  cancelled: 4,
};

/** Groups one day's lessons into non-overlapping slots, sorted by time. */
export function groupIntoSlots(dayLessons: Lesson[]): Slot[] {
  const sorted = [...dayLessons].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const slots: Slot[] = [];
  for (const l of sorted) {
    const last = slots[slots.length - 1];
    if (last && timeToMinutes(l.start) < timeToMinutes(last.end)) {
      last.lessons.push(l);
      if (l.end > last.end) last.end = l.end;
    } else {
      slots.push({ start: l.start, end: l.end, lessons: [l] });
    }
  }
  for (const s of slots) {
    s.lessons.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.start.localeCompare(b.start));
  }
  return slots;
}

/** True if anything on this lesson differs from the regular timetable. */
export function isChanged(l: Lesson): boolean {
  return l.status !== 'regular' || Boolean(l.substText);
}
