"use client";

// Stap 5 — wat weet jij al.
//
// Per kanaal drie vragen, plus twee over het geheel. Alles klikbaar, "weet ik niet" overal even
// groot als de rest, en één kanaal tegelijk in beeld zodat een project met negen kanalen geen
// muur van zevenentwintig keuzes wordt.
//
// De oude tuning-stap vroeg hier om vrije tekst ("beschrijf per onderwerp wat je weet") en liet
// een LLM daar een voorstel van maken. Dat werkte, maar de gebruiker zag niet wat hij eigenlijk
// had gezegd, en de stap beloofde knoppen die niet bestonden.

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  CHANNEL_QUESTIONS,
  MEDIA_SHARE_QUESTION,
  SEASONALITY_QUESTION,
  channelsOf,
  type BeliefAnswers,
  type ChannelAnswers,
} from "@/lib/flow/beliefs";
import type { DatasetVersion } from "@/lib/types";
import type { Carryover, MediaShare, SaturationBelief, SeasonalityBelief, Strength } from "@/lib/types";

/**
 * Wat de gids voorstelt als je hem vraagt dit in te vullen.
 *
 * Hetzelfde vormpje als de antwoorden zelf, en met dezelfde gesloten woordenschat — het
 * schema van het gereedschap wordt uit diezelfde vraaglijsten gegenereerd (lib/ai/guide.ts).
 * Een voorstel blijft een voorstel: het vult de kaart zichtbaar in, de gebruiker past aan en
 * bevestigt zelf.
 */
export interface BeliefProposal {
  reasoning?: string;
  channels?: Record<string, { carryover?: Carryover; strength?: Strength; saturation?: SaturationBelief }>;
  seasonality?: SeasonalityBelief;
  media_share?: MediaShare;
}

