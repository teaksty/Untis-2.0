import { addDays, daysBetween, today } from '../../shared/dates.ts';
import type { Exam, ExamsResponse } from '../../shared/types.ts';
import { useApi } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { Empty, LoadState, RefreshButton, Skeleton } from '../components/ui.tsx';
import { useT } from '../i18n.ts';
import { subjectStyle } from '../lib/colors.ts';
import { useNow } from '../lib/hooks.ts';
import { Updated } from './Timetable.tsx';

export function ExamsPage() {
  const t = useT();
  const todayStr = today(useNow(60_000));
  const res = useApi<ExamsResponse>(`/api/exams?start=${addDays(todayStr, -90)}&end=${addDays(todayStr, 180)}`);
  const exams = res.data?.exams ?? [];
  const upcoming = exams.filter((e) => e.date >= todayStr);
  const past = exams.filter((e) => e.date < todayStr).reverse();

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>{t('nav.exams')}</h1>
          {res.data && <Updated at={res.data.fetchedAt} />}
        </div>
        <div className="head-actions">
          <RefreshButton loading={res.loading} onClick={res.reload} />
        </div>
      </header>

      <LoadState error={res.error} hasData={Boolean(res.data)} onRetry={res.reload} />

      {!res.data && res.loading ? (
        <Skeleton />
      ) : !upcoming.length && !past.length ? (
        <Empty icon="exam" title={t('ex.empty')} hint={t('ex.emptyHint')} />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="group">
              <h2 className="group-title">{t('ex.upcoming')}</h2>
              <ul className="card-list">
                {upcoming.map((e) => (
                  <ExamCard key={e.id} exam={e} todayStr={todayStr} />
                ))}
              </ul>
            </section>
          )}
          {!upcoming.length && <Empty icon="sparkle" title={t('ex.empty')} hint={t('ex.emptyHint')} />}
          {past.length > 0 && (
            <details className="group past">
              <summary className="group-title">
                {t('ex.past')} <span className="count">{past.length}</span>
                <Icon name="down" size={16} />
              </summary>
              <ul className="card-list">
                {past.map((e) => (
                  <ExamCard key={e.id} exam={e} todayStr={todayStr} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function ExamCard({ exam: e, todayStr }: { exam: Exam; todayStr: string }) {
  const t = useT();
  const days = daysBetween(todayStr, e.date);
  const urgency = days < 0 ? 'past' : days <= 2 ? 'soon' : days <= 7 ? 'week' : 'later';
  const rel = t.relativeDays(days);
  return (
    <li className={`exam-card ${urgency}`} style={subjectStyle(e.subject)}>
      <div className="exam-date">
        <span className="exam-day">{t.date(e.date, { day: 'numeric' })}</span>
        <span className="exam-month">{t.date(e.date, { month: 'short' })}</span>
        <span className="exam-wd">{t.date(e.date, { weekday: 'short' })}</span>
      </div>
      <div className="exam-body">
        <div className="exam-top">
          <span className="exam-subject">{e.subject || e.name}</span>
          {days >= 0 && <span className="exam-countdown">{rel.charAt(0).toUpperCase() + rel.slice(1)}</span>}
          {e.grade && <span className="chip chip-grade">{t('ex.grade', { g: e.grade })}</span>}
        </div>
        <div className="exam-name">
          {e.name && e.type && !e.name.toLowerCase().includes(e.type.toLowerCase()) ? `${e.name} · ${e.type}` : e.name || e.type}
        </div>
        {e.text && <p className="exam-text">{e.text}</p>}
        <div className="exam-meta">
          <span>
            <Icon name="clock" size={14} /> {e.start}–{e.end}
          </span>
          {e.rooms.length > 0 && (
            <span>
              <Icon name="pin" size={14} /> {e.rooms.join(', ')}
            </span>
          )}
          {e.teachers.length > 0 && (
            <span>
              <Icon name="user" size={14} /> {e.teachers.join(', ')}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
