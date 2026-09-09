import type { Config } from "tailwindcss";

// Twee tokensets in één config. `site.*` (+ de site-radii/-schaduwen) hoort bij de
// publieke marketingsite: bijna-wit canvas, diep navy vlakken, één helderblauw accent.
// Alles daarna is de applicatie (wizard, dashboard) in de Udenhout.nl-huisstijl:
// wit/lichtbeige canvas, zand/beige neutralen voor kaarten en
// tabelkoppen, donkerblauw als inkt- en merkkleur, helderblauw als primaire actiekleur en
// oranje als secundair accent. Semantische tokens (bg / surface / border / fg / accent …)
// zodat de hele app centraal bij te stellen blijft.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Marketingsite (app/page.tsx + components/site/) ─────────────────────────
        // Tokenset van de publieke site. Staat bewust náást de app-tokens hieronder: de
        // wizard en het klantdashboard veranderen hier niet van mee.
        // Wit papier, bijna-zwarte inkt, één violet als actiekleur en één groen als
        // signaalkleur. Verder alleen grijswaarden.
        site: {
          paper: "#FFFFFF",
          "paper-2": "#F7F7F7", // genest/secundair vlak
          "paper-3": "#F0F0F1", // ingedrukt vlak
          ink: "#0B0B0C", // koppen en primaire tekst
          "ink-2": "#16161A", // donkere vlakken
          muted: "#63636A", // lopende tekst
          "muted-2": "#9A9AA2", // bijschriften, assen
          line: "#E5E5E5",
          "line-2": "#EFEFEF",
          violet: "#8511D9", // primaire actie
          "violet-hover": "#6D0DB3",
          "violet-soft": "rgba(133,17,217,0.09)",
          "violet-line": "rgba(133,17,217,0.22)",
          green: "#B9EFA3", // gevulde chips en accenten
          "green-text": "#24803F", // dezelfde signaalkleur, leesbaar als tekst
          "green-soft": "rgba(46,158,80,0.10)",
          "green-line": "rgba(46,158,80,0.26)",
        },
        // Wit canvas — Udenhout.nl-secties wisselen wit af met lichtbeige vlakken.
        bg: "#FFFFFF",
        surface: {
          DEFAULT: "#FFFFFF", // witte kaart
          2: "#F6F4F0", // lichtbeige — genestelde vlakken, invoervelden, tabel-zebra
          3: "#E2DDD1", // zand/beige — tabelkoppen, actieve/ingedrukte vlakken
        },
        border: {
          // Subtiele, warme scheidingslijn afgeleid van het donkerblauw — geen kille grijzen.
          DEFAULT: "rgba(25,36,59,0.10)",
          strong: "rgba(25,36,59,0.22)",
        },
        fg: {
          DEFAULT: "#000000", // zwart lichaamstekst, zoals de huisstijl voorschrijft
          muted: "rgba(25,36,59,0.72)",
          faint: "rgba(25,36,59,0.48)",
        },
        // Helderblauw als primaire actie-/linkkleur (zoals a:hover op udenhout.nl).
        accent: {
          DEFAULT: "#003DA5",
          hover: "#002E7D",
          dim: "rgba(0,61,165,0.08)",
        },
        // Donkerblauw-schaal voor merk-/navigatievlakken. 700 = het donkerblauw #19243b.
        brand: {
          50: "#E6EAF1",
          100: "#C2CCDE",
          200: "#8FA0C2",
          300: "#5574A5",
          400: "#26437C",
          500: "#19243B",
          600: "#141C2F",
          700: "#0E1421",
        },
        // Oranje — secundair accent, zoals state-orange knoppen/bullets in de huisstijl.
        orange: {
          DEFAULT: "#ED6935",
          hover: "#D8571F",
          dim: "rgba(237,105,53,0.10)",
        },
        success: {
          DEFAULT: "#1E7A4B",
          dim: "rgba(30,122,75,0.12)",
        },
        danger: {
          DEFAULT: "#C0362C",
          dim: "rgba(192,54,44,0.09)",
        },
        warn: {
          DEFAULT: "#9A6B12",
          dim: "rgba(154,107,18,0.12)",
        },
        user: {
          DEFAULT: "#003DA5",
        },
      },
      fontFamily: {
        // Display-grotesk van de marketingsite (self-hosted via next/font, zie layout.tsx):
        // dezelfde familie als de body, maar krapper — moderne SaaS-koppen, geen serif.
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // TheSansB (W5 Plain body / W7 koppen) is de huisstijlfont van udenhout.nl. Die is
        // niet publiek als webfont beschikbaar, dus alleen de naam staat vooraan de stack —
        // wordt hij lokaal geïnstalleerd, pakt de browser 'm automatisch op. Figtree
        // (self-hosted via next/font, zie layout.tsx) blijft de daadwerkelijk geladen
        // fallback met een vergelijkbaar humanistisch karakter.
        sans: ["TheSansB W5 Plain", "TheSansB", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        "sans-w7": ["TheSansB W7", "TheSansB", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        "sans-w3": ["TheSansB W3", "TheSansB", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Microlabels op de site draaien op de systeem-mono: precies wat de referentie
        // doet, en het scheelt een webfont.
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", "monospace"],
      },
      borderRadius: {
        // Marketingsite: kleine radii voor chips/tegels, grote voor kaarten en panelen.
        chip: "10px",
        ctl: "13px",
        card: "16px",
        panel: "22px",
        // Udenhout.nl: duidelijk afgeronde kaarten en tabelkoppen (1rem), pil-knoppen
        // blijven volledig rond (rounded-full, hieronder ongemoeid).
        sm: "0.25rem",
        DEFAULT: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(25 36 59 / 0.05)",
        DEFAULT: "0 1px 3px 0 rgb(25 36 59 / 0.08)",
        md: "0 3px 6px 0 rgb(25 36 59 / 0.10)",
        lg: "0 10px 15px -3px rgb(25 36 59 / 0.10)",
        xl: "0 10px 15px -3px rgb(25 36 59 / 0.12)",
        "2xl": "0 10px 15px -3px rgb(25 36 59 / 0.12)",
        panel: "none",
        soft: "0 3px 6px 0 rgb(25 36 59 / 0.08)",
        glow: "0 0 0 3px rgba(0,61,165,0.35)",
        "glow-sm": "0 0 0 3px rgba(0,61,165,0.30)",
        // Marketingsite: terughoudende schaduwen — kaarten liggen bijna plat, alleen het
        // productpaneel mag echt van de pagina afkomen.
        "site-sm": "0 1px 2px rgba(11,11,12,0.04), 0 8px 20px -14px rgba(11,11,12,0.22)",
        "site-md": "0 2px 6px rgba(11,11,12,0.05), 0 18px 40px -22px rgba(11,11,12,0.34)",
        "site-lg": "0 30px 70px -40px rgba(11,11,12,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
