import type { ReactNode } from "react";

/** Decorative stroke icons for the landing tiles (always aria-hidden). */
function Icon({ children, className = "h-6 w-6" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function MicIcon() {
  return (
    <Icon>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </Icon>
  );
}

export function HandIcon() {
  return (
    <Icon>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.6-2.2l-2.4-3a1.5 1.5 0 0 1 2.3-1.9L8 15" />
    </Icon>
  );
}

export function PulseIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="14" rx="2.5" />
      <path d="M6 12h2.5l1.5-3 2.5 6 1.5-3H18M9 21h6" />
    </Icon>
  );
}

export function ChecklistIcon() {
  return (
    <Icon>
      <path d="M10 6h10M10 12h10M10 18h10M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" />
    </Icon>
  );
}

export function BookIcon() {
  return (
    <Icon>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </Icon>
  );
}

export function HistoryIcon() {
  return (
    <Icon>
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4l3 2" />
    </Icon>
  );
}

export function InfoIcon() {
  return (
    <Icon className="mt-0.5 h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.1" />
    </Icon>
  );
}
