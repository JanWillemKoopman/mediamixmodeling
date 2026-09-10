"use client";

// Stap 4 — data klaarmaken.
//
// Twee gezichten, afhankelijk van waar de dataset staat:
//   * nog niets gebouwd → de opvallende dingen uit het profiel, elk als vraag met keuzes;
//   * gebouwd → het kwaliteitsrapport en een voorbeeld van de weektabel.
//
// De keuzes zijn geen instellingen. "Speelde daar iets bijzonders?" is een vraag die een
// marketeer kan beantwoorden; "event_dummy op ISO-week 48" is dat niet. De vertaling van de
// een naar de ander gebeurt in lib/flow/recipe.ts, en alleen naar iets wat de rekenkern ook
// echt kent.
//
// Wat een vraag beantwoordbaar maakt, is niet de vraag maar wat eronder staat. Een gebruiker
// kent zijn eigen weken niet uit zijn hoofd: "2026-11-23 springt eruit: 28.298" is voor hem
// een bewering, geen waarneming. Daarom draagt elke vraag zijn bewijsmateriaal mee — de hele
// reeks met de betreffende weken gemarkeerd, een paar feiten (wat is normaal, wat deden de
// buurweken, wat stond er een jaar eerder), en de weektabel eromheen. En bij "er speelde iets
// bijzonders" kan hij zeggen wát er speelde; anders overleeft de reden nergens.

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, ChevronDown, Info, MessageCircleQuestion, X } from "lucide-react";
import { DatasetPreviewTable } from "@/components/DatasetPreviewTable";
import { humanizeQualityMessage } from "@/lib/humanizeMessage";
import { issueInfo } from "@/lib/qualityIssueRegistry";
import { analyseProfile, formatValue, type DataFinding } from "@/lib/flow/dataCheck";
import { backfillProfileSeries, needsSeriesBackfill } from "@/lib/flow/profileBackfill";
import type { DatasetVersion, QualityIssue, SourceFile } from "@/lib/types";
import { FindingChart } from "@/components/flow/steps/FindingChart";

/**
 * Weken die de gebruiker zelf aanwijst als bijzonder.
 *
 * De uitschieter-vragen hierboven komen uit de detectie, en die ziet alleen weken die
 * afwijken van hun buren. Een actie die elk jaar op hetzelfde moment terugkeert valt daar
 * per definitie buiten: vier Black Fridays op rij zijn onderling normaal. Wie weet dat ze er
 * waren, moet ze hier kwijt kunnen — anders schrijft het model die pieken toe aan de media
 * die in diezelfde weken omhoog ging.
 */
