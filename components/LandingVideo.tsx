"use client";

import { useState } from "react";
import { Play } from "lucide-react";

// Lichte YouTube-"facade": we laden het zware YouTube-iframe (en al zijn scripts) pas
// wanneer de bezoeker echt op play klikt. Tot die tijd tonen we een strakke poster met
// play-knop. Zo blijft de landingspagina snel en privacy-vriendelijk. Staat er nog geen
// video-id ingesteld, dan tonen we een nette "binnenkort"-placeholder in dezelfde vorm.
export function LandingVideo({ videoId }: { videoId: string | null }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface-3 shadow-panel">
      {playing && videoId ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title="MMM Wizard — product walkthrough"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          disabled={!videoId}
          onClick={() => videoId && setPlaying(true)}
          aria-label={videoId ? "Speel de product-walkthrough af" : "Video volgt binnenkort"}
          className="group absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-fg/[0.03] via-transparent to-brand-500/[0.06] disabled:cursor-default"
        >
          {videoId && (
            <img
              src={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
            />
          )}
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition group-hover:scale-105 group-hover:bg-brand-500 group-disabled:bg-fg-faint group-disabled:shadow-none">
            <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />
          </span>
          <span className="relative rounded-full border border-border bg-surface/90 px-3 py-1 text-xs font-medium text-fg-muted backdrop-blur">
            {videoId ? "Bekijk de volledige app-walkthrough" : "Video-walkthrough volgt binnenkort"}
          </span>
        </button>
      )}
    </div>
  );
}
