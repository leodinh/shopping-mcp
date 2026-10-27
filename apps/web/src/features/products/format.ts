import type { CatalogProduct, Price } from "@shopping-mcp/contracts";

/** Minor units as the currency writes them: 1999 USD → $19.99, 1500 JPY → ¥1,500. */
export function formatPrice({ amountMinor, currency }: Price) {
  const format = new Intl.NumberFormat("en", { style: "currency", currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(amountMinor / 10 ** digits);
}

/** The product's price, "From …" when its variants are priced differently. */
export function priceLabel(product: CatalogProduct) {
  const varies = product.variants.some(
    (variant) =>
      variant.price.amountMinor !== product.price.amountMinor ||
      variant.price.currency !== product.price.currency,
  );
  return `${varies ? "From " : ""}${formatPrice(product.price)}`;
}

/** The store's product page, only when it is a real web address. */
export function purchaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export const productPath = (id: string) => `/products/${encodeURIComponent(id)}`;

export type CurrencyOption = { code: string; name: string };

/** Every ISO 4217 currency the runtime knows: the max-price filter never hides a valid one. */
export function currencyOptions(): CurrencyOption[] {
  const names = new Intl.DisplayNames("en", { type: "currency" });
  return Intl.supportedValuesOf("currency").map((code) => ({ code, name: names.of(code) ?? code }));
}
