"use client";

import Link from "next/link";
import vi from "../../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import { emitEcg } from "./ecgEvents";

/** The hero's start button. Hover or focus makes the ECG beat ~20% faster. */
export default function StartCta() {
  const on = () => emitEcg({ kind: "hover", on: true });
  const off = () => emitEcg({ kind: "hover", on: false });
  return (
    <Link
      href="/setup"
      onPointerEnter={on}
      onPointerLeave={off}
      onFocus={on}
      onBlur={off}
      className={buttonClass({ variant: "inverse", size: "lg", className: "btn-lift" })}
    >
      {vi.landing.ctaStart}
    </Link>
  );
}
