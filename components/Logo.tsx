export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#0877F9" />
      <path d="M13 10h11l5 5v6H13z" fill="#fff" />
      <path d="M24 10v5h5" fill="#D0E5FF" />
      <rect x="9" y="19" width="22" height="10" rx="3" fill="#0C2C55" />
      <rect x="13" y="25" width="14" height="7" rx="1.5" fill="#fff" />
      <circle cx="27" cy="22.5" r="1.3" fill="#159447" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-xl font-extrabold tracking-tight text-navy">
        PRINT<span className="text-brand">NOW</span>
      </span>
    </span>
  );
}
