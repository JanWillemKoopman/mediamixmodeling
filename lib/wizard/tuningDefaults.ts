import type { ChannelConfig, ColumnRole, Dataset, JobConfig } from "@/lib/types";

// Geteste standaardwaarden voor de rekeninstellingen — voor vrijwel iedereen prima; alleen
// aan te passen door het expliciet te vragen in de tuning-fase.
export const STANDARD_SAMPLE = { draws: 1000, tune: 1000, chains: 4 };

// Bouwt een minimale modelconfiguratie puur uit de bevestigde kolomrollen van de
// goedgekeurde dataset — het vertrekpunt voor zowel de "gebruik de aanbevolen
// instellingen"-flow (aangevuld door de architect) als de proefdraai.
export function templateConfigFromDataset(dataset: Dataset): JobConfig {
  const roles = dataset.column_roles ?? {};
  const byRole = (role: ColumnRole) => Object.entries(roles).filter(([, r]) => r === role).map(([name]) => name);
  const kpi = byRole("kpi")[0] ?? "";
  return {
    sources: [
      {
        name: "master",
        storage_path: dataset.master_path ?? "",
        date_column: "week_start",
        columns: Object.entries(roles).map(([name, role]) => ({ name, role: role as ColumnRole })),
      },
    ],
    model: {
      kpi,
      channels: byRole("spend").map((name) => ({ name, channel_type: "generic" }) as ChannelConfig),
      control_columns: byRole("control"),
      add_trend: true,
      seasonality_periods: 52,
      n_fourier_modes: 2,
    },
    sample: STANDARD_SAMPLE,
  };
}
