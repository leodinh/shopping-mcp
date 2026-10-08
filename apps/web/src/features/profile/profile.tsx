"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  shopifyConnectResponseSchema,
  type SellerResponse,
  type SellerStatus,
  type ShopifyConnectRequest,
} from "@shopping-mcp/contracts";
import { apiUrl } from "@/lib/api/origin";
import { authClient } from "../account/auth-client";
import { Slip, useLeave } from "../account/slip";
import { fetchSeller } from "./api";

type Status = "Connected" | "Awaiting sync" | "Sync failed" | "Disconnected";

function statusOf(store: SellerStatus): Status {
  if (!store.enabled) return "Disconnected";
  if (store.lastError) return "Sync failed";
  if (!store.lastSyncedAt) return "Awaiting sync";
  return "Connected";
}

const when = (value: string | Date) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );

const day = (value: string | Date) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));

function errorFrom(payload: unknown) {
  return payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : null;
}

/** LABEL ........ VALUE */
function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="leaders">
      <dt className="caps shrink-0 text-label text-muted">{term}</dt>
      <dd className="min-w-0 break-words text-base text-heading">{children}</dd>
    </div>
  );
}

/** The signed-in User's account and their connected stores, printed as one receipt. */
export function Profile() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { leaving, leave } = useLeave();
  const [seller, setSeller] = useState<SellerResponse | null>(null);
  const [usesGoogle, setUsesGoogle] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [shopError, setShopError] = useState("");
  const connectButton = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState("");
  const shopId = useId();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    fetchSeller(controller.signal).then(
      (payload) => !controller.signal.aborted && setSeller(payload),
      () => !controller.signal.aborted && setUnavailable(true),
    );
    authClient
      .listAccounts()
      .then(({ data }) =>
        setUsesGoogle(!!data?.some((account) => account.providerId === "google")),
      );
    return () => controller.abort();
  }, [session]);

  async function reload() {
    setUnavailable(false);
    try {
      setSeller(await fetchSeller());
    } catch {
      setUnavailable(true);
    }
  }

  async function act(store: SellerStatus, action: "sync" | "disconnect") {
    // Which store and which action, so only the clicked control reads as in progress.
    setBusy(`${store.id}:${action}`);
    setNotice("");
    try {
      const response = await fetch(apiUrl(`/api/seller/stores/${store.id}/${action}`), {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        setNotice(
          errorFrom(await response.json().catch(() => null)) ?? "That did not work. Try again.",
        );
      } else {
        setNotice(
          action === "sync" ? `Sync requested for ${store.name}.` : `${store.name} disconnected.`,
        );
      }
      await reload();
    } catch {
      setNotice("Network error. Try again.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  async function connect(shop: string) {
    setBusy("connect");
    setNotice("");
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
        setBusy(null);
        setNotice(
          errorFrom(payload) ?? "Could not start the Shopify connection. Check the domain.",
        );
        return;
      }
      leave(() => window.location.assign(parsed.data.authorizationUrl));
    } catch {
      setBusy(null);
      setNotice("Network error. Try again.");
    }
  }

  function submitConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shop = String(new FormData(event.currentTarget).get("shop") ?? "").trim();
    if (!shop) {
      setShopError("Enter your store's Shopify domain, like your-store.myshopify.com.");
      return;
    }
    setShopError("");
    void connect(shop);
  }

  if (unavailable) {
    return (
      <main className="grid flex-1 place-items-center overflow-y-auto px-5 py-12 sm:px-8">
        <Slip label="Profile" className="max-w-2xl p-6 sm:p-10">
          <h1 className="caps text-headline font-bold text-heading">Profile unavailable</h1>
          <p className="mt-3 text-base text-muted">
            We couldn’t load your stores. The API may be restarting.
          </p>
          <button type="button" className="btn mt-8" onClick={() => void reload()}>
            Try again
          </button>
        </Slip>
      </main>
    );
  }

  const stores = seller?.stores ?? [];
  const loading = !session || !seller;

  return (
    <main className="flex flex-1 justify-center overflow-y-auto px-5 py-12 sm:px-8">
      <Slip label="Profile" leaving={leaving} className="h-fit max-w-2xl p-6 sm:p-10">
        <h1 className="caps text-headline font-bold text-heading">Profile</h1>

        <section aria-labelledby="account-heading" className="mt-8">
          <h2 id="account-heading" className="caps text-label font-semibold text-heading">
            Account
          </h2>
          <dl className="mt-4 flex flex-col gap-2.5">
            <Row term="Email">
              {session?.user.email ?? <span className="text-muted">Loading…</span>}
            </Row>
            {session?.user.name ? <Row term="Name">{session.user.name}</Row> : null}
            <Row term="Sign-in">{usesGoogle ? "Google · Email link" : "Email link"}</Row>
            {session ? <Row term="Member since">{day(session.user.createdAt)}</Row> : null}
          </dl>
        </section>

        <div className="tear my-8" />

        <section aria-labelledby="stores-heading">
          <div className="leaders">
            <h2 id="stores-heading" className="caps text-label font-semibold text-heading">
              Connected stores
            </h2>
            <span className="text-label font-semibold text-heading">
              {loading ? "··" : String(stores.length).padStart(2, "0")}
            </span>
          </div>

          {loading ? (
            <p className="mt-6 text-label text-muted" aria-live="polite">
              Loading stores…
            </p>
          ) : stores.length === 0 ? (
            <div className="mt-6 border border-dashed border-ink px-5 py-8 text-center animate-stamp">
              <p className="caps text-label font-semibold text-heading">No stores connected</p>
              <p className="mx-auto mt-2 max-w-sm text-label text-muted">
                Connect a Shopify store so assistants can find and compare your products.
              </p>
            </div>
          ) : (
            <ol className="mt-6 flex flex-col">
              {stores.map((store, index) => {
                const status = statusOf(store);
                return (
                  <li
                    key={store.id}
                    className="-mx-3 border-t border-dotted border-muted px-3 py-5 transition-colors duration-150 first:border-t-0 first:pt-2 hover:bg-wash/60 animate-feed"
                    style={{ animationDelay: `${Math.min(index, 4) * 60}ms` }}
                  >
                    <div className="flex items-baseline gap-4">
                      <span className="w-[2ch] shrink-0 text-label text-muted" aria-hidden>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="caps min-w-0 flex-1 break-words text-base font-semibold text-heading">
                        {store.name}
                      </h3>
                      <span
                        key={status}
                        className={`caps shrink-0 whitespace-nowrap text-right sm:w-[17ch] text-label font-medium animate-stamp ${
                          status === "Connected" ? "text-heading" : "text-muted"
                        }`}
                      >
                        [{status}]
                      </span>
                    </div>
                    <div className="mt-1.5 pl-[calc(2ch+1rem)]">
                      <p className="truncate text-label text-muted">{store.slug}</p>
                      <p className="caps mt-1 text-label text-muted">
                        Shopify · {store.productCount} products
                        {store.lastSyncedAt ? ` · Synced ${when(store.lastSyncedAt)}` : ""}
                      </p>
                      {store.lastError ? (
                        <p className="mt-2 text-label text-heading">{store.lastError}</p>
                      ) : null}

                      {confirming === store.id ? (
                        <div
                          className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 animate-stamp"
                          role="group"
                        >
                          <p className="text-label text-heading">
                            Disconnect {store.name}? Its products leave search until you reconnect.
                          </p>
                          <button
                            type="button"
                            className="btn-link"
                            disabled={busy !== null}
                            onClick={() => void act(store, "disconnect")}
                          >
                            {busy === `${store.id}:disconnect` ? "Disconnecting…" : "Confirm"}
                          </button>
                          <button
                            type="button"
                            className="btn-link text-muted"
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                          {store.enabled ? (
                            <>
                              <button
                                type="button"
                                className="btn-link"
                                disabled={busy !== null}
                                onClick={() => void act(store, "sync")}
                              >
                                {busy === `${store.id}:sync` ? "Requesting…" : "Sync now"}
                              </button>
                              <button
                                type="button"
                                className="btn-link"
                                disabled={busy !== null}
                                onClick={() => setConfirming(store.id)}
                              >
                                Disconnect
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn-link"
                              disabled={busy !== null}
                              onClick={() => void connect(store.slug)}
                            >
                              Reconnect on Shopify
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <p role="status" className="mt-3 min-h-5 text-label font-medium text-heading">
            {notice}
          </p>
        </section>

        <div className="tear mt-3 mb-8" />

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
            connecting ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
          aria-hidden={!connecting}
          inert={!connecting}
        >
          <div className="overflow-hidden">
            <form noValidate onSubmit={submitConnect} className="flex flex-col gap-2 pb-6">
              <label htmlFor={shopId} className="field-label">
                Shopify store domain
              </label>
              <input
                id={shopId}
                name="shop"
                className="field"
                placeholder="your-store.myshopify.com"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={shopError ? true : undefined}
                aria-describedby={shopError ? `${shopId}-error` : undefined}
                onInput={() => shopError && setShopError("")}
                disabled={busy !== null}
              />
              <p
                id={`${shopId}-error`}
                className="min-h-5 text-label text-heading"
                aria-live="polite"
              >
                {shopError}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-5">
                <button className="btn" disabled={busy !== null}>
                  {busy === "connect" ? "Opening Shopify…" : "Continue to Shopify"}
                </button>
                <button
                  type="button"
                  className="btn-link text-muted"
                  onClick={() => {
                    setConnecting(false);
                    setShopError("");
                    requestAnimationFrame(() => connectButton.current?.focus());
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>

        {connecting ? null : (
          <button
            ref={connectButton}
            type="button"
            className="btn w-full sm:w-fit"
            disabled={loading}
            onClick={() => {
              setConnecting(true);
              requestAnimationFrame(() => document.getElementById(shopId)?.focus());
            }}
          >
            Connect store
          </button>
        )}
      </Slip>
    </main>
  );
}
