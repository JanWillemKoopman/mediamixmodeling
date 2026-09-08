import { ImageResponse } from "next/og";
import { CHANNELS, EFFECT_STEPS, SPEND_STEPS } from "@/lib/site/exampleData";

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
          backgroundColor: "#080C16",
          color: "#EDF1F7",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: "#97A2B8" }}>
          media mix modeling
          <div style={{ display: "flex", width: 8, height: 8, borderRadius: 8, backgroundColor: "#1F5AFF" }} />
        </div>

        <div style={{ display: "flex", fontSize: 82, lineHeight: 1.02, maxWidth: 900, letterSpacing: -2.5 }}>
          Weet wat je mediabudget doet.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 20, color: "#6A768E" }}>Waar het budget staat</div>
            <div style={{ display: "flex", height: 38, width: "100%", gap: 3 }}>
              {CHANNELS.map((channel, i) => (
                <div
                  key={channel.key}
                  style={{
                    display: "flex",
                    width: `${channel.spendShare}%`,
                    backgroundColor: SPEND_STEPS[4 - i],
                    borderRadius: 4,
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 20, color: "#7FA6FF" }}>
              Geschatte bijdrage aan het resultaat
            </div>
            <div style={{ display: "flex", height: 38, width: "100%", gap: 3 }}>
              {CHANNELS.map((channel, i) => (
                <div
                  key={channel.key}
                  style={{
                    display: "flex",
                    width: `${channel.effectShare}%`,
                    backgroundColor: EFFECT_STEPS[i],
                    borderRadius: 4,
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 18, color: "#6A768E" }}>
            Voorbeelddata — ter illustratie
          </div>
        </div>
      </div>
    ),
    size,
  );
}
