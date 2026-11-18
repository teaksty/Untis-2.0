// Turns raw WebUntis responses into the clean shapes in shared/types.ts.

import type {
  ChangeableRef,
  Exam,
  Holiday,
  Homework,
  Lesson,
  LessonStatus,
  Ref,
  TimegridUnit,
} from '../../shared/types.ts';
import { timeToMinutes } from '../../shared/lessons.ts';
import {
  fromUntisDate,
  fromUntisTime,
  type RawExam,
  type RawHoliday,
  type RawHomeworkData,
  type RawLesson,
  type RawRef,
  type RawTimegridDay,
} from './client.ts';

function ref(r: RawRef): Ref {
  const short = r.name?.trim() || '';
  const long = r.longname?.trim() || short;
  return { id: r.id, short, long };
}

function changeable(r: RawRef): ChangeableRef {
  const out: ChangeableRef = ref(r);
  if (r.orgid != null && r.orgid !== r.id) {
    const name = r.orgname?.trim() || '';
    out.original = { id: r.orgid, short: name, long: name };
  }
  return out;
}

export function lessonStatus(raw: RawLesson): LessonStatus {
  if (raw.code === 'cancelled') return 'cancelled';
  const teacherChanged = (raw.te ?? []).some((t) => t.orgid != null && t.orgid !== t.id);
  const roomChanged = (raw.ro ?? []).some((r) => r.orgid != null && r.orgid !== r.id);
  if (teacherChanged) return 'substitution';
  if (roomChanged) return 'roomChange';
  if (raw.code === 'irregular') return 'additional';
  return 'regular';
}

export function normalizeTimegrid(days: RawTimegridDay[]): TimegridUnit[] {
  // Use the day with the most periods; schools rarely differ per weekday.
  const best = [...(days ?? [])].sort((a, b) => b.timeUnits.length - a.timeUnits.length)[0];
  if (!best) return [];
  return best.timeUnits
    .map((u) => ({ name: u.name, start: fromUntisTime(u.startTime), end: fromUntisTime(u.endTime) }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

function periodsFor(start: string, end: string, grid: TimegridUnit[]) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  const covered = grid.filter((u) => timeToMinutes(u.start) < e && timeToMinutes(u.end) > s);
  return {
    periodFrom: covered[0]?.name,
    periodTo: covered[covered.length - 1]?.name,
    periods: Math.max(1, covered.length),
  };
}

export function normalizeLessons(raw: RawLesson[], grid: TimegridUnit[]): Lesson[] {
  const lessons = (raw ?? []).map((l): Lesson => {
    const date = fromUntisDate(l.date);
    const start = fromUntisTime(l.startTime);
    const end = fromUntisTime(l.endTime);
    const lesson: Lesson = {
      id: `${date}-${l.id}`,
      date,
      start,
      end,
      ...periodsFor(start, end, grid),
      subjects: (l.su ?? []).map(ref),
      teachers: (l.te ?? []).map(changeable),
      rooms: (l.ro ?? []).map(changeable),
      classes: (l.kl ?? []).map(ref),
      status: lessonStatus(l),
    };
    if (l.lstext?.trim()) lesson.text = l.lstext.trim();
    if (l.substText?.trim()) lesson.substText = l.substText.trim();
    const info = [l.info, l.bkRemark, l.bkText].map((s) => s?.trim()).filter(Boolean).join(' · ');
    if (info) lesson.info = info;
    if (l.sg?.trim()) lesson.studentGroup = l.sg.trim();
    if (l.activityType && l.activityType !== 'Unterricht') lesson.activityType = l.activityType;
    return lesson;
  });
  return lessons.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export function normalizeHolidays(raw: RawHoliday[]): Holiday[] {
  return (raw ?? []).map((h) => ({
    name: h.longName?.trim() || h.name,
    start: fromUntisDate(h.startDate),
    end: fromUntisDate(h.endDate),
  }));
}

export function normalizeHomework(data: RawHomeworkData): Homework[] {
  const lessons = new Map((data.lessons ?? []).map((l) => [l.id, l]));
  const teachers = new Map((data.teachers ?? []).map((t) => [t.id, t.name]));
  const teacherByHomework = new Map(
    (data.records ?? []).filter((r) => r.teacherId != null).map((r) => [r.homeworkId, teachers.get(r.teacherId!)]),
  );
  return (data.homeworks ?? [])
    .map((h): Homework => {
      const hw: Homework = {
        id: String(h.id),
        subject: lessons.get(h.lessonId)?.subject?.trim() || null,
        text: (h.text ?? '').trim(),
        assigned: fromUntisDate(h.date),
        due: fromUntisDate(h.dueDate),
        completed: Boolean(h.completed),
      };
      if (h.remark?.trim()) hw.remark = h.remark.trim();
      const teacher = teacherByHomework.get(h.id);
      if (teacher) hw.teacher = teacher;
      return hw;
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function normalizeExams(raw: RawExam[]): Exam[] {
  return (raw ?? [])
    .map((e): Exam => {
      const exam: Exam = {
        id: String(e.id),
        date: fromUntisDate(e.examDate),
        start: fromUntisTime(e.startTime),
        end: fromUntisTime(e.endTime),
        subject: e.subject?.trim() || '',
        name: e.name?.trim() || '',
        type: e.examType?.trim() || '',
        rooms: e.rooms ?? [],
        teachers: e.teachers ?? [],
      };
      if (e.text?.trim()) exam.text = e.text.trim();
      if (e.grade?.trim()) exam.grade = e.grade.trim();
      return exam;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}
