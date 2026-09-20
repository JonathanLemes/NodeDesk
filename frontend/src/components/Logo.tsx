/** NodeDesk mark: a window with a node dot. Uses currentColor so it follows the menubar text. */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="4" width="19" height="16" rx="4.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M2.5 9h19" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="14.6" r="2.1" fill="currentColor" />
    </svg>
  )
}
