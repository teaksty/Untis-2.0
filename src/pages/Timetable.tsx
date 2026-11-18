import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from 'react';
import { addDays, nowTime, startOfWeek, today, weekday } from '../../shared/dates.ts';
import { groupIntoSlots, isChanged, mergeDoubleLessons, timeToMinutes, type Slot } from '../../shared/lessons.ts';
import type { Exam, ExamsResponse, Holiday, HomeworkResponse, Lesson, TimegridUnit, TimetableResponse } from '../../shared/types.ts';
import { prefetch, useApi } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { LessonCard, RefList, periodLabel, subjectColorKey, subjectName } from '../components/LessonCard.tsx';
import { Empty, LoadState, RefreshButton, Segmented, Sheet, Skeleton } from '../components/ui.tsx';
import { useT, type T } from '../i18n.ts';
import { subjectStyle } from '../lib/colors.ts';
import { useMediaQuery, useNow } from '../lib/hooks.ts';
import { useStore } from '../lib/store.ts';
import { settingsStore, type UserData } from '../state.ts';

const isWeekend = (d: string) => weekday(d) === 0 || weekday(d) === 6;

/** Today, or the next Monday on weekends. */
function defaultDay(todayStr: string): string {
  let d = todayStr;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

function norm(s: string | null | undefined) {
  return (s ?? '').trim().toLowerCase();
}

function matchesSubject(l: Lesson, name: string | null | undefined): boolean {
  const n = norm(name);
  if (!n) return false;
  return l.subjects.some((s) => norm(s.short) === n || norm(s.long) === n);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

function examFor(l: Lesson, exams: Exam[]): Exam | undefined {
  return exams.find(
    (e) => e.date === l.date && overlaps(e.start, e.end, l.start, l.end) && (!e.subject || matchesSubject(l, e.subject)),
  );
}

function holidayOn(date: string, holidays: Holiday[]) {
  return holidays.find((h) => h.start <= date && date <= h.end);
}

interface Extras {
  exams: Exam[];
  /** Subjects (lowercased) with homework due, by date. */
  homeworkDue: Map<string, string[]>;
}

function homeworkCount(l: Lesson, extras: Extras): number {
  const due = extras.homeworkDue.get(l.date);
  if (!due || l.status === 'cancelled') return 0;
  return due.filter((s) => matchesSubject(l, s)).length;
}

export function TimetablePage({ userData }: { userData: UserData }) {
  const t = useT();
  const settings = useStore(settingsStore);
  const now = useNow();
  const todayStr = today(now);
  const wide = useMediaQuery('(min-width: 960px)');
  const [selected, setSelected] = useState(() => defaultDay(todayStr));
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);

  const weekStart = startOfWeek(selected);
  const weekEnd = addDays(weekStart, 6);
  const range = `start=${weekStart}&end=${weekEnd}`;
  const tt = useApi<TimetableResponse>(`/api/timetable?${range}`);
  const exams = useApi<ExamsResponse>(`/api/exams?${range}`);
  const hw = useApi<HomeworkResponse>(`/api/homework?${range}`);

  // Load next week in the background so swiping forward is instant.
  const prefetched = useRef(new Set<string>());
  useEffect(() => {
    if (!tt.data || prefetched.current.has(weekStart)) return;
    prefetched.current.add(weekStart);
    const next = addDays(weekStart, 7);
    prefetch(`/api/timetable?start=${next}&end=${addDays(next, 6)}`);
  }, [tt.data, weekStart]);

  const grid = tt.data?.timegrid ?? [];
  const lessons = useMemo(() => {
    const raw = tt.data?.lessons ?? [];
    return settings.mergeDoubles ? mergeDoubleLessons(raw, grid) : raw;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tt.data, settings.mergeDoubles]);

  const extras = useMemo<Extras>(() => {
    const homeworkDue = new Map<string, string[]>();
    const add = (date: string, subject: string | null) => {
      if (!subject) return;
      homeworkDue.set(date, [...(homeworkDue.get(date) ?? []), subject]);
    };
    for (const h of hw.data?.homework ?? []) {
      if (!(userData.homeworkDone[h.id] ?? h.completed)) add(h.due, h.subject);
    }
    for (const task of userData.tasks) if (!task.done) add(task.due, task.subject);
    return { exams: exams.data?.exams ?? [], homeworkDue };
  }, [hw.data, exams.data, userData]);

  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return all.filter((d) => !isWeekend(d) || lessons.some((l) => l.date === d));
  }, [weekStart, lessons]);

  const reload = () => {
    tt.reload();
    exams.reload();
    hw.reload();
  };

  const goWeek = (delta: number) => setSelected((d) => addDays(d, delta * 7));
  const goDay = (delta: number) =>
    setSelected((d) => {
      let next = addDays(d, delta);
      // Skip weekends unless that weekend has lessons in the loaded week.
      for (let i = 0; i < 3 && isWeekend(next) && !lessons.some((l) => l.date === next); i++) next = addDays(next, delta);
      return next;
    });

  const view = wide ? 'week' : settings.ttView;
  const setView = (ttView: 'day' | 'week') => settingsStore.set((s) => ({ ...s, ttView }));
  const isThisWeek = startOfWeek(todayStr) === weekStart;
  const month = t.date(selected, { month: 'long' });
  const title = `${month} ${selected.slice(0, 4)}`;

  return (
    <div className="page timetable-page">
      <header className="page-head">
        <div className="page-title">
          <h1>{title.charAt(0).toUpperCase() + title.slice(1)}</h1>
          {tt.data && <Updated at={tt.data.fetchedAt} />}
        </div>
        <div className="head-actions">
          {!(view === 'week' ? isThisWeek : selected === todayStr) && (
            <button type="button" className="pill-btn" onClick={() => setSelected(defaultDay(todayStr))}>
              {t('common.today')}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => goWeek(-1)} aria-label={t('common.back')}>
            <Icon name="left" />
          </button>
          <button type="button" className="icon-btn" onClick={() => goWeek(1)} aria-label={t('common.forward')}>
            <Icon name="right" />
          </button>
          <RefreshButton loading={tt.loading} onClick={reload} />
        </div>
      </header>

      <LoadState error={tt.error} hasData={Boolean(tt.data)} onRetry={reload} />

      {!wide && (
        <div className="view-switch">
          <Segmented<'day' | 'week'>
            label={t('tt.view')}
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: t('tt.viewDay') },
              { value: 'week', label: t('tt.viewWeek') },
            ]}
          />
        </div>
      )}

      {view === 'week' ? (
        <WeekGrid
          mini={!wide}
          onSwipe={goWeek}
          onPickDay={(d) => {
            setSelected(d);
            setView('day');
          }}
          days={days}
          lessons={lessons}
          grid={grid}
          holidays={tt.data?.holidays ?? []}
          extras={extras}
          now={now}
          todayStr={todayStr}
          loading={!tt.data}
          longNames={settings.teacherLongNames}
          onOpen={setOpenLesson}
        />
      ) : (
        <DayView
          days={days}
          selected={selected}
          onSelect={setSelected}
          onSwipe={goDay}
          lessons={lessons}
          grid={grid}
          holidays={tt.data?.holidays ?? []}
          extras={extras}
          now={now}
          todayStr={todayStr}
          loading={!tt.data}
          longNames={settings.teacherLongNames}
          onOpen={setOpenLesson}
        />
      )}

      {openLesson && (
        <LessonSheet
          lesson={openLesson}
          exam={examFor(openLesson, extras.exams)}
          longNames={settings.teacherLongNames}
          onClose={() => setOpenLesson(null)}
        />
      )}
    </div>
  );
}