function EventWeeks({
  weeks,
  onChange,
  busy,
}: {
  weeks: { date: string; note: string }[];
  onChange: (next: { date: string; note: string }[]) => void;
  busy: boolean;
}) {
  const update = (i: number, patch: Partial<{ date: string; note: string }>) =>
    onChange(weeks.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3.5">
      <p className="text-sm font-medium text-fg">Weken die je zelf kent</p>
      <p className="mt-0.5 text-xs text-fg-muted">
        Acties, storingen of feestdagen die elk jaar terugkomen vallen niet op als uitschieter,
        want alle jaren lijken op elkaar. Noem ze hier, dan schrijft het model die pieken niet
        toe aan de media die in diezelfde week omhoog ging.
      </p>

      {weeks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {weeks.map((week, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                id={`event-week-date-${i}`}
                type="date"
                value={week.date}
                disabled={busy}
                onChange={(e) => update(i, { date: e.target.value })}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
              />
              <input
                id={`event-week-note-${i}`}
                type="text"
                value={week.note}
                disabled={busy}
                maxLength={120}
                placeholder="Wat speelde er? (bv. Black Friday)"
                onChange={(e) => update(i, { note: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={busy}
                aria-label={`Week ${week.date || i + 1} weghalen`}
                onClick={() => onChange(weeks.filter((_, j) => j !== i))}
                className="rounded-lg p-1.5 text-fg-faint hover:bg-surface-3 hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={busy || weeks.length >= 24}
        onClick={() => onChange([...weeks, { date: "", note: "" }])}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        {weeks.length === 0 ? "Een bijzondere week doorgeven" : "Nog een week"}
      </button>
    </div>
  );
}

function QualityReport({ dataset }: { dataset: DatasetVersion }) {
  const issues = dataset.suitability?.issues ?? [];
  const bySeverity = (severity: QualityIssue["severity"]) => issues.filter((i) => i.severity === severity);
  const errors = bySeverity("error");
  const warnings = bySeverity("warning");
  const infos = bySeverity("info");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-sm font-medium text-fg">
          {dataset.n_weeks ?? "?"} weken klaargezet
          {dataset.window_start && ` · ${dataset.window_start} t/m ${dataset.window_end}`}
        </p>
        {issues.length === 0 ? (
          <p className="mt-1.5 text-xs text-fg-muted">Geen bijzonderheden gevonden.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {[...errors, ...warnings].map((issue, i) => {
              const info = issueInfo(issue.code);
              return (
                <li key={i} className="text-xs">
                  <span className={issue.severity === "error" ? "text-danger" : "text-warn"}>
                    {humanizeQualityMessage(issue.message)}
                  </span>
                  {info && <span className="text-fg-faint"> — {info.explain}</span>}
                </li>
              );
            })}
            {infos.length > 0 && (
              <li className="text-xs text-fg-faint">
                {infos.length} kleinere melding{infos.length === 1 ? "" : "en"}:{" "}
                {infos.map((i) => humanizeQualityMessage(i.message)).join("; ")}.
              </li>
            )}
          </ul>
        )}
      </div>
      {dataset.preview && <DatasetPreviewTable preview={dataset.preview} />}
    </div>
  );
}

/** De weken waar het om gaat, met hun buren — zodat "die twee weken" na te kijken is. */
function WeekTable({ finding }: { finding: DataFinding }) {
  const evidence = finding.evidence;
  if (!evidence || evidence.rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px] tnum">
        <thead>
          <tr className="text-fg-faint">
            <th className="py-1 pr-3 font-medium">Week</th>
            {evidence.series.map((s) => (
              <th key={s.name} className="py-1 pr-3 font-medium">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {evidence.rows.map((row) => (
            <tr
              key={row.label}
              className={row.highlight ? "font-medium text-fg" : "text-fg-muted"}
            >
              <td className="py-0.5 pr-3">
                {row.label}
                {row.highlight && <span className="ml-1 text-fg-faint">←</span>}
              </td>
              {row.values.map((value, i) => (
                <td key={i} className="py-0.5 pr-3">
                  {value == null ? <span className="text-warn">leeg</span> : formatValue(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Eén vraag, met alles wat nodig is om hem te kunnen beantwoorden. */
function FindingCard({
  finding,
  index,
  total,
  choice,
  note,
  onChoose,
  onNote,
  onAsk,
  busy,
}: {
  finding: DataFinding;
  index: number;
  total: number;
  choice: string;
  note: string;
  onChoose: (choiceId: string) => void;
  onNote: (text: string) => void;
  onAsk: ((question: string) => void) | null;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = finding.choices.find((c) => c.id === choice) ?? null;
  const evidence = finding.evidence;

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-faint">
        <span className="rounded-full bg-surface-3 px-2 py-0.5 font-medium text-fg-muted">
          Vraag {index + 1} van {total}
        </span>
        <span>{finding.topic}</span>
      </div>

      <p className="mt-2 text-sm font-medium text-fg">{finding.headline}</p>
      <p className="mt-1 text-xs text-fg-muted">{finding.detail}</p>

      {evidence && evidence.labels.length > 1 && (
        <div className="mt-2.5">
          <FindingChart labels={evidence.labels} series={evidence.series} marks={evidence.marks} />
        </div>
      )}

      {evidence && evidence.facts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {evidence.facts.map((fact, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-fg-muted">
              · {fact}
            </li>
          ))}
        </ul>
      )}

      {evidence && evidence.rows.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex items-center gap-1 text-[11px] font-medium text-accent transition hover:underline"
          >
            <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
            {open ? "Verberg de weken" : "Laat de weken eromheen zien"}
          </button>
          {open && (
            <div className="mt-2 rounded-lg border border-border bg-surface p-2">
              <WeekTable finding={finding} />
            </div>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {finding.choices.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.effect}
            onClick={() => onChoose(c.id)}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              choice === c.id
                ? "bg-accent text-bg"
                : "border border-border text-fg-muted hover:bg-surface-3"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Wat de gekozen optie doet — zodat een keuze nooit een gok is. */}
      <p className="mt-2 text-[11px] text-fg-faint">
        {selected?.effect}
        {selected && (
          <span className={selected.changesData ? "text-warn" : ""}>
            {" "}
            {selected.changesData ? "Dit verandert je data." : "Je data blijft zoals hij is."}
          </span>
        )}
      </p>

      {/* Wát er speelde. Optioneel — maar zonder dit veld kan de gebruiker alleen zeggen
          dát er iets was, en dat is precies de helft van het antwoord. */}
      {selected?.note && (
        <label className="mt-2 block">
          <span className="text-[11px] font-medium text-fg-muted">{selected.note.label}</span>
          <input
            type="text"
            value={note}
            maxLength={120}
            onChange={(e) => onNote(e.target.value)}
            placeholder={selected.note.placeholder}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-faint outline-none transition focus:border-strong"
          />
          <span className="mt-1 block text-[10px] text-fg-faint">
            Komt als naam van deze bijzondere week in je data terug. Leeg laten mag — dan heet
            hij naar zijn weeknummer.
          </span>
        </label>
      )}

      {onAsk && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onAsk(
              `Over stap 4, vraag ${index + 1} van ${total}: ${finding.headline} ` +
                `Wat kan hier aan de hand zijn, en wat raad je me aan? ` +
                (evidence && evidence.facts.length > 0 ? `Wat ik zie: ${evidence.facts.join(" ")}` : ""),
            )
          }
          className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-accent transition hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          <MessageCircleQuestion className="h-3 w-3" />
          Vraag de gids wat hier speelt
        </button>
      )}
    </div>
  );
}

export function QualityCard({
  source,
  dataset,
  localSignal,
  onPayloadChange,
  onAsk,
  onChanged,
  busy = false,
}: {
  source: SourceFile;
  dataset: DatasetVersion | null;
  localSignal: { actionId: string; n: number } | null;
  onPayloadChange: (
    payload: {
      choices: Record<string, string>;
      notes: Record<string, string>;
      event_weeks: { date: string; note?: string }[];
    } | null,
  ) => void;
  /** Een vraag aan de gids, vanuit een concrete bevinding. */
  onAsk?: (question: string) => void;
  /** Het profiel is bijgewerkt; de pagina mag opnieuw laden. */
  onChanged?: () => void;
  busy?: boolean;
}) {
  const { findings, notes } = useMemo(
    () => analyseProfile(source.profile, source.mapping),
    [source],
  );
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(findings.map((f) => [f.id, f.defaultChoice])),
  );
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  // Weken die de gebruiker zelf aanwijst. Zonder dit kan een week alleen apart worden gezet
  // als de detectie hem toevallig aanbood — en juist een actie die elk jaar terugkeert valt
  // niet op, omdat alle jaren op elkaar lijken.
  const [eventWeeks, setEventWeeks] = useState<{ date: string; note: string }[]>([]);
  // "Ik wil iets aanpassen" bij een gebouwde dataset brengt de keuzes terug in beeld. Er
  // wordt niets weggegooid: opnieuw indienen maakt gewoon een nieuwe datasetversie.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (localSignal?.actionId === "prepare.adjust") setEditing(true);
  }, [localSignal]);

  useEffect(() => {
    onPayloadChange({
      choices,
      notes: explanations,
      event_weeks: eventWeeks
        .filter((w) => w.date)
        .map((w) => ({ date: w.date, ...(w.note.trim() ? { note: w.note.trim() } : {}) })),
    });
  }, [choices, explanations, eventWeeks, onPayloadChange]);

  // Bestanden van vóór de uitbreiding van het profiel dragen de reeks niet. Die wordt hier
  // eenmalig opgehaald uit het bestand zelf, zodat ook een bestaand project de weken te zien
  // krijgt in plaats van alleen de bewering. Lukt het niet, dan blijven de vragen staan.
  const [backfilling, setBackfilling] = useState(false);
  // Eén poging per bestand, en niet één per render: `onChanged` is een verse functie bij elke
  // render van de schil, dus zonder deze rem zou een mislukte poging (bestand weg, geen
  // rechten) zich bij elke verversing herhalen. Daarom ook via een ref: de melding hoort niet
  // afhankelijk te zijn van de identiteit van een callback.
  const attempted = useRef<Set<string>>(new Set());
  const changedRef = useRef(onChanged);
  useEffect(() => {
    changedRef.current = onChanged;
  }, [onChanged]);
  useEffect(() => {
    if (!needsSeriesBackfill(source) || attempted.current.has(source.id)) return;
    attempted.current.add(source.id);
    setBackfilling(true);
    void backfillProfileSeries(source)
      .then((updated) => {
        if (updated) changedRef.current?.();
      })
      .finally(() => setBackfilling(false));
  }, [source]);

  const showChoices = dataset == null || dataset.status === "failed" || editing;

  // Hoeveel van de antwoorden dóórwerken. Dat de vragen er zijn is één ding; welke ervan
  // straks je data veranderen is wat de gebruiker wil weten voordat hij op "klaarmaken" drukt.
  const changing = findings.filter((f) => {
    const chosen = f.choices.find((c) => c.id === (choices[f.id] ?? f.defaultChoice));
    return chosen?.changesData ?? false;
  }).length;

  return (
    <div className="space-y-3">
      {dataset && dataset.status === "failed" && (
        <p className="rounded-lg border border-danger/30 bg-danger-dim px-3 py-2 text-sm text-danger">
          {dataset.error_message ?? "Het klaarmaken is niet gelukt."}
        </p>
      )}

      {dataset && dataset.status === "ready" && !editing && <QualityReport dataset={dataset} />}

      {showChoices && (
        <>
          {notes.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border border-border bg-surface-2 p-3">
              {notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-fg-muted">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-none text-fg-faint" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}

          <EventWeeks weeks={eventWeeks} onChange={setEventWeeks} busy={busy} />

          {findings.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Ik zie niets bijzonders in je data. Ik kan hem zo klaarmaken.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Hoeveel vragen er zijn, en hoeveel van je antwoorden doorwerken. Zonder deze
                  regel weet de gebruiker niet of hij aan het begin of aan het eind staat. */}
              <div className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
                <p className="text-sm font-medium text-fg">
                  {findings.length} {findings.length === 1 ? "vraag" : "vragen"} over je data
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {backfilling
                    ? "Ik haal je bestand er even bij om de weken te kunnen laten zien. "
                    : "Bij elke vraag zie je waarop hij berust: het verloop van de reeks, om welke weken het gaat en wat er normaal staat. "}
                  {changing === 0
                    ? "Met je huidige antwoorden verandert er niets aan je data."
                    : `Met je huidige antwoorden ${changing === 1 ? "verandert 1 antwoord" : `veranderen ${changing} antwoorden`} straks je data.`}
                </p>
              </div>

              {findings.map((finding, i) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  index={i}
                  total={findings.length}
                  choice={choices[finding.id] ?? finding.defaultChoice}
                  note={explanations[finding.id] ?? ""}
                  onChoose={(choiceId) => setChoices((prev) => ({ ...prev, [finding.id]: choiceId }))}
                  onNote={(text) => setExplanations((prev) => ({ ...prev, [finding.id]: text }))}
                  onAsk={onAsk ?? null}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
