"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { StoreOption } from "./api";
import { hasFilters, withoutFilters, type BrowseQuery } from "./browse";
import type { CurrencyOption } from "./format";
import { ChevronIcon } from "./icons";

function Select({
  id,
  name,
  defaultValue,
  invalid,
  describedBy,
  children,
}: {
  id: string;
  name: string;
  defaultValue: string;
  invalid?: boolean;
  describedBy?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="field cursor-pointer appearance-none truncate pr-10"
      >
        {children}
      </select>
      <ChevronIcon className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2" />
    </div>
  );
}

type Problem = { field: "maxPrice" | "currency"; message: string } | null;

/**
 * The filters a shopper can change on the assistant's search: store, max price (with its
 * currency, which the API requires) and stock. Applying keeps the query and starts at page 1.
 * Remount with `key` when the URL's search changes, so the fields show it.
 */
export function Filters({
  query,
  stores,
  currencies,
  onApply,
}: {
  query: BrowseQuery;
  stores: StoreOption[];
  currencies: CurrencyOption[];
  onApply: (next: BrowseQuery) => void;
}) {
  const id = useId();
  const [problem, setProblem] = useState<Problem>(null);
  // A store from the assistant's link that isn't listed (the list failed, or it just connected).
  const unlisted = query.merchantId && !stores.some((store) => store.id === query.merchantId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const maxPrice = text("maxPrice");
    const currency = text("currency");
    if (maxPrice && !(Number.isFinite(Number(maxPrice)) && Number(maxPrice) >= 0)) {
      return setProblem({ field: "maxPrice", message: "Enter a price such as 80 or 79.99." });
    }
    if (maxPrice && !currency) {
      return setProblem({ field: "currency", message: "Choose the currency of the max price." });
    }
    setProblem(null);
    onApply({
      ...query,
      merchantId: text("merchantId") || undefined,
      currency: currency || undefined,
      maxPrice: maxPrice ? String(Number(maxPrice)) : undefined,
      inStock: form.get("inStock") ? "true" : undefined,
    });
  }

  const messageId = `${id}-message`;
  return (
    <form
      noValidate
      aria-label="Filters"
      onSubmit={submit}
      onInput={() => setProblem(null)}
      className="mt-8 grid grid-cols-2 items-end gap-x-3 gap-y-4 sm:gap-x-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_auto_auto]"
    >
      <div className="col-span-2 flex flex-col gap-2 lg:col-span-1">
        <label htmlFor={`${id}-store`} className="field-label">
          Store
        </label>
        <Select id={`${id}-store`} name="merchantId" defaultValue={query.merchantId ?? ""}>
          <option value="">All stores</option>
          {unlisted ? (
            <option value={query.merchantId}>The store your assistant chose</option>
          ) : null}
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-price`} className="field-label">
          Max price
        </label>
        <input
          id={`${id}-price`}
          name="maxPrice"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Any"
          defaultValue={query.maxPrice ?? ""}
          aria-invalid={problem?.field === "maxPrice" || undefined}
          aria-describedby={messageId}
          className="field"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-currency`} className="field-label">
          Currency
        </label>
        <Select
          id={`${id}-currency`}
          name="currency"
          defaultValue={query.currency ?? ""}
          invalid={problem?.field === "currency"}
          describedBy={messageId}
        >
          <option value="">Any currency</option>
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} · {currency.name}
            </option>
          ))}
        </Select>
      </div>
      <label className="caps flex min-h-12 cursor-pointer items-center gap-3 border border-ink px-4 text-label font-medium text-heading transition-colors duration-150 ease-out hover:bg-wash">
        <input
          type="checkbox"
          name="inStock"
          defaultChecked={query.inStock === "true"}
          className="size-4 shrink-0 cursor-pointer accent-ink"
        />
        In stock only
      </label>
      <button type="submit" className="btn w-full lg:w-fit">
        Apply
      </button>
      <div className="col-span-2 -mt-2 flex min-h-5 items-baseline justify-between gap-4 lg:col-span-5">
        <p id={messageId} role="alert" className="text-label text-heading">
          {problem?.message}
        </p>
        {hasFilters(query) ? (
          <button
            type="button"
            onClick={() => onApply(withoutFilters(query))}
            className="btn-link shrink-0"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </form>
  );
}
