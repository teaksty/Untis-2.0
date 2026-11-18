// A fake school so the app can be tried (and developed) without a WebUntis
// account. Data is generated from the date, so it looks the same on every load.

import { addDays, today, weekday } from '../shared/dates.ts';
import type { ChangeableRef, Exam, Homework, Lesson, LessonStatus, Ref, TimegridUnit } from '../shared/types.ts';
import type { DataProvider, TimetableData } from './provider.ts';

const S = (id: number, short: string, long: string): Ref => ({ id, short, long });

const SUBJECTS = {
  M: S(1, 'M', 'Mathematik'),
  D: S(2, 'D', 'Deutsch'),
  E: S(3, 'E', 'Englisch'),
  PH: S(4, 'PH', 'Physik'),
  CH: S(5, 'CH', 'Chemie'),
  BIO: S(6, 'BIO', 'Biologie'),
  G: S(7, 'G', 'Geschichte'),
  EK: S(8, 'EK', 'Erdkunde'),
  KU: S(9, 'KU', 'Kunst'),
  MU: S(10, 'MU', 'Musik'),
  SP: S(11, 'SP', 'Sport'),
  INF: S(12, 'INF', 'Informatik'),
  F: S(13, 'F', 'Französisch'),
} as const;
type Sub = keyof typeof SUBJECTS;

const TEACHERS: Record<Sub, Ref> = {
  M: S(101, 'BRA', 'Braun'),
  D: S(102, 'KLE', 'Klein'),
  E: S(103, 'SMI', 'Smith'),
  PH: S(104, 'WEB', 'Weber'),
  CH: S(105, 'WEB', 'Weber'),
  BIO: S(106, 'HOF', 'Hoffmann'),
  G: S(107, 'SCH', 'Schulz'),
  EK: S(108, 'KOC', 'Koch'),
  KU: S(109, 'RIC', 'Richter'),
  MU: S(110, 'WOL', 'Wolf'),
  SP: S(111, 'NEU', 'Neumann'),
  INF: S(112, 'LAN', 'Lange'),
  F: S(113, 'DUP', 'Dupont'),
};
const SUBSTITUTES = [S(120, 'MEY', 'Meyer'), S(121, 'FIS', 'Fischer'), S(122, 'BEC', 'Becker')];

const ROOMS: Record<Sub, Ref> = {
  M: S(201, '204', 'Raum 204'),
  D: S(202, '204', 'Raum 204'),
  E: S(203, '112', 'Raum 112'),
  PH: S(204, 'PH1', 'Physikraum 1'),
  CH: S(205, 'CH2', 'Chemieraum 2'),
  BIO: S(206, 'BIO', 'Biologieraum'),
  G: S(207, '204', 'Raum 204'),
  EK: S(208, '108', 'Raum 108'),
  KU: S(209, 'KU1', 'Kunstraum'),
  MU: S(210, 'MU', 'Musiksaal'),
  SP: S(211, 'TH', 'Turnhalle'),
  INF: S(212, 'PC3', 'Computerraum 3'),
  F: S(213, '115', 'Raum 115'),
};
const SPARE_ROOMS = [S(220, '017', 'Raum 017'), S(221, 'AULA', 'Aula'), S(222, '301', 'Raum 301')];
const CLASS: Ref = S(301, '10b', 'Klasse 10b');

const TIMEGRID: TimegridUnit[] = [
  { name: '1', start: '08:00', end: '08:45' },
  { name: '2', start: '08:50', end: '09:35' },
  { name: '3', start: '09:55', end: '10:40' },
  { name: '4', start: '10:45', end: '11:30' },
  { name: '5', start: '11:50', end: '12:35' },
  { name: '6', start: '12:40', end: '13:25' },
  { name: '7', start: '13:45', end: '14:30' },
  { name: '8', start: '14:35', end: '15:20' },
];

// One subject per period; null = free period.
const WEEK: (Sub | null)[][] = [
  /* Mon */ ['M', 'M', 'D', 'D', 'E', 'BIO'],
  /* Tue */ ['PH', 'PH', 'E', 'G', 'SP', 'SP', 'MU'],
  /* Wed */ ['D', 'M', 'INF', 'INF', 'F', null, 'KU', 'KU'],
  /* Thu */ ['CH', 'CH', 'E', 'M', 'EK', 'G'],
  /* Fri */ ['D', 'F', 'BIO', 'M', 'E'],
];

/** Small deterministic hash so changes look random but stay stable. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const isSchoolDay = (date: string) => weekday(date) !== 0 && weekday(date) !== 6;

/** 0 for today (or the next school day on weekends), 1 for the school day after, …; -1 for the past. */
function schoolDayIndex(base: string, date: string): number {
  if (date < base) return -1;
  let n = -1;
  for (let d = base; d <= date; d = addDays(d, 1)) if (isSchoolDay(d)) n++;
  return n;
}

