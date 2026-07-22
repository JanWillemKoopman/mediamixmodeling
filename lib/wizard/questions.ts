// Deterministisch, tekst-only meerkeuze-mechanisme: een fase stelt een vraag met een paar
// genummerde opties (nooit knoppen — de gebruiker typt het cijfer of het woord). Nooit een
// fout: geen match betekent gewoon "geen match", de aanroeper valt dan terug op de
// architect-chat in plaats van vrije tekst als ongeldige invoer te behandelen.

export interface MenuOption {
  key: string;
  label: string;
  synonyms?: string[];
}

export function formatMenu(options: MenuOption[]): string {
  return options.map((o, i) => `${i + 1}) ${o.label}`).join("\n");
}

// Cijfer aan het begin ("1", "2) ja") wint altijd. Daarna, in volgorde:
//  1. Een EXACTE match op een heel label/synoniem, over alle opties heen — dit gaat vóór de
//     losse-woord-check hieronder, anders zou bv. "klopt niet" (een exacte synoniem van
//     "iets aanpassen") verkeerd worden gelezen via het losse woord "klopt" dat toevallig ook
//     bij "klopt, ga door" hoort.
//  2. Alleen bij een kort antwoord (≤4 woorden): een los-woord-match, maar uitsluitend als
//     precies één optie matcht — matchen twee opties allebei een woord, dan is dat een
//     onduidelijk antwoord en geen match (valt door naar de architect-chat).
// Die woordgrens + eenduidigheidseis voorkomt dat een lang, inhoudelijk antwoord ("ok, zet
// kanaal tv op delayed adstock...") per ongeluk als bevestiging ("ok") wordt gelezen.
export function matchOption(reply: string, options: MenuOption[]): MenuOption | null {
  const text = reply.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!text) return null;

  const leadingNumber = text.match(/^(\d+)\b/);
  if (leadingNumber) {
    const idx = Number(leadingNumber[1]) - 1;
    if (idx >= 0 && idx < options.length) return options[idx];
  }

  const candidatesOf = (o: MenuOption) => [o.label.toLowerCase(), ...(o.synonyms ?? []).map((s) => s.toLowerCase())];

  for (const o of options) {
    if (candidatesOf(o).includes(text)) return o;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    const wordMatches = options.filter((o) => candidatesOf(o).some((c) => words.includes(c)));
    if (wordMatches.length === 1) return wordMatches[0];
  }
  return null;
}

export const YES_OPTION: MenuOption = {
  key: "yes",
  label: "ja, toepassen",
  synonyms: ["ja", "yes", "akkoord", "toepassen", "prima", "klopt", "doe", "ok", "oke", "oké"],
};
