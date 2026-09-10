"use client";

// Stap 8 — delen.
//
// Wat de klant te zien krijgt staat hier expliciet, vóórdat je deelt. Dat is geen hoffelijkheid
// maar een productregel: het klantdashboard toont alleen wat het oordeel toestaat, en de bouwer
// moet kunnen weten wat hij verstuurt zonder het zelf te moeten openen.

import { useEffect } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { allows, type RunView } from "@/lib/types";

function Row({ shown, text }: { shown: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      {shown ? (
        <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-success" />
      ) : (
        <X className="mt-0.5 h-3.5 w-3.5 flex-none text-fg-faint" />
      )}
      <span className={shown ? "text-fg" : "text-fg-faint"}>{text}</span>
    </li>
  );
}

export function ShareCard({
  projectId,
  run,
  localSignal,
}: {
  projectId: string;
  run: RunView | null;
  localSignal: { actionId: string; n: number } | null;
}) {
  // "Bekijk het klantdashboard" opent die pagina in een nieuw tabblad — je bent hier nog niet
  // klaar, dus deze pagina blijft staan.
  useEffect(() => {
    if (localSignal?.actionId === "share.view") {
      window.open(`/dashboard/${projectId}`, "_blank", "noopener");
    }
  }, [localSignal, projectId]);

  if (!run?.result) {
    return <p className="text-sm text-fg-muted">Er is nog geen afgerond resultaat om te delen.</p>;
  }

  const validation = run.validation;
  const published = run.result.is_published;
  const canPublish = allows(validation, "publish");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-sm font-medium text-fg">
          {published ? "Dit staat op het klantdashboard." : "Dit krijgt de klant te zien"}
        </p>
        <ul className="mt-2.5 space-y-1.5">
          <Row shown={allows(validation, "total_media_contribution")} text="Hoeveel marketing als geheel heeft opgeleverd, met de bandbreedte eromheen." />
          <Row shown={allows(validation, "channel_contributions")} text="Wat elk kanaal heeft bijgedragen." />
          <Row shown={allows(validation, "response_curves")} text="Wat een euro meer of minder per kanaal zou doen." />
          <Row shown={allows(validation, "budget_advice")} text="Een advies over de verdeling van het budget." />
          <Row shown={false} text="Je ruwe data, je gesprek hier, en de technische diagnostiek." />
        </ul>
        {!canPublish && (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">
            Dit model haalt de drempel voor delen niet. Dat is geen instelling die ik kan omzetten: de
            database weigert het publiceren van een resultaat dat zijn eigen toets niet haalt.
          </p>
        )}
        {published && (
          <Link
            href={`/dashboard/${projectId}`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            Bekijk het klantdashboard <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
