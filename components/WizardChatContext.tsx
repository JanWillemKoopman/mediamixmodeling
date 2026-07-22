"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { JobConfig } from "@/lib/types";
import type { WizardPhase } from "@/lib/wizard/phase";

// Bridges the chat panel and the read-only panels around it (ModelDossier, the review
// turn) that need to reach into the chat without prop-drilling through the server-rendered
// page layout.
interface WizardChatValue {
  pendingChatMessage: string | null;
  sendToChat: (message: string) => void;
  clearPendingChatMessage: () => void;
  // "Config hergebruiken": de review-fase zet de configuratie van een eerdere run klaar,
  // de tuning-fase leest 'm als startpunt i.p.v. de standaard sjabloon-config.
  reuseJobConfig: JobConfig | null;
  setReuseJobConfig: (config: JobConfig | null) => void;
  clearReuseJobConfig: () => void;
  // Terugkoppeling/iteratie (blueprint stap 7): laat de bouwer op elk moment gericht
  // teruggaan naar een eerdere fase — bijv. vanuit de validatiestap naar tuning bij een
  // sampler-probleem, of naar data-voorbereiding bij een inhoudelijk plausibiliteitsprobleem
  // — zonder de hele flow opnieuw te doorlopen. Dit is een puur client-side "welke fase
  // toon ik nu"-keuze bovenop de deterministische fase-afleiding (lib/wizard/phase.ts):
  // er wordt niets in de database gewist of overschreven. Een nieuw recept/config vanuit
  // een teruggesprongen fase maakt gewoon een nieuwe dataset-/fit-versie aan; de bestaande
  // historie (eerdere datasets/runs) blijft intact en vergelijkbaar.
  overridePhase: WizardPhase | null;
  overrideReason: string | null;
  goToPhase: (phase: WizardPhase, reason?: string) => void;
  clearOverridePhase: () => void;
}

const WizardChatContext = createContext<WizardChatValue | null>(null);

export function WizardChatProvider({ children }: { children: React.ReactNode }) {
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);
  const [reuseJobConfig, setReuseJobConfig] = useState<JobConfig | null>(null);
  const [overridePhase, setOverridePhase] = useState<WizardPhase | null>(null);
  const [overrideReason, setOverrideReason] = useState<string | null>(null);

  const goToPhase = useCallback((phase: WizardPhase, reason?: string) => {
    setOverridePhase(phase);
    setOverrideReason(reason ?? null);
  }, []);

  const clearOverridePhase = useCallback(() => {
    setOverridePhase(null);
    setOverrideReason(null);
  }, []);

  return (
    <WizardChatContext.Provider
      value={{
        pendingChatMessage,
        sendToChat: setPendingChatMessage,
        clearPendingChatMessage: () => setPendingChatMessage(null),
        reuseJobConfig,
        setReuseJobConfig,
        clearReuseJobConfig: () => setReuseJobConfig(null),
        overridePhase,
        overrideReason,
        goToPhase,
        clearOverridePhase,
      }}
    >
      {children}
    </WizardChatContext.Provider>
  );
}

export function useWizardChat(): WizardChatValue {
  const ctx = useContext(WizardChatContext);
  if (!ctx) throw new Error("useWizardChat must be used within WizardChatProvider");
  return ctx;
}

// Same context, but safe to call from a component that is sometimes rendered outside the
// provider (e.g. SummaryView, which is shared between the builder wizard and the
// provider-less read-only client dashboard) — returns null instead of throwing.
export function useWizardChatOptional(): WizardChatValue | null {
  return useContext(WizardChatContext);
}
