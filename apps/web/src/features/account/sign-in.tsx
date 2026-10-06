"use client";

import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "./auth-client";

/** True when an MCP client's authorization request sent the user here (signed OAuth query). */
function fromOAuth() {
  return new URLSearchParams(window.location.search).has("sig");
}

/**
 * Email magic-link sign-in, also used as the OAuth login page. A magic link creates the session
 * on a later request that doesn't carry the OAuth query, so for an MCP client's sign-in the link
 * returns here, and once signed in this page resumes the authorization (consent, then back to
 * ChatGPT or Claude).
 */
export function SignIn() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!fromOAuth()) return;
    void (async () => {
      const { data: session } = await authClient.getSession();
      if (!session) return;
      setMessage("Signed in. Continuing…");
      const { data, error } = await authClient.oauth2.continue({ selected: true });
      if (error || !data?.url) {
        setMessage("Could not continue. Start the connection again from your assistant.");
        return;
      }
      window.location.href = data.url;
    })();
  }, []);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setPending(true);
    setMessage("");
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: fromOAuth() ? window.location.href : `${window.location.origin}/seller`,
    });
    setPending(false);
    setMessage(
      error ? "Could not send the sign-in link. Try again." : `Sign-in link sent to ${email}.`,
    );
  }

  return (
    <section className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 py-10 sm:px-8">
      <h1 className="text-headline font-bold text-heading">Sign in</h1>
      <p className="mt-4 text-intro text-muted">We’ll email you a link. No password needed.</p>
      <form onSubmit={sendLink} className="mt-8 flex flex-col gap-4">
        <label htmlFor="email" className="flex flex-col gap-2 text-label font-bold text-heading">
          Email
          <input
            id="email"
            name="email"
            type="email"
            className="field w-full"
            autoComplete="email"
            disabled={pending}
            required
          />
        </label>
        <button className="btn" disabled={pending}>
          {pending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      <div role="status" aria-live="polite" className="mt-4 text-label font-medium text-heading">
        {message}
      </div>
    </section>
  );
}
