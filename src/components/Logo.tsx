export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id="u2-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c6cff" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#u2-logo-bg)" />
      <rect x="14" y="17" width="36" height="32" rx="6" fill="none" stroke="#fff" strokeWidth="3.5" />
      <path d="M14 27h36" stroke="#fff" strokeWidth="3.5" />
      <path d="M23 13v7M41 13v7" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="21" y="33" width="9" height="9" rx="2.5" fill="#fff" />
      <rect x="34" y="33" width="9" height="9" rx="2.5" fill="#fff" fillOpacity=".45" />
    </svg>
  );
}
