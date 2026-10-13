import type { IncomingHttpHeaders } from "node:http";
import type { SellerUser } from "@shopping-mcp/contracts";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./better-auth";

function sessionFrom(headers: IncomingHttpHeaders | Headers) {
  const fetchHeaders = headers instanceof Headers ? headers : fromNodeHeaders(headers);
  // No session cookie (plain or __Secure- prefixed) means signed out: skip the session lookup.
  if (!/better-auth\.session_token=/.test(fetchHeaders.get("cookie") ?? "")) return null;
  return auth().api.getSession({ headers: fetchHeaders });
}

/** The signed-in User from the Better Auth session cookie, or null when signed out. */
export async function currentUser(headers: IncomingHttpHeaders | Headers) {
  const session = await sessionFrom(headers);
  return session ? { id: session.user.id, email: session.user.email } : null;
}

/** The signed-in User with what their profile shows, including linked sign-in providers. */
export async function currentProfile(
  headers: IncomingHttpHeaders | Headers,
): Promise<SellerUser | null> {
  const fetchHeaders = headers instanceof Headers ? headers : fromNodeHeaders(headers);
  const session = await sessionFrom(fetchHeaders);
  if (!session) return null;
  const accounts = await auth().api.listUserAccounts({ headers: fetchHeaders });
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name || null,
    createdAt: new Date(session.user.createdAt).toISOString(),
    // Email links need no linked account, so these are only the extra providers (e.g. google).
    providers: [...new Set(accounts.map((account) => account.providerId))],
  };
}