function lessonsFor(date: string, base: string): Lesson[] {
  if (!isSchoolDay(date)) return [];
  const plan = WEEK[weekday(date) - 1];
  const offset = schoolDayIndex(base, date);
  const out: Lesson[] = [];

  plan.forEach((sub, i) => {
    if (!sub) return;
    const unit = TIMEGRID[i];
    const key = `${date}:${i}`;
    let status: LessonStatus = 'regular';
    let teacher: ChangeableRef = { ...TEACHERS[sub] };
    let room: ChangeableRef = { ...ROOMS[sub] };
    let substText: string | undefined;
    let text: string | undefined;

    // Guaranteed changes around "today" so the demo always shows something.
    const forced =
      (offset === 0 && i === 4) ? 'substitution'
      : (offset === 1 && i === 2) ? 'cancelled'
      : (offset === 1 && i === 0) ? 'roomChange'
      : (offset === 2 && i === 1) ? 'cancelled'
      : null;
    const roll = hash(key) % 100;
    const kind = forced ?? (roll < 6 ? 'cancelled' : roll < 11 ? 'substitution' : roll < 15 ? 'roomChange' : null);

    if (kind === 'cancelled') {
      status = 'cancelled';
      substText = hash(key + 'txt') % 2 ? 'Aufgaben im Moodle' : undefined;
    } else if (kind === 'substitution') {
      status = 'substitution';
      teacher = { ...SUBSTITUTES[hash(key) % SUBSTITUTES.length], original: TEACHERS[sub] };
      substText = 'Vertretung';
    } else if (kind === 'roomChange') {
      status = 'roomChange';
      room = { ...SPARE_ROOMS[hash(key) % SPARE_ROOMS.length], original: ROOMS[sub] };
    }
    if (sub === 'INF') text = 'Projekt: Website';

    const lesson: Lesson = {
      id: `${date}-${i}`,
      date,
      start: unit.start,
      end: unit.end,
      periodFrom: unit.name,
      periodTo: unit.name,
      periods: 1,
      subjects: [SUBJECTS[sub]],
      teachers: [teacher],
      rooms: [room],
      classes: [CLASS],
      status,
    };
    if (substText) lesson.substText = substText;
    if (text) lesson.text = text;
    out.push(lesson);
  });

  // An extra event the day after tomorrow, in the cancelled slot.
  if (offset === 2) {
    const unit = TIMEGRID[1];
    out.push({
      id: `${date}-event`,
      date,
      start: unit.start,
      end: unit.end,
      periodFrom: unit.name,
      periodTo: unit.name,
      periods: 1,
      subjects: [S(30, 'KR', 'Klassenrat')],
      teachers: [{ ...TEACHERS.D }],
      rooms: [{ ...ROOMS.D }],
      classes: [CLASS],
      status: 'additional',
      info: 'Wahl der Klassensprecher',
    });
  }
  return out;
}

export class DemoProvider implements DataProvider {
  async verify() {}

  async timetable(start: string, end: string): Promise<TimetableData> {
    const base = today();
    const lessons: Lesson[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) lessons.push(...lessonsFor(d, base));
    return { start, end, lessons, timegrid: TIMEGRID, holidays: [] };
  }

  async homework(start: string, end: string): Promise<Homework[]> {
    const t = today();
    const items: Homework[] = [
      { id: 'd1', subject: 'Mathematik', text: 'Buch S. 84, Nr. 3a–f und 5', assigned: addDays(t, -2), due: addDays(t, 1), completed: false, teacher: 'Braun' },
      { id: 'd2', subject: 'Englisch', text: 'Read chapter 4 of "The Giver" and write a short summary (150 words).', assigned: addDays(t, -3), due: addDays(t, 2), completed: false, teacher: 'Smith' },
      { id: 'd3', subject: 'Deutsch', text: 'Gedichtanalyse „Der Panther“ fertigstellen', assigned: addDays(t, -6), due: addDays(t, 0), completed: false, teacher: 'Klein' },
      { id: 'd4', subject: 'Physik', text: 'Arbeitsblatt Ohmsches Gesetz', remark: 'Auf Moodle hochladen', assigned: addDays(t, -1), due: addDays(t, 5), completed: false, teacher: 'Weber' },
      { id: 'd5', subject: 'Geschichte', text: 'Referat vorbereiten: Weimarer Republik', assigned: addDays(t, -10), due: addDays(t, 8), completed: false, teacher: 'Schulz' },
      { id: 'd6', subject: 'Biologie', text: 'Zellmodell zeichnen', assigned: addDays(t, -8), due: addDays(t, -3), completed: true, teacher: 'Hoffmann' },
      { id: 'd7', subject: 'Französisch', text: 'Vokabeln Unité 3 lernen', assigned: addDays(t, -7), due: addDays(t, -1), completed: false, teacher: 'Dupont' },
    ];
    return items.filter((h) => h.due >= start && h.due <= end).sort((a, b) => a.due.localeCompare(b.due));
  }

  async exams(start: string, end: string): Promise<Exam[]> {
    const t = today();
    const nextWeekday = (from: number, wd: number) => {
      let d = addDays(t, from);
      while (weekday(d) !== wd) d = addDays(d, 1);
      return d;
    };
    const items: Exam[] = [
      { id: 'x1', date: nextWeekday(1, 4), start: '08:00', end: '09:35', subject: 'Chemie', name: 'Klassenarbeit Nr. 2', type: 'Klassenarbeit', text: 'Säuren und Basen, pH-Wert', rooms: ['CH2'], teachers: ['WEB'] },
      { id: 'x2', date: nextWeekday(4, 1), start: '08:00', end: '09:35', subject: 'Mathematik', name: 'Klassenarbeit Nr. 3', type: 'Klassenarbeit', text: 'Quadratische Funktionen', rooms: ['204'], teachers: ['BRA'] },
      { id: 'x3', date: nextWeekday(9, 2), start: '09:55', end: '10:40', subject: 'Englisch', name: 'Vokabeltest', type: 'Test', rooms: ['112'], teachers: ['SMI'] },
      { id: 'x4', date: nextWeekday(15, 3), start: '08:00', end: '08:45', subject: 'Deutsch', name: 'Klassenarbeit Nr. 2', type: 'Klassenarbeit', text: 'Erörterung', rooms: ['204'], teachers: ['KLE'] },
      { id: 'x5', date: nextWeekday(-12, 5), start: '10:45', end: '11:30', subject: 'Französisch', name: 'Test Unité 2', type: 'Test', rooms: ['115'], teachers: ['DUP'], grade: '2' },
    ];
    return items.filter((e) => e.date >= start && e.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  }

  async close() {}
}
