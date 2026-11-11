import vi from "../../messages/vi.json";

export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4" role="status" aria-live="polite">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-700 motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="ml-3 text-sm text-gray-700">{vi.errors.loading}</span>
    </div>
  );
}
