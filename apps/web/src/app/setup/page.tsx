import vi from "../../../messages/vi.json";

// Route: choose a case and start a session (wired to POST /sessions in AVP-010).
export default function SetupPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{vi.setup.title}</h1>
      <p className="mt-2 text-gray-600">{vi.common.placeholder}</p>
    </main>
  );
}
