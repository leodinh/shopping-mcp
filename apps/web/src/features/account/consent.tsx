"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "./auth-client";

const SCOPE_LABELS: Record<string, string> = {
  openid: "Know who you are",
  profile: "See your name",
  email: "See your email address",
  offline_access: "Stay connected without asking you to sign in again",
  account: "Access your Shopping with Agent account",
};

/** OAuth consent for an MCP client such as ChatGPT or Claude. */
export function Consent() {
  const params = useSearchParams();
  const clientId = params.get("client_id") ?? "an application";
  const scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function decide(accept: boolean) {
    setPending(true);
    const { data, error } = await authClient.oauth2.consent({ accept });
    if (error || !data?.url) {
      setPending(false);
      setMessage("That did not work. Start the connection again from your assistant.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <section className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 py-10 sm:px-8">
      <h1 className="text-headline font-bold text-heading">Allow access?</h1>
      <p className="mt-4 text-intro text-muted">
        <span className="font-mono text-label break-all text-heading">{clientId}</span> wants to:
      </p>
      <ul className="mt-6 flex list-disc flex-col gap-2 pl-5">
        {scopes.map((scope) => (
          <li key={scope}>{SCOPE_LABELS[scope] ?? scope}</li>
        ))}
      </ul>
      <div className="mt-8 flex gap-3">
        <button type="button" className="btn" disabled={pending} onClick={() => void decide(true)}>
          Allow
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() => void decide(false)}
        >
          Deny
        </button>
      </div>
      <div role="status" aria-live="polite" className="mt-4 text-label font-medium text-heading">
        {message}
      </div>
    </section>
  );
}
