import vi from "../../messages/vi.json";

export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-3 rounded-full border border-line bg-surface px-5 py-3 text-sm font-medium text-ink">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        {vi.errors.loading}
      </span>
    </div>
  );
}
