import { useMemo, useState } from 'react';
import { today } from '../../shared/dates.ts';
import { Icon } from '../components/Icon.tsx';
import { Empty, Segmented, Sheet } from '../components/ui.tsx';
import { useT } from '../i18n.ts';
import { qualityStyle, subjectStyle } from '../lib/colors.ts';
import { DEFAULT_WEIGHT, SCALES, average, formatAverage, overallAverage, type Grade, type GradeKind, type Scale } from '../lib/grades.ts';
import { uid, useStore, type Store } from '../lib/store.ts';
import { useSubjects } from '../lib/subjects.ts';
import { settingsStore, type UserData } from '../state.ts';

export function GradesPage({ userData, store }: { userData: UserData; store: Store<UserData> }) {
  const t = useT();
  const settings = useStore(settingsStore);
  const scale = SCALES[settings.scale];
  const subjects = useSubjects(userData);
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ subject: string | null } | null>(null);

  const bySubject = useMemo(() => {
    const m = new Map<string, Grade[]>();
    for (const g of userData.grades) m.set(g.subject, [...(m.get(g.subject) ?? []), g]);
    for (const list of m.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return m;
  }, [userData.grades]);

  const overall = overallAverage(bySubject);
  const withGrades = subjects.filter((s) => bySubject.has(s));
  const withoutGrades = subjects.filter((s) => !bySubject.has(s));

  const addGrade = (g: Grade) =>
    store.set((d) => ({
      ...d,
      grades: [...d.grades, g],
      extraSubjects: subjects.includes(g.subject) ? d.extraSubjects : [...d.extraSubjects, g.subject],
    }));
  const deleteGrade = (id: string) => store.set((d) => ({ ...d, grades: d.grades.filter((g) => g.id !== id) }));

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>{t('nav.grades')}</h1>
        </div>
      </header>

      <div className="grade-hero" style={qualityStyle(overall == null ? null : scale.quality(overall))}>
        <div>
          <div className="grade-hero-label">{t('gr.overall')}</div>
          <div className="grade-hero-value">{formatAverage(overall, scale)}</div>
        </div>
        <div className="grade-hero-stats">
          <span>{t('gr.count', { n: userData.grades.length })}</span>
          <span>{t('gr.subjects', { n: withGrades.length })}</span>
          <span className="muted">{t(`scale.${scale.id}`)}</span>
        </div>
      </div>

      {!subjects.length && <Empty icon="star" title={t('gr.empty')} hint={t('gr.emptyHint')} />}

      <ul className="card-list subject-list">
        {[...withGrades, ...withoutGrades].map((s) => {
          const grades = bySubject.get(s) ?? [];
          const avg = average(grades);
          return (
            <li key={s}>
              <button type="button" className="subject-row" style={subjectStyle(s)} onClick={() => setOpenSubject(s)}>
                <span className="dot" />
                <span className="subject-row-main">
                  <span className="subject-row-name">{s}</span>
                  <span className="grade-chips">
                    {grades.length ? (
                      grades.slice(0, 8).map((g) => <GradeChip key={g.id} grade={g} scale={scale} />)
                    ) : (
                      <span className="muted small">{t('gr.noGrades')}</span>
                    )}
                  </span>
                </span>
                <span className="avg-pill" style={qualityStyle(avg == null ? null : scale.quality(avg))}>
                  {formatAverage(avg, scale)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" className="fab" onClick={() => setAdding({ subject: null })} aria-label={t('gr.add')}>
        <Icon name="plus" size={24} />
        <span className="fab-label">{t('gr.add')}</span>
      </button>

      {openSubject && !adding && (
        <SubjectSheet
          subject={openSubject}
          grades={bySubject.get(openSubject) ?? []}
          scale={scale}
          onAdd={() => setAdding({ subject: openSubject })}
          onDelete={deleteGrade}
          onClose={() => setOpenSubject(null)}
        />
      )}
      {adding && (
        <GradeSheet
          fixedSubject={adding.subject}
          subjects={subjects}
          scale={scale}
          onClose={() => setAdding(null)}
          onSave={(g) => {
            addGrade(g);
            setAdding(null);
          }}
        />
      )}
    </div>
  );
}

function GradeChip({ grade, scale }: { grade: Grade; scale: Scale }) {
  const t = useT();
  return (
    <span
      className={`grade-chip kind-${grade.kind}`}
      style={qualityStyle(scale.quality(grade.value))}
      title={`${t(`gr.kind.${grade.kind}`)} · ${grade.date}${grade.note ? ` · ${grade.note}` : ''}`}
    >
      {grade.label}
    </span>
  );
}

function SubjectSheet({
  subject,
  grades,
  scale,
  onAdd,
  onDelete,
  onClose,
}: {
  subject: string;
  grades: Grade[];
  scale: Scale;
  onAdd(): void;
  onDelete(id: string): void;
  onClose(): void;
}) {
  const t = useT();
  const avg = average(grades);
  const written = average(grades.filter((g) => g.kind === 'written'));
  const oral = average(grades.filter((g) => g.kind === 'oral'));

  return (
    <Sheet
      title={
        <span className="sheet-title-subject" style={subjectStyle(subject)}>
          <span className="dot" />
          {subject}
        </span>
      }
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          <Icon name="plus" size={18} /> {t('gr.add')}
        </button>
      }
    >
      <div className="avg-row">
        <div className="avg-box" style={qualityStyle(avg == null ? null : scale.quality(avg))}>
          <span className="avg-box-label">{t('gr.average')}</span>
          <span className="avg-box-value">{formatAverage(avg, scale)}</span>
        </div>
        <div className="avg-box small" style={qualityStyle(written == null ? null : scale.quality(written))}>
          <span className="avg-box-label">{t('gr.kind.written')}</span>
          <span className="avg-box-value">{formatAverage(written, scale)}</span>
        </div>
        <div className="avg-box small" style={qualityStyle(oral == null ? null : scale.quality(oral))}>
          <span className="avg-box-label">{t('gr.kind.oral')}</span>
          <span className="avg-box-value">{formatAverage(oral, scale)}</span>
        </div>
      </div>

      {!grades.length ? (
        <Empty icon="star" title={t('gr.noGrades')} hint={t('gr.emptyHint')} />
      ) : (
        <ul className="grade-list">
          {grades.map((g) => (
            <li key={g.id} className="grade-item">
              <span className="grade-big" style={qualityStyle(scale.quality(g.value))}>
                {g.label}
              </span>
              <span className="grade-item-main">
                <span>
                  {t(`gr.kind.${g.kind}`)} · ×{g.weight}
                </span>
                <span className="muted small">
                  {t.date(g.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {g.note && ` · ${g.note}`}
                </span>
              </span>
              <button type="button" className="icon-btn" onClick={() => onDelete(g.id)} aria-label={t('common.delete')}>
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

const NEW_SUBJECT = '\u0000new';

function GradeSheet({
  fixedSubject,
  subjects,
  scale,
  onClose,
  onSave,
}: {
  fixedSubject: string | null;
  subjects: string[];
  scale: Scale;
  onClose(): void;
  onSave(g: Grade): void;
}) {
  const t = useT();
  const [subject, setSubject] = useState(fixedSubject ?? subjects[0] ?? NEW_SUBJECT);
  const [customSubject, setCustomSubject] = useState('');
  const [option, setOption] = useState<number | null>(null);
  const [kind, setKind] = useState<GradeKind>('written');
  const [weight, setWeight] = useState(DEFAULT_WEIGHT.written);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const finalSubject = subject === NEW_SUBJECT ? customSubject.trim() : subject;
  const picked = option == null ? null : scale.options[option];
  const valid = Boolean(finalSubject && picked && weight > 0);

  const save = () => {
    if (!valid || !picked) return;
    onSave({ id: uid(), subject: finalSubject, label: picked.label, value: picked.value, kind, weight, date, note: note.trim() || undefined });
  };

  return (
    <Sheet
      title={t('gr.add')}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={save}>
          {t('common.save')}
        </button>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {!fixedSubject && (
          <label className="field">
            <span>{t('gr.subject')}</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={NEW_SUBJECT}>{t('gr.newSubject')}</option>
            </select>
          </label>
        )}
        {subject === NEW_SUBJECT && !fixedSubject && (
          <label className="field">
            <span className="sr-only">{t('gr.newSubjectPlaceholder')}</span>
            <input value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} placeholder={t('gr.newSubjectPlaceholder')} autoFocus />
          </label>
        )}

        <div className="field">
          <span>{t('gr.value')}</span>
          <div className={`grade-picker scale-${scale.id}`} role="radiogroup" aria-label={t('gr.value')}>
            {scale.options.map((o, i) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={option === i}
                className={option === i ? 'on' : ''}
                style={qualityStyle(scale.quality(o.value))}
                onClick={() => setOption(i)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>{t('gr.kind.written')} / {t('gr.kind.oral')}</span>
          <Segmented
            label={t('gr.kind.written')}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setWeight(DEFAULT_WEIGHT[k]);
            }}
            options={(['written', 'oral', 'other'] as const).map((k) => ({ value: k, label: t(`gr.kind.${k}`) }))}
          />
        </div>

        <div className="field-row">
          <label className="field">
            <span>{t('gr.weight')}</span>
            <input type="number" min={0.25} step={0.25} value={weight} onChange={(e) => setWeight(Number(e.target.value))} inputMode="decimal" />
          </label>
          <label className="field">
            <span>{t('gr.date')}</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>{t('gr.note')}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('gr.notePlaceholder')} />
        </label>
      </form>
    </Sheet>
  );
}