export function Updated({ at }: { at: number }) {
  const t = useT();
  const time = new Intl.DateTimeFormat(t.locale, { hour: '2-digit', minute: '2-digit' }).format(at);
  return <span className="updated">{t('common.updated', { time })}</span>;
}

// ---- Day view (phones) --------------------------------------------------------

interface ViewProps {
  days: string[];
  lessons: Lesson[];
  grid: TimegridUnit[];
  holidays: Holiday[];
  extras: Extras;
  now: Date;
  todayStr: string;
  loading: boolean;
  longNames: boolean;
  onOpen(l: Lesson): void;
}

function progressOf(l: Lesson, date: string, todayStr: string, nowMin: number): number | undefined {
  if (date !== todayStr || l.status === 'cancelled') return undefined;
  const s = timeToMinutes(l.start);
  const e = timeToMinutes(l.end);
  return nowMin >= s && nowMin < e ? (nowMin - s) / (e - s) : undefined;
}

function DayView(
  props: ViewProps & { selected: string; onSelect(d: string): void; onSwipe(delta: number): void },
) {
  const { days, selected, onSelect, onSwipe, lessons, grid, holidays, extras, now, todayStr, loading, longNames, onOpen } = props;
  const t = useT();
  const { slide, setSlide, handlers } = useSwipe(onSwipe);

  const dayLessons = lessons.filter((l) => l.date === selected);
  const slots = groupIntoSlots(dayLessons);
  const holiday = holidayOn(selected, holidays);
  const nowMin = timeToMinutes(nowTime(now));

  return (
    <div className="day-view" {...handlers}>
      <nav className="week-strip" aria-label="Week">
        {days.map((d) => {
          const changes = lessons.filter((l) => l.date === d && isChanged(l));
          const cancelled = changes.some((l) => l.status === 'cancelled');
          return (
            <button
              key={d}
              type="button"
              className={`day-chip${d === selected ? ' on' : ''}${d === todayStr ? ' today' : ''}`}
              onClick={() => {
                setSlide(d > selected ? 'from-right' : d < selected ? 'from-left' : '');
                onSelect(d);
              }}
              aria-current={d === selected ? 'date' : undefined}
            >
              <span className="day-chip-wd">{t.date(d, { weekday: 'short' })}</span>
              <span className="day-chip-num">{t.date(d, { day: 'numeric' })}</span>
              <span className={`day-chip-dot${changes.length ? (cancelled ? ' red' : ' amber') : ''}`} />
            </button>
          );
        })}
      </nav>

      <div key={selected} className={`day-content ${slide}`}>
        <h2 className="day-heading">
          {t.date(selected, { weekday: 'long', day: 'numeric', month: 'long' })}
          {dayLessons.some(isChanged) && (
            <span className="day-changes">{t('tt.changes', { n: dayLessons.filter(isChanged).length })}</span>
          )}
        </h2>

        {selected === todayStr && slots.length > 0 && (
          <NowCard slots={slots} nowMin={nowMin} longNames={longNames} onNextDay={() => onSwipe(1)} />
        )}

        {loading && !dayLessons.length ? (
          <Skeleton />
        ) : holiday && !dayLessons.length ? (
          <Empty icon="sparkle" title={t('tt.holiday')} hint={holiday.name} />
        ) : !slots.length ? (
          <Empty icon="moon" title={t('tt.noLessons')} hint={t('tt.noLessonsHint')} />
        ) : (
          <ol className="slot-list">
            {slots.map((slot, i) => (
              <li key={`${slot.start}-${i}`}>
                {i > 0 && <Gap prev={slots[i - 1]} next={slot} grid={grid} />}
                <div className="slot">
                  {slot.lessons.map((l) => (
                    <LessonCard
                      key={l.id}
                      lesson={l}
                      exam={examFor(l, extras.exams)}
                      homeworkCount={homeworkCount(l, extras)}
                      progress={progressOf(l, selected, todayStr, nowMin)}
                      longNames={longNames}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** Horizontal swipe detection plus the slide-in direction for the next render. */
function useSwipe(onSwipe: (delta: number) => void) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [slide, setSlide] = useState<'' | 'from-left' | 'from-right'>('');
  const handlers = {
    onTouchStart(e: TouchEvent) {
      touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd(e: TouchEvent) {
      if (!touch.current) return;
      const dx = e.changedTouches[0].clientX - touch.current.x;
      const dy = e.changedTouches[0].clientY - touch.current.y;
      touch.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        setSlide(dx < 0 ? 'from-right' : 'from-left');
        onSwipe(dx < 0 ? 1 : -1);
      }
    },
  };
  return { slide, setSlide, handlers };
}

function Gap({ prev, next, grid }: { prev: Slot; next: Slot; grid: TimegridUnit[] }) {
  const t = useT();
  const from = timeToMinutes(prev.end);
  const to = timeToMinutes(next.start);
  const min = to - from;
  if (min < 15) return null;
  const freePeriod = grid.some((u) => timeToMinutes(u.start) >= from && timeToMinutes(u.end) <= to);
  return <div className={`gap${freePeriod ? ' free' : ''}`}>{t(freePeriod ? 'tt.free' : 'tt.break', { min })}</div>;
}

/** "Now: Maths, room 204, 23 min left" — the thing you actually want to know. */
function NowCard({ slots, nowMin, longNames, onNextDay }: { slots: Slot[]; nowMin: number; longNames: boolean; onNextDay(): void }) {
  const t = useT();
  const primary = (s: Slot) => s.lessons.find((l) => l.status !== 'cancelled');
  const running = slots.find((s) => timeToMinutes(s.start) <= nowMin && nowMin < timeToMinutes(s.end) && primary(s));
  const upcoming = slots.filter((s) => timeToMinutes(s.start) > nowMin && primary(s));
  const next = upcoming[0];
  const anyBefore = slots.some((s) => timeToMinutes(s.end) <= nowMin && primary(s));

  if (!running && !next) {
    return (
      <div className="now-card done">
        <div>
          <div className="now-label">{t('tt.doneForToday')}</div>
          <div className="now-sub">{t('tt.doneForTodayHint')}</div>
        </div>
        <button type="button" className="pill-btn" onClick={onNextDay}>
          {t('common.forward')} <Icon name="right" size={16} />
        </button>
      </div>
    );
  }

  const lesson = primary((running ?? next)!)!;
  const minutes = running ? timeToMinutes(running.end) - nowMin : timeToMinutes(next!.start) - nowMin;
  const label = running ? t('tt.now') : anyBefore ? t('tt.next') : t('tt.later');
  const when = running
    ? t('tt.minLeft', { min: minutes })
    : minutes <= 90
      ? t('tt.startsIn', { min: minutes })
      : `${lesson.start}–${lesson.end}`;
  const after = running ? upcoming.find((s) => s !== running) : upcoming[1];
  const afterLesson = after && primary(after);

  return (
    <div className="now-card" style={subjectStyle(subjectColorKey(lesson))}>
      <div className="now-top">
        <span className="now-label">
          {running && <span className="live-dot" />}
          {label}
        </span>
        <span className="now-when">{when}</span>
      </div>
      <div className="now-subject">{subjectName(lesson)}</div>
      <div className="now-meta">
        {lesson.rooms.length > 0 && (
          <span>
            <Icon name="pin" size={15} /> <RefList refs={lesson.rooms} long={false} />
          </span>
        )}
        {lesson.teachers.length > 0 && (
          <span>
            <Icon name="user" size={15} /> <RefList refs={lesson.teachers} long={longNames} />
          </span>
        )}
      </div>
      {running && (
        <div
          className="now-progress"
          style={{ '--p': (nowMin - timeToMinutes(running.start)) / (timeToMinutes(running.end) - timeToMinutes(running.start)) } as CSSProperties}
        />
      )}
      {afterLesson && (
        <div className="now-after">
          {t('tt.next')}: <b>{subjectName(afterLesson)}</b> · {afterLesson.start}
          {afterLesson.rooms[0] && <> · {afterLesson.rooms.map((r) => r.short).join(', ')}</>}
        </div>
      )}
    </div>
  );
}

// ---- Week grid (tablets, desktops) ----------------------------------------------

function unitIndex(grid: TimegridUnit[], time: string, edge: 'start' | 'end'): number {
  const m = timeToMinutes(time);
  if (edge === 'start') {
    const i = grid.findIndex((u) => timeToMinutes(u.end) > m);
    return i === -1 ? grid.length - 1 : i;
  }
  let last = 0;
  grid.forEach((u, i) => {
    if (timeToMinutes(u.start) < m) last = i;
  });
  return last;
}

interface WeekGridProps extends ViewProps {
  /** Phone layout: short names, tiny cells. */
  mini?: boolean;
  onSwipe?(delta: number): void;
  onPickDay?(date: string): void;
}

function WeekGrid({ mini, onSwipe, onPickDay, ...props }: WeekGridProps) {
  const { slide, handlers } = useSwipe((d) => onSwipe?.(d));
  if (!mini) return <WeekGridInner {...props} />;
  return (
    <div className="week-swipe" {...handlers}>
      <div key={props.days[0]} className={`day-content ${slide}`}>
        <WeekGridInner {...props} mini onPickDay={onPickDay} />
      </div>
    </div>
  );
}

function WeekGridInner({
  days,
  lessons,
  grid,
  holidays,
  extras,
  now,
  todayStr,
  loading,
  longNames,
  onOpen,
  mini,
  onPickDay,
}: ViewProps & { mini?: boolean; onPickDay?(date: string): void }) {
  const t = useT();
  const nowMin = timeToMinutes(nowTime(now));

  if (loading && !lessons.length) return <Skeleton rows={8} />;
  if (!grid.length) {
    // No timegrid from the school: fall back to simple columns.
    return (
      <div className="week-cols" style={{ '--days': days.length } as CSSProperties}>
        {days.map((d) => (
          <div key={d} className="week-col">
            <DayHeader date={d} todayStr={todayStr} t={t} lessons={lessons} />
            {lessons
              .filter((l) => l.date === d)
              .map((l) => (
                <LessonCard key={l.id} lesson={l} compact longNames={longNames} onOpen={onOpen} exam={examFor(l, extras.exams)} homeworkCount={homeworkCount(l, extras)} />
              ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`week-grid${mini ? ' mini' : ''}`}
      style={{ '--days': days.length, '--rows': grid.length } as CSSProperties}
    >
      <div className="wg-corner" />
      {days.map((d, i) => (
        <div key={d} className="wg-head" style={{ gridColumn: i + 2 }}>
          {mini ? (
            <MiniDayHeader date={d} todayStr={todayStr} t={t} lessons={lessons} onPick={onPickDay} />
          ) : (
            <DayHeader date={d} todayStr={todayStr} t={t} lessons={lessons} />
          )}
        </div>
      ))}
      {grid.map((u, r) => (
        <div key={u.name} className="wg-period" style={{ gridRow: r + 2 }}>
          <span className="wg-period-name">{u.name}</span>
          <span className="wg-period-time">
            {u.start}
            {!mini && (
              <>
                <br />
                {u.end}
              </>
            )}
          </span>
        </div>
      ))}
      {grid.map((u, r) =>
        days.map((d, c) => (
          <div key={`${u.name}-${d}`} className={`wg-cell${d === todayStr ? ' today' : ''}`} style={{ gridRow: r + 2, gridColumn: c + 2 }} />
        )),
      )}
      {days.flatMap((d, c) => {
        const holiday = holidayOn(d, holidays);
        const slots = groupIntoSlots(lessons.filter((l) => l.date === d));
        if (!slots.length && holiday) {
          return [
            <div key={`${d}-holiday`} className="wg-holiday" style={{ gridColumn: c + 2, gridRow: `2 / span ${grid.length}` }}>
              <Icon name="sparkle" />
              <span>{holiday.name}</span>
            </div>,
          ];
        }
        return slots.map((slot, i) => {
          const from = unitIndex(grid, slot.start, 'start');
          const to = Math.max(from, unitIndex(grid, slot.end, 'end'));
          return (
            <div
              key={`${d}-${i}`}
              className="wg-slot"
              style={{ gridColumn: c + 2, gridRow: `${from + 2} / ${to + 3}` }}
            >
              {slot.lessons.map((l) =>
                mini ? (
                  <MiniLesson
                    key={l.id}
                    lesson={l}
                    exam={Boolean(examFor(l, extras.exams))}
                    homework={homeworkCount(l, extras) > 0}
                    current={progressOf(l, d, todayStr, nowMin) != null}
                    onOpen={onOpen}
                  />
                ) : (
                  <LessonCard
                    key={l.id}
                    lesson={l}
                    compact
                    exam={examFor(l, extras.exams)}
                    homeworkCount={homeworkCount(l, extras)}
                    progress={progressOf(l, d, todayStr, nowMin)}
                    longNames={longNames}
                    onOpen={onOpen}
                  />
                ),
              )}
            </div>
          );
        });
      })}
    </div>
  );
}

/** Day column header on phones; tapping it opens that day. */
function MiniDayHeader({ date, todayStr, t, lessons, onPick }: { date: string; todayStr: string; t: T; lessons: Lesson[]; onPick?(d: string): void }) {
  const changes = lessons.filter((l) => l.date === date && isChanged(l));
  const cancelled = changes.some((l) => l.status === 'cancelled');
  return (
    <button type="button" className={`mini-day${date === todayStr ? ' today' : ''}`} onClick={() => onPick?.(date)}>
      <span className="mini-day-wd">{t.date(date, { weekday: 'short' })}</span>
      <span className="mini-day-num">{t.date(date, { day: 'numeric' })}</span>
      <span className={`day-chip-dot${changes.length ? (cancelled ? ' red' : ' amber') : ''}`} />
    </button>
  );
}

/** Tiny lesson cell for the phone week grid: short subject and room only. */
function MiniLesson({ lesson: l, exam, homework, current, onOpen }: { lesson: Lesson; exam: boolean; homework: boolean; current: boolean; onOpen(l: Lesson): void }) {
  const subject = l.subjects.map((s) => s.short || s.long).join(', ') || l.activityType || l.text || '—';
  const room = l.rooms.map((r) => r.short || r.long).join(', ');
  return (
    <button
      type="button"
      className={`mini-lesson st-${l.status}${current ? ' current' : ''}`}
      style={subjectStyle(subjectColorKey(l))}
      onClick={() => onOpen(l)}
      title={subjectName(l)}
    >
      <span className="mini-subject">{subject}</span>
      {room && <span className="mini-room">{room}</span>}
      {(exam || homework) && (
        <span className="mini-dots" aria-hidden="true">
          {exam && <span className="mini-dot exam" />}
          {homework && <span className="mini-dot hw" />}
        </span>
      )}
    </button>
  );
}

function DayHeader({ date, todayStr, t, lessons }: { date: string; todayStr: string; t: T; lessons: Lesson[] }) {
  const changes = lessons.filter((l) => l.date === date && isChanged(l)).length;
  return (
    <div className={`day-head${date === todayStr ? ' today' : ''}`}>
      <span className="day-head-wd">{t.date(date, { weekday: 'short' })}</span>
      <span className="day-head-num">{t.date(date, { day: 'numeric', month: 'short' })}</span>
      {changes > 0 && <span className="day-head-changes" title={t('tt.changes', { n: changes })}>{changes}</span>}
    </div>
  );
}

// ---- Lesson details -------------------------------------------------------------

function LessonSheet({ lesson: l, exam, longNames, onClose }: { lesson: Lesson; exam?: Exam; longNames: boolean; onClose(): void }) {
  const t = useT();
  const period = periodLabel(l, t);
  const rows: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: ReactNode }[] = [
    { icon: 'clock', label: t('tt.time'), value: `${t.date(l.date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${l.start}–${l.end}${period ? ` · ${period}` : ''}` },
  ];
  if (l.rooms.length) rows.push({ icon: 'pin', label: t('tt.room'), value: <RefList refs={l.rooms} long={false} /> });
  if (l.teachers.length) rows.push({ icon: 'user', label: t('tt.teacher'), value: <RefList refs={l.teachers} long={longNames} /> });
  if (l.classes.length) rows.push({ icon: 'school', label: t('tt.class'), value: l.classes.map((c) => c.short).join(', ') });
  if (l.studentGroup) rows.push({ icon: 'user', label: t('tt.group'), value: l.studentGroup });
  for (const note of [l.substText, l.text, l.info].filter(Boolean)) rows.push({ icon: 'info', label: t('tt.note'), value: note });

  return (
    <Sheet
      onClose={onClose}
      title={
        <span className="sheet-title-subject" style={subjectStyle(subjectColorKey(l))}>
          <span className="dot" />
          {subjectName(l)}
        </span>
      }
    >
      {l.status !== 'regular' && <div className={`banner banner-${l.status}`}>{t(`status.${l.status}`)}</div>}
      {exam && (
        <div className="banner banner-exam">
          <b>{exam.name || t('tt.exam')}</b>
          {exam.text && <span> · {exam.text}</span>}
        </div>
      )}
      <dl className="detail-list">
        {rows.map((r, i) => (
          <div key={i} className="detail-row">
            <dt>
              <Icon name={r.icon} size={18} />
              <span className="sr-only">{r.label}</span>
            </dt>
            <dd>
              <span className="detail-label">{r.label}</span>
              <span className="detail-value">{r.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
