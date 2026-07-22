"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { WizardPhase } from "@/lib/wizard/phase";

// Bridges the chat panel and the editors/views it can fill in or be filled from, which
// sit in different parts of the page layout: when the architect proposes a recipe or a
// config, this carries it from the chat panel to the right editor; when a result view
// wants to hand a specific question to the architect (e.g. "explain these divergences"),
// it goes the other way through pendingChatMessage — without restructuring the
// surrounding server-rendered page.
interface WizardChatValue {
  pendingConfig: unknown | null;
  applyConfig: (config: unknown) => void;
  clearPendingConfig: () => void;
  pendingRecipe: unknown | null;
  applyRecipe: (recipe: unknown) => void;
  clearPendingRecipe: () => void;
  // Een voorstel dat de AI in de chat heeft gedaan maar dat nog niet is overgenomen:
  // "klaargezet", zodat de betreffende stap het als kaart kan tonen ("De AI stelt voor: …
  // [Overnemen]") — de gebruiker hoeft dan niet terug naar de chat om het te vinden.
  stagedRecipe: unknown | null;
  stageRecipe: (recipe: unknown) => void;
  clearStagedRecipe: () => void;
  stagedConfig: unknown | null;
  stageConfig: (config: unknown) => void;
  clearStagedConfig: () => void;
  pendingChatMessage: string | null;
  sendToChat: (message: string) => void;
  clearPendingChatMessage: () => void;
  // Which pipeline step the builder currently has open — lets the chat panel offer
  // quick-actions relevant to what's actually on screen instead of one fixed set.
  activeStepId: string | null;
  setActiveStepId: (id: string) => void;
  // Globale "bezig"-status: elke langlopende actie (AI-voorstel, samenvoegen, fit,
  // chatbeurt) meldt zich hier aan zodat de ActivityBar prominent kan tonen wáár de
  // app mee bezig is en hoe lang al. Meerdere acties tegelijk kunnen naast elkaar
  // bestaan; de balk toont de recentste.
  activities: Activity[];
  beginActivity: (label: string) => ActivityHandle;
  // Terugkoppeling/iteratie (blueprint stap 7): laat de bouwer op elk moment gericht
  // teruggaan naar een eerdere fase — bijv. vanuit de validatiestap naar tuning bij een
  // sampler-probleem, of naar data-voorbereiding bij een inhoudelijk plausibiliteitsprobleem
  // — zonder de hele flow opnieuw te doorlopen. Dit is een puur client-side "welke kaart
  // toon ik nu"-keuze bovenop de deterministische fase-afleiding (lib/wizard/phase.ts):
  // er wordt niets in de database gewist of overschreven. Een nieuw recept/config vanuit
  // een teruggesprongen fase maakt gewoon een nieuwe dataset-/fit-versie aan; de bestaande
  // historie (eerdere datasets/runs) blijft intact en vergelijkbaar.
  overridePhase: WizardPhase | null;
  overrideReason: string | null;
  goToPhase: (phase: WizardPhase, reason?: string) => void;
  clearOverridePhase: () => void;
}

export interface Activity {
  id: number;
  label: string;
  startedAt: number;
}

export interface ActivityHandle {
  // Label bijwerken terwijl de actie loopt (bv. "Ronde 2: …") zonder de teller te resetten.
  update: (label: string) => void;
  end: () => void;
}

const WizardChatContext = createContext<WizardChatValue | null>(null);

export function WizardChatProvider({ children }: { children: React.ReactNode }) {
  const [pendingConfig, setPendingConfig] = useState<unknown | null>(null);
  const [pendingRecipe, setPendingRecipe] = useState<unknown | null>(null);
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);
  const [stagedRecipe, setStagedRecipe] = useState<unknown | null>(null);
  const [stagedConfig, setStagedConfig] = useState<unknown | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const nextActivityId = useRef(1);
  const [overridePhase, setOverridePhase] = useState<WizardPhase | null>(null);
  const [overrideReason, setOverrideReason] = useState<string | null>(null);

  const beginActivity = useCallback((label: string): ActivityHandle => {
    const id = nextActivityId.current++;
    setActivities((prev) => [...prev, { id, label, startedAt: Date.now() }]);
    return {
      update: (next: string) =>
        setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, label: next } : a))),
      end: () => setActivities((prev) => prev.filter((a) => a.id !== id)),
    };
  }, []);

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
        pendingConfig,
        applyConfig: setPendingConfig,
        clearPendingConfig: () => setPendingConfig(null),
        pendingRecipe,
        applyRecipe: setPendingRecipe,
        clearPendingRecipe: () => setPendingRecipe(null),
        stagedRecipe,
        stageRecipe: setStagedRecipe,
        clearStagedRecipe: () => setStagedRecipe(null),
        stagedConfig,
        stageConfig: setStagedConfig,
        clearStagedConfig: () => setStagedConfig(null),
        pendingChatMessage,
        sendToChat: setPendingChatMessage,
        clearPendingChatMessage: () => setPendingChatMessage(null),
        activeStepId,
        setActiveStepId,
        activities,
        beginActivity,
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
