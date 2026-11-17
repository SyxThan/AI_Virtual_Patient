"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import vi from "../../../messages/vi.json";
import { useReducedMotion } from "@/hooks/useMotionPrefs";
import { HOW_IT_WORKS_ID } from "./ids";
import { DebriefMockup, SetupMockup, WorkspaceMockup } from "./StepMockups";

const L = vi.landing;
const MOCKUPS: ReactNode[] = [<SetupMockup key="s" />, <WorkspaceMockup key="w" />, <DebriefMockup key="d" />];

/**
 * The three real steps of a session, in order (the numbers encode the sequence).
 * Desktop: the section pins for ~3 screens of scrolling; a rail fills from step 1
 * to 3 with scroll progress; the active number grows and fills, the other steps
 * dim to 50%, and a preview beside it cross-fades (350 ms) between simple
 * mockups of the setup, clinic and debrief screens.
 * Phones: no pin, stacked, each step with its mockup; the rail fills as you scroll.
 * Reduced motion: stacked like phones, all steps full, rail full.
 */
export default function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [wide, setWide] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const update = () => setWide(mq.matches);
    const id = setTimeout(update, 0);
    mq.addEventListener("change", update);
    return () => {
      clearTimeout(id);
      mq.removeEventListener("change", update);
    };
  }, []);

  // Pinned: progress over the whole tall section. Stacked: while it crosses the middle of the screen.
  const pinned = useScroll({ target: ref, offset: ["start start", "end end"] });
  const stacked = useScroll({ target: ref, offset: ["start 0.7", "end 0.7"] });
  const progress = wide ? pinned.scrollYProgress : stacked.scrollYProgress;

  useMotionValueEvent(pinned.scrollYProgress, "change", (p) => {
    setActive(Math.min(L.steps.length - 1, Math.floor(p * L.steps.length)));
  });

  return (
    <section
      ref={ref}
      aria-labelledby="steps-title"
      id={HOW_IT_WORKS_ID}
      className={`relative mt-14 scroll-mt-24 lg:motion-safe:h-[300vh]`}
    >
      <div className={`lg:motion-safe:sticky lg:motion-safe:top-24 lg:motion-safe:flex lg:motion-safe:h-[calc(100vh-7rem)] lg:motion-safe:flex-col lg:motion-safe:justify-center`}>
        <div data-reveal="">
          <h2 id="steps-title" className="font-display text-[clamp(32px,4vw,56px)] font-bold leading-[1.05] tracking-tight text-ink">
            {L.stepsTitle}
          </h2>
        </div>

        <div className="relative mt-10 lg:grid lg:grid-cols-12 lg:gap-10">
          {/* Pinned: the list and its items are static so each mockup positions against this grid (the preview column). */}
          <ol className="relative lg:col-span-5 lg:motion-reduce:col-span-8 lg:motion-safe:static">
            {/* The rail: a track and a fill that grows with scroll progress (transform only). */}
            <span aria-hidden="true" className="absolute bottom-6 left-5 top-5 w-0.5 -translate-x-1/2 bg-line-strong/60" />
            <motion.span
              aria-hidden="true"
              className="absolute bottom-6 left-5 top-5 w-0.5 origin-top -translate-x-1/2 bg-primary"
              style={{ scaleY: reduced ? 1 : progress }}
            />
            {L.steps.map((step, i) => (
              <li
                key={step.title}
                data-active={active === i}
                className="group relative flex gap-5 pb-10 last:pb-0 lg:motion-safe:static"
              >
                <span
                  aria-hidden="true"
                  className={`font-display tabular relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-white ring-4 ring-canvas transition-[transform,background-color,color] duration-[var(--dur-base)] lg:motion-safe:bg-surface lg:motion-safe:text-primary lg:motion-safe:group-data-[active=true]:scale-110 lg:motion-safe:group-data-[active=true]:bg-primary lg:motion-safe:group-data-[active=true]:text-white`}
                >
                  {i + 1}
                </span>
                {/* Only the text dims: the number stays opaque so the rail never shows through it. */}
                <div className="min-w-0 flex-1">
                  <div className="transition-opacity duration-[var(--dur-base)] lg:motion-safe:opacity-50 lg:motion-safe:group-data-[active=true]:opacity-100">
                  <h3 className="font-display text-2xl font-bold tracking-tight">{step.title}</h3>
                  <p className="mt-2 max-w-prose leading-relaxed text-ink-muted">{step.body}</p>
                  </div>
                  {/* Phones and reduced motion: the mockup sits under its step. Pinned: it moves into the preview column. */}
                  <div
                    data-active={active === i}
                    className={`mt-5 transition-opacity duration-[var(--dur-base)] lg:max-w-none lg:motion-safe:pointer-events-none lg:motion-safe:absolute lg:motion-safe:right-0 lg:motion-safe:top-1/2 lg:motion-safe:mt-0 lg:motion-safe:w-[55%] lg:motion-safe:-translate-y-1/2 lg:motion-safe:opacity-0 lg:motion-safe:data-[active=true]:opacity-100`}
                  >
                    {MOCKUPS[i]}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
