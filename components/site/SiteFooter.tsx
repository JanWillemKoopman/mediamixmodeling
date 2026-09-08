import Link from "next/link";
import { SITE } from "@/lib/site/copy";

export function SiteFooter() {
  return (
    <footer className="border-t border-site-line bg-site-canvas">
      <div className="mx-auto flex max-w-[80rem] flex-col gap-6 px-5 py-10 text-sm text-site-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <p className="text-site-text">{SITE.wordmark}</p>
        <nav aria-label="Voettekst" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a href="#de-vraag" className="underline-offset-4 hover:text-site-text hover:underline">
            De vraag
          </a>
          <a href="#aanpak" className="underline-offset-4 hover:text-site-text hover:underline">
            Aanpak
          </a>
          <a href="#demo" className="underline-offset-4 hover:text-site-text hover:underline">
            {SITE.ctaPrimary}
          </a>
          <Link href="/login" className="underline-offset-4 hover:text-site-text hover:underline">
            Inloggen
          </Link>
        </nav>
      </div>
    </footer>
  );
}
