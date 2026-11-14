/** Small stroke icon per status, so the status reads without color. */
export default function StatusIcon({ status, className = "h-3.5 w-3.5" }: { status: string; className?: string }) {
  const common = {
    viewBox: "0 0 16 16",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (status) {
    case "met":
      return (
        <svg {...common}>
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      );
    case "partial":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 2.5v11" />
        </svg>
      );
    case "unmet":
      return (
        <svg {...common}>
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M5.5 8h5" />
        </svg>
      );
  }
}
