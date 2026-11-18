import type { CSSProperties, ReactNode } from 'react';
import type { ChangeableRef, Exam, Lesson } from '../../shared/types.ts';
import { useT } from '../i18n.ts';
import { subjectStyle } from '../lib/colors.ts';
import { Icon } from './Icon.tsx';

export function subjectName(l: Lesson): string {
  return l.subjects.map((s) => s.long || s.short).join(', ') || l.activityType || l.text || '—';
}

/** Short subject key used for colors, stable between long and short names. */
export function subjectColorKey(l: Lesson): string {
  return l.subjects[0]?.long || l.subjects[0]?.short || l.text || '';
}

function refName(r: { short: string; long: string }, long: boolean) {
  const name = long ? r.long || r.short : r.short || r.long;
  return name && name !== '---' ? name : '—';
}

/** Renders "new (was old)" for a teacher/room that changed. */
export function RefList({ refs, long }: { refs: ChangeableRef[]; long: boolean }) {
  if (!refs.length) return null;
  return (
    <>
      {refs.map((r, i) => (
        <span key={`${r.id}-${i}`} className={r.original ? 'changed' : undefined}>
          {i > 0 && ', '}
          {r.original && <s className="was">{refName(r.original, long)}</s>}
          {r.original && ' '}
          {refName(r, long)}
        </span>
      ))}
    </>
  );
}

export function periodLabel(l: Lesson, t: ReturnType<typeof useT>): string | null {
  if (!l.periodFrom) return null;
  return l.periodTo && l.periodTo !== l.periodFrom
    ? t('tt.periods', { from: l.periodFrom, to: l.periodTo })
    : t('tt.period', { n: l.periodFrom });
}

export interface LessonCardProps {
  lesson: Lesson;
  compact?: boolean;
  exam?: Exam;
  homeworkCount?: number;
  /** 0–1 while the lesson is running. */
  progress?: number;
  longNames: boolean;
  onOpen(l: Lesson): void;
}

export function LessonCard({ lesson: l, compact, exam, homeworkCount, progress, longNames, onOpen }: LessonCardProps) {
  const t = useT();
  const note = [l.substText, l.text, l.info].filter(Boolean).join(' · ');
  const badges: ReactNode[] = [];
  if (l.status !== 'regular') {
    badges.push(
      <span key="st" className={`chip chip-${l.status}`}>
        {t(`status.${l.status}`)}
      </span>,
    );
  }
  if (exam) {
    badges.push(
      <span key="ex" className="chip chip-exam">
        {t('tt.exam')}
      </span>,
    );
  }
  if (homeworkCount) {
    badges.push(
      <span key="hw" className="chip chip-hw" title={t('nav.homework')}>
        <Icon name="checklist" size={12} />
        {homeworkCount > 1 ? homeworkCount : t('tt.homework')}
      </span>,
    );
  }

  const style = { ...subjectStyle(subjectColorKey(l)), ...(progress != null ? { '--p': progress } : {}) } as CSSProperties;

  return (
    <button
      type="button"
      className={`lesson st-${l.status}${compact ? ' compact' : ''}${progress != null ? ' current' : ''}`}
      style={style}
      onClick={() => onOpen(l)}
    >
      {!compact && (
        <div className="lesson-time">
          <span>{l.start}</span>
          <span className="lesson-end">{l.end}</span>
        </div>
      )}
      <div className="lesson-main">
        <div className="lesson-top">
          <span className="lesson-subject">{subjectName(l)}</span>
          {!compact && badges.length > 0 && <span className="badges">{badges}</span>}
        </div>
        <div className="lesson-meta">
          {l.rooms.length > 0 && (
            <span className="meta-item">
              <RefList refs={l.rooms} long={false} />
            </span>
          )}
          {l.teachers.length > 0 && (
            <span className="meta-item">
              <RefList refs={l.teachers} long={longNames && !compact} />
            </span>
          )}
          {!compact && l.studentGroup && <span className="meta-item muted">{l.studentGroup}</span>}
        </div>
        {compact && badges.length > 0 && <span className="badges">{badges}</span>}
        {!compact && note && <div className="lesson-note">{note}</div>}
      </div>
      {progress != null && <div className="lesson-progress" aria-hidden="true" />}
    </button>
  );
}
