// Recharts' built-in <Tooltip> gets its colors via inline styles (Tailwind classes don't
// reach that DOM), so the app's surface/border/fg tokens are mirrored here for the simpler
// charts. Charts with a custom `content` component (ShareTooltip/RoasTooltip in
// ResultsCharts.tsx) style themselves with Tailwind tokens directly.
export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#FFFFFF",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 10,
    boxShadow: "none",
    fontSize: 12,
    color: "#182420",
  },
  labelStyle: { color: "#5C6660", marginBottom: 2 },
  itemStyle: { color: "#182420" },
} as const;

// Backwards-compat alias (oude naam uit het donkere thema).
export const DARK_TOOLTIP_STYLE = CHART_TOOLTIP_STYLE;
