"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { flush, installGlobalLogging, logEvent, sessionId } from "@/lib/log/client";

/**
 * Zet het logboek aan voor de hele app. Rendert niets.
 *
 * Staat in de root-layout, zodat de vangnetten er al zijn vóórdat er een pagina is om stuk te
 * gaan — een fout tijdens het laden van het eerste scherm is er anders precies één die je
 * mist.
 */
export function EventLogger() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => installGlobalLogging(), []);

  // Elke paginawissel is een handeling van de gebruiker. Zonder deze regels is het logboek
  // een lijst fouten zonder verhaal eromheen; mét deze regels lees je terug waar hij liep.
  useEffect(() => {
    logEvent({
      level: "info",
      event: first.current ? "pageview.eerste" : "pageview",
      message: pathname,
      detail: first.current
        ? { sessie: sessionId(), scherm: `${window.innerWidth}x${window.innerHeight}`, browser: navigator.userAgent }
        : {},
    });
    first.current = false;
    // Meteen versturen bij de eerste pageview: dan staat de sessie in de database, ook als de
    // gebruiker daarna direct iets doet wat de pagina laat crashen.
    flush();
  }, [pathname]);

  return null;
}
