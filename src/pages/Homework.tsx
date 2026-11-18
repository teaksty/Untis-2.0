import { useMemo, useState } from 'react';
import { addDays, daysBetween, today } from '../../shared/dates.ts';
import type { HomeworkResponse } from '../../shared/types.ts';
import { useApi } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { Empty, LoadState, RefreshButton, Segmented, Sheet, Skeleton } from '../components/ui.tsx';
import { useT, type T } from '../i18n.ts';
import { subjectStyle } from '../lib/colors.ts';
import { useNow } from '../lib/hooks.ts';
import { uid, type Store } from '../lib/store.ts';
import { useSubjects } from '../lib/subjects.ts';
import type { OwnTask, UserData } from '../state.ts';
import { Updated } from './Timetable.tsx';

interface Item {
  id: string;
  own: boolean;
  subject: string | null;
  text: string;
  remark?: string;
  assigned?: string;
  due: string;
  done: boolean;
  teacher?: string;
}

export function dueLabel(t: T, due: string, todayStr: string): string {
  const days = daysBetween(todayStr, due);
  if (Math.abs(days) <= 2) {
    const s = t.relativeDays(days);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const s = t.date(due, { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function HomeworkPage({ userData, store }: { userData: UserData; store: Store<UserData> }) {
  const t = useT();
  const todayStr = today(useNow(60_000));
  const res = useApi<HomeworkResponse>(`/api/homework?start=${addDays(todayStr, -21)}&end=${addDays(todayStr, 60)}`);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [editing, setEditing] = useState<OwnTask | 'new' | null>(null);

  const items = useMemo<Item[]>(() => {
    const fromUntis = (res.data?.homework ?? []).map(
      (h): Item => ({
        id: h.id,
        own: false,
        subject: h.subject,
        text: h.text,
        remark: h.remark,
        assigned: h.assigned,
        due: h.due,
        teacher: h.teacher,
        done: userData.homeworkDone[h.id] ?? h.completed,
      }),
    );
    const own = userData.tasks.map((task): Item => ({ id: task.id, own: true, subject: task.subject || null, text: task.text, due: task.due, done: task.done }));
    return [...fromUntis, ...own];
  }, [res.data, userData]);

  const visible = items
    .filter((i) => (tab === 'open' ? !i.done : i.done))
    .sort((a, b) => (tab === 'open' ? a.due.localeCompare(b.due) : b.due.localeCompare(a.due)));

  const groups: { key: string; label: string; overdue?: boolean; items: Item[] }[] = [];
  for (const item of visible) {
    const overdue = tab === 'open' && item.due < todayStr;
    const key = overdue ? 'overdue' : item.due;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: overdue ? t('hw.overdue') : dueLabel(t, item.due, todayStr), overdue, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  const toggle = (item: Item) =>
    store.set((d) =>
      item.own
        ? { ...d, tasks: d.tasks.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)) }
        : { ...d, homeworkDone: { ...d.homeworkDone, [item.id]: !item.done } },
    );

  const openCount = items.filter((i) => !i.done).length;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>{t('nav.homework')}</h1>
          {res.data && <Updated at={res.data.fetchedAt} />}
        </div>
        <div className="head-actions">
          <RefreshButton loading={res.loading} onClick={res.reload} />
        </div>
      </header>

      <LoadState error={res.error} hasData={Boolean(res.data)} onRetry={res.reload} />

      <Segmented<'open' | 'done'>
        label={t('nav.homework')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'open', label: <>{t('hw.open')}{openCount > 0 && <span className="count">{openCount}</span>}</> },
          { value: 'done', label: t('hw.done') },
        ]}
      />

      {!res.data && res.loading && !userData.tasks.length ? (
        <Skeleton />
      ) : !groups.length ? (
        tab === 'open' ? <Empty icon="check" title={t('hw.empty')} hint={t('hw.emptyHint')} /> : <Empty icon="checklist" title={t('hw.emptyDone')} />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="group">
            <h2 className={`group-title${g.overdue ? ' overdue' : ''}`}>{g.label}</h2>
            <ul className="card-list">
              {g.items.map((item) => (
                <li key={`${item.own ? 'own' : 'u'}-${item.id}`} className={`hw-item${item.done ? ' done' : ''}`} style={subjectStyle(item.subject)}>
                  <button
                    type="button"
                    className="check"
                    role="checkbox"
                    aria-checked={item.done}
                    aria-label={t('hw.markDone')}
                    onClick={() => toggle(item)}
                  >
                    <Icon name="check" size={16} />
                  </button>
                  <div
                    className="hw-body"
                    onClick={item.own ? () => setEditing(userData.tasks.find((x) => x.id === item.id) ?? null) : undefined}
                    role={item.own ? 'button' : undefined}
                    tabIndex={item.own ? 0 : undefined}
                  >
                    <div className="hw-top">
                      <span className="hw-subject">
                        <span className="dot" />
                        {item.subject ?? '—'}
                      </span>
                      {item.own && <span className="tag">{t('hw.mine')}</span>}
                      {g.overdue && <span className="hw-due">{dueLabel(t, item.due, todayStr)}</span>}
                    </div>
                    <p className="hw-text">{item.text}</p>
                    {item.remark && <p className="hw-remark">{item.remark}</p>}
                    {(item.assigned || item.teacher) && (
                      <p className="hw-foot">
                        {item.assigned && t('hw.assigned', { date: t.date(item.assigned, { day: 'numeric', month: 'short' }) })}
                        {item.assigned && item.teacher && ' · '}
                        {item.teacher}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <button type="button" className="fab" onClick={() => setEditing('new')} aria-label={t('hw.add')}>
        <Icon name="plus" size={24} />
        <span className="fab-label">{t('hw.add')}</span>
      </button>

      {editing && (
        <TaskSheet
          task={editing === 'new' ? null : editing}
          userData={userData}
          defaultDue={addDays(todayStr, 1)}
          onClose={() => setEditing(null)}
          onSave={(task) => {
            store.set((d) => ({
              ...d,
              tasks: d.tasks.some((x) => x.id === task.id) ? d.tasks.map((x) => (x.id === task.id ? task : x)) : [...d.tasks, task],
            }));
            setEditing(null);
          }}
          onDelete={(id) => {
            store.set((d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== id) }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TaskSheet({
  task,
  userData,
  defaultDue,
  onClose,
  onSave,
  onDelete,
}: {
  task: OwnTask | null;
  userData: UserData;
  defaultDue: string;
  onClose(): void;
  onSave(t: OwnTask): void;
  onDelete(id: string): void;
}) {
  const t = useT();
  const subjects = useSubjects(userData);
  const [subject, setSubject] = useState(task?.subject ?? '');
  const [text, setText] = useState(task?.text ?? '');
  const [due, setDue] = useState(task?.due ?? defaultDue);

  const save = () => {
    if (!text.trim()) return;
    onSave({
      id: task?.id ?? uid(),
      subject: subject.trim(),
      text: text.trim(),
      due,
      done: task?.done ?? false,
      createdAt: task?.createdAt ?? Date.now(),
    });
  };

  return (
    <Sheet
      title={task ? t('hw.editTitle') : t('hw.newTitle')}
      onClose={onClose}
      footer={
        <>
          {task && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => onDelete(task.id)}>
              <Icon name="trash" size={18} /> {t('common.delete')}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={save} disabled={!text.trim()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>{t('hw.subject')}</span>
          <input list="subject-list" value={subject} onChange={(e) => setSubject(e.target.value)} autoComplete="off" />
          <datalist id="subject-list">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>{t('hw.text')}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus={!task} />
        </label>
        <label className="field">
          <span>{t('hw.due')}</span>
          <input type="date" value={due} onChange={(e) => e.target.value && setDue(e.target.value)} required />
        </label>
      </form>
    </Sheet>
  );
}
