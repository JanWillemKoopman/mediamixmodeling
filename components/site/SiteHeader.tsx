"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NAV, SITE } from "@/lib/site/copy";
import { Button } from "./primitives";

/**
 * Compacte, plakkende koptekst. In rust vrijwel onzichtbaar boven de hero; zodra je scrolt
 * krijgt hij een eigen vlak met een haarlijn eronder. Het mobiele menu schuift open in
 * dezelfde balk — geen paginavullend overlay-menu.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const [active, setActive] = useState<string | null>(null);

  // Eén scroll-handler voor beide dingen: het vlak van de header, en welk menu-item bij de
  // sectie hoort waar de bezoeker nu is. Gethrottled op de frame-rate, dus geen layout-werk
  // per scroll-event.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 8);

      let current: string | null = null;
      for (const item of NAV) {
        const el = document.querySelector(item.href);
        if (el && el.getBoundingClientRect().top <= 140) current = item.href;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Een open menu mag niet blijven staan als de bezoeker naar een anker springt.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled || open
          ? "border-b border-site-line bg-site-canvas/80 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[60px] w-full max-w-[88rem] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <a href="#top" className="-m-2 flex items-center gap-2 p-2" aria-label={`${SITE.wordmark} — naar boven`}>
          <Wordmark />
        </a>

        <nav aria-label="Hoofdmenu" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? "true" : undefined}
              className={`rounded-ctl px-3 py-2 text-[0.875rem] transition-colors duration-200 hover:bg-site-surface-2 hover:text-site-text ${
                active === item.href ? "bg-site-surface-2 text-site-text" : "text-site-text-muted"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-ctl px-3 py-2 text-[0.875rem] text-site-text-muted transition-colors duration-200 hover:text-site-text sm:inline-flex"
          >
            Inloggen
          </Link>
          {/* Op smalle schermen kort label, zodat de knop nooit over twee regels breekt. */}
          <Button href="#demo" className="whitespace-nowrap px-4 py-2.5 text-[0.875rem]">
            <span className="sm:hidden">Demo aanvragen</span>
            <span className="hidden sm:inline">{SITE.ctaPrimary}</span>
          </Button>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Menu sluiten" : "Menu openen"}
            onClick={() => setOpen((v) => !v)}
            className="-mr-1 inline-flex h-10 w-10 items-center justify-center rounded-ctl text-site-text transition-colors hover:bg-site-surface-2 md:hidden"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 12h14" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="site-menu" className="site-sheet border-t border-site-line bg-site-canvas/95 backdrop-blur-xl md:hidden">
          <nav aria-label="Hoofdmenu (mobiel)" className="mx-auto flex max-w-[88rem] flex-col px-3 py-2 sm:px-6">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-ctl px-3 py-3.5 text-base text-site-text transition-colors hover:bg-site-surface-2"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-ctl px-3 py-3.5 text-base text-site-text-muted transition-colors hover:bg-site-surface-2"
            >
              Inloggen
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

/**
 * Woordmerk: puur typografisch, kleinletter, krappe letterafstand. Het blauwe punt is
 * hetzelfde signaal als het statuslampje in de productpanelen — meer merk heeft dit
 * product niet nodig.
 */
export function Wordmark({ ink = false, className = "" }: { ink?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 whitespace-nowrap font-display text-[0.9375rem] font-semibold tracking-[-0.035em] ${
        ink ? "text-white" : "text-site-text"
      } ${className}`}
    >
      {SITE.wordmark}
      <span aria-hidden="true" className={`h-1 w-1 translate-y-[-1px] rounded-full ${ink ? "bg-site-blue-ink" : "bg-site-blue"}`} />
    </span>
  );
}
