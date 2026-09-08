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