function OptionRow<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T | undefined;
  onPick: (v: T) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.hint}
          onClick={() => onPick(option.value)}
          className={`rounded-full px-3 py-1.5 text-xs transition ${
            value === option.value
              ? "bg-accent text-bg"
              : "border border-border text-fg-muted hover:bg-surface-3"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function BeliefsCard({
  dataset,
  proposal,
  onPayloadChange,
}: {
  dataset: DatasetVersion;
  /** Een ingevuld voorstel van de gids, of null. */
  proposal: BeliefProposal | null;
  onPayloadChange: (payload: { answers: BeliefAnswers } | null) => void;
}) {
  const channels = useMemo(() => channelsOf(dataset), [dataset]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<BeliefAnswers>({ channels: {} });
  const [tookProposal, setTookProposal] = useState(false);

  useEffect(() => {
    onPayloadChange({ answers });
  }, [answers, onPayloadChange]);

  // Een voorstel wordt zichtbaar ingevuld, niet stil toegepast: de gebruiker ziet per kanaal
  // staan wat de gids denkt en kan elk antwoord aanklikken om het te wijzigen. Alleen kanalen
  // die echt in de data zitten worden overgenomen — een verzonnen kanaalnaam hoort hier niet
  // binnen te komen, en als het gebeurt valt hij weg in plaats van een vraag te vervuilen.
  useEffect(() => {
    if (!proposal) return;
    const known = new Set(channels.map((c) => c.name));
    setAnswers((prev) => {
      const next = { ...prev, channels: { ...prev.channels } };
      for (const [name, given] of Object.entries(proposal.channels ?? {})) {
        if (!known.has(name)) continue;
        next.channels[name] = { ...next.channels[name], ...given };
      }
      if (proposal.seasonality) next.seasonality = proposal.seasonality;
      if (proposal.media_share) next.media_share = proposal.media_share;
      return next;
    });
    setTookProposal(true);
  }, [proposal, channels]);

  const channel = channels[index];
  const answered = (name: string) => {
    const a = answers.channels[name];
    return a != null && a.carryover != null && a.strength != null && a.saturation != null;
  };
  const answeredCount = channels.filter((c) => answered(c.name)).length;

  function setChannelAnswer(name: string, patch: Partial<ChannelAnswers>) {
    setAnswers((prev) => ({
      ...prev,
      channels: { ...prev.channels, [name]: { ...prev.channels[name], ...patch } },
    }));
  }

  if (channels.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        Ik zie nog geen kanalen in je goedgekeurde data. Ga terug naar de kolommen om ze aan te wijzen.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {tookProposal && (
        <p className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-2 text-xs text-fg">
          De gids heeft dit voor je ingevuld. Loop het na en wijzig wat niet klopt — er gebeurt
          niets tot je op &ldquo;Hiermee verder&rdquo; klikt.
        </p>
      )}
      {/* Kanaalkiezer: waar ben je, en hoeveel heb je gehad. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {channels.map((c, i) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setIndex(i)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition ${
              i === index
                ? "bg-surface-3 font-medium text-fg"
                : answered(c.name)
                  ? "text-success hover:bg-surface-2"
                  : "text-fg-faint hover:bg-surface-2"
            }`}
          >
            {answered(c.name) && <Check className="h-3 w-3" />}
            {c.name}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-xs text-fg-faint">
          Kanaal {index + 1} van {channels.length} · {answeredCount} afgerond
        </p>
        <h3 className="mt-0.5 text-sm font-semibold text-fg">{channel.name}</h3>

        <div className="mt-3 space-y-4">
          {CHANNEL_QUESTIONS.map((question) => (
            <div key={question.id}>
              <p className="text-sm text-fg">{question.ask(channel.name)}</p>
              <OptionRow
                options={question.options as { value: string; label: string; hint?: string }[]}
                value={answers.channels[channel.name]?.[question.id]}
                onPick={(v) => setChannelAnswer(channel.name, { [question.id]: v } as Partial<ChannelAnswers>)}
              />
              {/* De toelichting bij de gekozen optie — zodat een keuze nooit een gok is. */}
              {(() => {
                const picked = question.options.find(
                  (o) => o.value === answers.channels[channel.name]?.[question.id],
                );
                return picked?.hint ? (
                  <p className="mt-1.5 text-[11px] text-fg-faint">{picked.hint}</p>
                ) : null;
              })()}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted transition hover:bg-surface-3 disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" /> Vorige
          </button>
          <button
            type="button"
            disabled={index >= channels.length - 1}
            onClick={() => setIndex((i) => Math.min(channels.length - 1, i + 1))}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted transition hover:bg-surface-3 disabled:opacity-40"
          >
            Volgende <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Over het geheel. */}
      <div className="space-y-4 rounded-xl border border-border bg-surface-2 p-4">
        <div>
          <p className="text-sm text-fg">{SEASONALITY_QUESTION.ask}</p>
          <OptionRow
            options={SEASONALITY_QUESTION.options}
            value={answers.seasonality}
            onPick={(v) => setAnswers((prev) => ({ ...prev, seasonality: v }))}
          />
        </div>
        <div>
          <p className="text-sm text-fg">{MEDIA_SHARE_QUESTION.ask}</p>
          <OptionRow
            options={MEDIA_SHARE_QUESTION.options}
            value={answers.media_share}
            onPick={(v) => setAnswers((prev) => ({ ...prev, media_share: v }))}
          />
          <p className="mt-1.5 text-[11px] text-fg-faint">
            {answers.media_share
              ? MEDIA_SHARE_QUESTION.options.find((o) => o.value === answers.media_share)?.hint
              : "Weet je het niet? Laat het leeg — dan reken ik met het meest voorkomende geval."}
          </p>
        </div>
      </div>

      {/* Vrije tekst: het enige veld in de hele stap, en het mag leeg blijven. */}
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <label htmlFor="beliefs-context" className="text-sm text-fg">
          Is er nog iets over je bedrijf of je markt dat ik moet weten?
        </label>
        <p className="mt-0.5 text-[11px] text-fg-faint">
          Grote campagnes, een prijswijziging, een eerder experiment. Mag leeg blijven.
        </p>
        <textarea
          id="beliefs-context"
          rows={2}
          value={answers.context ?? ""}
          onChange={(e) => setAnswers((prev) => ({ ...prev, context: e.target.value }))}
          className="mt-2 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-strong"
          placeholder="Bijvoorbeeld: in maart liep een grote tv-campagne die niet in de data staat."
        />
      </div>
    </div>
  );
}
