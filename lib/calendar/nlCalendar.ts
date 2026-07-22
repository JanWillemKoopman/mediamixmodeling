// A curated reference of recurring Dutch-market calendar events that reliably move a
// marketing KPI, keyed by the ISO week they usually fall in. The architect is told about
// this list (see lib/anthropic/preFitContext.ts) so it can proactively propose calendar
// controls — a `recurring_week_dummy` feature or an event dummy — instead of only spotting
// them if a spike happens to land in the 15-line preview.
//
// ISO weeks shift by ±1 year to year; these are the typical weeks. The architect always
// states its reasoning and the builder confirms, so an off-by-one week is corrected in the
// loop rather than silently baked in. Fixed-date holidays map cleanly to an ISO week;
// moving feasts (Easter, Pentecost, Ascension) do not, so they are flagged as "varieert".

export interface CalendarEvent {
  name: string;
  // Typical ISO week number, or null for moving feasts whose week varies year to year.
  iso_week: number | null;
  note: string;
}

export const NL_CALENDAR_EVENTS: CalendarEvent[] = [
  { name: "Nieuwjaar / uitverkoop januari", iso_week: 1, note: "Jaarwisseling + januari-sale." },
  { name: "Valentijnsdag", iso_week: 7, note: "14 februari; relevant voor cadeau/retail." },
  { name: "Pasen", iso_week: null, note: "Moving feast (maart/april); week varieert." },
  { name: "Koningsdag", iso_week: 17, note: "27 april; retail/horeca-piek." },
  { name: "Meivakantie", iso_week: 18, note: "Rond week 18–19; reizen/vrije tijd." },
  { name: "Hemelvaart", iso_week: null, note: "Moving feast (mei); week varieert." },
  { name: "Pinksteren", iso_week: null, note: "Moving feast (mei/juni); week varieert." },
  { name: "Zomervakantie (piek)", iso_week: 30, note: "Rond week 29–33; reizen, lagere B2B-vraag." },
  { name: "Prinsjesdag / najaarsstart", iso_week: 38, note: "Derde dinsdag september." },
  { name: "Herfstvakantie", iso_week: 43, note: "Rond week 43; regio-afhankelijk." },
  { name: "Black Friday / Cyber Monday", iso_week: 48, note: "Grootste e-commerce-piek van het jaar." },
  { name: "Sinterklaas", iso_week: 49, note: "5 december; cadeau-piek." },
  { name: "Kerst", iso_week: 51, note: "Week 51–52; retail-piek, B2B-vraag valt terug." },
];

// A compact one-line-per-event block for the architect prompt.
export function formatCalendarReference(): string {
  const lines = NL_CALENDAR_EVENTS.map((e) => {
    const week = e.iso_week === null ? "week varieert" : `ISO-week ${e.iso_week}`;
    return `  • ${e.name} (${week}) — ${e.note}`;
  });
  return [
    "Terugkerende NL-kalendergebeurtenissen die een KPI vaak beïnvloeden (typische ISO-week; verschuift ±1 per jaar):",
    ...lines,
    "Stel een 'recurring_week_dummy'-feature of event-dummy voor als de KPI rond zo'n week een patroon toont — met je redenering, en laat de bouwer de exacte week bevestigen.",
  ].join("\n");
}
