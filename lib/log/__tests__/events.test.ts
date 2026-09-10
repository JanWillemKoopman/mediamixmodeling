// Het logboek heeft één belofte: het breekt nooit de aanroep die het logt. Alles wat die
// belofte kan schenden zit in deze drie functies — ze krijgen onbekende invoer (een Error,
// een string, een object met een cyclus, `undefined`) op het moment dat er al iets misgaat.
// Gooit er hier één, dan verliezen we juist de fout die we wilden vastleggen.

import { describe, expect, it } from "vitest";
import {
  MAX_DETAIL_CHARS,
  MAX_MESSAGE_CHARS,
  describeError,
  safeDetail,
  truncate,
} from "@/lib/log/events";

describe("truncate", () => {
  it("laat korte tekst met rust", () => {
    expect(truncate("kolom niet gevonden")).toBe("kolom niet gevonden");
  });

  it("geeft null voor leegte, zodat een lege melding geen lege string wordt", () => {
    expect(truncate(null)).toBeNull();
    expect(truncate(undefined)).toBeNull();
    expect(truncate("")).toBeNull();
  });

  it("kapt lange tekst af en zegt hoeveel er was", () => {
    const out = truncate("x".repeat(MAX_MESSAGE_CHARS + 500))!;
    expect(out.length).toBeLessThan(MAX_MESSAGE_CHARS + 100);
    expect(out).toContain("afgekapt");
    expect(out).toContain(String(MAX_MESSAGE_CHARS + 500));
  });

  it("maakt van niet-tekst alsnog tekst", () => {
    expect(truncate(404)).toBe("404");
  });
});

describe("describeError", () => {
  it("haalt melding en stacktrace uit een Error", () => {
    const described = describeError(new TypeError("kan niet lezen"));
    expect(described.message).toBe("kan niet lezen");
    expect(described.name).toBe("TypeError");
    expect(described.stack).toContain("TypeError");
  });

  it("valt terug op de naam als een Error geen melding heeft", () => {
    expect(describeError(new Error()).message).toBe("Error");
  });

  it("verwerkt wat er verder allemaal geworpen kan worden", () => {
    expect(describeError("gewoon een string").message).toBe("gewoon een string");
    expect(describeError({ error: "van een API" }).message).toContain("van een API");
    expect(describeError(undefined).message).toBeTruthy();
  });

  it("gooit niet op een object dat niet te serialiseren is", () => {
    const cyclisch: Record<string, unknown> = {};
    cyclisch.zelf = cyclisch;
    expect(() => describeError(cyclisch)).not.toThrow();
  });
});

describe("safeDetail", () => {
  it("laat een gewoon detailobject door", () => {
    expect(safeDetail({ actie: "goal.budget", status: 400 })).toEqual({
      actie: "goal.budget",
      status: 400,
    });
  });

  it("geeft een leeg object voor niet-objecten", () => {
    expect(safeDetail(undefined)).toEqual({});
    expect(safeDetail("tekst")).toEqual({});
  });

  it("kapt een te groot detail af in plaats van het te weigeren", () => {
    const out = safeDetail({ stack: "y".repeat(MAX_DETAIL_CHARS * 2) });
    expect(out.afgekapt).toBe(true);
    expect(String(out.fragment).length).toBeLessThanOrEqual(MAX_DETAIL_CHARS);
  });

  it("gooit niet op een cyclus, maar meldt dat het detail onleesbaar was", () => {
    const cyclisch: Record<string, unknown> = { actie: "x" };
    cyclisch.zelf = cyclisch;
    expect(safeDetail(cyclisch)).toEqual({ detail_niet_leesbaar: true });
  });
});
