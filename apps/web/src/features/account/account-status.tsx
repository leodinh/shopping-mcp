"use client";

import { authClient } from "./auth-client";

/** Who the dashboard is signed in as, from the shared Better Auth session cookie. */
export function AccountStatus() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return null;
  return (
    <p className="mx-auto w-full max-w-xl px-5 pt-6 text-label text-muted sm:px-8">
      {session ? (
        <>
          Signed in as <span className="font-medium text-heading">{session.user.email}</span> ·{" "}
          <button
            type="button"
            className="font-medium text-heading underline underline-offset-4"
            onClick={() => void authClient.signOut().then(() => window.location.reload())}
          >
            Sign out
          </button>
        </>
      ) : (
        <a href="/login" className="font-medium text-heading underline underline-offset-4">
          Sign in
        </a>
      )}
    </p>
  );
}
