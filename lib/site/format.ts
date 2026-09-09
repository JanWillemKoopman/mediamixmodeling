// Nederlandse getalnotatie zonder afhankelijkheid van de ICU-locale van de server: dezelfde
// uitkomst op de server als in de browser, dus geen hydratieverschillen.

/** 12345.6 → "12.345,6" */
export function nl(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = value < 0 ? "−" : "";
  return dec ? `${sign}${grouped},${dec}` : `${sign}${grouped}`;
}

/** 2.3 → "+2,3%" (met echt minteken, en 0 zonder plusteken) */
export function signedPct(value: number, decimals = 1): string {
  const rounded = Number(value.toFixed(decimals));
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${nl(rounded, decimals)}%`;
}

/** 7500000 → "€ 7,5 mln" — korte, leesbare bedragen voor productlabels. */
export function euroShort(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `€ ${nl(value / 1_000_000, 1)} mln`;
  if (Math.abs(value) >= 1_000) return `€ ${nl(value / 1_000)}k`;
  return `€ ${nl(value)}`;
}

/** 26.4 → "26,4%" */
export function pct(value: number, decimals = 0): string {
  return `${nl(value, decimals)}%`;
}
