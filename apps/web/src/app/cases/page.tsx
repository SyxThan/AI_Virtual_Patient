import { Suspense } from "react";
import vi from "../../../messages/vi.json";
import CaseLibrary, { CaseGridSkeleton } from "@/components/cases/CaseLibrary";
import PageShell from "@/components/ui/PageShell";

/** /cases "Thư viện ca bệnh" (Slice 20, AVP-148): pick a case, then /setup?case=<id>. */
export default function CasesPage() {
  return (
    <PageShell title={vi.cases.title} description={vi.cases.subtitle} width="wide">
      {/* useSearchParams (URL filters) needs a Suspense boundary for static rendering. */}
      <Suspense fallback={<CaseGridSkeleton />}>
        <CaseLibrary />
      </Suspense>
    </PageShell>
  );
}
