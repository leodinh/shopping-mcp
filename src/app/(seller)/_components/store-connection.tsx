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
        setMessage(payload.error || "Could not start Shopify connection.");
        setPending(false);
        return;
      }
      window.location.assign(payload.authorizationUrl);
    } catch {
      setMessage("Could not start Shopify connection.");
      setPending(false);
    }
  }

  return (
    <section className="px-5 py-10 sm:px-12 sm:py-18" aria-label="Your store" aria-busy={pending}>
      {connected ? (
        <>
          <p className="text-label font-medium">YOUR STORE</p>
          <h1 className="my-6 text-headline font-semibold text-heading sm:text-headline-lg">
            {connected.name}
          </h1>
          <div className="my-8 grid grid-cols-1 gap-8 border border-line bg-card p-8 sm:grid-cols-2">
            <div>
              <span className="mb-3 block text-label font-medium text-muted">Connection</span>
              <strong
                className={`text-card-heading font-semibold sm:text-card-heading-lg ${connected.enabled ? "text-stock" : "text-sold-out"}`}
              >
                {connected.enabled ? "Shopify connected ✓" : "Disabled"}
              </strong>
            </div>
            <div>
              <span className="mb-3 block text-label font-medium text-muted">Products</span>
              <strong className="text-card-heading font-semibold sm:text-card-heading-lg">
                {connected.productCount}
              </strong>
            </div>
            <div>
              <span className="mb-3 block text-label font-medium text-muted">Sync status</span>
              <strong
                className={`text-card-heading font-semibold sm:text-card-heading-lg ${connected.lastError ? "text-sold-out" : "text-stock"}`}
              >
                {connected.lastError
                  ? "Sync failed"
                  : connected.lastSyncedAt
                    ? "Synced"
                    : "Awaiting sync"}
              </strong>
            </div>
            <div>
              <span className="mb-3 block text-label font-medium text-muted">Last synced</span>
              <strong className="text-card-heading font-semibold sm:text-card-heading-lg">
                {connected.lastSyncedAt ? (
                  <time className="text-base font-normal" dateTime={connected.lastSyncedAt}>
                    {connected.lastSyncedAt.slice(0, 16).replace("T", " ")} UTC
                  </time>
                ) : (
                  "Not yet"
                )}
              </strong>
            </div>
          </div>
        </>
      ) : (
        <>
          <h1 className="my-6 text-headline font-semibold text-heading sm:text-headline-lg">
            Connect your store.
          </h1>
          <p className="text-intro text-muted sm:text-intro-lg">
            Enter your Shopify domain to connect products and keep track of sync status.
          </p>
          <form
            onSubmit={connectShopify}
            className="mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-end"
          >
            <label htmlFor="shop-domain" className="flex flex-col gap-2 text-label font-medium">
              Shopify domain
              <input
                id="shop-domain"
                name="shop"
                className="field w-full min-w-0 sm:min-w-64"
                placeholder="your-store.myshopify.com"
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
                required
              />
            </label>
            <button className="btn" disabled={pending}>
              {pending ? "Connecting…" : "Connect Shopify"}
            </button>
          </form>
        </>
      )}
      <div role="status" aria-live="polite" className="my-4 text-label font-medium text-sold-out">
        {message}
      </div>
    </section>
  );
}
