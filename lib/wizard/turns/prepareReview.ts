// Fase "prepare_review" — kwaliteitsrapport als tekst (geen losse kaart met knoppen per
// issue) + een genummerd goedkeuren/aanpassen-menu. DatasetPreviewTable blijft een passieve
// (niet-interactieve) tabel onder de bubbel — dat is geen formulier, dus geen probleem voor
// "alles via chat".

import { humanizeError, humanizeQualityMessage } from "@/lib/humanizeMessage";
import { issueInfo } from "@/lib/qualityIssueRegistry";
import { formatMenu, matchOption, type MenuOption } from "@/lib/wizard/questions";
import type { Dataset, QualityIssue } from "@/lib/types";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

const REVIEW_OPTIONS: MenuOption[] = [
  { key: "approve", label: "Goedkeuren", synonyms: ["goedkeuren", "ja", "klopt", "akkoord"] },
  { key: "adjust", label: "Ik wil iets aanpassen", synonyms: ["aanpassen", "wijzigen", "nee"] },
];

function formatQualityReport(dataset: Dataset): string {
  const issues = dataset.quality?.issues ?? [];
  if (issues.length === 0) return "Geen bijzonderheden gevonden.";
  const byTone = (tone: QualityIssue["severity"]) => issues.filter((i) => i.severity === tone);
  const lines: string[] = [];
  const section = (label: string, list: QualityIssue[]) => {
    if (list.length === 0) return;
    lines.push(`**${list.length} ${label}${list.length === 1 ? "" : "en"}**`);
    for (const issue of list) {
      const info = issueInfo(issue.code);
      const detail = info ? ` _(${info.explain}${info.action ? ` ${info.action}` : ""})_` : "";
      lines.push(`- ${humanizeQualityMessage(issue.message)}${detail}`);
    }
  };
  section("fout", byTone("error"));
  section("waarschuwing", byTone("warning"));
  const infos = byTone("info");
  if (infos.length > 0) lines.push(`${infos.length} info-melding${infos.length === 1 ? "" : "en"}: ${infos.map((i) => humanizeQualityMessage(i.message)).join("; ")}.`);
  return lines.join("\n");
}

export function intro(env: TurnEnv): string {
  const dataset = env.dataset;
  if (!dataset) return "";
  const window = dataset.window_start ? `${dataset.n_weeks ?? "?"} weken · ${dataset.window_start} t/m ${dataset.window_end}\n\n` : "";
  return `${window}${formatQualityReport(dataset)}\n\n${formatMenu(REVIEW_OPTIONS)}`;
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  const dataset = env.dataset;
  if (!dataset) return { handled: false };
  const match = matchOption(reply, REVIEW_OPTIONS);
  if (!match) return { handled: false };

  if (match.key === "approve") {
    const res = await fetch(`/api/datasets/${dataset.id}/approve`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { handled: true, reply: humanizeError(j.error, "Goedkeuren is niet gelukt — probeer het opnieuw.").text };
    }
    return {
      handled: true,
      refresh: true,
      reply: "Dataset goedgekeurd. Nu wil ik iets over het bedrijf en de markt weten — dat helpt om betere aannames te kiezen bij het tunen.",
    };
  }

  // "Ik wil iets aanpassen" heeft geen vaste vervolgvraag — laat de bouwer het gewoon
  // beschrijven; dat gaat door naar de architect (die het kwaliteitsrapport al in zijn
  // context heeft) met hetzelfde voorstel-bevestigingsmechanisme als bij het recept.
  return { handled: true, reply: "Beschrijf wat er moet veranderen — dan kijk ik met je mee en stel ik een aangepast recept voor." };
}
