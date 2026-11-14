import vi from "../../../messages/vi.json";

/** Critical criterion missed: danger tone, with a heading and text (never color alone). */
export default function RedFlagAlertBanner() {
  return (
    <div
      role="alert"
      className="flex items-start gap-4 rounded-tile border-2 border-danger bg-danger-soft p-5 text-danger sm:p-6"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger text-white">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3.5L2.5 20h19L12 3.5z" />
          <path d="M12 10v4.5M12 17.5v.01" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-lg font-bold tracking-tight">{vi.debrief.redFlagTitle}</p>
        <p className="mt-1 text-sm font-medium leading-relaxed">{vi.debrief.redFlagBody}</p>
      </div>
    </div>
  );
}
