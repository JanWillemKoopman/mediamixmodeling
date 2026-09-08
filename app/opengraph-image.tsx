import { ImageResponse } from "next/og";
import { CHANNELS, EFFECT_STEPS, SPEND_STEPS } from "@/lib/site/exampleData";

export const runtime = "edge";
export const alt = "Weet wat je mediabudget doet — van mediabudget naar geschat media-effect";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Het deelbeeld is dezelfde metafoor als de pagina zelf: twee balken, waar je geld staat en
// waar het effect naar schatting zit.
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
          backgroundColor: "#111A2B",
          color: "#F4F2EE",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", fontSize: 26, color: "#AEB9CC" }}>media mix modeling</div>

        <div style={{ display: "flex", fontSize: 76, lineHeight: 1.05, maxWidth: 900 }}>
          Weet wat je mediabudget doet.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 22, color: "#AEB9CC" }}>Waar je geld staat</div>
          <div style={{ display: "flex", height: 44, width: "100%" }}>
            {CHANNELS.map((channel, i) => (
              <div
                key={channel.key}
                style={{
                  width: `${channel.spendShare}%`,
                  backgroundColor: SPEND_STEPS[i],
                  borderRight: "3px solid #111A2B",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", height: 44, width: "100%" }}>
            {CHANNELS.map((channel, i) => (
              <div
                key={channel.key}
                style={{
                  width: `${channel.effectShare}%`,
                  backgroundColor: EFFECT_STEPS[i],
                  borderRight: "3px solid #111A2B",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#8FB8F2" }}>
            Waar het effect naar schatting zit
          </div>
        </div>
      </div>
    ),
    size,
  );
}
