import Link from "next/link";
import vi from "../../messages/vi.json";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">{vi.app.title}</h1>
      <p className="text-gray-600">{vi.app.description}</p>
      <Link
        href="/setup"
        className="w-fit rounded-md bg-black px-4 py-2 text-white"
      >
        {vi.home.start}
      </Link>
    </main>
  );
}
