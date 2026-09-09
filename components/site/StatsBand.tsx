import { EXAMPLE_PROFILE } from "@/lib/site/exampleData";
import { Anim } from "./motion";
import { Container, ExampleTag, Label, Stat } from "./primitives";

/**
 * Smalle band onder de hero: de omvang van de voorbeeldanalyse in vier cijfers. Geen
 * klantlogo's en geen resultaatclaims — alleen wat er in de analyse zit, en het label dat
 * zegt dat het een voorbeeld is.
 */
export function StatsBand() {
  const stats = [
    { value: EXAMPLE_PROFILE.budget, label: EXAMPLE_PROFILE.budgetLabel, accent: false },
    { value: EXAMPLE_PROFILE.channels, label: EXAMPLE_PROFILE.channelsLabel, accent: false },
    { value: EXAMPLE_PROFILE.weeks, label: EXAMPLE_PROFILE.weeksLabel, accent: true },
    { value: EXAMPLE_PROFILE.factors, label: EXAMPLE_PROFILE.factorsLabel, accent: false },
  ];

  return (
    <section className="relative border-y border-site-line bg-site-paper py-12 sm:py-14">
      <Container>
        <Anim className="flex flex-col gap-8">
          <div className="site-stagger flex flex-wrap items-center justify-between gap-4">
            <Label tone="muted">Waar de voorbeeldanalyse op rust</Label>
            <ExampleTag />
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
            {stats.map((stat, i) => (
              <div key={stat.label} className="site-stagger" style={{ ["--d" as string]: `${i * 90}ms` }}>
                <Stat value={stat.value} label={stat.label} accent={stat.accent} />
              </div>
            ))}
          </div>
        </Anim>
      </Container>
    </section>
  );
}
