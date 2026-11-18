import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../shared/types.ts';
import { api, clearCache } from './api.ts';
import { Icon, type IconName } from './components/Icon.tsx';
import { Logo } from './components/Logo.tsx';
import { useT, type TKey } from './i18n.ts';
import { useMediaQuery } from './lib/hooks.ts';
import { useStore } from './lib/store.ts';
import { ExamsPage } from './pages/Exams.tsx';
import { GradesPage } from './pages/Grades.tsx';
import { HomeworkPage } from './pages/Homework.tsx';
import { LoginPage } from './pages/Login.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { TimetablePage } from './pages/Timetable.tsx';
import { profileScope, profileStore, settingsStore, userDataStore } from './state.ts';

type Tab = 'timetable' | 'homework' | 'exams' | 'grades' | 'settings';

const TABS: { id: Tab; icon: IconName; label: TKey }[] = [
  { id: 'timetable', icon: 'calendar', label: 'nav.timetable' },
  { id: 'homework', icon: 'checklist', label: 'nav.homework' },
  { id: 'exams', icon: 'exam', label: 'nav.exams' },
  { id: 'grades', icon: 'star', label: 'nav.grades' },
  { id: 'settings', icon: 'settings', label: 'nav.settings' },
];

function tabFromHash(): Tab {
  const h = location.hash.replace(/^#\/?/, '') as Tab;
  return TABS.some((t) => t.id === h) ? h : 'timetable';
}

function useTheme() {
  const { theme, lang } = useStore(settingsStore);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.lang = lang;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1016' : '#f3f4f8');
  }, [dark, lang]);
}

export function App() {
  useTheme();
  const profile = useStore(profileStore);

  // Check the session in the background; a 401 clears the profile (see api()).
  useEffect(() => {
    if (!profile) return;
    api<Profile>('/api/me')
      .then((p) => profileScope(p) !== profileScope(profile) && profileStore.set(p))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!profile) {
    return (
      <LoginPage
        onLogin={(p) => {
          clearCache();
          profileStore.set(p);
          location.hash = '#/timetable';
        }}
      />
    );
  }
  return <Shell key={profileScope(profile)} profile={profile} />;
}

function Shell({ profile }: { profile: Profile }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const store = useMemo(() => userDataStore(profile), [profile]);
  const userData = useStore(store);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const go = (id: Tab) => {
    location.hash = `#/${id}`;
    setTab(id);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo size={34} />
          <span>{t('app.name')}</span>
        </div>
        <nav className="side-nav">
          {TABS.map((x) => (
            <button key={x.id} type="button" className={tab === x.id ? 'on' : ''} onClick={() => go(x.id)} aria-current={tab === x.id ? 'page' : undefined}>
              <Icon name={x.icon} />
              <span>{t(x.label)}</span>
            </button>
          ))}
        </nav>
        <div className="side-profile">
          <span className="avatar">{profile.username.slice(0, 1).toUpperCase()}</span>
          <span className="account-main">
            <b>{profile.username}</b>
            <span className="muted small">{profile.schoolDisplayName}</span>
          </span>
        </div>
      </aside>

      <main className="content">
        {profile.demo && <div className="demo-ribbon">{t('set.demo')}</div>}
        {tab === 'timetable' && <TimetablePage userData={userData} />}
        {tab === 'homework' && <HomeworkPage userData={userData} store={store} />}
        {tab === 'exams' && <ExamsPage />}
        {tab === 'grades' && <GradesPage userData={userData} store={store} />}
        {tab === 'settings' && <SettingsPage profile={profile} store={store} />}
      </main>

      <nav className="tab-bar">
        {TABS.map((x) => (
          <button key={x.id} type="button" className={tab === x.id ? 'on' : ''} onClick={() => go(x.id)} aria-current={tab === x.id ? 'page' : undefined}>
            <Icon name={x.icon} size={22} />
            <span>{t(x.label)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
