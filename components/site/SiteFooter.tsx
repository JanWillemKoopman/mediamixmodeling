import Link from "next/link";
import { FOOTER_NAV, SITE } from "@/lib/site/copy";
import { Button, Container } from "./primitives";
import { Wordmark } from "./SiteHeader";

/**
 * Voettekst: één groot statement, drie logische kolommen, één actie. Ruim opgezet — de site
 * eindigt niet met een muur van links maar met de belofte waarmee hij begon.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="on-ink border-t border-site-line-ink bg-site-ink text-site-on-ink">
      <Container className="py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-16">
          <div>
            <Wordmark ink />
            <p className="mt-7 max-w-lg font-display text-[clamp(1.875rem,4vw,3rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-white">
              Weet wat je mediabudget doet.
            </p>
            <p className="mt-4 max-w-sm text-[0.9375rem] leading-relaxed text-site-on-ink-muted">
              {SITE.tagline}
            </p>
            <div className="mt-8">
              <Button href="#demo" variant="primary-ink" arrow>
                {SITE.ctaPrimary}
              </Button>
            </div>
          </div>

          <nav aria-label="Voettekst" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {FOOTER_NAV.map((group) => (
              <div key={group.title}>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-site-on-ink-faint">
                  {group.title}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      {link.href.startsWith("/") ? (
                        <Link
                          href={link.href}
                          className="text-[0.9375rem] text-site-on-ink-muted transition-colors hover:text-white"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          className="text-[0.9375rem] text-site-on-ink-muted transition-colors hover:text-white"
                        >
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

        <div className="mt-20 flex flex-col gap-4 border-t border-site-line-ink pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.8125rem] text-site-on-ink-faint">
            © {year} {SITE.wordmark}
          </p>
          <p className="text-[0.8125rem] text-site-on-ink-faint">
            Alle cijfers op deze site zijn voorbeelddata en geen klantresultaten.
          </p>
        </div>
      </Container>
    </footer>
  );
}
