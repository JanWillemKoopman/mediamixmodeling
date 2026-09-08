"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** "site-reveal" voor tekstonthulling, "site-figure" voor de balkanimatie (zie globals.css). */
  baseClass?: "site-reveal" | "site-figure";
  /** Extra vertraging in ms, voor een gestaffelde onthulling binnen één sectie. */
  delay?: number;
}

/**
 * Zet `is-in` op zijn wrapper zodra die in beeld komt — meer doet dit niet. De inhoud is
 * standaard zichtbaar en in de eindstand; alleen mét JavaScript start ze in de beginstand
 * (zie de `html.js`-regels in globals.css). De observer koppelt na één keer los, zodat
 * terugscrollen niets herhaalt.
 */
export function Reveal({ children, className = "", baseClass = "site-reveal", delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      className={`${baseClass} ${shown ? "is-in" : ""} ${className}`.trim()}
      style={delay ? ({ "--d": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
