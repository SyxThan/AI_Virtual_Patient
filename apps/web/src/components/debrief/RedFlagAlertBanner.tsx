import vi from "../../../messages/vi.json";

export default function RedFlagAlertBanner() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
    >
      <span aria-hidden className="text-lg leading-none">⚠</span>
      <p>{vi.debrief.redFlag}</p>
    </div>
  );
}
