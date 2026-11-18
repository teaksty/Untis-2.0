import { useRef, useState } from 'react';
import type { Profile } from '../../shared/types.ts';
import { clearCache, logout } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { Segmented, Toggle } from '../components/ui.tsx';
import { LANG_NAMES, useT } from '../i18n.ts';
import { SCALES, type ScaleId } from '../lib/grades.ts';
import { useStore, type Store } from '../lib/store.ts';
import { isUserData, settingsStore, type Lang, type Theme, type UserData } from '../state.ts';

export function SettingsPage({ profile, store }: { profile: Profile; store: Store<UserData> }) {
  const t = useT();
  const settings = useStore(settingsStore);
  const set = (patch: Partial<typeof settings>) => settingsStore.set((s) => ({ ...s, ...patch }));
  const fileInput = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'untis-2', version: 1, data: store.get() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `untis2-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const data = parsed?.data;
      if (parsed?.app !== 'untis-2' || !isUserData(data)) throw new Error('bad file');
      store.set(data);
      setImportMsg(t('set.importOk'));
    } catch {
      setImportMsg(t('set.importFail'));
    }
  };

  return (
    <div className="page settings">
      <header className="page-head">
        <div className="page-title">
          <h1>{t('nav.settings')}</h1>
        </div>
      </header>

      <section className="group">
        <h2 className="group-title">{t('set.account')}</h2>
        <div className="card">
          <div className="row account-row">
            <span className="avatar">{profile.username.slice(0, 1).toUpperCase()}</span>
            <span className="account-main">
              <b>{profile.username}</b>
              <span className="muted small">{profile.schoolDisplayName}</span>
            </span>
          </div>
          {profile.demo && <p className="row muted small">{t('set.demo')}</p>}
          <button
            type="button"
            className="row row-btn danger"
            onClick={async () => {
              await logout();
              clearCache();
            }}
          >
            <Icon name="logout" size={18} /> {t('set.logout')}
          </button>
        </div>
      </section>

      <section className="group">
        <h2 className="group-title">{t('set.appearance')}</h2>
        <div className="card">
          <div className="row stack">
            <span>{t('set.theme')}</span>
            <Segmented<Theme>
              label={t('set.theme')}
              value={settings.theme}
              onChange={(theme) => set({ theme })}
              options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`set.theme.${v}`) }))}
            />
          </div>
          <div className="row stack">
            <span>{t('set.language')}</span>
            <Segmented<Lang>
              label={t('set.language')}
              value={settings.lang}
              onChange={(lang) => set({ lang })}
              options={(Object.keys(LANG_NAMES) as Lang[]).map((v) => ({ value: v, label: LANG_NAMES[v] }))}
            />
          </div>
        </div>
      </section>

      <section className="group">
        <h2 className="group-title">{t('set.timetable')}</h2>
        <div className="card">
          <Toggle label={t('set.merge')} checked={settings.mergeDoubles} onChange={(mergeDoubles) => set({ mergeDoubles })} />
          <Toggle label={t('set.longNames')} checked={settings.teacherLongNames} onChange={(teacherLongNames) => set({ teacherLongNames })} />
        </div>
      </section>

      <section className="group">
        <h2 className="group-title">{t('set.grades')}</h2>
        <div className="card">
          <label className="row stack">
            <span>{t('set.scale')}</span>
            <select value={settings.scale} onChange={(e) => set({ scale: e.target.value as ScaleId })}>
              {(Object.keys(SCALES) as ScaleId[]).map((id) => (
                <option key={id} value={id}>
                  {t(`scale.${id}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="group">
        <h2 className="group-title">{t('set.data')}</h2>
        <div className="card">
          <p className="row muted small">{t('set.dataHint')}</p>
          <button type="button" className="row row-btn" onClick={exportData}>
            <Icon name="download" size={18} /> {t('set.export')}
          </button>
          <button type="button" className="row row-btn" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={18} /> {t('set.import')}
          </button>
          {importMsg && <p className="row small">{importMsg}</p>}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importData(f);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      <section className="group">
        <h2 className="group-title">{t('set.notifications')}</h2>
        <div className="card">
          <p className="row muted small">
            <Icon name="bell" size={18} /> {t('set.notificationsSoon')}
          </p>
        </div>
      </section>

      <section className="group">
        <h2 className="group-title">{t('set.about')}</h2>
        <div className="card">
          <p className="row muted small">{t('set.aboutText')}</p>
          <p className="row muted small">Untis 2.0 · v{__APP_VERSION__}</p>
        </div>
      </section>
    </div>
  );
}
