// Stap 5: van antwoorden naar modelintentie.
//
// Wat hier bewaakt wordt is de grens die het hele product draagt: de gebruiker (en straks de
// AI) spreekt een gesloten woordenschat, en er komt geen enkel getal uit deze stap. Elk
// numeriek veld dat hier zou binnensluipen, zou een prior zijn die niet uit gemeten data is
// afgeleid — precies wat de vorige refactor heeft uitgebannen.

import { describe, expect, it } from "vitest";
import {
  CHANNEL_QUESTIONS,
  MEDIA_SHARE_QUESTION,
  SEASONALITY_QUESTION,
  buildIntent,
  channelsOf,
  describeIntent,
  type BeliefAnswers,
} from "@/lib/flow/beliefs";
import { validateIntent } from "@/lib/modelIntent";
import type { ColumnRole, DatasetVersion } from "@/lib/types";

const ROLES: Record<string, ColumnRole> = {
  flatscreen_verkopen: "kpi",
  tv_spend: "spend",
  email_verzendingen: "spend",
  gemiddelde_prijs: "control",
};

const DATASET = {
  id: "ds-1",
  column_roles: ROLES,
  column_units: { tv_spend: "currency", email_verzendingen: "sendings" },
  n_weeks: 104,
} as unknown as DatasetVersion;

describe("de vragen zelf", () => {
  it("bieden overal een 'weet ik niet'", () => {
    // Geen ontsnappingsluik maar een echt antwoord: het zegt de rekenkern om de data zwaarder
    // te laten wegen dan de verwachting. Verdwijnt die optie, dan dwingt de stap een mening af.
    for (const question of CHANNEL_QUESTIONS) {
      expect(question.options.some((o) => o.value === "unknown"), question.id).toBe(true);
    }
    expect(SEASONALITY_QUESTION.options.some((o) => o.value === "unknown")).toBe(true);
  });

  it("stellen de vraag met de kanaalnaam erin", () => {
    for (const question of CHANNEL_QUESTIONS) {
      expect(question.ask("tv_spend")).toContain("tv_spend");
    }
  });

  it("gebruiken geen vaktaal", () => {
    const alleText = [
      ...CHANNEL_QUESTIONS.flatMap((q) => [q.ask("kanaal"), ...q.options.map((o) => `${o.label} ${o.hint ?? ""}`)]),
      SEASONALITY_QUESTION.ask,
      MEDIA_SHARE_QUESTION.ask,
      ...MEDIA_SHARE_QUESTION.options.map((o) => `${o.label} ${o.hint ?? ""}`),
    ]
      .join(" ")
      .toLowerCase();
    for (const jargon of ["adstock", "saturatie", "prior", "carryover", "bayesiaans", "posterior"]) {
      expect(alleText.includes(jargon), `vraagtekst gebruikt jargon: ${jargon}`).toBe(false);
    }
  });

  it("vraagt het aandeel van marketing expliciet", () => {
    // De zwaarst wegende aanname van het hele model. Stil op een middenwaarde zetten zou een
    // mening zijn die de gebruiker nooit heeft gegeven.
    expect(MEDIA_SHARE_QUESTION.options.length).toBe(4);
    for (const option of MEDIA_SHARE_QUESTION.options) {
      expect(option.hint, option.value).toBeTruthy();
    }
  });
});

describe("de kanalen waarover gevraagd wordt", () => {
  it("komen uit de goedgekeurde data, met de eenheid uit stap 3", () => {
    const channels = channelsOf(DATASET);
    expect(channels.map((c) => c.name).sort()).toEqual(["email_verzendingen", "tv_spend"]);
    expect(channels.find((c) => c.name === "email_verzendingen")!.unit).toBe("sendings");
  });
});

