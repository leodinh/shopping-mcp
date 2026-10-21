/** How many minor-unit digits a currency has: USD 2, JPY 0, KWD 3 (ISO 4217, via Intl). */
export function currencyDigits(currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits!;
}

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/**
 * A decimal amount string ("19.99", Shopify's "1500.0") in the currency's minor units. Exact: no
 * floating point. Throws on a malformed amount or one finer than the currency allows.
 */
export function minorUnits(amount: string, currency: string): number {
  const match = DECIMAL.exec(amount.trim());
  if (!match) throw new Error(`Not a decimal amount: ${amount}`);
  const digits = currencyDigits(currency);
  const fraction = match[2] ?? "";
  if (/[1-9]/.test(fraction.slice(digits))) {
    throw new Error(`${amount} has more decimals than ${currency} allows`);
  }
  return Number(match[1] + fraction.slice(0, digits).padEnd(digits, "0"));
}

/**
 * The most minor units still at or under a major-unit ceiling: 19.999 USD → 1999. For filters
 * ("under 19.999"), so a ceiling finer than the currency rounds down, never up.
 */
export function maxMinorUnits(maxMajor: number, currency: string): number {
  const digits = currencyDigits(currency);
  // No real price is this large; past it the digits below are float noise anyway.
  if (maxMajor >= 1e15) return Number.MAX_SAFE_INTEGER;
  // String() is the shortest exact decimal ("19.999"); toFixed would round 19.9999 up to 20.
  // Below 1e-6 String() switches to exponent form, and such amounts are 0 minor units anyway.
  const [whole, fraction = ""] = (maxMajor < 1e-6 ? "0" : String(maxMajor)).split(".");
  return Number(whole + fraction.slice(0, digits).padEnd(digits, "0"));
}

/** Minor units back to the decimal string Shopify's `price` filter expects: 1999 USD → "19.99". */
export function majorAmount(amountMinor: number, currency: string): string {
  const digits = currencyDigits(currency);
  if (digits === 0) return String(amountMinor);
  const text = String(amountMinor).padStart(digits + 1, "0");
  return `${text.slice(0, -digits)}.${text.slice(-digits)}`;
}
