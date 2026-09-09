"use client";

import { CHANNELS, REPORTING_GAP } from "@/lib/site/exampleData";
import { euroShort, nl } from "@/lib/site/format";
import { Anim, Reveal, useCountUp, useInView } from "./motion";
import { Container, ExampleTag, Label, Section, SectionHead } from "./primitives";

/**
 * Het scherpste onderscheid van de site: rapporteren is iets anders dan verklaren. Drie
 * schakels naast elkaar — wat de platforms rapporteren, wat het bedrijf zelf registreert, en
 * wat de analyse daarvan probeert te verklaren. Het verschil tussen de eerste twee getallen
 * is het hele argument.
 */
export function ReportingSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const reported = useCountUp(REPORTING_GAP.reported, inView, 1200);
  const actual = useCountUp(REPORTING_GAP.actual, inView, 1400);

  return (
    <Section wash labelledBy="verklaren-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="verklaren-titel"
            watermark="Verklaren"
            label="Rapportage · verklaring"
            title="Rapporteren is iets"
            accent="anders dan verklaren."
            intro="Platformrapportages tellen op wat ze zelf hebben gezien. Ze corrigeren niet voor elkaar, niet voor je prijs, niet voor je promoties en niet voor het seizoen."
          />
        </Reveal>

        <div ref={ref} className="mt-14">
          <Anim className="grid gap-4 lg:grid-cols-3 lg:gap-5">
            {/* 01 — wat de platforms optellen. */}
            <article className="site-stagger u-card flex flex-col p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <Label tone="muted">01 · wat platforms rapporteren</Label>
              </div>
              <p className="tnum mt-6 text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold leading-none tracking-[-0.04em] text-site-ink">
                {nl(Math.round(reported))}
              </p>
              <p className="mt-2 text-[0.875rem] text-site-muted">conversies, opgeteld uit alle rapportages</p>
              <ul className="mt-6 space-y-2">
                {CHANNELS.slice(0, 4).map((channel) => (
                  <li key={channel.key} className="flex items-baseline justify-between gap-3 border-b border-site-line pb-2 last:border-b-0">
                    <span className="text-[0.8125rem] text-site-muted">{channel.label}</span>
                    <span className="tnum font-mono text-[0.78rem] text-site-ink">{channel.reported}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-auto pt-6 text-[0.85rem] leading-relaxed text-site-muted">
                Elk systeem rekent zichzelf dezelfde order toe. Optellen mag dus eigenlijk niet.
              </p>
            </article>

            {/* 02 — wat het bedrijf zelf registreerde. */}
            <article className="site-stagger u-card flex flex-col p-5 sm:p-7" style={{ ["--d" as string]: "120ms" }}>
              <Label tone="muted">02 · wat je bedrijf registreert</Label>
              <p className="tnum mt-6 text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold leading-none tracking-[-0.04em] text-site-ink">
                {nl(Math.round(actual))}
              </p>
              <p className="mt-2 text-[0.875rem] text-site-muted">orders in je eigen ordersysteem, zelfde periode</p>

              <div className="mt-6 space-y-3">
                <Bar label="Gerapporteerd" value={REPORTING_GAP.reported} max={REPORTING_GAP.reported} tone="#C0C0C6" />
                <Bar label="Geregistreerd" value={REPORTING_GAP.actual} max={REPORTING_GAP.reported} tone="#0B0B0C" />
              </div>

              <p className="mt-auto pt-6 text-[0.85rem] leading-relaxed text-site-muted">
                Het verschil is geen fout van één systeem. Het is wat er gebeurt als iedereen
                hetzelfde resultaat claimt.
              </p>
            </article>

            {/* 03 — wat de analyse ervan verklaart. */}
            <article className="site-stagger u-card u-card-md flex flex-col p-5 sm:p-7" style={{ ["--d" as string]: "240ms" }}>
              <div className="flex items-center justify-between gap-3">
                <Label>03 · wat de analyse verklaart</Label>
                <ExampleTag />
              </div>

              <p className="mt-6 text-[0.9rem] leading-relaxed text-site-muted">
                De analyse rekent terug wat er van je resultaat samenhangt met media, en splitst dat
                uit over je kanalen — met de bandbreedte erbij.
              </p>

              <ul className="mt-6 space-y-2.5">
                {CHANNELS.slice(0, 4).map((channel, i) => (
                  <li key={channel.key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[0.8125rem] text-site-ink">{channel.label}</span>
                      <span className="tnum font-mono text-[0.78rem] text-site-ink">{euroShort(channel.contribution)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-site-paper-3">
                      <div
                        className="site-bar h-1.5 rounded-full bg-site-green-text"
                        style={{
                          ["--w" as string]: `${(channel.contribution / 3_100_000) * 100}%`,
                          ["--w0" as string]: "0%",
                          ["--d" as string]: `${400 + i * 90}ms`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <p className="mt-auto pt-6 text-[0.85rem] leading-relaxed text-site-muted">
                Geen negende maatstaf erbij: één maatstaf waarop je kanalen eindelijk vergelijkbaar
                zijn.
              </p>
            </article>
          </Anim>
        </div>
      </Container>
    </Section>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="u-label-sm u-label text-site-muted-2">{label}</span>
        <span className="tnum font-mono text-[0.78rem] text-site-ink">{nl(value)}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-site-paper-3">
        <div
          className="site-bar h-2 rounded-full"
          style={{ ["--w" as string]: `${(value / max) * 100}%`, ["--w0" as string]: "0%", backgroundColor: tone }}
        />
      </div>
    </div>
  );
}
