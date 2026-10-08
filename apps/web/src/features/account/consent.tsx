"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "./auth-client";
import { describeClient, type PublicClient } from "./client-identity";
import { Slip, useLeave } from "./slip";

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

  const { leaving, leave } = useLeave();

  async function decide(accept: boolean) {
    setPending(true);
    const { data, error } = await authClient.oauth2.consent({ accept });
    if (error || !data?.url) {
      setPending(false);
      setMessage("That did not work. Start the connection again from your assistant.");
      return;
    }
    leave(() => window.location.assign(data.url));
  }

  return (
    <main className="grid flex-1 place-items-center overflow-y-auto px-5 py-12 sm:px-8">
      <Slip label="Allow access" leaving={leaving} className="max-w-md p-6 sm:p-10">
        <div className="flex items-center gap-4">
          {client.logoUrl ? (
            // Logos come from any client's own host; next/image would need every host allow-listed.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logoUrl}
              alt=""
              width={40}
              height={40}
              referrerPolicy="no-referrer"
              className="size-10 shrink-0 border border-ink object-contain p-1 grayscale"
            />
          ) : null}
          <h1 className="caps min-w-0 break-words text-headline font-bold text-heading">
            Allow {client.name} access?
          </h1>
        </div>
        <p className="mt-4 text-label text-muted">
          {client.verifiedHost ? (
            <>
              Verified app from{" "}
              <span className="font-medium text-heading">{client.verifiedHost}</span>
            </>
          ) : (
            <>
              Unverified app: its name is self-declared. Only continue if you started this
              connection.
            </>
          )}
        </p>

        <div className="tear my-6" />

        <h2 className="caps text-label font-semibold text-heading">It wants to</h2>
        <ul className="mt-4 flex flex-col gap-2.5">
          {scopes.map((scope) => (
            <li key={scope} className="flex gap-3 text-base text-heading">
              <span aria-hidden className="text-muted">
                –
              </span>
              {SCOPE_LABELS[scope] ?? scope}
            </li>
          ))}
        </ul>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={pending}
            onClick={() => void decide(false)}
          >
            Deny
          </button>
          <button
            type="button"
            className="btn w-full"
            disabled={pending}
            onClick={() => void decide(true)}
          >
            {pending ? "Working…" : "Allow"}
          </button>
        </div>
        <p role="alert" className="mt-4 min-h-5 text-label font-medium text-heading">
          {message}
        </p>
      </Slip>
    </main>
  );
}
