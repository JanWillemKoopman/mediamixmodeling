"use client";

// Het read-only "model-dossier" rechts: een levende spiegel van alles wat het model tot nu
// toe WEET. Puur een render van bestaande DB-staat (bronnen, dataset, config, context) —
// kost geen tokens. Hier gebeurt geen bewerking; dat loopt allemaal via de chat links.

import { Check, Circle, Dot } from "lucide-react";
import { useWizardChatOptional } from "@/components/WizardChatContext";
import type {
  BusinessContextNote,
  ColumnRole,
  Dataset,
  Job,
  ModelRun,
  SourceFile,
} from "@/lib/types";
import type { WizardPhase } from "@/lib/wizard/phase";
import { PHASE_STEPS, stepIndexForPhase } from "@/lib/wizard/script";

const ROLE_LABEL: Record<ColumnRole, string> = {
  kpi: "KPI",
  spend: "Kanaal",
  control: "Control",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">{title}</h3>
      {children}
    </div>
  );
}

function RolePill({ role }: { role: ColumnRole }) {
  const cls: Record<ColumnRole, string> = {
    kpi: "bg-accent-dim text-accent",
    spend: "bg-surface-3 text-fg",
    control: "bg-surface-2 text-fg-muted",
  };
  return <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${cls[role]}`}>{ROLE_LABEL[role]}</span>;
}

export function ModelDossier({
  phase,
  projectName,
  clientCompany,
  sources,
  dataset,
  jobs,
  runs,
  industry,
  businessNotes,
  companyDescription,
}: {
  phase: WizardPhase;
  projectName: string;
  clientCompany: string | null;
  sources: SourceFile[];
  dataset: Dataset | null;
  jobs: Job[];
  runs: ModelRun[];
  industry: string | null;
  businessNotes: BusinessContextNote[];
  companyDescription: string | null;
}) {
  const activeStep = stepIndexForPhase(phase);
  const chat = useWizardChatOptional(); // null op het klant-dashboard, waar dit paneel niet gerenderd wordt
  const source = sources[0] ?? null;
  const roles = dataset?.column_roles ?? null;
  const byRole = (r: ColumnRole) => (roles ? Object.entries(roles).filter(([, v]) => v === r).map(([k]) => k) : []);
  const kpi = byRole("kpi")[0] ?? null;
  const channels = byRole("spend");
  const controls = byRole("control");
  const recipe = dataset?.recipe ?? null;
  const events = recipe?.event_dummies ?? [];
  const features = recipe?.features ?? [];
  const latestRun = runs[0] ?? null;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg">{projectName}</h2>
        {clientCompany && <p className="text-xs text-fg-muted">{clientCompany}</p>}
      </div>

      {/* Voortgang — welke stap ben je? Een afgeronde stap met een backTarget is klikbaar:
          dat opent 'm opnieuw in de chat (terugkoppeling/iteratie), zonder de rest van de
          voortgang hier te wissen — dit paneel blijft altijd de WERKELIJKE stand tonen. */}
      <Section title="Voortgang">
        <ol className="space-y-1">
          {PHASE_STEPS.map((step, i) => {
            const done = i < activeStep;
            const active = i === activeStep;
            const clickable = done && step.backTarget != null && chat != null;
            const content = (
              <>
                {done ? (
                  <Check className="h-3.5 w-3.5 flex-none text-accent" />
                ) : active ? (
                  <Dot className="h-3.5 w-3.5 flex-none text-accent" />
                ) : (
                  <Circle className="h-3 w-3 flex-none text-fg-faint" />
                )}
                <span className={done ? "text-fg-muted" : active ? "font-medium text-fg" : "text-fg-faint"}>
                  {step.label}
                </span>
              </>
            );
            return (
              <li key={step.label} className="text-xs">
                {clickable ? (
                  <button
                    onClick={() => chat!.goToPhase(step.backTarget!, `vanuit "${PHASE_STEPS[activeStep]?.label}"`)}
                    className="flex w-full items-center gap-2 rounded px-0.5 py-0.5 text-left transition hover:bg-surface-2"
                    title={`Terug naar: ${step.label}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      </Section>

      {/* Databestand */}
      <Section title="Databestand">
        {source ? (
          <p className="truncate text-xs text-fg" title={source.name}>
            {source.name}
          </p>
        ) : (
          <p className="text-xs text-fg-faint">Nog geen bestand geüpload</p>
        )}
      </Section>

      {/* Dataset — venster + kolomrollen */}
      {dataset && (
        <Section title="Dataset">
          {dataset.window_start && dataset.window_end && (
            <p className="text-xs text-fg-muted">
              {dataset.n_weeks ?? "?"} weken · {dataset.window_start} t/m {dataset.window_end}
            </p>
          )}
          <p className="text-[11px] text-fg-faint">
            Status: {dataset.status === "approved" ? "goedgekeurd" : dataset.status}
          </p>
        </Section>
      )}

      {roles && (
        <>
          {kpi && (
            <Section title="KPI">
              <div className="flex items-center gap-1.5">
                <RolePill role="kpi" />
                <span className="text-xs text-fg">{kpi}</span>
              </div>
            </Section>
          )}
          {channels.length > 0 && (
            <Section title={`Kanalen (${channels.length})`}>
              <ul className="space-y-0.5">
                {channels.map((c) => (
                  <li key={c} className="text-xs text-fg">
                    {c}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {controls.length > 0 && (
            <Section title={`Controls (${controls.length})`}>
              <ul className="space-y-0.5">
                {controls.map((c) => (
                  <li key={c} className="text-xs text-fg-muted">
                    {c}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      {(events.length > 0 || features.length > 0) && (
        <Section title="Afgeleide kennis">
          {events.map((e) => (
            <p key={e.name} className="text-xs text-fg-muted">
              Event: {e.name}
            </p>
          ))}
          {features.map((f) => (
            <p key={f.name} className="text-xs text-fg-muted">
              Feature: {f.name} ({f.op})
            </p>
          ))}
        </Section>
      )}

      {/* Zakelijke context — de "opgeslagen kennis" */}
      {(industry || companyDescription || businessNotes.length > 0) && (
        <Section title="Zakelijke context">
          {industry && <p className="text-xs text-fg-muted">Branche: {industry}</p>}
          {companyDescription && <p className="text-xs text-fg-muted line-clamp-4">{companyDescription}</p>}
          {businessNotes.map((n, i) => (
            <p key={i} className="text-xs text-fg-muted">
              • {n.fact}
              {n.relates_to ? ` (${n.relates_to})` : ""}
            </p>
          ))}
        </Section>
      )}

      {/* Laatste resultaat */}
      {latestRun && (
        <Section title="Laatste resultaat">
          <p className="text-xs text-fg-muted">
            {new Date(latestRun.created_at).toLocaleDateString("nl-NL")}
            {latestRun.is_published ? " · gepubliceerd" : ""}
          </p>
        </Section>
      )}
    </div>
  );
}
