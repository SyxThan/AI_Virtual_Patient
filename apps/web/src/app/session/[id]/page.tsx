import vi from "../../../../messages/vi.json";

// Route: the interview (chat/voice turn loop, wired in AVP-010 / AVP-022).
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{vi.session.title}</h1>
      <p className="mt-2 text-gray-600">
        {vi.common.placeholder} (session {id})
      </p>
    </main>
  );
}
