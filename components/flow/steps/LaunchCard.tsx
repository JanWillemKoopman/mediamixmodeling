"use client";

// Stap 6 — controleren en rekenen.
//
// Eerst zien wat er berekend wordt, dan pas rekenen. Dat is de hele stap: de oude wizard
// startte een berekening van drie tot vijf minuten op een getypte "ja", zonder dat de
// gebruiker ooit op één scherm zag waar hij ja tegen zei.
//
// Tijdens het rekenen toont de kaart de zeven echte stappen van de worker, zodat een lange
// berekening te onderscheiden is van een vastgelopen container. Welke stap actief is, komt uit
// de run zelf — niet uit een timer die hoopt dat het ongeveer klopt.

import { Check, Loader2 } from "lucide-react";
import { buildIntent, describeIntent } from "@/lib/flow/beliefs";
import { RUN_STATE_SEQUENCE, type DatasetVersion, type KpiType, type RunState, type RunView } from "@/lib/types";
import type { BeliefAnswers } from "@/lib/flow/beliefs";

/** Mensentaal per werkstap. Losstaand van RUN_STATE_LABEL: dat is het bouwersjargon. */
const STAGE_LABEL: Partial<Record<RunState, string>> = {
  queued: "In de wachtrij",
  validating: "Je antwoorden controleren",
  preparing_data: "Je data klaarzetten",
  building_model: "Het model opbouwen en je verwachtingen toetsen",
  validating_model: "Toetsen of dit betrouwbaar is",
  sampling: "Rekenen",
  calculating_results: "De uitkomst samenstellen",
};

// "completed" is geen werkstap maar de uitkomst; hij hoort niet in de voortgangslijst.
const STAGES: RunState[] = RUN_STATE_SEQUENCE.filter((s) => s !== "completed");

function Progress({ run }: { run: RunView }) {
  // Een afgeronde of mislukte run staat niet in de lijst; dan is elke stap gehad.
  const current = STAGES.indexOf(run.run.state);
  const position = current === -1 ? STAGES.length : current;
  return (
    <ol className="space-y-1.5">
      {STAGES.map((stage, i) => {
        const done = position > i;
        const active = position === i;
        return (
          <li key={stage} className="flex items-center gap-2 text-xs">
            <span className="flex h-4 w-4 flex-none items-center justify-center">
              {done ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-border" />
              )}
            </span>
            <span className={active ? "font-medium text-fg" : done ? "text-fg-muted" : "text-fg-faint"}>
              {STAGE_LABEL[stage] ?? stage}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function LaunchCard({
  dataset,
  kpiType,
  answers,
  runningRun,
  failedRun,
}: {
  dataset: DatasetVersion | null;
  kpiType: KpiType;
  /** De antwoorden uit stap 5, zoals ze in het grootboek staan. */
  answers: BeliefAnswers | null;
  runningRun: RunView | null;
  failedRun: RunView | null;
}) {
  if (runningRun) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-sm font-medium text-fg">De berekening loopt.</p>
        <p className="mt-0.5 text-xs text-fg-muted">
          Je kunt deze pagina sluiten — ik onthoud waar we waren en je ziet het vanzelf als het klaar is.
        </p>
        <div className="mt-3">
          <Progress run={runningRun} />
        </div>
      </div>
    );
  }

  if (failedRun) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger-dim p-4">
        <p className="text-sm font-medium text-danger">De berekening is niet afgemaakt.</p>
        {/* error_message is al gebruikersvriendelijke tekst: de worker schrijft nooit een
            traceback in dat veld. */}
        <p className="mt-1 text-sm text-fg">
          {failedRun.run.error_message ?? "Er is gestopt zonder duidelijke reden."}
        </p>
        {failedRun.run.error_code === "PRIOR_GATE_FAILED" && (
          <p className="mt-2 text-xs text-fg-muted">
            Dit betekent dat je verwachtingen je eigen cijfers uitsluiten. Dat is een antwoord, geen
            storing: pas je antwoorden in stap 5 aan — meestal is het aandeel van marketing te hoog
            ingeschat.
          </p>
        )}
      </div>
    );
  }

  if (!dataset || !answers) {
    return (
      <p className="text-sm text-fg-muted">
        Ik mis nog iets om te kunnen rekenen. Loop de vorige stappen na.
      </p>
    );
  }

  const rows = describeIntent(buildIntent(dataset, kpiType, answers));
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <p className="text-sm font-medium text-fg">Dit ga ik berekenen</p>
      <dl className="mt-2.5 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[10rem_1fr] gap-2 text-xs">
            <dt className="text-fg-faint">{row.label}</dt>
            <dd className="text-fg">{row.value}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[10rem_1fr] gap-2 text-xs">
          <dt className="text-fg-faint">Periode</dt>
          <dd className="text-fg">
            {dataset.n_weeks ?? "?"} weken
            {dataset.window_start && ` · ${dataset.window_start} t/m ${dataset.window_end}`}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-fg-faint">
        De rekeninstellingen staan vast en zijn geen knop: onder die waarden betekent de
        betrouwbaarheidstoets niets meer.
      </p>
    </div>
  );
}
