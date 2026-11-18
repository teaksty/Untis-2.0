// Small shared UI pieces: sheet (modal), segmented control, toggle, empty state, status bar.

import { useEffect, useRef, type ReactNode } from 'react';
import type { RequestError } from '../api.ts';
import { useT } from '../i18n.ts';
import { Icon, type IconName } from './Icon.tsx';

export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: V;
  options: { value: V; label: ReactNode }[];
  onChange(v: V): void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: ReactNode }) {
  return (
    <label className="row toggle-row">
      <span>{label}</span>
      <input type="checkbox" className="toggle" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Empty({ icon, title, hint }: { icon: IconName; title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} />
      </div>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  );
}

/** Shows "offline / error" above content that may be stale. */
export function LoadState({ error, hasData, onRetry }: { error: RequestError | null; hasData: boolean; onRetry(): void }) {
  const t = useT();
  if (!error || error.code === 'not_logged_in') return null;
  const msg = error.code === 'network' ? (hasData ? t('common.offline') : t('err.network')) : t(`err.${error.code}`);
  return (
    <div className={`notice ${hasData ? '' : 'notice-error'}`} role="status">
      <Icon name="info" size={18} />
      <span>{msg}</span>
      <button type="button" className="link-btn" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </div>
  );
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick(): void }) {
  const t = useT();
  return (
    <button type="button" className={`icon-btn ${loading ? 'spinning' : ''}`} onClick={onClick} aria-label={t('common.refresh')} title={t('common.refresh')}>
      <Icon name="refresh" />
    </button>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}
