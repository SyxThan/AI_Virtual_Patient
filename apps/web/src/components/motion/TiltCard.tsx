"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useMotionPrefs";

const MAX_DEG = 3;

/**
 * Tilts its child up to 3 degrees toward the pointer. Only on devices with a
 * fine pointer that can hover, and never under reduced motion; elsewhere it is
 * a plain wrapper. Transform only.
 */
export default function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFinePointer(mq.matches);
    const id = setTimeout(update, 0);
    mq.addEventListener("change", update);
    return () => {
      clearTimeout(id);
      mq.removeEventListener("change", update);
    };
  }, []);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-MAX_DEG, MAX_DEG]), { stiffness: 220, damping: 22 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [MAX_DEG, -MAX_DEG]), { stiffness: 220, damping: 22 });

  const enabled = finePointer && !reduced;
  return (
    <motion.div
      className={className}
      style={enabled ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
      onPointerMove={(e) => {
        if (!enabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
