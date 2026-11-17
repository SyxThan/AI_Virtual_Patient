/** The app mark: a speech bubble with a pulse line (talk + clinic), decorative. */
export default function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`tile-primary flex shrink-0 items-center justify-center rounded-full ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5z" />
        <path d="M7.5 10.5h2l1.5-2.5 2 5 1.5-2.5h2" />
      </svg>
    </span>
  );
}
