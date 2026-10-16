import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { apiUrl } from "@/lib/api/origin";

export type Account = { email: string };

/** `/api/auth/get-session` answers `{ session, user }` when signed in, `null` when not. */
function emailOf(payload: unknown): string | null {
  const user = (payload as { user?: { email?: unknown } } | null)?.user;
  return typeof user?.email === "string" ? user.email : null;
}

/**
 * Who is signed in, for the first render, so the header never shows a loading state. The session
 * cookie is shared with the API (same host locally, COOKIE_DOMAIN on the tunnel), so it arrives
 * here too; the API alone decides if it's valid. Returns null when signed out, and undefined when
 * the API couldn't say, so the browser resolves it instead.
 */
export async function loadAccount(): Promise<Account | null | undefined> {
  const requestHeaders = await headers();
  // No session cookie: signed out, no need to ask the API.
  if (!getSessionCookie(requestHeaders)) return null;
  try {
    const response = await fetch(apiUrl("/api/auth/get-session"), {
      headers: { cookie: requestHeaders.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return undefined;
    const email = emailOf(await response.json());
    return email ? { email } : null;
  } catch (error) {
    console.error("Header session lookup failed", error);
    return undefined;
  }
}
