import { useEffect, useState } from 'react';
import type { Profile, SchoolSearchResult } from '../../shared/types.ts';
import { parseUntisUrl } from '../../shared/untis-url.ts';
import { RequestError, api, login, loginDemo } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { Logo } from '../components/Logo.tsx';
import { useT } from '../i18n.ts';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; schools: SchoolSearchResult[] }
  | { kind: 'error'; code: RequestError['code']; detail: string };

export function LoginPage({ onLogin }: { onLogin(p: Profile): void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const [school, setSchool] = useState<SchoolSearchResult | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [manual, setManual] = useState(false);

  // Debounced school search.
  useEffect(() => {
    const q = query.trim();
    if (school || q.length < 3) {
      setSearch({ kind: 'idle' });
      return;
    }
    setSearch({ kind: 'loading' });
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      api<{ schools: SchoolSearchResult[] }>(`/api/schools?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => setSearch({ kind: 'done', schools: r.schools }))
        .catch((e: RequestError) => {
          if (!ctrl.signal.aborted) setSearch({ kind: 'error', code: e.code, detail: e.message });
        });
    }, 350);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [query, school]);

  const submit = async () => {
    if (!school || !username || !password) return;
    setBusy(true);
    setError(null);
    try {
      onLogin(
        await login({
          server: school.server,
          school: school.loginName,
          schoolDisplayName: school.displayName,
          username,
          password,
        }),
      );
    } catch (e) {
      setError(e as RequestError);
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    setError(null);
    try {
      onLogin(await loginDemo());
    } catch (e) {
      setError(e as RequestError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <main className="login-card">
        <Logo size={56} />
        <h1>{t('login.title')}</h1>
        <p className="muted">{t('login.subtitle')}</p>

        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {school ? (
            <div className="field">
              <span>{t('login.school')}</span>
              <div className="picked-school">
                <Icon name="school" />
                <span className="picked-school-main">
                  <b>{school.displayName}</b>
                  <span className="muted small">{school.address}</span>
                </span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setSchool(null);
                    setError(null);
                  }}
                >
                  {t('login.change')}
                </button>
              </div>
            </div>
          ) : manual ? (
            <ManualSchool onPick={setSchool} onCancel={() => setManual(false)} />
          ) : (
            <div className="field">
              <label htmlFor="school-search">{t('login.school')}</label>
              <div className="input-icon">
                <Icon name="search" size={18} />
                <input
                  id="school-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('login.schoolPlaceholder')}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <SchoolResults state={search} query={query} onPick={setSchool} />
              <button type="button" className="link-btn small left" onClick={() => setManual(true)}>
                {t('login.manual')}
              </button>
            </div>
          )}

          <label className="field">
            <span>{t('login.username')}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} />
          </label>
          <label className="field">
            <span>{t('login.password')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>

          {error && (
            <p className="form-error" role="alert">
              {t(error.code === 'network' ? 'err.network' : `err.${error.code}`)}
              {error.code !== 'bad_credentials' && error.code !== 'network' && <span className="error-detail">{error.message}</span>}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !school || !username || !password}>
            {busy ? t('common.loading') : t('login.submit')}
          </button>
        </form>

        <div className="divider">
          <span>{t('login.or')}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-block" onClick={demo} disabled={busy}>
          <Icon name="sparkle" size={18} /> {t('login.demo')}
        </button>

        <p className="login-privacy muted small">
          <Icon name="info" size={14} /> {t('login.privacy')}
        </p>
      </main>
    </div>
  );
}

function SchoolResults({ state, query, onPick }: { state: SearchState; query: string; onPick(s: SchoolSearchResult): void }) {
  const t = useT();
  if (query.trim().length > 0 && query.trim().length < 3) return <p className="hint">{t('login.typeMore')}</p>;
  if (state.kind === 'loading') return <p className="hint">{t('login.searching')}</p>;
  if (state.kind === 'error') {
    return (
      <p className="hint error">
        {t(state.code === 'network' ? 'err.network' : `err.${state.code}`)}
        {state.code !== 'too_many_results' && state.code !== 'network' && <span className="error-detail">{state.detail}</span>}
      </p>
    );
  }
  if (state.kind !== 'done') return null;
  if (!state.schools.length) return <p className="hint">{t('login.noSchools')}</p>;
  return (
    <ul className="school-results" role="listbox">
      {state.schools.slice(0, 8).map((s) => (
        <li key={`${s.server}/${s.loginName}`}>
          <button type="button" role="option" aria-selected="false" onClick={() => onPick(s)}>
            <b>{s.displayName}</b>
            <span className="muted small">{s.address}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Fallback when search fails or the school is not listed: paste the WebUntis address. */
function ManualSchool({ onPick, onCancel }: { onPick(s: SchoolSearchResult): void; onCancel(): void }) {
  const t = useT();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const pick = () => {
    const school = parseUntisUrl(value);
    if (school) onPick(school);
    else setInvalid(true);
  };
  return (
    <div className="field">
      <label htmlFor="school-url">{t('login.manualLabel')}</label>
      <input
        id="school-url"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            pick();
          }
        }}
        placeholder="https://….webuntis.com/WebUntis/?school=…"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
      />
      <p className={`hint${invalid ? ' error' : ''}`}>{invalid ? t('login.manualInvalid') : t('login.manualHint')}</p>
      <div className="inline-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('common.back')}
        </button>
        <button type="button" className="btn btn-primary" onClick={pick} disabled={!value.trim()}>
          {t('login.manualUse')}
        </button>
      </div>
    </div>
  );
}
