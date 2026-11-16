"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/*
 * Shared motion hooks (AVP-142). Server render assumes "motion allowed, in view"
 * is unknown: hooks return the static-safe value until the browser answers.
 */

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True when the user asked the OS for reduced motion. Server: true (no motion before hydration). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => true,
  );
}

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/** True while the browser tab is visible. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
}

/**
 * Whether `ref` intersects the viewport. `once` latches the first `true`
 * (entrance animations); otherwise it follows the element (loops).
 */
export function useInView(
  ref: RefObject<Element | null>,
  { threshold = 0.2, once = false }: { threshold?: number; once?: boolean } = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, once]);
  return inView;
}

/**
 * A looping animation should run only when motion is allowed, its element is on
 * screen and the tab is visible. Put `data-paused={!active}` on the loop's scope.
 */
export function useActive(ref: RefObject<Element | null>, threshold = 0): boolean {
  const reduced = useReducedMotion();
  const inView = useInView(ref, { threshold });
  const visible = usePageVisible();
  return !reduced && inView && visible;
}
