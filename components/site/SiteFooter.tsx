import Link from "next/link";
import { FOOTER_NAV, SITE } from "@/lib/site/copy";
import { Container } from "./primitives";

/**
 * Voettekst in dezelfde opbouw als de rest van de site: drie kolommen, een dunne scheidslijn,
 * en daaronder het woordmerk over de volle breedte — de laatste, rustige merkindruk.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-site-line bg-site-paper pt-16 sm:pt-20">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,44rem)] lg:gap-20">
          <div>
            <p className="u-display text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.05] text-site-ink">
              Weet wat je
              <br />
              <span className="u-grad">mediabudget doet.</span>
            </p>
            <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-site-muted">
              {SITE.taglineTop} {SITE.taglineBottom}
            </p>
            <a href="#demo" className="u-btn u-btn-primary group mt-8">
              {SITE.ctaPrimary}
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </a>
          </div>

          <nav aria-label="Voettekst" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {FOOTER_NAV.map((group) => (
              <div key={group.title}>
                <p className="u-label text-site-muted-2">{group.title}</p>
                <ul className="mt-5 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      {link.href.startsWith("/") ? (
                        <Link href={link.href} className="text-[0.9375rem] text-site-muted transition-colors hover:text-site-ink">
                          {link.label}
                        </Link>
                      ) : (
                        <a href={link.href} className="text-[0.9375rem] text-site-muted transition-colors hover:text-site-ink">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-site-line py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="u-label-sm u-label text-site-muted-2">© {year} {SITE.wordmark}</p>
          <p className="u-label-sm u-label text-site-muted-2">
            Alle cijfers op deze site zijn voorbeelddata — geen klantresultaten
          </p>
        </div>
      </Container>

      {/* Woordmerk over de volle breedte: het sluitstuk van de pagina. Als SVG met een
          vaste textLength, zodat het op élke schermbreedte exact de container vult in
          plaats van te overlopen of los te zwemmen. */}
      <div aria-hidden="true" className="px-5 pb-6 xl:px-16">
        <svg viewBox="0 0 1000 104" className="block w-full select-none" role="presentation">
          <text
            x="0"
            y="82"
            textLength="1000"
            lengthAdjust="spacingAndGlyphs"
            fontSize="104"
            fontWeight="800"
            letterSpacing="-4"
            fill="#0B0B0C"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {SITE.wordmark}
          </text>
        </svg>
      </div>
    </footer>
  );
}
