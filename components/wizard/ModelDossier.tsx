"use client";

// Het read-only "model-dossier" rechts: een levende spiegel van alles wat het model tot nu
// toe WEET. Puur een render van bestaande DB-staat (bronnen, dataset, config, context) —
// kost geen tokens. Hier gebeurt geen bewerking; dat loopt allemaal via de chat links.
//
// Het paneel krijgt de hele projectmomentopname binnen in plaats van tien losse props: run,
// resultaat en oordeel horen bij elkaar, en dit paneel mag een resultaat nooit tonen zonder
// het oordeel dat erbij hoort.

import { Check, Circle, Dot } from "lucide-react";
import { useWizardChatOptional } from "@/components/WizardChatContext";
import {
  RUN_STATE_LABEL,
  VALIDATION_LEVEL_LABEL,
  type ColumnRole,
  type DatasetStatus,
  type ProjectSnapshot,
} from "@/lib/types";
import type { WizardPhase } from "@/lib/wizard/phase";
import { PHASE_STEPS, stepIndexForPhase } from "@/lib/wizard/script";

const ROLE_LABEL: Record<ColumnRole, string> = {
  kpi: "KPI",
  spend: "Kanaal",
  control: "Control",
};

const DATASET_STATUS_LABEL: Record<DatasetStatus, string> = {
  queued: "in de wachtrij",
  building: "wordt samengevoegd",
  ready: "klaar voor beoordeling",
  failed: "mislukt",
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

export function ModelDossier({ phase, snapshot }: { phase: WizardPhase; snapshot: ProjectSnapshot }) {
  const activeStep = stepIndexForPhase(phase);
  const chat = useWizardChatOptional(); // null op het klant-dashboard, waar dit paneel niet gerenderd wordt
  const { project, context } = snapshot;
  const source = snapshot.sources[0] ?? null;
  const dataset = snapshot.dataset;
  const roles = dataset?.column_roles ?? null;
  const byRole = (r: ColumnRole) => (roles ? Object.entries(roles).filter(([, v]) => v === r).map(([k]) => k) : []);
  const kpi = byRole("kpi")[0] ?? null;
  const channels = byRole("spend");
  const controls = byRole("control");
  const recipe = dataset?.recipe ?? null;
  const events = recipe?.event_dummies ?? [];
  const features = recipe?.features ?? [];
  const industry = context?.industry ?? null;
  const companyDescription = context?.description ?? null;
  const businessNotes = context?.notes ?? [];
  const latest = snapshot.runs[0] ?? null;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg">{project.name}</h2>
        {project.client_company && <p className="text-xs text-fg-muted">{project.client_company}</p>}
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

      {/* Dataset — venster + status. "Goedgekeurd" is geen status maar een datum: alleen een
          goedgekeurde versie mag gemodelleerd worden, dus die staat er los bij. */}
      {dataset && (
        <Section title={`Dataset (v${dataset.version_no})`}>
          {dataset.window_start && dataset.window_end && (
            <p className="text-xs text-fg-muted">
              {dataset.n_weeks ?? "?"} weken · {dataset.window_start} t/m {dataset.window_end}
            </p>
          )}
          <p className="text-[11px] text-fg-faint">
            Status: {dataset.approved_at ? "goedgekeurd" : DATASET_STATUS_LABEL[dataset.status]}
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
                    {dataset?.column_units?.[c] ? (
                      <span className="text-fg-faint"> · {dataset.column_units[c]}</span>
                    ) : null}
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
              {n.source === "ai_inferred" ? <span className="text-fg-faint"> · afgeleid</span> : null}
            </p>
          ))}
        </Section>
      )}

      {/* Laatste berekening — altijd mét het oordeel erbij. Een datum zonder oordeel zou
          suggereren dat er een bruikbaar resultaat ligt; dat is precies wat we niet willen. */}
      {latest && (
        <Section title="Laatste berekening">
          <p className="text-xs text-fg-muted">
            {new Date(latest.run.created_at).toLocaleDateString("nl-NL")}
            {latest.result?.is_published ? " · gepubliceerd" : ""}
          </p>
          <p className="text-[11px] text-fg-faint">
            {latest.validation
              ? VALIDATION_LEVEL_LABEL[latest.validation.level]
              : RUN_STATE_LABEL[latest.run.state]}
          </p>
        </Section>
      )}
    </div>
  );
}
