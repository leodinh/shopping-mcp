"use client";

import { useActionState, useState } from "react";
import { demoStores } from "@/shared/demo-stores";
import { connectStoreAction } from "@/app/_actions/store";

type StoreStatus = {
  id: string; slug: string; name: string; connectionId: string | null;
  enabled: boolean | null; lastSyncedAt: string | null; lastError: string | null; productCount: number;
};

export function StoreConnections({ merchant }: { merchant: StoreStatus | null }) {
  const [expanded, setExpanded] = useState(false);
  const [state, action, pending] = useActionState(connectStoreAction, { message: "", ok: false });
  const connected = merchant?.connectionId ? merchant : null;
  return <section className="seller-content" aria-label="Your store" aria-busy={pending}>
    {connected ? <>
      <p className="eyebrow">YOUR STORE</p><h1>{connected.name}</h1>
      <div className="seller-status">
        <div><span>Connection</span><strong className={connected.enabled ? "stock" : "sold-out"}>{connected.enabled ? "Connected" : "Disabled"}</strong></div>
        <div><span>Products</span><strong>{connected.productCount}</strong></div>
        <div><span>Sync status</span><strong className={connected.lastError ? "sold-out" : "stock"}>{pending ? "Syncing…" : connected.lastError ? "Sync failed" : connected.lastSyncedAt ? "Synced" : "Awaiting sync"}</strong></div>
        <div><span>Last synced</span><strong>{connected.lastSyncedAt ? <time dateTime={connected.lastSyncedAt}>{connected.lastSyncedAt.slice(0, 16).replace("T", " ")} UTC</time> : "Not yet"}</strong></div>
      </div>
      <form action={action}><input type="hidden" name="storeSlug" value={connected.slug} /><button disabled={pending}>{pending ? "Syncing…" : connected.lastError ? "Retry sync" : "Sync now"}</button></form>
    </> : <>
      <h1>Connect your store.</h1><p>Bring in your products and keep track of your sync status.</p>
      <button type="button" aria-expanded={expanded} aria-controls="store-picker" onClick={() => setExpanded(!expanded)}>Connect Your Store</button>
      {expanded && <div id="store-picker" className="store-picker"><form action={action}>
        <label htmlFor="store-slug">Demo store<select id="store-slug" name="storeSlug" disabled={pending} required>{demoStores.map((store) => <option key={store.slug} value={store.slug}>{store.name}</option>)}</select></label>
        <button disabled={pending}>{pending ? "Connecting…" : "Connect store"}</button>
      </form></div>}
    </>}
    <div role="status" aria-live="polite" className={state.ok ? "connection-feedback stock" : "connection-feedback sold-out"}>{pending ? "Syncing your products…" : state.message}</div>
    <p className="seller-note">Demo connection · real store integrations coming later.</p>
  </section>;
}
