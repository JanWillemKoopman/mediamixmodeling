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
        // Eigen, additieve tokenset voor de publieke site. Staat bewust náást de
        // app-tokens hieronder: wizard en klantdashboard veranderen hier niet van, en de
        // site erft omgekeerd niet de applicatie-esthetiek.
        // Kleurregel: bestedingen zijn neutraal-grijs, effect is blauw. Verder niets.
        site: {
          canvas: "#FAFBFC", // bijna-wit paginavlak
          surface: "#FFFFFF", // kaart
          "surface-2": "#F3F5F8", // subtiel getint vlak
          "surface-3": "#E9EDF3", // ingedrukt/actief vlak
          ink: "#080C16", // diep bijna-zwart navy
          "ink-2": "#0F1526", // verhoogd paneel op inkt
          "ink-3": "#182034", // tweede niveau op inkt
          text: "#0B1020",
          "text-muted": "#525C74",
          "text-faint": "#7A8499",
          "on-ink": "#EDF1F7",
          "on-ink-muted": "#97A2B8",
          "on-ink-faint": "#6A768E",
          line: "rgba(11,16,32,0.09)",
          "line-strong": "rgba(11,16,32,0.16)",
          "line-ink": "rgba(255,255,255,0.10)",
          "line-ink-strong": "rgba(255,255,255,0.20)",
          // Eén heldere blauwe signaalkleur: media-effect én primaire actie.
          blue: "#1F5AFF",
          "blue-hover": "#1544D2",
          "blue-soft": "#ECF1FF",
          "blue-mute": "#5B87F5",
          "blue-ink": "#7FA6FF", // dezelfde signaalkleur, leesbaar op inkt
          "blue-ink-soft": "rgba(127,166,255,0.14)",
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
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        // Marketingsite: strakke, compacte radii (knoppen 10px, kaarten 14px, panelen 20px).
        ctl: "10px",
        card: "14px",
        panel: "20px",
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
        "site-card": "0 1px 2px rgba(11,16,32,0.04), 0 10px 30px -18px rgba(11,16,32,0.20)",
        "site-lift": "0 2px 4px rgba(11,16,32,0.05), 0 18px 40px -20px rgba(11,16,32,0.26)",
        "site-panel": "0 1px 1px rgba(11,16,32,0.04), 0 40px 80px -40px rgba(11,16,32,0.38)",
        "site-ink": "0 40px 90px -50px rgba(0,0,0,0.9)",
      },
    },
  },
  plugins: [],
};

export default config;
