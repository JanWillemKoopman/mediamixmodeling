import { ImageResponse } from "next/og";
import { CHANNELS, TOTAL_BUDGET } from "@/lib/site/exampleData";

export const runtime = "edge";
export const alt = "Weet wat je mediabudget doet — van mediabudget naar geschat media-effect";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Het deelbeeld is dezelfde metafoor als de site zelf: waar het budget staat, en waar het
// effect naar schatting zit. Donker vlak, één blauw accent — zoals de secties op de site.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#FFFFFF",
          color: "#0B0B0C",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: "#63636A" }}>
          media mix modeling
          <div style={{ display: "flex", width: 8, height: 8, borderRadius: 8, backgroundColor: "#8511D9" }} />
        </div>

        <div style={{ display: "flex", fontSize: 82, lineHeight: 1.02, maxWidth: 900, letterSpacing: -3, textTransform: "uppercase" as const }}>
          Weet wat je mediabudget doet.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 20, color: "#9A9AA2" }}>Waar het budget staat</div>
            <div style={{ display: "flex", height: 38, width: "100%", gap: 3 }}>
              {CHANNELS.map((channel, i) => (
                <div
                  key={channel.key}
                  style={{
                    display: "flex",
                    width: `${(channel.spend / TOTAL_BUDGET) * 100}%`,
                    backgroundColor: "#C0C0C6",
                    borderRadius: 4,
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 20, color: "#24803F" }}>
              Geschatte bijdrage aan het resultaat
            </div>
            <div style={{ display: "flex", height: 38, width: "100%", gap: 3 }}>
              {CHANNELS.map((channel, i) => (
                <div
                  key={channel.key}
                  style={{
                    display: "flex",
                    width: `${(channel.contribution / 7_700_000) * 100}%`,
                    backgroundColor: channel.contribution < channel.spend ? "#8511D9" : "#2E9E50",
                    borderRadius: 4,
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 18, color: "#9A9AA2" }}>
            Illustratief voorbeeld — geen klantdata
          </div>
        </div>
      </div>
    ),
    size,
  );
}
