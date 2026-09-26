"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiUrl } from "@/lib/api/origin";
import {
  shopifyConnectResponseSchema,
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

export function StoreConnections() {
  const [merchant, setMerchant] = useState<SellerStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const connected = merchant?.connectionId ? merchant : null;

  async function loadMerchant() {
    try {
      const payload = await fetchSeller();
      setMerchant(payload.merchant);
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
        setMerchant(payload.merchant);
        setUnavailable(false);
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
        const error =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : null;
        setMessage(error || "Could not start Shopify connection. Check the domain and try again.");
        setPending(false);
        return;
      }
      window.location.assign(parsed.data.authorizationUrl);
    } catch {
      setMessage("Could not start Shopify connection. Check your network and try again.");
      setPending(false);
    }
  }

  async function postSeller(path: "/api/seller/sync" | "/api/seller/disconnect") {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(apiUrl(path), { method: "POST", credentials: "include" });
      if (!response.ok) {
        setMessage("Request failed. Try again.");
        setPending(false);
        return;
      }
      await loadMerchant();
    } catch {
      setMessage("Request failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (unavailable) {
    return (
      <section className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 py-10 sm:px-8">
        <h1 className="text-headline font-bold text-heading">Store status unavailable.</h1>
        <p className="mt-4 text-intro text-muted">The dashboard could not reach the database.</p>
        <button type="button" className="mt-6 btn" onClick={() => void loadMerchant()}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <section
      className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 py-10 sm:px-8"
      aria-label="Your store"
      aria-busy={pending || loading}
    >
      {connected ? (
        <>
          <h1 className="text-headline font-bold text-heading">{connected.name}</h1>
          <dl className="mt-8 divide-y divide-line border-y border-line">
            <div className="flex justify-between gap-4 py-4">
              <dt className="text-muted">Connection</dt>
              <dd className={`font-bold ${connected.enabled ? "text-stock" : "text-sold-out"}`}>
                {connected.enabled ? "Shopify connected" : "Disabled"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-4">
              <dt className="text-muted">Products</dt>
              <dd className="font-bold text-heading">{connected.productCount}</dd>
            </div>
            <div className="flex justify-between gap-4 py-4">
              <dt className="text-muted">Sync</dt>
              <dd className={`font-bold ${connected.lastError ? "text-sold-out" : "text-heading"}`}>
                {connected.lastError
                  ? "Sync failed"
                  : connected.lastSyncedAt
                    ? "Synced"
                    : "Awaiting sync"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-4">
              <dt className="text-muted">Last synced</dt>
              <dd className="text-heading">
                {connected.lastSyncedAt ? (
                  <time dateTime={connected.lastSyncedAt}>{syncedAt(connected.lastSyncedAt)}</time>
                ) : (
                  "Not yet"
                )}
              </dd>
            </div>
          </dl>
          {connected.lastError ? (
            <p className="mt-4 text-label text-sold-out">{connected.lastError}</p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => void postSeller("/api/seller/sync")}
            >
              Retry sync
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => void postSeller("/api/seller/disconnect")}
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-headline font-bold text-heading">
            {loading ? "Loading store" : "Add a store"}
          </h1>
          <p className="mt-4 text-intro text-muted">
            You’ll authorize on Shopify next. We keep a session cookie so this dashboard can show
            that store.
          </p>
          {!loading ? (
            <form onSubmit={connectShopify} className="mt-8 flex flex-col gap-4">
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
                {pending ? "Redirecting to Shopify…" : "Continue to Shopify"}
              </button>
            </form>
          ) : null}
          <p className="mt-4 text-label text-muted">
            See{" "}
            <a
              href="/privacy"
              className="font-bold text-heading underline decoration-primary underline-offset-4"
            >
              Privacy
            </a>{" "}
            for what the cookie stores.
          </p>
        </>
      )}
      <div role="status" aria-live="polite" className="mt-4 text-label font-bold text-sold-out">
        {message}
      </div>
    </section>
  );
}
