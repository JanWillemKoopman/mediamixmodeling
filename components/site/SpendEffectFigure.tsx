import { CHANNELS, EXAMPLE_LABEL } from "@/lib/site/exampleData";
import { nl } from "@/lib/site/format";
import { BarLegend, BudgetBar } from "./BudgetBar";
import { Reveal } from "./Reveal";
import { boundaries, effectSegments, legendItems, spendSegments } from "./segments";

/**
 * Het hart van de pagina: dezelfde vijf kanalen, twee keer. Boven de verdeling van het
 * mediabudget, onder de geschatte bijdrage aan het resultaat. De segmenten van de onderste
 * balk vertrekken vanaf hun budgetbreedte en bewegen naar hun eigen breedte zodra de figuur
 * in beeld komt; de schuine verbindingslijnen laten zien welk kanaal waarheen verschuift.
 * Het verschil tussen beide balken is het hele argument van deze website.
 */
export function SpendEffectFigure() {
  const spend = spendSegments();
  const effect = effectSegments();
  const spendBounds = boundaries(spend.map((s) => s.pct));
  const effectBounds = boundaries(effect.map((s) => s.pct));

  return (
    <figure className="mt-12 sm:mt-16">
      <Reveal baseClass="site-figure">
        <p className="text-xs uppercase tracking-[0.14em] text-site-text-faint">Waar je geld staat</p>
        <BudgetBar segments={spend} className="mt-3" />

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="site-links h-10 w-full sm:h-14"
          aria-hidden="true"
          focusable="false"
        >
          {spendBounds.map((from, i) => (
            <line
              key={i}
              x1={from}
              y1="0"
              x2={effectBounds[i]}
              y2="100"
              stroke="rgba(20,28,47,0.28)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <BudgetBar segments={effect} variant="effect" />
        <p className="mt-3 text-xs uppercase tracking-[0.14em] text-site-effect">
          Waar het effect naar schatting zit
        </p>

        <div className="mt-5">
          <BarLegend items={legendItems} />
        </div>
      </Reveal>

      <figcaption className="mt-6 max-w-2xl text-sm text-site-text-muted">
        Het verschil tussen de twee balken is waar het gesprek over budget begint. In dit
        voorbeeld staat ruim een derde van het budget op shopping, terwijl TV — met 12% van het
        budget — samenhangt met bijna een kwart van de door media verklaarde omzet.{" "}
        <span className="text-site-text-faint">{EXAMPLE_LABEL}.</span>
      </figcaption>

      {/* Tekstequivalent van de figuur: dezelfde cijfers, leesbaar met een schermlezer. De
          wrapper draagt sr-only: een <table> zelf negeert overflow en zou de pagina op
          smalle schermen alsnog horizontaal laten scrollen. */}
      <div className="sr-only">
        <table>
        <caption>
          Aandeel in het mediabudget tegenover het geschatte aandeel in de door media verklaarde
          omzet, per kanaal. Voorbeelddata.
        </caption>
        <thead>
          <tr>
            <th scope="col">Kanaal</th>
            <th scope="col">Aandeel mediabudget</th>
            <th scope="col">Geschat aandeel in het effect</th>
            <th scope="col">Bandbreedte</th>
          </tr>
        </thead>
        <tbody>
          {CHANNELS.map((channel) => (
            <tr key={channel.key}>
              <th scope="row">{channel.label}</th>
              <td>{nl(channel.spendShare, 1)}%</td>
              <td>{nl(channel.effectShare)}%</td>
              <td>
                {nl(channel.effectLow)}% tot {nl(channel.effectHigh)}%
              </td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
