// "Zo lees je dit dashboard" — een korte onboarding + methodologie-noot zodat een marketeer
// zónder MMM-specialist weet hoe hij de output moet wegen. Native <details>, dus geen
// client-JS nodig; standaard ingeklapt om de bovenkant rustig te houden.
export function DashboardHelp() {
  return (
    <details className="rounded-lg border border-border bg-surface-2/50 px-4 py-3" data-print="hide">
      <summary className="cursor-pointer select-none text-sm font-medium text-fg">
        Zo lees je dit dashboard <span className="font-normal text-fg-muted">— in 6 punten</span>
      </summary>
      <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-fg-muted">
        <p>
          <span className="font-medium text-fg">1. Begin bovenaan.</span> De samenvatting en de kop-conclusie geven
          in gewone taal wat marketing opleverde. Daaronder staan de aanbevolen acties — dáár begin je als je snel
          een besluit wilt nemen.
        </p>
        <p>
          <span className="font-medium text-fg">2. Check eerst het modelvertrouwen.</span> Staat het op groen, dan
          kun je de cijfers vertrouwen. Op oranje of rood: lees mee met de genoemde reden en wees voorzichtig met
          grote budgetbesluiten.
        </p>
        <p>
          <span className="font-medium text-fg">3. Elk getal heeft een marge.</span> Onder de mediaan staat steevast
          een band (bijv. 3%–97%). Een brede band betekent onzekerheid — meestal doordat een kanaal weinig of te
          weinig variërende data had. Het vertrouwenslabel per kanaal vat dit samen.
        </p>
        <p>
          <span className="font-medium text-fg">4. Basislijn = zonder marketing.</span> Een deel van je KPI was er
          ook zonder campagnes geweest: trend, seizoen, prijs en andere externe factoren. Dat is de basislijn, geen
          verlies — het voorkomt dat marketing eer krijgt voor verkoop die er toch was.
        </p>
        <p>
          <span className="font-medium text-fg">5. ROAS vs. verzadiging.</span> ROAS is het gemiddelde rendement tot
          nu toe; de verzadigingscurves en het marginale rendement laten zien wat de vólgende euro nog doet. Een goed
          scorend kanaal kan toch verzadigd zijn.
        </p>
        <p>
          <span className="font-medium text-fg">6. Speel met scenario&apos;s.</span> Op het tabblad
          &ldquo;Scenarioplanning&rdquo; stel je zelf een toekomstige mix samen en zie je het effect op KPI&apos;s en
          kosten, afgezet tegen niets aanpassen.
        </p>
        <p className="border-t border-border pt-2.5 text-xs text-fg-faint">
          Methode: een Bayesiaans media-mix-model schat per kanaal de bijdrage aan de KPI, gecorrigeerd voor
          doorwerking (adstock), afnemend rendement (verzadiging), trend, seizoen en externe factoren. Het werkt met
          waarschijnlijkheden, niet met zekerheden — vandaar de marges.
        </p>
      </div>
    </details>
  );
}
