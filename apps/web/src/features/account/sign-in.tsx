"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { authClient } from "./auth-client";
import { Slip, useLeave } from "./slip";

/** True when an MCP client's authorization request sent the user here (signed OAuth query). */
function fromOAuth() {
  return new URLSearchParams(window.location.search).has("sig");
}

/** Where sign-in returns: back here to resume an MCP client's authorization, else the profile. */
function returnUrl() {
  return fromOAuth() ? window.location.href : `${window.location.origin}/profile`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Pending = "email" | "google" | null;

/**
 * Email magic link or Google, also serving as the OAuth login page. A magic link creates the
 * session on a later request without the OAuth query, so for an MCP client's sign-in both methods
 * return here, and once signed in this page resumes the authorization (consent, then the client).
 */
export function SignIn() {
  const router = useRouter();
  const { leaving, leave } = useLeave();
  const [pending, setPending] = useState<Pending>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [resuming, setResuming] = useState(false);
  const emailId = useId();
  const emailErrorId = useId();

  useEffect(() => {
    void (async () => {
      const { data: session } = await authClient.getSession();
      if (!session) return;
      if (!fromOAuth()) return router.replace("/profile");
      setResuming(true);
      const { data, error } = await authClient.oauth2.continue({ selected: true });
      if (error || !data?.url) {
        setResuming(false);
        setError("Could not continue. Start the connection again from your assistant.");
        return;
      }
      leave(() => window.location.assign(data.url));
    })();
  }, [router, leave]);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setError("");
    if (!EMAIL.test(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError("");
    setPending("email");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: returnUrl() });
    setPending(null);
    if (error) setError("Could not send the sign-in link. Try again in a moment.");
    else setSentTo(email);
  }

  async function continueWithGoogle() {
    setError("");
    setPending("google");
    const { data, error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: returnUrl(),
      disableRedirect: true,
    });
    if (error || !data?.url) {
      setPending(null);
      setError("Google sign-in is unavailable. Use an email link instead.");
      return;
    }
    leave(() => window.location.assign(data.url));
  }

  const busy = pending !== null || resuming || leaving;

  return (
    <main className="grid flex-1 place-items-center overflow-y-auto px-5 py-12 sm:px-8">
      <Slip label="Login" leaving={leaving} className="max-w-md p-6 sm:p-10">
        <h1 className="caps text-headline font-bold text-heading">Login</h1>

        {resuming ? (
          <p role="status" className="mt-6 text-base text-heading">
            Signed in. Continuing…
          </p>
        ) : sentTo ? (
          <div role="status" className="mt-6 animate-stamp">
            <p className="caps text-label font-semibold text-heading">Check your email</p>
            <p className="mt-3 text-base text-heading">
              We sent a sign-in link to <span className="break-words font-medium">{sentTo}</span>.
            </p>
            <p className="mt-2 text-label text-muted">
              It expires in 5 minutes. You can close this tab.
            </p>
            <button
              type="button"
              className="btn-link mt-6"
              onClick={() => {
                setSentTo(null);
                setError("");
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-label text-muted">
              No password. One account for the dashboard and your assistants.
            </p>
            <form noValidate onSubmit={sendLink} className="mt-8 flex flex-col gap-2">
              <label htmlFor={emailId} className="field-label">
                Email address
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="field"
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? emailErrorId : undefined}
                disabled={busy}
                onInput={() => fieldError && setFieldError("")}
              />
              <p id={emailErrorId} role="alert" className="min-h-5 text-label font-medium text-heading">
                {fieldError || error}
              </p>
              <button className="btn w-full" disabled={busy}>
                {pending === "email" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-4" aria-hidden>
              <span className="h-px flex-1 bg-ink" />
              <span className="caps text-label text-muted">Or</span>
              <span className="h-px flex-1 bg-ink" />
            </div>

            <button
              type="button"
              className="btn-secondary w-full"
              disabled={busy}
              onClick={() => void continueWithGoogle()}
            >
              {pending === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
          </>
        )}
      </Slip>
    </main>
  );
}
