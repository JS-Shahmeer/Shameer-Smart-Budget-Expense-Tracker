// Amounts are integers in minor units (paisa for PKR) everywhere in the app.
// Floating point is only used at the edges, for display.

export const DEFAULT_CURRENCY = "PKR";
/** Largest amount the database accepts, in minor units (exclusive). */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000_000;

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Parses user input such as "1,500" or "2499.5" into minor units.
 * Returns null for anything that is not a positive amount with at most two decimals.
 */
export function parseAmountToMinor(input: string | number): number | null {
  const text = String(input).trim().replace(/,/g, "");
  if (!AMOUNT_PATTERN.test(text)) return null;

  const [whole, fraction = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor >= MAX_AMOUNT_MINOR) return null;
  return minor;
}

/** Converts minor units back to the plain string a form input should show. */
export function minorToInputValue(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const fraction = Math.abs(minor % 100);
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, fractionDigits: number) {
  const key = `${currency}:${fractionDigits}`;
  let value = formatters.get(key);
  if (!value) {
    value = new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, value);
  }
  return value;
}

/** Formats minor units for display, hiding ".00" on whole amounts. */
export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY): string {
  const digits = minor % 100 === 0 ? 0 : 2;
  return formatter(currency, digits).format(minor / 100);
}

/** Share of `part` in `whole` as a percentage, 0 when the whole is not positive. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}
