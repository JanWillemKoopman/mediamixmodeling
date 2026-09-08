"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/site/copy";

/**
 * Minimale koptekst: merknaam, twee ankers, de inlogroute en de primaire actie. Blijft
 * bereikbaar op elke scrollpositie (ook met het toetsenbord) en krijgt pas een eigen vlak
 * zodra de bezoeker de hero voorbij is, zodat de opening rustig blijft.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-site-line bg-site-canvas/90 backdrop-blur" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-3 px-5 sm:gap-4 sm:px-8 lg:px-12">
        <a href="#top" className="whitespace-nowrap text-sm font-medium tracking-tight text-site-text">
          {SITE.wordmark}
        </a>

        <nav aria-label="Hoofdmenu" className="flex items-center gap-4 text-sm sm:gap-6">
          <a href="#de-vraag" className="hidden text-site-text-muted underline-offset-4 hover:text-site-text hover:underline md:inline">
            De vraag
          </a>
          <a href="#aanpak" className="hidden text-site-text-muted underline-offset-4 hover:text-site-text hover:underline md:inline">
            Aanpak
          </a>
          <Link href="/login" className="hidden text-site-text-muted underline-offset-4 hover:text-site-text hover:underline sm:inline">
            Inloggen
          </Link>
          <a
            href="#demo"
            className="whitespace-nowrap rounded-full bg-site-effect px-4 py-2 text-sm font-medium text-white transition hover:bg-site-effect-hover"
          >
            {SITE.ctaPrimary}
          </a>
        </nav>
      </div>
    </header>
  );
}
