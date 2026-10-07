"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiUrl } from "@/lib/api/origin";
import {
  shopifyConnectResponseSchema,
  type SellerResponse,
  type SellerStatus,
  type ShopifyConnectRequest,
} from "@shopping-mcp/contracts";
import { fetchSeller } from "./api";

function syncedAt(value: string) {
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function errorFrom(payload: unknown) {
  return payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : null;
}

/** The signed-in User's stores: status per store, sync and disconnect, and adding a store. */
export function StoreConnections() {
  const [seller, setSeller] = useState<SellerResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  async function load() {
    try {
      setSeller(await fetchSeller());
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetchSeller(controller.signal).then(
      (payload) => {
        if (controller.signal.aborted) return;
        setSeller(payload);
        setLoading(false);
      },
      () => {
        if (controller.signal.aborted) return;
        setUnavailable(true);
        setLoading(false);
      },
    );
    return () => controller.abort();
  }, []);

  async function connectShopify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const shop = String(new FormData(event.currentTarget).get("shop") ?? "");
    try {
      const response = await fetch(apiUrl("/api/shopify/connect"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop } satisfies ShopifyConnectRequest),
      });
      const payload: unknown = await response.json();
      const parsed = shopifyConnectResponseSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        setMessage(
          errorFrom(payload) ??
            "Could not start Shopify connection. Check the domain and try again.",
        );
        setPending(false);
        return;
      }
      window.location.assign(parsed.data.authorizationUrl);
    } catch {
      setMessage("Could not start Shopify connection. Check your network and try again.");
      setPending(false);
    }
  }

  async function act(store: SellerStatus, action: "sync" | "disconnect") {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(apiUrl(`/api/seller/stores/${store.id}/${action}`), {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok)
        setMessage(errorFrom(await response.json()) ?? "Request failed. Try again.");
      await load();
    } catch {
      setMessage("Request failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  const section = "mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 py-10 sm:px-8";

  if (unavailable) {
    return (
      <section className={section}>
        <h1 className="text-headline font-bold text-heading">Store status unavailable.</h1>
        <p className="mt-4 text-intro text-muted">The dashboard could not reach the database.</p>
        <button type="button" className="mt-6 btn" onClick={() => void load()}>
          Try again
        </button>
      </section>
    );
  }

  if (loading) {
    return (
      <section className={section} aria-busy>
        <h1 className="text-headline font-bold text-heading">Loading stores</h1>
      </section>
    );
  }

  if (!seller?.user) {
    return (
      <section className={section}>
        <h1 className="text-headline font-bold text-heading">Your stores</h1>
        <p className="mt-4 text-intro text-muted">Sign in to connect and manage your stores.</p>
        <a href="/login" className="mt-6 inline-block btn">
          Sign in
        </a>
      </section>
    );
  }

  return (
    <section className={section} aria-label="Your stores" aria-busy={pending}>
      <h1 className="text-headline font-bold text-heading">Your stores</h1>
      {seller.stores.map((store) => (
        <article key={store.id} className="mt-10">
          <h2 className="text-intro font-bold text-heading">{store.name}</h2>
          <dl className="mt-4 flex flex-col gap-3">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Connection</dt>
              <dd className="font-medium text-heading">
                {store.enabled ? "Shopify connected" : "Disconnected"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Products</dt>
              <dd className="font-medium text-heading">{store.productCount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Last synced</dt>
              <dd className="text-heading">
                {store.lastSyncedAt ? (
                  <time dateTime={store.lastSyncedAt}>{syncedAt(store.lastSyncedAt)}</time>
                ) : (
                  "Not yet"
                )}
              </dd>
            </div>
          </dl>
          {store.lastError ? (
            <p className="mt-3 text-label text-heading">{store.lastError}</p>
          ) : null}
          {store.enabled ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() => void act(store, "sync")}
              >
                Sync now
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => void act(store, "disconnect")}
              >
                Disconnect
              </button>
            </div>
          ) : null}
        </article>
      ))}
      <h2 className="mt-12 text-intro font-bold text-heading">
        {seller.stores.length ? "Add or reconnect a store" : "Add a store"}
      </h2>
      <p className="mt-3 text-muted">You’ll authorize on Shopify next.</p>
      <form onSubmit={connectShopify} className="mt-6 flex flex-col gap-4">
        <label
          htmlFor="shop-domain"
          className="flex flex-col gap-2 text-label font-bold text-heading"
        >
          Shopify domain
          <input
            id="shop-domain"
            name="shop"
            className="field w-full"
            placeholder="your-store.myshopify.com"
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
            required
          />
        </label>
        <button className="btn" disabled={pending}>
          {pending ? "Working…" : "Continue to Shopify"}
        </button>
      </form>
      <div role="status" aria-live="polite" className="mt-4 text-label font-medium text-heading">
        {message}
      </div>
    </section>
  );
}
