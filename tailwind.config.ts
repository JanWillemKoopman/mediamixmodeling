import type { Config } from "tailwindcss";

// Udenhout.nl-huisstijl: wit/lichtbeige canvas, zand/beige neutralen voor kaarten en
// tabelkoppen, donkerblauw als inkt- en merkkleur, helderblauw als primaire actiekleur en
// oranje als secundair accent. Semantische tokens (bg / surface / border / fg / accent …)
// zodat de hele app centraal bij te stellen blijft.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Marketingpagina (app/page.tsx + components/site/) ────────────────────────
        // Eigen, additieve tokenset voor de publieke one-page. Staat bewust náást de
        // app-tokens hieronder: de wizard en het klantdashboard veranderen hier niet van,
        // en de marketingpagina erft omgekeerd niet de applicatie-esthetiek.
        // Kleurregel van de pagina: bestedingen zijn neutraal, effect is blauw.
        site: {
          ink: "#111A2B", // diep statementvlak
          "ink-2": "#1B2740", // verhoogd vlak op inkt
          canvas: "#FBFAF7", // warm off-white
          sand: "#F1EDE6", // afwisselingsvlak
          text: "#141C2F",
          "text-muted": "#4A5468",
          "text-faint": "#636C7D",
          "on-ink": "#F4F2EE",
          "on-ink-muted": "#AEB9CC",
          line: "rgba(20,28,47,0.12)",
          "line-strong": "rgba(20,28,47,0.26)",
          "line-ink": "rgba(255,255,255,0.16)",
          effect: "#0F5099", // signaalkleur: media-effect én primaire actie
          "effect-hover": "#0A3D77",
          "effect-soft": "#E9F1FB",
          "effect-ink": "#8FB8F2", // dezelfde signaalkleur, leesbaar op inkt
          accent: "#ED6935", // spaarzaam: markeert de kloof tussen budget en effect
          "accent-text": "#B54A1A", // dezelfde signaalkleur, maar leesbaar als tekst (AA)
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
        // Display-serif van de marketingpagina (self-hosted via next/font, zie layout.tsx).
        // Alleen gebruikt op grote koppen; body blijft de humanistische sans hieronder.
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        // TheSansB (W5 Plain body / W7 koppen) is de huisstijlfont van udenhout.nl. Die is
        // niet publiek als webfont beschikbaar, dus alleen de naam staat vooraan de stack —
        // wordt hij lokaal geïnstalleerd, pakt de browser 'm automatisch op. Figtree
        // (self-hosted via next/font, zie layout.tsx) blijft de daadwerkelijk geladen
        // fallback met een vergelijkbaar humanistisch karakter.
        sans: ["TheSansB W5 Plain", "TheSansB", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        "sans-w7": ["TheSansB W7", "TheSansB", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        "sans-w3": ["TheSansB W3", "TheSansB", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
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
      },
    },
  },
  plugins: [],
};

export default config;
