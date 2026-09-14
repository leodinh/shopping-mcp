"use client";

import { useState, type FormEvent } from "react";

type StoreStatus = {
  id: string;
  slug: string;
  name: string;
  connectionId: string | null;
  connectorType: "shopify" | null;
  enabled: boolean | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  productCount: number;
};

function syncedAt(value: string) {
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export function StoreConnections({ merchant }: { merchant: StoreStatus | null }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const connected = merchant?.connectionId ? merchant : null;

  async function connectShopify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const shop = String(new FormData(event.currentTarget).get("shop") ?? "");
    try {
      const response = await fetch("/api/shopify/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop }),
      });
      const payload = (await response.json()) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !payload.authorizationUrl) {
        setMessage(payload.error || "Could not start Shopify connection. Check the domain and try again.");
        setPending(false);
        return;
      }
      window.location.assign(payload.authorizationUrl);
    } catch {
      setMessage("Could not start Shopify connection. Check your network and try again.");
      setPending(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 py-10 sm:px-8" aria-label="Your store" aria-busy={pending}>
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
                {connected.lastError ? "Sync failed" : connected.lastSyncedAt ? "Synced" : "Awaiting sync"}
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
          {connected.lastError ? <p className="mt-4 text-label text-sold-out">{connected.lastError}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <form action="/api/seller/sync" method="post">
              <button type="submit" className="btn">
                Retry sync
              </button>
            </form>
            <form action="/api/seller/disconnect" method="post">
              <button type="submit" className="btn-secondary">
                Disconnect
              </button>
            </form>
          </div>
          <p className="mt-4 text-label text-muted">
            Or sync from this app’s directory:{" "}
            <code className="font-mono text-heading">npm run sync</code>
          </p>
        </>
      ) : (
        <>
          <h1 className="text-headline font-bold text-heading">Add a store</h1>
          <p className="mt-4 text-intro text-muted">
            You’ll authorize on Shopify next. We keep a session cookie so this dashboard can show
            that store.
          </p>
          <form onSubmit={connectShopify} className="mt-8 flex flex-col gap-4">
            <label htmlFor="shop-domain" className="flex flex-col gap-2 text-label font-bold text-heading">
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
          <p className="mt-4 text-label text-muted">
            See{" "}
            <a href="/privacy" className="font-bold text-heading underline decoration-primary underline-offset-4">
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
