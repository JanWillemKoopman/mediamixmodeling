"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

/**
 * Alle beweging op de site hangt aan twee dingen: "is dit element in beeld geweest?" en
 * "hoeveel vertraging krijgt het?". Meer heeft de site niet nodig — de rest doet CSS
 * (zie de .site-*-regels in globals.css). Zonder JavaScript staat alles in de eindstand.
 */

/** Zet `true` zodra het element één keer in beeld is geweest. Koppelt daarna los. */
export function useInView<T extends HTMLElement = HTMLDivElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, threshold]);

  return { ref, inView };
}

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Extra vertraging in ms, voor een gestaffelde onthulling binnen één sectie. */
  delay?: number;
  as?: ElementType;
}

/** Tekst en kaarten die van onderaf invaren zodra ze in beeld komen. */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>(0.12);
  return (
    <Tag
      ref={ref}
      className={`site-reveal ${inView ? "is-in" : ""} ${className}`.trim()}
      style={delay ? ({ "--d": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * Wrapper voor visualisaties: zet `is-in` zodra de figuur in beeld komt, waarna balken hun
 * breedte aannemen en lijnen zichzelf tekenen. De inhoud is en blijft leesbaar, ook zonder
 * die overgang.
 */
export function Anim({
  children,
  className = "",
  threshold = 0.25,
  style,
}: {
  children: ReactNode;
  className?: string;
  threshold?: number;
  style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(threshold);
  return (
    <div ref={ref} className={`site-anim ${inView ? "is-in" : ""} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

/**
 * Telt een getal op zodra het in beeld komt. Gebruikt requestAnimationFrame en respecteert
 * `prefers-reduced-motion`: dan verschijnt direct de eindwaarde.
 */
export function useCountUp(target: number, active: boolean, duration = 1100) {
  const [value, setValue] = useState(active ? target : 0);
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;

    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // Zelfde curve als de CSS-overgangen: snel op gang, rustig uit.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target, duration]);

  return value;
}

/**
 * Loopt een reeks stappen af zolang de sectie in beeld is, met een pauze per stap. Wordt
 * gebruikt door de verhalende panelen (hero, rapportage → verklaring). Bij
 * `prefers-reduced-motion` blijft de reeks op de laatste, meest informatieve stap staan.
 */
export function useStepper(steps: number, active: boolean, interval = 3200) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!active || paused) return;
    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setStep(steps - 1);
      return;
    }
    const id = window.setInterval(() => setStep((s) => (s + 1) % steps), interval);
    return () => window.clearInterval(id);
  }, [active, paused, steps, interval]);

  return { step, setStep, setPaused };
}
