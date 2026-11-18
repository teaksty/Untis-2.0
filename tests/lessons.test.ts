import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, startOfWeek, weekday } from '../shared/dates.ts';
import { groupIntoSlots, mergeDoubleLessons } from '../shared/lessons.ts';
import type { Lesson, TimegridUnit } from '../shared/types.ts';
import { lessonStatus, normalizeHomework, normalizeLessons, normalizeTimegrid } from '../server/untis/normalize.ts';
import { average, overallAverage, SCALES } from '../src/lib/grades.ts';

const grid: TimegridUnit[] = [
  { name: '1', start: '08:00', end: '08:45' },
  { name: '2', start: '08:50', end: '09:35' },
  { name: '3', start: '09:55', end: '10:40' },
  { name: '4', start: '10:45', end: '11:30' },
];

function lesson(p: Partial<Lesson> & Pick<Lesson, 'start' | 'end'>): Lesson {
  return {
    id: p.start,
    date: '2026-11-16',
    periods: 1,
    subjects: [{ id: 1, short: 'M', long: 'Mathematik' }],
    teachers: [{ id: 10, short: 'BRA', long: 'Braun' }],
    rooms: [{ id: 20, short: '204', long: 'Raum 204' }],
    classes: [],
    status: 'regular',
    ...p,
  };
}

describe('dates', () => {
  it('finds the Monday of a week', () => {
    expect(startOfWeek('2026-11-18')).toBe('2026-11-16'); // Wednesday
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16'); // Sunday
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16');
  });

  it('adds days across month ends and DST switches', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(weekday('2026-11-18')).toBe(3);
  });
});

describe('mergeDoubleLessons', () => {
  it('joins identical back-to-back lessons', () => {
    const merged = mergeDoubleLessons(
      [lesson({ start: '08:00', end: '08:45', periodFrom: '1', periodTo: '1' }), lesson({ start: '08:50', end: '09:35', periodFrom: '2', periodTo: '2' })],
      grid,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ start: '08:00', end: '09:35', periodFrom: '1', periodTo: '2', periods: 2 });
  });

  it('does not join across a long break', () => {
    const merged = mergeDoubleLessons([lesson({ start: '08:50', end: '09:35' }), lesson({ start: '09:55', end: '10:40' })], grid);
    expect(merged).toHaveLength(2);
  });

  it('does not join when something differs', () => {
    const merged = mergeDoubleLessons(
      [lesson({ start: '08:00', end: '08:45' }), lesson({ start: '08:50', end: '09:35', status: 'cancelled' })],
      grid,
    );
    expect(merged).toHaveLength(2);
  });
});

describe('groupIntoSlots', () => {
  it('puts a cancelled lesson and its replacement into one slot, replacement first', () => {
    const slots = groupIntoSlots([
      lesson({ id: 'a', start: '08:00', end: '08:45', status: 'cancelled' }),
      lesson({ id: 'b', start: '08:00', end: '08:45', status: 'additional' }),
      lesson({ id: 'c', start: '08:50', end: '09:35' }),
    ]);
    expect(slots).toHaveLength(2);
    expect(slots[0].lessons.map((l) => l.id)).toEqual(['b', 'a']);
  });
});

describe('normalize', () => {
  it('detects lesson status from WebUntis fields', () => {
    const base = { id: 1, date: 20261116, startTime: 800, endTime: 845 };
    expect(lessonStatus({ ...base, code: 'cancelled' })).toBe('cancelled');
    expect(lessonStatus({ ...base, te: [{ id: 5, name: 'MEY', orgid: 4, orgname: 'BRA' }] })).toBe('substitution');
    expect(lessonStatus({ ...base, ro: [{ id: 7, name: '017', orgid: 6, orgname: '204' }] })).toBe('roomChange');
    expect(lessonStatus({ ...base, code: 'irregular' })).toBe('additional');
    expect(lessonStatus(base)).toBe('regular');
  });

  it('turns raw lessons into clean ones', () => {
    const [l] = normalizeLessons(
      [
        {
          id: 42,
          date: 20261116,
          startTime: 800,
          endTime: 935,
          su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
          te: [{ id: 5, name: 'MEY', longname: 'Meyer', orgid: 4, orgname: 'BRA' }],
          ro: [{ id: 6, name: '204' }],
          substText: ' Vertretung ',
        },
      ],
      grid,
    );
    expect(l).toMatchObject({
      id: '2026-11-16-42',
      date: '2026-11-16',
      start: '08:00',
      end: '09:35',
      periodFrom: '1',
      periodTo: '2',
      periods: 2,
      status: 'substitution',
      substText: 'Vertretung',
    });
    expect(l.teachers[0]).toEqual({ id: 5, short: 'MEY', long: 'Meyer', original: { id: 4, short: 'BRA', long: 'BRA' } });
    expect(l.rooms[0]).toEqual({ id: 6, short: '204', long: '204' });
  });

  it('picks the fullest day of the timegrid', () => {
    const tg = normalizeTimegrid([
      { day: 2, timeUnits: [{ name: '1', startTime: 800, endTime: 845 }] },
      { day: 3, timeUnits: [{ name: '2', startTime: 850, endTime: 935 }, { name: '1', startTime: 800, endTime: 845 }] },
    ]);
    expect(tg.map((u) => u.name)).toEqual(['1', '2']);
  });

  it('joins homework with its lesson subject and teacher', () => {
    const hw = normalizeHomework({
      homeworks: [{ id: 1, lessonId: 9, date: 20261110, dueDate: 20261117, text: 'S. 84', completed: false }],
      lessons: [{ id: 9, subject: 'Mathematik' }],
      teachers: [{ id: 3, name: 'Braun' }],
      records: [{ homeworkId: 1, teacherId: 3 }],
    });
    expect(hw).toEqual([{ id: '1', subject: 'Mathematik', text: 'S. 84', assigned: '2026-11-10', due: '2026-11-17', completed: false, teacher: 'Braun' }]);
  });
});

describe('grades', () => {
  it('computes weighted averages', () => {
    expect(average([{ value: 1, weight: 2 }, { value: 4, weight: 1 }])).toBe(2);
    expect(average([])).toBeNull();
  });

  it('averages subjects equally for the overall average', () => {
    const m = new Map([
      ['M', [{ id: '1', subject: 'M', label: '1', value: 1, weight: 1, kind: 'oral' as const, date: '2026-11-01' }]],
      ['D', [
        { id: '2', subject: 'D', label: '3', value: 3, weight: 1, kind: 'oral' as const, date: '2026-11-01' },
        { id: '3', subject: 'D', label: '3', value: 3, weight: 1, kind: 'oral' as const, date: '2026-11-01' },
      ]],
    ]);
    expect(overallAverage(m)).toBe(2);
  });

  it('maps grades to a 0–1 quality in every scale', () => {
    expect(SCALES.de.quality(1)).toBe(1);
    expect(SCALES.de.quality(6)).toBe(0);
    expect(SCALES.points.quality(15)).toBe(1);
    expect(SCALES.ru.quality(5)).toBe(1);
    expect(SCALES.at.quality(5)).toBe(0);
  });
});
