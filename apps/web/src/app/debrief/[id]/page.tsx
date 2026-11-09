import vi from "../../../../messages/vi.json";

// Route: OSCE result + cited debrief (wired in AVP-015 / AVP-019).
export default async function DebriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{vi.debrief.title}</h1>
      <p className="mt-2 text-gray-600">
        {vi.common.placeholder} (session {id})
      </p>
    </main>
  );
}
