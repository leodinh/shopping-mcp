"use client";

import { useActionState, useState } from "react";
import { demoStores } from "@/shared/demo-stores";
import { connectStoreAction } from "@/app/_actions/store";

type StoreStatus = {
  id: string;
  slug: string;
  name: string;
  connectionId: string | null;
  enabled: boolean | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  productCount: number;
};

const field = "min-h-11 rounded-sm border border-input bg-transparent px-3 text-sm text-ink";
const button =
  "min-h-11 cursor-pointer rounded-sm border border-ink bg-ink px-6 text-sm text-white hover:bg-ink-hover disabled:cursor-wait disabled:opacity-60";

export function StoreConnections({ merchant }: { merchant: StoreStatus | null }) {
  const [expanded, setExpanded] = useState(false);
  const [state, action, pending] = useActionState(connectStoreAction, { message: "", ok: false });
  const connected = merchant?.connectionId ? merchant : null;
  return (
    <section className="py-10 sm:py-18" aria-label="Your store" aria-busy={pending}>
      {connected ? (
        <>
          <p className="text-xs font-bold tracking-widest">YOUR STORE</p>
          <h1 className="my-6 text-4xl font-medium tracking-tight sm:text-5xl">{connected.name}</h1>
          <div className="my-8 grid grid-cols-1 gap-8 rounded-md border border-line bg-card p-8 sm:grid-cols-2">
            <div>
              <span className="mb-3 block text-xs text-muted">Connection</span>
              <strong
                className={`text-xl font-medium ${connected.enabled ? "text-stock" : "text-sold-out"}`}
              >
                {connected.enabled ? "Connected" : "Disabled"}
              </strong>
            </div>
            <div>
              <span className="mb-3 block text-xs text-muted">Products</span>
              <strong className="text-xl font-medium">{connected.productCount}</strong>
            </div>
            <div>
              <span className="mb-3 block text-xs text-muted">Sync status</span>
              <strong
                className={`text-xl font-medium ${connected.lastError ? "text-sold-out" : "text-stock"}`}
              >
                {pending
                  ? "Syncing…"
                  : connected.lastError
                    ? "Sync failed"
                    : connected.lastSyncedAt
                      ? "Synced"
                      : "Awaiting sync"}
              </strong>
            </div>
            <div>
              <span className="mb-3 block text-xs text-muted">Last synced</span>
              <strong className="text-xl font-medium">
                {connected.lastSyncedAt ? (
                  <time className="text-base" dateTime={connected.lastSyncedAt}>
                    {connected.lastSyncedAt.slice(0, 16).replace("T", " ")} UTC
                  </time>
                ) : (
                  "Not yet"
                )}
              </strong>
            </div>
          </div>
          <form action={action}>
            <input type="hidden" name="storeSlug" value={connected.slug} />
            <button className={button} disabled={pending}>
              {pending ? "Syncing…" : connected.lastError ? "Retry sync" : "Sync now"}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="my-6 text-4xl font-medium tracking-tight sm:text-5xl">Connect your store.</h1>
          <p className="text-sm leading-relaxed text-muted">
            Bring in your products and keep track of your sync status.
          </p>
          <button
            type="button"
            className={`${button} mt-5`}
            aria-expanded={expanded}
            aria-controls="store-picker"
            onClick={() => setExpanded(!expanded)}
          >
            Connect Your Store
          </button>
          {expanded && (
            <div id="store-picker" className="mt-5 rounded bg-picker p-6">
              <form
                action={action}
                className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end"
              >
                <label
                  htmlFor="store-slug"
                  className="flex flex-col gap-2 text-xs font-semibold"
                >
                  Demo store
                  <select
                    id="store-slug"
                    name="storeSlug"
                    className={`${field} w-full min-w-0 sm:min-w-64`}
                    disabled={pending}
                    required
                  >
                    {demoStores.map((store) => (
                      <option key={store.slug} value={store.slug}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className={button} disabled={pending}>
                  {pending ? "Connecting…" : "Connect store"}
                </button>
              </form>
            </div>
          )}
        </>
      )}
      <div
        role="status"
        aria-live="polite"
        className={`my-4 text-xs leading-relaxed ${state.ok ? "text-stock" : "text-sold-out"}`}
      >
        {pending ? "Syncing your products…" : state.message}
      </div>
      <p className="mt-8 text-xs text-muted">
        Demo connection · real store integrations coming later.
      </p>
    </section>
  );
}
