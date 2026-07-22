"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BaselineDecomposition, FitSummary, ResponseCurve, WeeklyDecomposition } from "@/lib/types";

// Deterministic, zero-cost charts drawn straight from the numbers already in FitSummary —
// no AI call, so these always render (unlike the optional deep-analysis step below them).
// Georganiseerd langs de vier vragen van een budgetgesprek: wat gebeurde er → wat leverde
// elk kanaal op → waar kan de volgende euro heen → hoe werkt het (verdieping).
// Starbucks.nl-palet voor de grafieken: House Green als accent, koele grijzen als
// neutralen, diep bosgroen als inkt.
const ACCENT = "#00693E";
const ACCENT_SOFT = "#5FA588";
const NEUTRAL = "#97A09B";
const BASELINE_FILL = "#E4E7E5";
const INK = "#1E3932";
const SUCCESS = "#1E7A4B";
const DANGER = "#C0362C";
const GRID = "rgba(0,0,0,0.07)";
const AXIS = { fontSize: 11, fill: "#5C6660" };

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: digits });
}

// Compacte notatie voor grote assen: 12.500 → "12,5k".
function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${fmt(n / 1_000_000, 1)}M`;
  if (Math.abs(n) >= 1_000) return `${fmt(n / 1_000, 1)}k`;
  return fmt(n);
}

// Kanaal-lagen in de opbouwgrafiek: een curated, koel-getint Starbucks-palet. Bewust
// afwisselend groen ↔ accent en met flinke lichtheidsstappen tussen naburige lagen, zodat
// gestapelde vlakken duidelijk te onderscheiden blijven (i.p.v. één groene massa) terwijl
// het palet on-brand blijft. Buiten de reeks: een rustig groen-hue verloop.
const CHANNEL_PALETTE = [
  "#00693E", // house green
  "#C88A2C", // goud
  "#2E8B8B", // teal
  "#6BAF92", // salie
  "#B4633A", // klei
  "#1E3932", // diep bosgroen
  "#8A938F", // koel grijs
  "#4C5F57", // steen-groen
];
function channelColor(i: number, n: number): string {
  if (i < CHANNEL_PALETTE.length) return CHANNEL_PALETTE[i];
  const light = 34 + ((i - CHANNEL_PALETTE.length) * 30) / Math.max(1, n - 1);
  return `hsl(158, 42%, ${Math.min(70, light)}%)`;
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {hint && <p className="mb-1 text-xs text-fg-muted">{hint}</p>}
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-border pb-1.5">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-fg">{title}</p>
      <p className="text-xs text-fg-muted">{subtitle}</p>
    </div>
  );
}

function RoasTooltip({ active, payload }: { active?: boolean; payload?: { payload: Record<string, number> }[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-fg">{fmt(d.p50 as number, 2)}</p>
      <p className="text-fg-muted">
        {fmt(d.p3 as number, 2)} – {fmt(d.p97 as number, 2)}
      </p>
    </div>
  );
}

// Shared tooltip for the curve/frontier area charts: both plot { spend|budget, p50, band:
// [p3, p97] }. Reads the row straight from `payload[0].payload` — the invisible band
// Area's dataKey is a [p3, p97] tuple, and formatting that as a plain number is what
// produced the "band: NaN" row in the previous default tooltip.
function BandTooltip({
  active,
  payload,
  label,
  unitLabel,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  label?: number | string;
  unitLabel: string;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const band = d.band as [number, number];
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm">
      <p className="text-fg-muted">
        {unitLabel}: {fmt(Number(label))}
      </p>
      <p className="font-medium text-fg">{fmt(d.p50 as number)}</p>
      <p className="text-fg-muted">
        {fmt(band[0])} – {fmt(band[1])}
      </p>
    </div>
  );
}

function ReallocTooltip({ active, payload }: { active?: boolean; payload?: { payload: Record<string, number> }[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-fg">
        {fmt(d.current)} → {fmt(d.advised)}
      </p>
      <p className="text-fg-muted">advies</p>
    </div>
  );
}

function SplitTooltip({ active, payload }: { active?: boolean; payload?: { payload: Record<string, number | string> }[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const direct = d.direct as number;
  const carryover = d.carryover as number;
  const total = direct + carryover;
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-fg">totaal {fmt(total)}</p>
      <p className="text-fg-muted">direct (zelfde week): {fmt(direct)}</p>
      <p className="text-fg-muted">na-ijl (latere weken): {fmt(carryover)}</p>
      {total > 0 && <p className="mt-0.5 text-fg-faint">{fmt((direct / total) * 100)}% direct</p>}
    </div>
  );
}

// --- Blok 1: Wat gebeurde er? -------------------------------------------------------

// De euro-balans: de vier getallen die je aan de directietafel voorleest. De band op de
// marketingbijdrage is de som van de kanaal-banden — iets ruimer dan de exacte gezamenlijke
// band, dus een voorzichtige (eerlijke) weergave.
function ScoreCards({ summary, kpiMargin, marginUnit }: { summary: FitSummary; kpiMargin?: number | null; marginUnit: string }) {
  const spend = summary.channels.reduce((s, ch) => s + ch.total_spend, 0);
  const marketingP50 = summary.channels.reduce((s, ch) => s + ch.absolute_contribution.p50, 0);
  const marketingP3 = summary.channels.reduce((s, ch) => s + ch.absolute_contribution.p3, 0);
  const marketingP97 = summary.channels.reduce((s, ch) => s + ch.absolute_contribution.p97, 0);
  const totalKpi = summary.weekly ? summary.weekly.actual.reduce((s, v) => s + v, 0) : marketingP50 + summary.baseline_contribution.p50;
  const cards: { label: string; value: string; sub: string }[] = [
    {
      label: "Totaal besteed",
      value: fmt(spend),
      sub: "alle kanalen samen, hele periode",
    },
    {
      label: `Door marketing gedreven ${summary.kpi}`,
      value: fmt(marketingP50),
      sub: `waarschijnlijk tussen ${fmtShort(marketingP3)} en ${fmtShort(marketingP97)}`,
    },
    {
      label: "Rendement per bestede euro",
      value: spend > 0 ? fmt(marketingP50 / spend, 2) : "—",
      sub: "marketingbijdrage ÷ totale spend",
    },
    ...(kpiMargin != null && spend > 0
      ? [
          {
            label: "Netto rendement (ROI)",
            value: `${fmt(((marketingP50 * kpiMargin - spend) / spend) * 100)}%`,
            sub: `winst per euro, bij €${fmt(kpiMargin, 2)} marge per ${marginUnit}`,
          },
        ]
      : []),
    {
      label: "Basislijn (zonder marketing)",
      value: totalKpi > 0 ? `${fmt((summary.baseline_contribution.p50 / totalKpi) * 100)}%` : "—",
      sub: `was er ook zonder campagnes geweest`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-fg-faint">{c.label}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{c.value}</p>
          <p className="text-[11px] text-fg-muted">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// De KPI-opbouwgrafiek: de hoofdact. Basislijn onderin, kanalen als lagen erbovenop,
// de werkelijke KPI als lijn eroverheen — het hele MMM-verhaal in één beeld.
function BuildUpChart({ weekly, kpi }: { weekly: WeeklyDecomposition; kpi: string }) {
  const channelNames = Object.keys(weekly.channels_p50);
  const data = weekly.dates.map((date, i) => {
    const row: Record<string, number | string> = {
      date,
      Basislijn: Math.max(0, weekly.baseline_p50[i]),
      werkelijk: weekly.actual[i],
    };
    for (const n of channelNames) row[n] = Math.max(0, weekly.channels_p50[n][i]);
    return row;
  });
  return (
    <ChartCard
      title={`Opbouw van je ${kpi}, week voor week`}
      hint="Lichtgrijs = de basislijn (wat je ook zonder marketing had gehad); de gekleurde lagen = de bijdrage per kanaal; de donkere lijn = wat er werkelijk gebeurde."
    >
      <ResponsiveContainer width="100%" height={280} className="overflow-hidden">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} minTickGap={48} />
          <YAxis tick={AXIS} width={48} tickFormatter={fmtShort} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
            formatter={(v) => (typeof v === "number" ? fmt(v) : String(v))}
          />
          <Area dataKey="Basislijn" stackId="kpi" stroke="none" fill={BASELINE_FILL} fillOpacity={0.95} />
          {channelNames.map((n, i) => (
            // Dunne crème scheidingslijn tussen de lagen houdt de gestapelde vlakken —
            // ook meerdere groentinten — scherp van elkaar gescheiden en leesbaar.
            <Area
              key={n}
              dataKey={n}
              stackId="kpi"
              stroke="#FFFFFF"
              strokeWidth={0.75}
              fill={channelColor(i, channelNames.length)}
              fillOpacity={0.95}
            />
          ))}
          <Line dataKey="werkelijk" stroke={INK} strokeWidth={1.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BASELINE_FILL }} /> basislijn
        </span>
        {channelNames.map((n, i) => (
          <span key={n} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: channelColor(i, channelNames.length) }} /> {n}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5" style={{ background: INK }} /> werkelijk
        </span>
      </div>
    </ChartCard>
  );
}

// Mix-verschuiving in de tijd: het aandeel van elk kanaal in de totale marketingbijdrage,
// week voor week, als 100%-gestapeld vlak. Laat zien of de mix verschoof (bv. een kanaal
// dat gaandeweg dominanter of juist minder belangrijk werd) — iets wat de periode-totalen
// verbergen. Basislijn telt niet mee: dit gaat puur over de verdeling ván het marketingdeel.
function MixShiftChart({ weekly, kpi }: { weekly: WeeklyDecomposition; kpi: string }) {
  const channelNames = Object.keys(weekly.channels_p50);
  if (channelNames.length < 2) return null;
  const data = weekly.dates.map((date, i) => {
    const raw = channelNames.map((n) => Math.max(0, weekly.channels_p50[n][i]));
    const total = raw.reduce((s, v) => s + v, 0) || 1;
    const row: Record<string, number | string> = { date };
    channelNames.forEach((n, j) => (row[n] = (raw[j] / total) * 100));
    return row;
  });
  return (
    <ChartCard
      title="Verschoof je mix in de loop van de tijd?"
      hint={`Het aandeel van elk kanaal in de door marketing gedreven ${kpi}, week voor week (opgeteld 100%). Een kanaal dat breder wordt, werd belangrijker; smaller = minder belangrijk.`}
    >
      <ResponsiveContainer width="100%" height={240} className="overflow-hidden">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} stackOffset="expand">
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} minTickGap={48} />
          <YAxis tick={AXIS} width={40} tickFormatter={(v) => `${fmt(v * 100)}%`} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
            formatter={(v) => (typeof v === "number" ? `${fmt(v, 1)}%` : String(v))}
          />
          {channelNames.map((n, i) => (
            <Area
              key={n}
              dataKey={n}
              stackId="mix"
              stroke="#FFFFFF"
              strokeWidth={0.75}
              fill={channelColor(i, channelNames.length)}
              fillOpacity={0.95}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
        {channelNames.map((n, i) => (
          <span key={n} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: channelColor(i, channelNames.length) }} /> {n}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}

// Basislijn-decompositie: waar komt de "verkoop zonder marketing" vandaan? De basislijn
// wordt uitgesplitst in structureel niveau, trend, seizoen en externe factoren (controls) —
// zodat het geen black box meer is die "70% van je omzet" opslokt zonder uitleg. Componenten
// kunnen negatief zijn (bv. een seizoensdal of een negatieve controle); recharts stapelt
// negatieve waarden onder nul, wat precies de juiste lezing geeft.
const BASELINE_LABELS: Record<string, string> = {
  niveau: "Structureel niveau",
  trend: "Trend",
  seizoen: "Seizoen",
  externe_factoren: "Externe factoren",
};
const BASELINE_COLORS: Record<string, string> = {
  niveau: BASELINE_FILL,
  trend: ACCENT,
  seizoen: ACCENT_SOFT,
  externe_factoren: "#C88A2C",
};
function BaselineDecompositionChart({ decomp, kpi }: { decomp: BaselineDecomposition; kpi: string }) {
  const keys = Object.keys(decomp.components).filter((k) => decomp.components[k]?.length);
  // Alleen tonen als er méér is dan het kale niveau — anders is er niets te "ontrafelen".
  if (keys.length < 2) return null;
  const data = decomp.dates.map((date, i) => {
    const row: Record<string, number | string> = { date };
    for (const k of keys) row[BASELINE_LABELS[k] ?? k] = decomp.components[k][i];
    return row;
  });
  const controlsHint =
    decomp.control_names.length > 0
      ? ` Externe factoren = ${decomp.control_names.join(", ")}.`
      : "";
  return (
    <ChartCard
      title="Waar komt je basislijn vandaan?"
      hint={`De basislijn (verkoop zonder marketing) uitgesplitst in ${kpi} per week: structureel niveau, trend, seizoen en externe factoren. Zo zie je dat bv. een Q4-piek seizoen is, niet media.${controlsHint} Onder nul = dat deel drukte de basislijn dat moment juist omlaag.`}
    >
      <ResponsiveContainer width="100%" height={260} className="overflow-hidden">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} stackOffset="sign">
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} minTickGap={48} />
          <YAxis tick={AXIS} width={48} tickFormatter={fmtShort} />
          <ReferenceLine y={0} stroke="#4C5F57" strokeWidth={1} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
            formatter={(v) => (typeof v === "number" ? fmt(v) : String(v))}
          />
          {keys.map((k) => (
            <Bar key={k} dataKey={BASELINE_LABELS[k] ?? k} stackId="base" fill={BASELINE_COLORS[k] ?? NEUTRAL} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
        {keys.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BASELINE_COLORS[k] ?? NEUTRAL }} />{" "}
            {BASELINE_LABELS[k] ?? k}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}

// ROAS in de tijd: werd een kanaal efficiënter of juist minder efficiënt? Per week de
// bijdrage ÷ de spend, met een voortschrijdend gemiddelde (venster) om de ruis te dempen.
// Weken met verwaarloosbare spend geven een gat (geen deling door ~0). Dit is wat de
// periode-gemiddelde ROAS-balk verbergt: een dalende lijn = advertentievermoeidheid.
function rollingRatio(contrib: number[], spend: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < contrib.length; i++) {
    const lo = Math.max(0, i - window + 1);
    let c = 0;
    let s = 0;
    for (let j = lo; j <= i; j++) {
      c += contrib[j] ?? 0;
      s += spend[j] ?? 0;
    }
    out.push(s > 1e-6 && i >= window - 1 ? c / s : null);
  }
  return out;
}
function RoasOverTimeChart({ weekly }: { weekly: WeeklyDecomposition }) {
  const spendByChannel = weekly.channel_spend;
  if (!spendByChannel) return null;
  const names = Object.keys(weekly.channels_p50).filter((n) => spendByChannel[n]);
  if (names.length === 0) return null;
  const window = Math.min(4, Math.max(1, Math.floor(weekly.dates.length / 8)));
  const series = Object.fromEntries(
    names.map((n) => [n, rollingRatio(weekly.channels_p50[n], spendByChannel[n], window)]),
  );
  // Alleen kanalen met minstens één geldig punt tonen.
  const shown = names.filter((n) => series[n].some((v) => v != null));
  if (shown.length === 0) return null;
  const data = weekly.dates.map((date, i) => {
    const row: Record<string, number | string | null> = { date };
    for (const n of shown) row[n] = series[n][i];
    return row;
  });
  return (
    <ChartCard
      title="Werd elk kanaal efficiënter of minder efficiënt?"
      hint={`ROAS week voor week (bijdrage ÷ spend, ${window}-weeks voortschrijdend gemiddelde). Een dalende lijn wijst op verzadiging of advertentievermoeidheid; een stijgende op een kanaal dat beter ging renderen. Gaten = te weinig spend om te meten.`}
    >
      <ResponsiveContainer width="100%" height={240} className="overflow-hidden">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} minTickGap={48} />
          <YAxis tick={AXIS} width={44} tickFormatter={(v) => fmt(v, 1)} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
            formatter={(v, n) => [typeof v === "number" ? fmt(v, 2) : "—", String(n)]}
          />
          {shown.map((n, i) => (
            <Line
              key={n}
              dataKey={n}
              stroke={channelColor(i, shown.length)}
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
        {shown.map((n, i) => (
          <span key={n} className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5" style={{ background: channelColor(i, shown.length) }} /> {n}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}

// De waterval: van "niets doen" (basislijn) trede voor trede omhoog naar het
// modeltotaal — de statische, presentatieklare tweeling van de opbouwgrafiek.
function WaterfallChart({ summary }: { summary: FitSummary }) {
  const steps = [...summary.channels]
    .sort((a, b) => b.absolute_contribution.p50 - a.absolute_contribution.p50)
    .map((ch) => ({ name: ch.name, value: ch.absolute_contribution.p50 }));
  const baseline = summary.baseline_contribution.p50;
  let cum = baseline;
  const rows: { name: string; base: number; value: number; fill: string }[] = [
    { name: "Basislijn", base: 0, value: baseline, fill: BASELINE_FILL },
  ];
  for (const s of steps) {
    if (s.value >= 0) {
      rows.push({ name: s.name, base: cum, value: s.value, fill: ACCENT });
      cum += s.value;
    } else {
      cum += s.value;
      rows.push({ name: s.name, base: cum, value: -s.value, fill: DANGER });
    }
  }
  rows.push({ name: "Totaal (model)", base: 0, value: cum, fill: INK });

  return (
    <ChartCard
      title={`Van basislijn naar totaal — wie droeg wat bij?`}
      hint="Elke trede is de geschatte bijdrage (mediaan) over de hele periode; de laatste balk is het modeltotaal."
    >
      <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 30)} className="overflow-hidden">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickFormatter={fmtShort} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={110} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.[1]) return null;
              const d = payload[1].payload as { name: string; value: number };
              return (
                <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm">
                  <p className="font-medium text-fg">{fmt(d.value)}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="w" radius={[0, 3, 3, 0]} barSize={16}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Voorspeld vs. werkelijk: de vertrouwensmeter. Blijft de donkere lijn binnen de band,
// dan mag je de rest van het dashboard geloven.
function FitVsActualChart({ weekly, coverage }: { weekly: WeeklyDecomposition; coverage: number }) {
  const data = weekly.dates.map((date, i) => ({
    date,
    werkelijk: weekly.actual[i],
    model: weekly.expected_p50[i],
    band: [weekly.expected_p3[i], weekly.expected_p97[i]] as [number, number],
  }));
  return (
    <ChartCard
      title="Hoe goed volgt het model de werkelijkheid?"
      hint={`De donkere lijn is wat er echt gebeurde; groen is de modelverwachting met onzekerheidsband. ${fmt(coverage * 100)}% van de weken viel binnen de band — weken erbuiten zijn gespreksstof ("wat gebeurde daar?").`}
    >
      <ResponsiveContainer width="100%" height={220} className="overflow-hidden">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} minTickGap={48} />
          <YAxis tick={AXIS} width={48} tickFormatter={fmtShort} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
            formatter={(v) => (Array.isArray(v) ? `${fmt(Number(v[0]))} – ${fmt(Number(v[1]))}` : typeof v === "number" ? fmt(v) : String(v))}
          />
          <Area dataKey="band" stroke="none" fill={ACCENT} fillOpacity={0.12} name="94%-band" />
          <Line dataKey="model" stroke={ACCENT} strokeWidth={1.5} dot={false} name="model" />
          <Line dataKey="werkelijk" stroke={INK} strokeWidth={1.5} dot={false} name="werkelijk" />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// --- Blok 2: Wat leverde elk kanaal op? ---------------------------------------------

// De kernvergelijking: kosten-balk naast opbrengst-balk, per kanaal.
function SpendVsReturnChart({ summary }: { summary: FitSummary }) {
  const data = [...summary.channels]
    .sort((a, b) => b.absolute_contribution.p50 - a.absolute_contribution.p50)
    .map((ch) => ({
      name: ch.name,
      kosten: ch.total_spend,
      opbrengst: Math.max(0, ch.absolute_contribution.p50),
      errorRange: [
        Math.max(0, ch.absolute_contribution.p50 - ch.absolute_contribution.p3),
        Math.max(0, ch.absolute_contribution.p97 - ch.absolute_contribution.p50),
      ] as [number, number],
    }));
  return (
    <ChartCard
      title="Wat kostte het, wat leverde het op?"
      hint={`Per kanaal: grijs = uitgegeven, groen = geschatte opbrengst in ${summary.kpi} (met onzekerheidsstreep). Is de groene balk langer dan de grijze, dan verdiende het kanaal zichzelf terug.`}
    >
      <ResponsiveContainer width="100%" height={Math.max(140, data.length * 44)} className="overflow-hidden">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 4 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickFormatter={fmtShort} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={100} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.05)" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
            formatter={(v) => (typeof v === "number" ? fmt(v) : String(v))}
          />
          <Bar dataKey="kosten" fill={NEUTRAL} radius={[0, 3, 3, 0]} barSize={11} name="kosten" />
          <Bar dataKey="opbrengst" fill={ACCENT} radius={[0, 3, 3, 0]} barSize={11} name="opbrengst">
            <ErrorBar dataKey="errorRange" direction="x" width={3} stroke={ACCENT} strokeOpacity={0.5} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Aandeel budget vs. aandeel effect: de scheefheids-detector.
function BudgetVsEffectChart({ summary }: { summary: FitSummary }) {
  const totalSpend = summary.channels.reduce((s, ch) => s + ch.total_spend, 0);
  const totalEffect = summary.channels.reduce((s, ch) => s + Math.max(0, ch.absolute_contribution.p50), 0);
  if (totalSpend <= 0 || totalEffect <= 0) return null;
  const data = summary.channels.map((ch) => ({
    name: ch.name,
    budget: (ch.total_spend / totalSpend) * 100,
    effect: (Math.max(0, ch.absolute_contribution.p50) / totalEffect) * 100,
  }));
  return (
    <ChartCard
      title="Aandeel in het budget vs. aandeel in het effect"
      hint="Krijgt een kanaal veel budget maar levert het weinig effect (grijs langer dan groen)? Dan is dat de eerste plek om te herverdelen."
    >
      <ResponsiveContainer width="100%" height={Math.max(140, data.length * 44)} className="overflow-hidden">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 4 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickFormatter={(v) => `${fmt(v)}%`} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={100} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.05)" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
            formatter={(v) => (typeof v === "number" ? `${fmt(v, 1)}%` : String(v))}
          />
          <Bar dataKey="budget" fill={NEUTRAL} radius={[0, 3, 3, 0]} barSize={11} name="aandeel budget" />
          <Bar dataKey="effect" fill={ACCENT} radius={[0, 3, 3, 0]} barSize={11} name="aandeel effect" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex items-center gap-4 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: NEUTRAL }} /> aandeel budget
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ACCENT }} /> aandeel effect
        </span>
      </div>
    </ChartCard>
  );
}

// --- Blok 3: Waar kan de volgende euro heen? ----------------------------------------

// Marginaal rendement per kanaal: de helling van de responscurve op het huidige
// spendniveau — wat de vólgende euro doet (≠ het gemiddelde rendement tot nu toe).
function marginalPerExtra(curve: ResponseCurve, extra = 1000): number | null {
  const pts = [...curve.points].sort((a, b) => a.weekly_spend - b.weekly_spend);
  if (pts.length < 2) return null;
  const cur = curve.current_weekly_spend;
  let i = pts.findIndex((p) => p.weekly_spend >= cur);
  if (i <= 0) i = 1;
  if (i >= pts.length) i = pts.length - 1;
  const a = pts[i - 1];
  const b = pts[i];
  const dSpend = b.weekly_spend - a.weekly_spend;
  if (dSpend <= 0) return null;
  return ((b.contribution.p50 - a.contribution.p50) / dSpend) * extra;
}

function MarginalEuroChart({ summary }: { summary: FitSummary }) {
  const curves = summary.response_curves ?? [];
  const data = curves
    .map((c) => {
      const m = marginalPerExtra(c);
      return m == null ? null : { name: c.name, marginaal: m };
    })
    .filter((d): d is { name: string; marginaal: number } => d !== null)
    .sort((a, b) => b.marginaal - a.marginaal);
  if (data.length === 0) return null;
  return (
    <ChartCard
      title="Wat levert €1.000 éxtra per week op?"
      hint={`Het geschatte effect van de vólgende €1.000 per kanaal, op het huidige spendniveau (mediaan, in ${summary.kpi}). Let op: dit is iets anders dan het gemiddelde rendement — een kanaal dat tot nu toe goed scoorde kan verzadigd zijn.`}
    >
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32)} className="overflow-hidden">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickFormatter={fmtShort} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={100} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.05)" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
            formatter={(v) => (typeof v === "number" ? fmt(v) : String(v))}
          />
          <Bar dataKey="marginaal" radius={[0, 3, 3, 0]} barSize={14}>
            {data.map((d, i) => (
              <Cell key={d.name} fill={i === 0 ? ACCENT : ACCENT_SOFT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// De wat-als-schuif: kies een totaal weekbudget en lees af wat het model verwacht —
// geïnterpoleerd op de al berekende efficiency frontier (optimale verdeling per punt).
function WhatIfSlider({ summary }: { summary: FitSummary }) {
  const frontier = useMemo(
    () => [...(summary.efficiency_frontier ?? [])].sort((a, b) => a.total_weekly_budget - b.total_weekly_budget),
    [summary.efficiency_frontier],
  );
  const current = summary.optimal_allocation?.total_weekly_budget ?? null;
  const [budget, setBudget] = useState<number | null>(null);
  if (frontier.length < 2) return null;
  const min = frontier[0].total_weekly_budget;
  const max = frontier[frontier.length - 1].total_weekly_budget;
  const chosen = budget ?? current ?? (min + max) / 2;

  const interp = (pick: (f: (typeof frontier)[number]) => number): number => {
    const x = Math.min(max, Math.max(min, chosen));
    let i = frontier.findIndex((f) => f.total_weekly_budget >= x);
    if (i <= 0) return pick(frontier[0]);
    const a = frontier[i - 1];
    const b = frontier[i];
    const t = (x - a.total_weekly_budget) / (b.total_weekly_budget - a.total_weekly_budget || 1);
    return pick(a) + t * (pick(b) - pick(a));
  };
  const p50 = interp((f) => f.predicted_contribution.p50);
  const p3 = interp((f) => f.predicted_contribution.p3);
  const p97 = interp((f) => f.predicted_contribution.p97);

  return (
    <ChartCard
      title="Wat als je het weekbudget verandert?"
      hint="Schuif en lees af wat het model verwacht bij dat totaalbudget (optimaal verdeeld over de kanalen). Buiten het historische bereik wordt niet geëxtrapoleerd."
    >
      <div className="rounded-lg border border-border bg-surface-2/60 p-3">
        <input
          type="range"
          min={min}
          max={max}
          step={(max - min) / 100 || 1}
          value={chosen}
          onChange={(e) => setBudget(Number(e.target.value))}
          className="w-full accent-[#00693E]"
          aria-label="Totaal weekbudget"
        />
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-sm text-fg">
            Weekbudget <span className="font-semibold tabular-nums">{fmt(chosen)}</span>
            {current != null && (
              <span className="text-xs text-fg-muted"> (nu: {fmt(current)})</span>
            )}
          </p>
          <p className="text-sm text-fg">
            Verwachte marketingbijdrage <span className="font-semibold tabular-nums">{fmt(p50)}</span>{" "}
            <span className="text-xs text-fg-muted">
              ({fmtShort(p3)} – {fmtShort(p97)}) {summary.kpi} per week
            </span>
          </p>
        </div>
      </div>
    </ChartCard>
  );
}

// --- Blok 4: Hoe werkt het? (verdieping) --------------------------------------------

// Na-ijlcurves: hoe lang elk kanaal doorwerkt na de uitgave, uit de geschatte
// halfwaardetijd (mediaan). Didactisch klein grid — geen beslisgrafiek.
function AdstockDecayGrid({ summary }: { summary: FitSummary }) {
  const weeksShown = 10;
  const grids = summary.channels.map((ch) => {
    const hl = Math.max(0.1, ch.adstock_half_life_weeks.p50);
    const alpha = Math.pow(0.5, 1 / hl);
    const raw = Array.from({ length: weeksShown }, (_, l) => Math.pow(alpha, l));
    const sum = raw.reduce((s, v) => s + v, 0);
    return {
      name: ch.name,
      hl,
      data: raw.map((v, l) => ({ week: l, effect: (v / sum) * 100 })),
    };
  });
  return (
    <ChartCard
      title="Hoe lang werkt elk kanaal door?"
      hint="Het geschatte effectverloop na één week uitgeven (week 0 = de week zelf). Een lange staart betekent: niet afrekenen op de week zelf."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {grids.map((g) => (
          <div key={g.name}>
            <p className="mb-1 text-xs font-medium text-fg">
              {g.name} <span className="font-normal text-fg-muted">— halfwaardetijd ~{fmt(g.hl, 1)} wk</span>
            </p>
            <ResponsiveContainer width="100%" height={100} className="overflow-hidden">
              <BarChart data={g.data} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="week" tick={AXIS} tickFormatter={(v) => `${v}`} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
                  formatter={(v) => (typeof v === "number" ? `${fmt(v, 1)}% van het effect` : String(v))}
                  labelFormatter={(l) => `week +${l}`}
                />
                <Bar dataKey="effect" fill={ACCENT_SOFT} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

// --- Samenstelling ------------------------------------------------------------------

export function ResultsCharts({
  summary,
  kpiMargin,
  isCountKpi,
}: {
  summary: FitSummary;
  kpiMargin?: number | null;
  // Telling-KPI (orders/leads) vs. continue KPI (omzet) — bepaalt of de marge "per
  // verkochte eenheid" of "per euro omzet" heet. Onbekend (oudere runs) = neutrale tekst.
  isCountKpi?: boolean;
}) {
  const marginUnit = isCountKpi === true ? `verkochte ${summary.kpi}` : isCountKpi === false ? `euro ${summary.kpi}` : `verkochte ${summary.kpi}-eenheid`;
  // Direct vs na-ijl: alleen voor runs die de splitsing al meekregen uit de rekenkern.
  const splitData = summary.channels
    .filter((ch) => ch.direct_contribution && ch.carryover_contribution)
    .map((ch) => ({
      name: ch.name,
      direct: Math.max(0, ch.direct_contribution!.p50),
      carryover: Math.max(0, ch.carryover_contribution!.p50),
    }));

  const roasData = summary.channels.map((ch) => ({
    name: ch.name,
    p50: ch.roas.p50,
    errorRange: [ch.roas.p50 - ch.roas.p3, ch.roas.p97 - ch.roas.p50] as [number, number],
    p3: ch.roas.p3,
    p97: ch.roas.p97,
  }));

  const rowHeight = 32;
  const roasHeight = Math.max(120, roasData.length * rowHeight);
  // Met marge is break-even geen ROAS 1,0 maar 1/marge (elke euro omzet is maar
  // deels winst); zonder marge houden we de klassieke omzet-break-even van 1,0 aan.
  const breakEven = kpiMargin != null && kpiMargin > 0 ? 1 / kpiMargin : 1;

  const curves = summary.response_curves ?? [];
  const frontier = summary.efficiency_frontier;
  const allocation = summary.optimal_allocation;

  const reallocData =
    allocation && curves.length > 0
      ? curves
          .map((c) => {
            const advised = allocation.per_channel[c.name];
            if (advised == null) return null;
            return { name: c.name, delta: advised - c.current_weekly_spend, current: c.current_weekly_spend, advised };
          })
          .filter((d): d is { name: string; delta: number; current: number; advised: number } => d !== null)
      : [];
  const reallocHeight = Math.max(120, reallocData.length * rowHeight);

  return (
    <div className="space-y-6">
      {/* ---- Blok 1: Wat gebeurde er? ---- */}
      <SectionHeader title="Wat gebeurde er?" subtitle="Het totaalbeeld: waar je omzet vandaan kwam en of het model de werkelijkheid volgt." />
      <ScoreCards summary={summary} kpiMargin={kpiMargin} marginUnit={marginUnit} />
      {summary.weekly && <BuildUpChart weekly={summary.weekly} kpi={summary.kpi} />}
      {summary.baseline_decomposition && (
        <BaselineDecompositionChart decomp={summary.baseline_decomposition} kpi={summary.kpi} />
      )}
      {summary.weekly && <MixShiftChart weekly={summary.weekly} kpi={summary.kpi} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <WaterfallChart summary={summary} />
        {summary.weekly && (
          <FitVsActualChart weekly={summary.weekly} coverage={summary.diagnostics.interval_coverage_94} />
        )}
      </div>

      {/* ---- Blok 2: Wat leverde elk kanaal op? ---- */}
      <SectionHeader title="Wat leverde elk kanaal op?" subtitle="De afrekening per kanaal — altijd met eerlijke onzekerheidsmarge." />
      <div className="grid gap-6 lg:grid-cols-2">
        <SpendVsReturnChart summary={summary} />
        <ChartCard
          title="Rendement per kanaal (ROAS)"
          hint={
            kpiMargin != null
              ? `Rechts van de stippellijn verdient een kanaal zichzelf écht terug: bij €${fmt(kpiMargin, 2)} marge per ${marginUnit} ligt break-even bij ROAS ${fmt(1 / kpiMargin, 2)}. Groen = vrijwel zeker winstgevend; grijs = nog niet te zeggen; rood = vrijwel zeker verliesgevend.`
              : "Rechts van de stippellijn (1,0) levert een kanaal meer op dan het kost. Let op: échte winstgevendheid hangt van je marge af — vul bij stap 3 de gemiddelde marge per verkocht product in voor de eerlijke break-evenlijn. Groen = vrijwel zeker boven break-even; grijs = nog niet te zeggen; rood = vrijwel zeker eronder."
          }
        >
          <ResponsiveContainer width="100%" height={roasHeight} className="overflow-hidden">
            <BarChart data={roasData} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS} />
              <YAxis type="category" dataKey="name" tick={AXIS} width={100} />
              <Tooltip content={<RoasTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
              <ReferenceLine x={breakEven} stroke="#4C5F57" strokeDasharray="4 4" label={{ value: "break-even", position: "top", fontSize: 10, fill: "#4C5F57" }} />
              <Bar dataKey="p50" radius={[0, 3, 3, 0]} barSize={14}>
                {roasData.map((d) => (
                  <Cell key={d.name} fill={d.p3 >= breakEven ? SUCCESS : d.p97 <= breakEven ? DANGER : NEUTRAL} />
                ))}
                <ErrorBar dataKey="errorRange" direction="x" width={3} stroke={INK} strokeOpacity={0.35} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <BudgetVsEffectChart summary={summary} />
        {splitData.length > 0 && (
          <ChartCard
            title="Direct effect vs. na-ijl per kanaal"
            hint="Donkergroen = opbrengst in dezelfde week als de uitgave (“zag de advertentie, kocht meteen”); lichtgroen = doorwerking in latere weken (“zag de advertentie, kocht later”)."
          >
            <ResponsiveContainer width="100%" height={Math.max(120, splitData.length * 32)} className="overflow-hidden">
              <BarChart data={splitData} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS} tickFormatter={fmtShort} />
                <YAxis type="category" dataKey="name" tick={AXIS} width={100} />
                <Tooltip content={<SplitTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                <Bar dataKey="direct" stackId="split" fill={ACCENT} barSize={14} name="Direct" />
                <Bar dataKey="carryover" stackId="split" fill={ACCENT_SOFT} radius={[0, 3, 3, 0]} barSize={14} name="Na-ijl" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-1 flex items-center gap-4 text-[11px] text-fg-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ACCENT }} /> direct (zelfde week)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ACCENT_SOFT }} /> na-ijl (latere weken)
              </span>
            </div>
          </ChartCard>
        )}
      </div>
      {summary.weekly && <RoasOverTimeChart weekly={summary.weekly} />}

      {/* ---- Blok 3: Waar kan de volgende euro heen? ---- */}
      {(curves.length > 0 || (frontier && frontier.length > 1) || reallocData.length > 0) && (
        <SectionHeader title="Waar kan de volgende euro het beste heen?" subtitle="Van terugkijken naar vooruit sturen: verzadiging, marginaal rendement en het herverdelingsadvies." />
      )}
      <MarginalEuroChart summary={summary} />

      {curves.length > 0 && (
        <div>
          <p className="text-sm font-medium text-fg">Verzadiging per kanaal</p>
          <p className="mb-2 text-xs text-fg-muted">
            Opbrengst bij toenemende weekspend; de stippellijn is waar je nú zit. Op het vlakke deel levert extra geld weinig meer op.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {curves.map((curve) => {
              const data = curve.points.map((p) => ({
                spend: p.weekly_spend,
                p50: p.contribution.p50,
                band: [p.contribution.p3, p.contribution.p97],
              }));
              return (
                <div key={curve.name}>
                  <p className="mb-1 text-xs font-medium text-fg">{curve.name}</p>
                  <ResponsiveContainer width="100%" height={160} className="overflow-hidden">
                    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="spend" tick={AXIS} tickFormatter={(v) => fmt(v)} />
                      <YAxis tick={AXIS} width={44} tickFormatter={(v) => fmt(v)} />
                      <Tooltip content={<BandTooltip unitLabel="Spend" />} />
                      <Area dataKey="band" stroke="none" fill={ACCENT} fillOpacity={0.12} />
                      <Line type="monotone" dataKey="p50" stroke={ACCENT} strokeWidth={2} dot={false} />
                      <ReferenceLine
                        x={curve.current_weekly_spend}
                        stroke="#4C5F57"
                        strokeDasharray="4 4"
                        label={{ value: "nu", position: "top", fontSize: 10, fill: "#4C5F57" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {frontier && frontier.length > 1 && (
        <ChartCard title="Totaalbudget vs. verwachte opbrengst" hint="Waar de curve afvlakt, koopt extra totaalbudget steeds minder resultaat.">
          <ResponsiveContainer width="100%" height={200} className="overflow-hidden">
            <AreaChart
              data={[...frontier].sort((a, b) => a.total_weekly_budget - b.total_weekly_budget).map((f) => ({
                budget: f.total_weekly_budget,
                p50: f.predicted_contribution.p50,
                band: [f.predicted_contribution.p3, f.predicted_contribution.p97],
              }))}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="budget" tick={AXIS} tickFormatter={(v) => fmt(v)} />
              <YAxis tick={AXIS} width={48} tickFormatter={(v) => fmt(v)} />
              <Tooltip content={<BandTooltip unitLabel="Budget" />} />
              <Area dataKey="band" stroke="none" fill={ACCENT} fillOpacity={0.12} />
              <Line type="monotone" dataKey="p50" stroke={ACCENT} strokeWidth={2} dot={false} />
              {allocation && (
                <ReferenceLine
                  x={allocation.total_weekly_budget}
                  stroke="#4C5F57"
                  strokeDasharray="4 4"
                  label={{ value: "nu", position: "top", fontSize: 10, fill: "#4C5F57" }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <WhatIfSlider summary={summary} />

      {reallocData.length > 0 && (
        <ChartCard title="Budgetherverdeling" hint="Advies t.o.v. huidige spend per week — groen = meer, grijs = minder">
          <ResponsiveContainer width="100%" height={reallocHeight} className="overflow-hidden">
            <BarChart data={reallocData} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS} tickFormatter={(v) => fmt(v)} />
              <YAxis type="category" dataKey="name" tick={AXIS} width={100} />
              <Tooltip content={<ReallocTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
              <Bar dataKey="delta" radius={[0, 3, 3, 0]} barSize={14}>
                {reallocData.map((d) => (
                  <Cell key={d.name} fill={d.delta >= 0 ? ACCENT : NEUTRAL} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ---- Blok 4: Hoe werkt het? ---- */}
      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-fg">
          Hoe werkt het? <span className="font-normal text-fg-muted">— verdieping voor wie het naadje wil weten</span>
        </summary>
        <div className="mt-4">
          <AdstockDecayGrid summary={summary} />
        </div>
      </details>
    </div>
  );
}
