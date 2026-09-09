"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NAV, SITE } from "@/lib/site/copy";

/**
 * Vaste, transparante koptekst die pas een wit vlak krijgt zodra je scrolt. Drie kolommen:
 * woordmerk links, menu gecentreerd, acties rechts. De hoogte groeit mee met het scherm
 * (64 → 80 → 112px), net als de zijmarges van de container.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 8);
      let current: string | null = null;
      for (const item of NAV) {
        const el = document.querySelector(item.href);
        if (el && el.getBoundingClientRect().top <= 160) current = item.href;
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

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("hashchange", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 h-16 transition-colors duration-300 lg:h-20 2xl:h-28 ${
        scrolled || open ? "border-b border-site-line bg-site-paper/90 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-full w-full max-w-[120rem] items-center justify-between gap-5 px-5 md:grid md:grid-cols-[0.5fr_2fr_0.5fr] xl:gap-16 xl:px-16">
        <a href="#top" className="-m-2 w-fit p-2" aria-label={`${SITE.wordmark} — naar boven`}>
          <Wordmark />
        </a>

        <nav aria-label="Hoofdmenu" className="hidden justify-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? "true" : undefined}
              className={`rounded-full px-3.5 py-2 text-[0.875rem] font-medium transition-colors duration-200 hover:text-site-ink ${
                active === item.href ? "text-site-ink" : "text-site-muted"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2 sm:gap-4">
          <Link
            href="/login"
            className="hidden text-[0.875rem] font-medium text-site-muted transition-colors hover:text-site-ink sm:inline"
          >
            Inloggen
          </Link>
          {/* De actie in de kop staat als omlijnde pil; de gevulde violette knop is voor de
              hero en de slotsectie — zo blijft er één primaire actie per beeld. */}
          <a
            href="#demo"
            className="u-btn u-btn-sm border border-site-green-line bg-site-paper text-site-ink shadow-site-sm transition hover:border-site-green-text hover:bg-[rgba(185,239,163,0.28)]"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-site-green-text" />
            <span className="hidden sm:inline">{SITE.ctaPrimary}</span>
            <span className="sm:hidden">Demo</span>
          </a>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Menu sluiten" : "Menu openen"}
            onClick={() => setOpen((v) => !v)}
            className="-mr-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-site-ink transition-colors hover:bg-site-paper-2 md:hidden"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 12h14" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="site-menu" className="site-sheet border-b border-site-line bg-site-paper/97 backdrop-blur-xl md:hidden">
          <nav aria-label="Hoofdmenu (mobiel)" className="mx-auto flex max-w-[120rem] flex-col px-3 py-2 sm:px-6">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-ctl px-3 py-3.5 text-base font-medium text-site-ink transition-colors hover:bg-site-paper-2"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-ctl px-3 py-3.5 text-base text-site-muted transition-colors hover:bg-site-paper-2"
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
 * Woordmerk: puur typografisch, kleinletter, krappe letterafstand, met één violette punt.
 * Geen icoon, geen grafiekje — de naam zelf is het merk.
 */
export function Wordmark({ className = "", large = false }: { className?: string; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 whitespace-nowrap font-extrabold tracking-[-0.045em] text-site-ink ${
        large ? "text-[1.05rem]" : "text-[0.9375rem] 2xl:text-[1.05rem]"
      } ${className}`}
    >
      {SITE.wordmark}
      <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-site-violet" />
    </span>
  );
}
