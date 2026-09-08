import { EXAMPLE_LABEL, REPORTING_GAP } from "@/lib/site/exampleData";
import { nl } from "@/lib/site/format";
import { Reveal } from "./Reveal";

const SCALE = 140000;
const pct = (value: number) => (value / SCALE) * 100;

/**
 * Waarom bestaande rapportages de managementvraag niet beantwoorden. Geen aanval op
 * platformen: ze doen precies waarvoor ze gemaakt zijn. Maar opgeteld meten ze deels
 * hetzelfde resultaat, en samen tellen ze op tot meer dan er werkelijk gebeurde.
 */
export function ReportingGap() {
  const overshoot = REPORTING_GAP.reported - REPORTING_GAP.actual;
  const overshootPct = Math.round((overshoot / REPORTING_GAP.actual) * 100);

  return (
    <section className="border-t border-site-line" aria-labelledby="rapportage-titel">
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-20">
          <Reveal>
            <h2
              id="rapportage-titel"
              className="font-display text-[clamp(1.875rem,4vw,3rem)] leading-[1.1] tracking-tight text-site-text"
            >
              Rapporteren is iets anders dan verklaren.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-site-text-muted">
              Advertentieplatforms doen precies waarvoor ze gemaakt zijn: registreren wat er binnen
              hun eigen omgeving gebeurt. Die cijfers zijn nuttig en blijven nuttig — voor het
              sturen van campagnes zijn ze onmisbaar.
            </p>
            <p className="mt-4 text-base leading-relaxed text-site-text-muted">
              Maar ze zien elkaar niet, en ze zien niet wat er buiten hun omgeving gebeurt. Een klant
              die een advertentie zag, later zocht en uiteindelijk kocht, wordt op meerdere plekken
              als succes geteld. Het management vraagt intussen naar iets anders: hoeveel van het
              totale resultaat hangt samen met de media-investering?
            </p>
          </Reveal>

          <Reveal delay={120} className="self-center">
            <figure>
              <div className="relative">
                <div className="space-y-7">
                  <div>
                    <p className="text-sm text-site-text-muted">
                      Wat de platforms samen rapporteren
                    </p>
                    <div className="mt-2 flex h-11" aria-hidden="true">
                      <div
                        className="h-full rounded-l-md"
                        style={{ width: `${pct(REPORTING_GAP.actual)}%`, backgroundColor: "#7F858F" }}
                      />
                      <div
                        className="h-full rounded-r-md"
                        style={{ width: `${pct(overshoot)}%`, backgroundColor: "#ED6935" }}
                      />
                    </div>
                    <p className="tnum mt-2 text-sm text-site-text">
                      {nl(REPORTING_GAP.reported)}{" "}
                      <span className="text-site-text-faint">{REPORTING_GAP.reportedLabel}</span>
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-site-text-muted">Wat het bedrijf zelf registreerde</p>
                    <div className="mt-2 flex h-11" aria-hidden="true">
                      <div
                        className="h-full rounded-md"
                        style={{ width: `${pct(REPORTING_GAP.actual)}%`, backgroundColor: "#252A32" }}
                      />
                    </div>
                    <p className="tnum mt-2 text-sm text-site-text">
                      {nl(REPORTING_GAP.actual)}{" "}
                      <span className="text-site-text-faint">{REPORTING_GAP.actualLabel}</span>
                    </p>
                  </div>
                </div>
              </div>

              <figcaption className="mt-7 border-t border-site-line pt-5 text-sm leading-relaxed text-site-text-muted">
                In dit voorbeeld rapporteren de kanalen samen{" "}
                <span className="font-medium text-site-text">{overshootPct}% meer conversies</span> dan
                het bedrijf orders had. Niet omdat er iemand fout telt, maar omdat ze deels dezelfde
                klant tellen — en niemand van hen het totaal kan zien.{" "}
                <span className="text-site-text-faint">{EXAMPLE_LABEL}.</span>
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