describe("de modelintentie", () => {
  it("bevat geen enkel getal", () => {
    const intent = buildIntent(DATASET, "orders", { channels: {} });
    // Alles wat hier doorheen komt moet een woord zijn. Eén getal is een prior die niet uit
    // gemeten data is afgeleid.
    const scan = (value: unknown, path: string) => {
      if (typeof value === "number") {
        throw new Error(`numeriek veld in de intentie: ${path} = ${value}`);
      }
      if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${path}[${i}]`));
      else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) scan(v, `${path}.${k}`);
      }
    };
    expect(() => scan(intent, "intent")).not.toThrow();
  });

  it("maakt van onbeantwoord hetzelfde als 'weet ik niet'", () => {
    const intent = buildIntent(DATASET, "revenue", { channels: {} });
    for (const channel of intent.channels) {
      expect(channel.carryover, channel.name).toBe("unknown");
      expect(channel.strength, channel.name).toBe("unknown");
      expect(channel.saturation, channel.name).toBe("unknown");
    }
    expect(intent.seasonality).toBe("unknown");
    // Niet aangegeven betekent afwezig, niet "moderate": de rekenkern heeft zijn eigen
    // middenwaarde en die hoort daar te staan, niet hier.
    expect(intent.media_share_belief).toBeUndefined();
  });

  it("neemt het KPI-type over uit stap 1", () => {
    expect(buildIntent(DATASET, "orders", { channels: {} }).kpi_type).toBe("orders");
    expect(buildIntent(DATASET, "leads", { channels: {} }).kpi_type).toBe("leads");
  });

  it("neemt de gegeven antwoorden over", () => {
    const answers: BeliefAnswers = {
      channels: {
        tv_spend: { carryover: "long", strength: "large", saturation: "far_from_saturated" },
      },
      seasonality: "strong",
      media_share: "large",
      context: "In maart liep een tv-campagne.",
    };
    const intent = buildIntent(DATASET, "revenue", answers);
    const tv = intent.channels.find((c) => c.name === "tv_spend")!;
    expect(tv.carryover).toBe("long");
    expect(tv.strength).toBe("large");
    expect(intent.seasonality).toBe("strong");
    expect(intent.media_share_belief).toBe("large");
    expect(intent.notes).toEqual(["In maart liep een tv-campagne."]);
    // Het kanaal dat niet beantwoord is, blijft eerlijk op onbekend staan.
    expect(intent.channels.find((c) => c.name === "email_verzendingen")!.carryover).toBe("unknown");
  });

  it("is ook zonder één antwoord een geldige intentie", () => {
    // Het hele "ik weet het nog niet"-pad hangt hieraan: de stap moet af te ronden zijn
    // zonder dat de gebruiker iets beweert.
    const intent = buildIntent(DATASET, "orders", { channels: {} });
    expect(validateIntent(intent, ROLES)).toEqual([]);
  });

  it("is geldig met volledig ingevulde antwoorden", () => {
    const answers: BeliefAnswers = {
      channels: {
        tv_spend: { carryover: "long", strength: "large", saturation: "approaching" },
        email_verzendingen: { carryover: "short", strength: "small", saturation: "likely_saturated" },
      },
      seasonality: "mild",
      media_share: "moderate",
    };
    expect(validateIntent(buildIntent(DATASET, "revenue", answers), ROLES)).toEqual([]);
  });

  it("neemt de controls mee zoals de data ze heeft vastgelegd", () => {
    expect(buildIntent(DATASET, "revenue", { channels: {} }).control_columns).toEqual(["gemiddelde_prijs"]);
  });
});

describe("het overzicht van wat er berekend wordt", () => {
  it("noemt de eenheid per kanaal in gewone taal", () => {
    const rows = describeIntent(buildIntent(DATASET, "orders", { channels: {} }));
    const channelRow = rows.find((r) => r.label.startsWith("Kanalen"))!;
    expect(channelRow.value).toContain("verzendingen");
    expect(channelRow.value).toContain("euro's");
  });

  it("zegt eerlijk dat er niets is aangegeven", () => {
    const rows = describeIntent(buildIntent(DATASET, "orders", { channels: {} }));
    expect(rows.find((r) => r.label.includes("Na-ijl"))!.value).toContain("je data bepaalt het");
    expect(rows.find((r) => r.label.includes("Aandeel"))!.value).toContain("niet aangegeven");
  });

  it("bevat geen enkel afgeleid getal", () => {
    // De priors bestaan op dit moment nog niet — de worker leidt ze af. Ze hier alsnog noemen
    // zou een tweede, afwijkende berekening betekenen.
    const answers: BeliefAnswers = {
      channels: { tv_spend: { carryover: "long", strength: "large", saturation: "approaching" } },
      seasonality: "strong",
      media_share: "dominant",
    };
    for (const row of describeIntent(buildIntent(DATASET, "revenue", answers))) {
      expect(row.value, row.label).not.toMatch(/\d+[.,]\d+/);
    }
  });
});
