"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "./auth-client";
import { describeClient, type PublicClient } from "./client-identity";

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
  const clientId = params.get("client_id") ?? "";
  const scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [client, setClient] = useState(() => describeClient({ client_id: clientId }));

  useEffect(() => {
    if (!clientId) return;
    authClient
      .$fetch<PublicClient>("/oauth2/public-client", { query: { client_id: clientId } })
      .then(({ data }) => {
        if (data) setClient(describeClient(data));
      });
  }, [clientId]);

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
      <div className="flex items-center gap-4">
        {client.logoUrl ? (
          // Logos come from any client's own host; next/image would need every host allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.logoUrl}
            alt=""
            width={48}
            height={48}
            referrerPolicy="no-referrer"
            className="size-12 rounded object-contain"
          />
        ) : null}
        <h1 className="text-headline font-bold text-heading break-words">
          Allow {client.name} access?
        </h1>
      </div>
      <p className="mt-3 text-label text-muted">
        {client.verifiedHost ? (
          <>
            Verified app from{" "}
            <span className="font-medium text-heading">{client.verifiedHost}</span>
          </>
        ) : (
          <>
            Unverified app: its name is self-declared. Only continue if you started this connection.
          </>
        )}
      </p>
      <p className="mt-6 text-intro text-muted">It wants to:</p>
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
