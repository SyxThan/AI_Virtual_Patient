"use client";

import { useEffect } from "react";

/**
 * Mount once per page. Marks every `[data-reveal]` element with `data-shown`
 * the first time 20% of it enters the viewport; CSS in globals.css does the
 * fade (children 70ms apart). Sections stay server components. Without JS, or
 * with reduced motion, the content is already in its final state.
 */
export default function RevealObserver() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])"));
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-shown", "");
          io.unobserve(e.target); // once: never re-hides when scrolling back
        }
      },
      { threshold: 0.2 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
